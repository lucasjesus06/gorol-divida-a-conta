import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessInvites, accessRequests, outingParticipants, outings, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  failCreate: undefined as string | undefined,
  deleted: [] as string[],
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          if (state.failCreate) {
            return { data: { user: null }, error: { code: state.failCreate, message: state.failCreate } };
          }
          const id = crypto.randomUUID();
          await (state.db as TestDb).execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          state.deleted.push(id);
          await (state.db as TestDb).execute(sql`delete from auth.users where id = ${id}`);
          return { error: null };
        },
      },
    },
  }),
}));

const access = await import("./access");
const outingsServer = await import("./outings");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

const pedido = { name: "Maria  Souza", email: " Maria@Exemplo.com ", phone: "(11) 99999-0001" };
let admin: string;

beforeEach(async () => {
  state.db = await createTestDatabase();
  state.failCreate = undefined;
  state.deleted = [];
  const [lucas] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  admin = lucas.id;
});

describe("pedido de acesso", () => {
  it("guarda o pedido normalizado e pendente", async () => {
    await access.submitAccessRequest(pedido);
    const [saved] = await access.listAccessRequests();
    expect(saved).toMatchObject({
      name: "Maria Souza",
      email: "maria@exemplo.com",
      phone: "+5511999990001",
      status: "pending",
      source: "request",
    });
  });

  it("repetir o pedido com o mesmo e-mail não cria outro nem avisa que já existia", async () => {
    await access.submitAccessRequest(pedido);
    await access.submitAccessRequest({ ...pedido, name: "Outra" });
    expect(await db().$count(accessRequests)).toBe(1);
  });

  it("recusa dados inválidos sem guardar nada", async () => {
    await expect(access.submitAccessRequest({ ...pedido, email: "maria" })).rejects.toMatchObject({ code: "invalid_email" });
    await expect(access.submitAccessRequest({ ...pedido, phone: "123" })).rejects.toMatchObject({ code: "invalid_phone" });
    expect(await db().$count(accessRequests)).toBe(0);
  });
});

describe("decisão do super admin", () => {
  it("aprovar cria o acesso, a pessoa aprovada e fecha o pedido", async () => {
    await access.submitAccessRequest(pedido);
    const [request] = await access.listAccessRequests();

    await access.approveAccessRequest(request.id, admin);

    const [decided] = await access.listAccessRequests();
    expect(decided).toMatchObject({ status: "approved", decidedBy: admin });
    const accounts = await access.listAccounts();
    expect(accounts.map((account) => account.displayName)).toEqual(["Maria Souza"]);
    expect(await db().$count(people)).toBe(2);
  });

  it("aprovar assume a pessoa que um dono de rolê já tinha cadastrado com o telefone", async () => {
    const [convidada] = await db().insert(people).values({ displayName: "Mari", phone: "+5511999990001" }).returning();
    await access.submitAccessRequest(pedido);
    const [request] = await access.listAccessRequests();

    await access.approveAccessRequest(request.id, admin);

    const [row] = await db().select().from(people).where(eq(people.id, convidada.id));
    expect(row.userId).not.toBeNull();
    expect(row.accountApprovedAt).not.toBeNull();
    expect(await db().$count(people)).toBe(2);
  });

  it("se o banco falhar depois de criar o acesso, o acesso é desfeito", async () => {
    const [outra] = await db().insert(people).values({ displayName: "Outra", phone: "+5511999990001" }).returning();
    const authId = crypto.randomUUID();
    await db().execute(sql`insert into auth.users (id, email) values (${authId}, 'outra@exemplo.com')`);
    await db().update(people).set({ userId: authId }).where(eq(people.id, outra.id));
    await access.submitAccessRequest(pedido);
    const [request] = await access.listAccessRequests();

    await expect(access.approveAccessRequest(request.id, admin)).rejects.toMatchObject({ code: "phone_already_linked" });

    expect(state.deleted).toHaveLength(1);
    expect((await access.listAccessRequests())[0].status).toBe("pending");
  });

  it("e-mail que já tem conta é avisado e o pedido continua pendente", async () => {
    await access.submitAccessRequest(pedido);
    const [request] = await access.listAccessRequests();
    state.failCreate = "email_exists";

    await expect(access.approveAccessRequest(request.id, admin)).rejects.toMatchObject({ code: "email_already_registered" });
    expect((await access.listAccessRequests())[0].status).toBe("pending");
  });

  it("não decide duas vezes o mesmo pedido", async () => {
    await access.submitAccessRequest(pedido);
    const [request] = await access.listAccessRequests();
    await access.rejectAccessRequest(request.id, admin, " sem vaga ");

    await expect(access.approveAccessRequest(request.id, admin)).rejects.toMatchObject({ code: "request_not_pending" });
    await expect(access.rejectAccessRequest(request.id, admin, "")).rejects.toMatchObject({ code: "request_not_pending" });
    expect((await access.listAccessRequests())[0]).toMatchObject({ status: "rejected", decisionNote: "sem vaga" });
    expect(await access.listAccounts()).toEqual([]);
  });
});

