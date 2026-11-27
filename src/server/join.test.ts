import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { outingJoinAttempts, outingJoinLinks, outingParticipants, people } from "@/db/schema";
import { MAX_FAILED_ATTEMPTS_PER_PARTICIPANT } from "@/domain/join";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outings = await import("./outings");
const join = await import("./join");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: { personId: string; displayName: string };
let outingId: string;
let biaParticipant: string;

async function guest(email = `${crypto.randomUUID()}@convidado.local`) {
  const id = crypto.randomUUID();
  await db().execute(sql`insert into auth.users (id, email) values (${id}, ${email})`);
  return id;
}

async function participantByName(displayName: string) {
  const [row] = await db().select({ id: outingParticipants.id }).from(outingParticipants).where(eq(outingParticipants.displayName, displayName));
  return row.id;
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = { personId: owner.id, displayName: "Lucas" };
  outingId = await outings.createOuting(lucas, { name: "Churrasco", kind: "event" });
  await outings.addParticipant(lucas.personId, outingId, { name: "Bia", phone: "11988880002" });
  await outings.addParticipant(lucas.personId, outingId, { name: "Caio", phone: "11977770003" });
  biaParticipant = await participantByName("Bia");
});

describe("link do rolê", () => {
  it("só o dono gera o link, e o banco guarda só o resumo dele", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    const [row] = await db().select().from(outingJoinLinks);
    expect(row.tokenHash).not.toContain(token);
    expect(await join.getJoinPage(token)).not.toBeNull();

    const [bia] = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    await expect(join.createJoinLink(bia.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
  });

  it("gerar outro link revoga o anterior", async () => {
    const first = await join.createJoinLink(lucas.personId, outingId);
    const second = await join.createJoinLink(lucas.personId, outingId);
    expect(await join.getJoinPage(first)).toBeNull();
    expect(await join.getJoinPage(second)).not.toBeNull();
  });

  it("revogar, vencer ou encerrar o rolê desativa o link", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    await db().update(outingJoinLinks).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await join.getJoinPage(token)).toBeNull();

    const fresh = await join.createJoinLink(lucas.personId, outingId);
    await join.revokeJoinLink(lucas.personId, outingId);
    expect(await join.getJoinPage(fresh)).toBeNull();
    expect(await join.getActiveJoinLink(lucas.personId, outingId)).toBeNull();
  });

  it("a tela de entrada mostra só o nome do rolê e os nomes ainda livres, sem telefone", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    const page = await join.getJoinPage(token);
    expect(page).toEqual({
      outingName: "Churrasco",
      participants: [
        { id: expect.any(String), displayName: "Bia" },
        { id: expect.any(String), displayName: "Caio" },
      ],
    });
  });
});

describe("pedir para entrar", () => {
  it("com o telefone certo, o pedido fica pendente e o nome some da lista", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    await join.requestJoin(token, await guest(), { participantId: biaParticipant, phone: "(11) 98888-0002" });

    expect((await join.getJoinPage(token))?.participants.map((participant) => participant.displayName)).toEqual(["Caio"]);
    expect((await join.listJoinRequests(lucas.personId, outingId)).map((request) => request.name)).toEqual(["Bia"]);
  });

  it("telefone errado não entra e a tentativa é registrada", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    await expect(join.requestJoin(token, await guest(), { participantId: biaParticipant, phone: "11999999999" })).rejects.toMatchObject({
      code: "phone_mismatch",
    });
    expect(await db().$count(outingJoinAttempts, eq(outingJoinAttempts.succeeded, false))).toBe(1);
    expect(await join.listJoinRequests(lucas.personId, outingId)).toEqual([]);
  });

  it("depois de errar demais, nem o telefone certo passa", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS_PER_PARTICIPANT; attempt += 1) {
      await expect(join.requestJoin(token, await guest(), { participantId: biaParticipant, phone: "11999999999" })).rejects.toMatchObject({
        code: "phone_mismatch",
      });
    }
    await expect(join.requestJoin(token, await guest(), { participantId: biaParticipant, phone: "11988880002" })).rejects.toMatchObject({
      code: "too_many_join_attempts",
    });
  });

  it("link inválido, nome de outro rolê ou nome já escolhido são recusados", async () => {
    await expect(join.requestJoin("inventado", await guest(), { participantId: biaParticipant, phone: "11988880002" })).rejects.toMatchObject({
      code: "link_unavailable",
    });

    const token = await join.createJoinLink(lucas.personId, outingId);
    const lucasRowId = await participantByName("Lucas");
    await expect(join.requestJoin(token, await guest(), { participantId: lucasRowId, phone: "11999990000" })).rejects.toMatchObject({
      code: "participant_unavailable",
    });
  });

  it("cada sessão faz um pedido por vez no rolê", async () => {
    const token = await join.createJoinLink(lucas.personId, outingId);
    const session = await guest();
    await join.requestJoin(token, session, { participantId: biaParticipant, phone: "11988880002" });
    await expect(
      join.requestJoin(token, session, { participantId: await participantByName("Caio"), phone: "11977770003" }),
    ).rejects.toMatchObject({ code: "already_requested" });
  });
});


