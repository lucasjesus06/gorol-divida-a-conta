import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRequests, notifications, outingParticipants, outings, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const expensesServer = await import("./expenses");
const paymentsServer = await import("./payments");
const balancesServer = await import("./balances");
const server = await import("./outing-lifecycle");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

async function member(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

async function expense(payer: string, total: number, among: string[]) {
  await expensesServer.declarePayer(lucas, outingId, payer).catch(() => undefined);
  return expensesServer.registerExpense(lucas, outingId, {
    description: "Despesa",
    totalCents: total,
    payers: [{ personId: payer, amountCents: total }],
    split: { method: "equal", personIds: among },
    occurredAt: new Date("2026-03-10T20:00:00Z"),
  });
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await member("Maria", "11999990001");
  caio = await member("Caio", "11999990002");
});

describe("encerrar o rolê", () => {
  it("rolê sem lançamentos encerra, registra quem encerrou e avisa os outros", async () => {
    await server.closeOuting(lucas, outingId);
    const [row] = await db().select().from(outings).where(eq(outings.id, outingId));
    expect(row).toMatchObject({ status: "closed", closedBy: lucas });
    expect((await db().select().from(notifications)).map((notice) => notice.personId).sort()).toEqual([maria, caio].sort());
  });

  it("com saldo em aberto não encerra e diz quem deve", async () => {
    await expense(lucas, 9000, [lucas, maria, caio]);
    expect((await server.getCloseBlockers(lucas, outingId))[0]).toMatchObject({ code: "open_balance" });
    await expect(server.closeOuting(lucas, outingId)).rejects.toMatchObject({ code: "outing_cannot_close" });
    expect((await db().select().from(outings))[0].status).toBe("active");
  });

  it("depois que todos pagam e o credor confirma, encerra; a dívida acertada some do bloqueio", async () => {
    await expense(lucas, 9000, [lucas, maria, caio]);
    for (const debtor of [maria, caio]) {
      const id = await paymentsServer.declarePayment(debtor, outingId, { toId: lucas, amountCents: 3000 });
      await expect(server.closeOuting(lucas, outingId)).rejects.toMatchObject({ code: "outing_cannot_close" });
      await paymentsServer.confirmPayment(lucas, outingId, id);
    }
    expect(await server.getCloseBlockers(lucas, outingId)).toEqual([]);
    await server.closeOuting(lucas, outingId);
    await expect(expense(lucas, 1000, [lucas, maria])).rejects.toMatchObject({ code: "outing_closed" });
  });

  it("só o dono encerra, e uma vez", async () => {
    await expect(server.closeOuting(maria, outingId)).rejects.toMatchObject({ code: "only_admin_manages_outing" });
    await server.closeOuting(lucas, outingId);
    await expect(server.closeOuting(lucas, outingId)).rejects.toMatchObject({ code: "outing_closed" });
  });

  it("convidado com pedido de cadastro pendente bloqueia o encerramento", async () => {
    const guestUser = crypto.randomUUID();
    await db().execute(sql`insert into auth.users (id, email) values (${guestUser}, ${`${guestUser}@convidado.local`})`);
    const [edu] = await db().insert(people).values({ displayName: "Edu", phone: "+5511999990009", userId: guestUser }).returning();
    await db().insert(outingParticipants).values({ outingId, personId: edu.id, displayName: "Edu" });
    await db().insert(accessRequests).values({ name: "Edu", email: "edu@exemplo.com", phone: "+5511999990009", guestUserId: guestUser });
    expect((await server.getCloseBlockers(lucas, outingId)).map((blocker) => blocker.code)).toContain("guest_account_pending");
  });
});

describe("sair do rolê", () => {
  it("quem não tem nada em aberto sai, perde o acesso e o dono é avisado", async () => {
    await server.leaveOuting(caio, outingId);
    const [row] = await db().select().from(outingParticipants).where(eq(outingParticipants.personId, caio));
    expect(row).toMatchObject({ leftBy: caio });
    expect(row.leftAt).not.toBeNull();
    await expect(outingsServer.getOuting(caio, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
    expect((await outingsServer.getOuting(lucas, outingId)).participants.map((participant) => participant.displayName)).toEqual(["Lucas", "Maria"]);
    expect((await db().select().from(notifications))[0]).toMatchObject({ personId: lucas, kind: "participant_left" });
  });

  it("quem deve ao dono não sai", async () => {
    await expense(lucas, 9000, [lucas, maria, caio]);
    await expect(server.leaveOuting(maria, outingId)).rejects.toMatchObject({ code: "participant_cannot_leave" });
  });

  it("quem deve a um terceiro, e não ao dono, também não sai: o terceiro seria prejudicado", async () => {
    await expensesServer.declarePayer(lucas, outingId, maria);
    await expensesServer.registerExpense(maria, outingId, {
      description: "Gelo",
      totalCents: 3000,
      payers: [{ personId: maria, amountCents: 3000 }],
      split: { method: "equal", personIds: [maria, caio] },
      occurredAt: new Date("2026-03-10T21:00:00Z"),
    });
    expect((await server.getLeaveBlockers(lucas, outingId, caio))[0].message).toContain("Maria");
    await expect(server.removeParticipant(lucas, outingId, caio)).rejects.toMatchObject({ code: "participant_cannot_leave" });
    await expect(server.leaveOuting(caio, outingId)).rejects.toMatchObject({ code: "participant_cannot_leave" });
  });

  it("o dono não sai, e não dá para sair de rolê encerrado", async () => {
    await expect(server.leaveOuting(lucas, outingId)).rejects.toMatchObject({ code: "participant_cannot_leave" });
    await server.closeOuting(lucas, outingId);
    await expect(server.leaveOuting(maria, outingId)).rejects.toMatchObject({ code: "outing_closed" });
  });

  it("pagamento esperando confirmação segura a saída de quem pagou", async () => {
    await expense(lucas, 9000, [lucas, maria]);
    await paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents: 4500 });
    await expect(server.leaveOuting(maria, outingId)).rejects.toMatchObject({ code: "participant_cannot_leave" });
  });
});

describe("remover participante", () => {
  it("só o dono remove, quem está limpo, e a pessoa é avisada", async () => {
    await expect(server.removeParticipant(maria, outingId, caio)).rejects.toMatchObject({ code: "only_admin_manages_outing" });
    await expect(server.removeParticipant(lucas, outingId, lucas)).rejects.toMatchObject({ code: "owner_cannot_leave" });
    await server.removeParticipant(lucas, outingId, caio);
    expect((await db().select().from(notifications))[0]).toMatchObject({ personId: caio, kind: "participant_removed" });
    await expect(server.removeParticipant(lucas, outingId, caio)).rejects.toMatchObject({ code: "participant_not_found" });
  });

  it("quem saiu continua com o nome nas despesas antigas e não entra em despesa nova", async () => {
    await expense(lucas, 9000, [lucas, maria, caio]);
    for (const debtor of [maria, caio]) {
      const id = await paymentsServer.declarePayment(debtor, outingId, { toId: lucas, amountCents: 3000 });
      await paymentsServer.confirmPayment(lucas, outingId, id);
    }
    await server.removeParticipant(lucas, outingId, caio);

    const [old] = await expensesServer.listExpenses(lucas, outingId);
    expect(old.shares.map((share) => share.name)).toContain("Caio");
    await expect(expense(lucas, 3000, [lucas, caio])).rejects.toBeTruthy();
    const view = await balancesServer.getOutingBalances(lucas, outingId);
    expect(view.balances.map((balance) => balance.name)).toContain("Caio");
  });
});