describe("convites", () => {
  const dados = { name: "Bruno", email: "bruno@exemplo.com", phone: "11999990002" };

  it("o convite é guardado só como hash e aparece como utilizável", async () => {
    const token = await access.createInvite(admin);
    const [row] = await db().select().from(accessInvites);
    expect(row.tokenHash).not.toContain(token);
    expect(await access.inviteIsUsable(token)).toBe(true);
    expect(await access.inviteIsUsable("outro")).toBe(false);
  });

  it("usar o convite cria a conta aprovada e registra o pedido", async () => {
    const token = await access.createInvite(admin);
    await access.redeemInvite(token, dados);

    expect((await access.listAccounts()).map((account) => account.displayName)).toEqual(["Bruno"]);
    const [request] = await access.listAccessRequests();
    expect(request).toMatchObject({ source: "invite", status: "approved", decidedBy: admin });
    expect(await access.inviteIsUsable(token)).toBe(false);
  });

  it("convite usado não vale de novo", async () => {
    const token = await access.createInvite(admin);
    await access.redeemInvite(token, dados);
    await expect(
      access.redeemInvite(token, { name: "Carla", email: "carla@exemplo.com", phone: "11999990003" }),
    ).rejects.toMatchObject({ code: "invite_unavailable" });
  });

  it("convite revogado deixa de valer e registra quem revogou", async () => {
    const token = await access.createInvite(admin);
    const [{ id }] = await access.listInvites();
    await access.revokeInvite(admin, id);

    expect(await access.inviteIsUsable(token)).toBe(false);
    await expect(access.redeemInvite(token, dados)).rejects.toMatchObject({ code: "invite_unavailable" });
    const [row] = await db().select().from(accessInvites);
    expect(row.revokedBy).toBe(admin);
    expect((await access.listInvites())[0].revokedAt).not.toBeNull();
  });

  it("não revoga convite já usado nem já revogado", async () => {
    const used = await access.createInvite(admin);
    await access.redeemInvite(used, dados);
    const [usedRow] = await access.listInvites();
    await expect(access.revokeInvite(admin, usedRow.id)).rejects.toMatchObject({ code: "invite_not_revocable" });

    await access.createInvite(admin);
    const fresh = (await access.listInvites()).find((invite) => !invite.usedAt);
    await access.revokeInvite(admin, fresh!.id);
    await expect(access.revokeInvite(admin, fresh!.id)).rejects.toMatchObject({ code: "invite_not_revocable" });
  });

  it("convite vencido não vale", async () => {
    const token = await access.createInvite(admin);
    await db().update(accessInvites).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(access.redeemInvite(token, dados)).rejects.toMatchObject({ code: "invite_unavailable" });
  });

  it("falha ao criar a conta não gasta o convite", async () => {
    const token = await access.createInvite(admin);
    state.failCreate = "email_exists";
    await expect(access.redeemInvite(token, dados)).rejects.toMatchObject({ code: "email_already_registered" });
    expect(await access.inviteIsUsable(token)).toBe(true);
  });

  it("lista os convites com quem gerou", async () => {
    await access.createInvite(admin);
    const [invite] = await access.listInvites();
    expect(invite.createdByName).toBe("Lucas");
    expect(invite.usedAt).toBeNull();
  });
});

describe("conta aprovada", () => {
  it("aprovar a conta confirma a vaga de quem já estava cadastrado em um rolê", async () => {
    const [convidada] = await db().insert(people).values({ displayName: "Mari", phone: "+5511999990001" }).returning();
    const [outing] = await db().insert(outings).values({ name: "Pizza", kind: "event", createdBy: admin }).returning();
    await db()
      .insert(outingParticipants)
      .values({ outingId: outing.id, personId: convidada.id, displayName: "Mari", confirmedAt: null });
    await access.submitAccessRequest(pedido);
    const [request] = await access.listAccessRequests();

    await access.approveAccessRequest(request.id, admin);

    const [vaga] = await db().select().from(outingParticipants).where(eq(outingParticipants.personId, convidada.id));
    expect(vaga.confirmedAt).not.toBeNull();
  });

  it("só é aprovada a pessoa com conta e aprovação", async () => {
    const [semConta] = await db().insert(people).values({ displayName: "Sem conta", phone: "+5511999990005" }).returning();
    expect(await access.isApprovedPerson(semConta.id)).toBe(false);

    const token = await access.createInvite(admin);
    await access.redeemInvite(token, { name: "Bruno", email: "bruno@exemplo.com", phone: "11999990002" });
    const [account] = await access.listAccounts();
    expect(await access.isApprovedPerson(account.id)).toBe(true);
  });
});