describe("decisão do dono", () => {
  async function pedido(session: string) {
    const token = await join.createJoinLink(lucas.personId, outingId);
    await join.requestJoin(token, session, { participantId: biaParticipant, phone: "11988880002" });
    return (await join.listJoinRequests(lucas.personId, outingId))[0].id;
  }

  it("aprovar vincula a sessão à pessoa e libera o rolê para ela", async () => {
    const session = await guest();
    const requestId = await pedido(session);
    await join.decideJoinRequest(lucas.personId, outingId, requestId, true);

    const [bia] = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    expect(bia.userId).toBe(session);
    const detail = await outings.getOuting(bia.id, outingId);
    expect(detail.participants.find((participant) => participant.displayName === "Bia")?.joined).toBe(true);
    expect(await join.getGuestJoinStatus(session)).toEqual({ status: "approved", outingName: "Churrasco" });
  });

  it("recusar mantém a pessoa de fora", async () => {
    const session = await guest();
    const requestId = await pedido(session);
    await join.decideJoinRequest(lucas.personId, outingId, requestId, false);

    const [bia] = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    expect(bia.userId).toBeNull();
    await expect(outings.getOuting(bia.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
    expect(await join.getGuestJoinStatus(session)).toMatchObject({ status: "rejected" });
  });

  it("só o dono decide, e cada pedido é decidido uma vez", async () => {
    const requestId = await pedido(await guest());
    const [caio] = await db().select().from(people).where(eq(people.phone, "+5511977770003"));
    await expect(join.decideJoinRequest(caio.id, outingId, requestId, true)).rejects.toMatchObject({ code: "outing_not_found" });

    await join.decideJoinRequest(lucas.personId, outingId, requestId, true);
    await expect(join.decideJoinRequest(lucas.personId, outingId, requestId, true)).rejects.toMatchObject({ code: "request_not_pending" });
  });

  it("liberar o nome devolve a vaga: o impostor perde o rolê e a pessoa de verdade retoma", async () => {
    const impostor = await guest();
    await join.decideJoinRequest(lucas.personId, outingId, await pedido(impostor), true);

    const participantId = biaParticipant;
    await join.releaseParticipant(lucas.personId, outingId, participantId);
    const [bia] = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    await expect(outings.getOuting(bia.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });

    const real = await guest();
    const token = await join.createJoinLink(lucas.personId, outingId);
    await join.requestJoin(token, real, { participantId, phone: "11988880002" });
    await join.decideJoinRequest(lucas.personId, outingId, (await join.listJoinRequests(lucas.personId, outingId))[0].id, true);
    const [after] = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    expect(after.userId).toBe(real);
  });

  it("uma sessão já vinculada a uma pessoa não vira outra", async () => {
    const session = await guest();
    await join.decideJoinRequest(lucas.personId, outingId, await pedido(session), true);

    const token = await join.createJoinLink(lucas.personId, outingId);
    await join.requestJoin(token, session, { participantId: await participantByName("Caio"), phone: "11977770003" });
    const [request] = await join.listJoinRequests(lucas.personId, outingId);
    await expect(join.decideJoinRequest(lucas.personId, outingId, request.id, true)).rejects.toMatchObject({
      code: "guest_linked_elsewhere",
    });
  });

  it("não libera o dono nem quem tem conta aprovada", async () => {
    const [lucasRow] = await db().select({ id: outingParticipants.id }).from(outingParticipants).where(eq(outingParticipants.displayName, "Lucas"));
    await expect(join.releaseParticipant(lucas.personId, outingId, lucasRow.id)).rejects.toMatchObject({ code: "participant_not_releasable" });

    const [caio] = await db().select().from(people).where(eq(people.phone, "+5511977770003"));
    await approveAccount(db(), caio.id);
    await expect(join.releaseParticipant(lucas.personId, outingId, await participantByName("Caio"))).rejects.toMatchObject({
      code: "participant_not_releasable",
    });
  });
});

describe("pessoa que já tem conta", () => {
  it("entra no rolê direto, sem aprovação do dono, e fica fora da lista do link", async () => {
    const [dani] = await db().insert(people).values({ displayName: "Dani", phone: "+5511966660004" }).returning();
    await approveAccount(db(), dani.id);
    await outings.addParticipant(lucas.personId, outingId, { name: "Dani", phone: "11966660004" });

    expect((await outings.getOuting(dani.id, outingId)).name).toBe("Churrasco");
    const token = await join.createJoinLink(lucas.personId, outingId);
    expect((await join.getJoinPage(token))?.participants.map((participant) => participant.displayName)).toEqual(["Bia", "Caio"]);
  });
});
