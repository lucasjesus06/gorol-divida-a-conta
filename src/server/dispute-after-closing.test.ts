import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifications, outingReopenings, outings, people } from "@/db/schema";
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
const lifecycle = await import("./outing-lifecycle");
const disputes = await import("./disputes");
const params = await import("./system-parameters");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;
let expenseId: string;

const day = 86_400_000;

async function member(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

const outing = async () => (await db().select().from(outings).where(eq(outings.id, outingId)))[0];
const closedDaysAgo = (days: number) => db().update(outings).set({ closedAt: new Date(Date.now() - days * day) }).where(eq(outings.id, outingId));

const revision = (totalCents: number) => ({
  description: "Carne corrigida",
  totalCents,
  payers: [{ personId: lucas, amountCents: totalCents }],
  split: { method: "equal" as const, personIds: [lucas, maria, caio] },
  occurredAt: new Date("2026-03-10T20:00:00Z"),
});

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await member("Maria", "11999990001");
  caio = await member("Caio", "11999990002");
  expenseId = await expensesServer.registerExpense(lucas, outingId, { ...revision(9000), occurredAt: new Date("2026-03-10T20:00:00Z") });
  for (const debtor of [maria, caio]) {
    const id = await paymentsServer.declarePayment(debtor, outingId, { toId: lucas, amountCents: 3000 });
    await paymentsServer.confirmPayment(lucas, outingId, id);
  }
  await lifecycle.closeOuting(lucas, outingId);
  await db().delete(notifications);
});

describe("contestar dentro dos 7 dias", () => {
  it("abre a contestação e o rolê continua encerrado", async () => {
    await closedDaysAgo(3);
    await disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor errado" });
    expect((await outing()).status).toBe("closed");
    expect(await db().$count(outingReopenings)).toBe(0);
    expect((await disputes.listDisputes(lucas, outingId, expenseId))[0]).toMatchObject({ status: "open", canDecide: true });
  });

  it("o dono aceita e corrige a despesa, mesmo com o rolê encerrado, uma vez", async () => {
    await closedDaysAgo(3);
    const disputeId = await disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor errado" });
    await expect(expensesServer.reviseExpense(lucas, outingId, expenseId, revision(6000))).rejects.toMatchObject({ code: "outing_closed" });

    await disputes.decideDispute(lucas, outingId, disputeId, { approve: true, note: "" });
    const newId = await expensesServer.reviseExpense(lucas, outingId, expenseId, revision(6000));
    expect((await expensesServer.getExpense(lucas, outingId, newId)).totalCents).toBe(6000);
    expect((await outing()).status).toBe("closed");
    await expect(expensesServer.reviseExpense(lucas, outingId, newId, revision(5000))).rejects.toMatchObject({ code: "outing_closed" });
  });

  it("rolê encerrado continua sem aceitar despesa nova nem anulação", async () => {
    await expect(expensesServer.registerExpense(lucas, outingId, revision(1000))).rejects.toMatchObject({ code: "outing_closed" });
    await expect(expensesServer.voidExpense(lucas, outingId, expenseId, "teste")).rejects.toMatchObject({ code: "outing_closed" });
  });
});

describe("contestar depois dos 7 dias", () => {
  it("sem confirmação não abre e nada muda", async () => {
    await closedDaysAgo(10);
    await expect(disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor errado" })).rejects.toMatchObject({ code: "dispute_late_needs_confirmation" });
    expect((await outing()).status).toBe("closed");
    expect(await disputes.listDisputes(lucas, outingId, expenseId)).toEqual([]);
  });

  it("com confirmação reabre o rolê, registra a reabertura e avisa os outros", async () => {
    await closedDaysAgo(10);
    const disputeId = await disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor errado", confirmLate: true });
    const row = await outing();
    expect(row).toMatchObject({ status: "active", closedAt: null, closedBy: null });
    const [reopening] = await db().select().from(outingReopenings);
    expect(reopening).toMatchObject({ outingId, disputeId, reopenedBy: maria, previousClosedBy: lucas });
    expect((await db().select().from(notifications)).map((notice) => [notice.personId, notice.kind]).sort()).toEqual(
      [[lucas, "outing_reopened"], [caio, "outing_reopened"]].sort(),
    );
  });

  it("reaberto, o rolê volta a aceitar lançamentos e pode ser encerrado de novo quando tudo estiver acertado", async () => {
    await closedDaysAgo(10);
    await disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor errado", confirmLate: true });
    await expensesServer.registerExpense(lucas, outingId, { ...revision(900), description: "Gelo" });
    await expect(lifecycle.closeOuting(lucas, outingId)).rejects.toMatchObject({ code: "outing_cannot_close" });
  });

  it("o prazo segue o parâmetro: com 14 dias, 10 dias depois ainda está no prazo", async () => {
    await params.saveParameter(lucas, "dispute.window_days", 14);
    await closedDaysAgo(10);
    await disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor errado" });
    expect((await outing()).status).toBe("closed");
  });

  it("com 3 dias, 5 dias depois já é fora do prazo e a mensagem diz 3", async () => {
    await params.saveParameter(lucas, "dispute.window_days", 3);
    await closedDaysAgo(5);
    await expect(disputes.openDispute(maria, outingId, expenseId, { subject: "amount", message: "x" })).rejects.toMatchObject({ code: "dispute_late_needs_confirmation" });
  });

  it("só quem participa da despesa contesta, como antes", async () => {
    await closedDaysAgo(10);
    const [stranger] = await db().insert(people).values({ displayName: "Intruso", phone: "+5511999990099" }).returning();
    await approveAccount(db(), stranger.id);
    await expect(disputes.openDispute(stranger.id, outingId, expenseId, { subject: "amount", message: "Oi", confirmLate: true })).rejects.toMatchObject({ code: "outing_not_found" });
  });
});