describe("convidado que cria cadastro", () => {
  async function convidadoNoRole() {
    const [dono] = await db().insert(people).values({ displayName: "Dono", phone: "+5511999990100" }).returning();
    await approveAccount(db(), dono.id);
    const outingId = await outingsServer.createOuting({ personId: dono.id, displayName: "Dono" }, { name: "Churrasco", kind: "event" });
    await outingsServer.addParticipant(dono.id, outingId, { name: "Bia", phone: "11988880002" });
    const guestUser = crypto.randomUUID();
    await db().execute(sql`insert into auth.users (id, email) values (${guestUser}, ${`${guestUser}@convidado.local`})`);
    const [bia] = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    await db().update(people).set({ userId: guestUser }).where(eq(people.id, bia.id));
    await db().update(outingParticipants).set({ confirmedAt: new Date() }).where(eq(outingParticipants.personId, bia.id));
    return { dono, outingId, guestUser, biaId: bia.id };
  }

  it("o pedido usa o nome e o telefone que a pessoa já tem, e só o e-mail é novo", async () => {
    const { guestUser } = await convidadoNoRole();
    await access.submitGuestAccessRequest(guestUser, { email: " Bia@Exemplo.com " });

    const [request] = await access.listAccessRequests();
    expect(request).toMatchObject({ name: "Bia", email: "bia@exemplo.com", phone: "+5511988880002", status: "pending", guestUserId: guestUser });
    expect(await access.getGuestAccessRequest(guestUser)).toEqual({ status: "pending" });
  });

  it("quem ainda não está em nenhum rolê não pede cadastro por aqui", async () => {
    const semPessoa = crypto.randomUUID();
    await db().execute(sql`insert into auth.users (id, email) values (${semPessoa}, 'x@convidado.local')`);
    await expect(access.submitGuestAccessRequest(semPessoa, { email: "x@exemplo.com" })).rejects.toMatchObject({
      code: "guest_without_person",
    });
  });

  it("o dono do rolê vê quem pediu cadastro", async () => {
    const { dono, outingId, guestUser } = await convidadoNoRole();
    await access.submitGuestAccessRequest(guestUser, { email: "bia@exemplo.com" });

    const detail = await outingsServer.getOuting(dono.id, outingId);
    expect(detail.participants.map((participant) => [participant.displayName, participant.accountRequested])).toEqual([
      ["Dono", false],
      ["Bia", true],
    ]);
  });

  it("aprovar liga a conta à mesma pessoa pela sessão, mantendo o histórico, mesmo com o telefone já ocupado pelo convidado", async () => {
    const { outingId, guestUser, biaId } = await convidadoNoRole();
    await access.submitGuestAccessRequest(guestUser, { email: "bia@exemplo.com" });
    const [request] = await access.listAccessRequests();

    await access.approveAccessRequest(request.id, admin);

    const [bia] = await db().select().from(people).where(eq(people.id, biaId));
    expect(bia.userId).not.toBe(guestUser);
    expect(bia.userId).not.toBeNull();
    expect(bia.accountApprovedAt).not.toBeNull();
    expect(await access.isApprovedPerson(biaId)).toBe(true);
    expect((await outingsServer.getOuting(biaId, outingId)).name).toBe("Churrasco");
    expect(await db().$count(people, eq(people.phone, "+5511988880002"))).toBe(1);
  });

  it("recusado, continua convidado", async () => {
    const { guestUser, biaId } = await convidadoNoRole();
    await access.submitGuestAccessRequest(guestUser, { email: "bia@exemplo.com" });
    const [request] = await access.listAccessRequests();
    await access.rejectAccessRequest(request.id, admin, "");

    const [bia] = await db().select().from(people).where(eq(people.id, biaId));
    expect(bia.userId).toBe(guestUser);
    expect(await access.getGuestAccessRequest(guestUser)).toEqual({ status: "rejected" });
  });
});
