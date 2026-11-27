import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenseDisputes, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const expensesServer = await import("./expenses");
const server = await import("./disputes");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let ana: string;
let outingId: string;
let expenseId: string;

async function confirmedPerson(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
  ana = await confirmedPerson("Ana", "11999990003");
  await expensesServer.declarePayer(lucas, outingId, ana);
  expenseId = await expensesServer.registerExpense(lucas, outingId, {
    description: "Churrasco",
    totalCents: 10000,
    payers: [
      { personId: lucas, amountCents: 6000 },
      { personId: ana, amountCents: 4000 },
    ],
    split: { method: "equal", personIds: [lucas, maria, caio, ana] },
    occurredAt: new Date("2026-03-10T20:00:00Z"),
  });
});

describe("abrir contestação", () => {
  it("contestar valor ou divisão vai só para o dono", async () => {
    const id = await server.openDispute(maria, outingId, expenseId, { subject: "amount", message: "  O valor está alto " });
    const [dispute] = await server.listDisputes(maria, outingId, expenseId);
    expect(dispute).toMatchObject({ id, subject: "amount", message: "O valor está alto", status: "open", canDecide: false });
    expect(dispute.approvals.map((approval) => approval.name)).toEqual(["Lucas"]);
    expect((await server.listDisputes(lucas, outingId, expenseId))[0].canDecide).toBe(true);
  });

  it("\"não participei\" vai ao dono e a todos os pagantes", async () => {
    await server.openDispute(maria, outingId, expenseId, { subject: "not_participated", message: "Não fui" });
    const [dispute] = await server.listDisputes(maria, outingId, expenseId);
    expect(dispute.approvals.map((approval) => approval.name).sort()).toEqual(["Ana", "Lucas"]);
  });

  it("quem pagou não diz que não participou, e só vale na divisão por igual", async () => {
    await expect(server.openDispute(ana, outingId, expenseId, { subject: "not_participated", message: "x" })).rejects.toMatchObject({ code: "payer_cannot_opt_out" });
    const exact = await expensesServer.registerExpense(lucas, outingId, {
      description: "Bebida",
      totalCents: 1000,
      payers: [{ personId: lucas, amountCents: 1000 }],
      split: { method: "exact", shares: [{ personId: lucas, amountCents: 500 }, { personId: maria, amountCents: 500 }] },
      occurredAt: new Date(),
    });
    await expect(server.openDispute(maria, outingId, exact, { subject: "not_participated", message: "x" })).rejects.toMatchObject({ code: "not_participated_needs_equal_split" });
  });

  it("mensagem obrigatória, uma contestação aberta por pessoa e só de quem está na despesa", async () => {
    await expect(server.openDispute(maria, outingId, expenseId, { subject: "amount", message: " " })).rejects.toMatchObject({ code: "dispute_message_required" });
    await server.openDispute(maria, outingId, expenseId, { subject: "amount", message: "a" });
    await expect(server.openDispute(maria, outingId, expenseId, { subject: "split", message: "b" })).rejects.toMatchObject({ code: "dispute_already_open" });
    const [fora] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.openDispute(fora.id, outingId, expenseId, { subject: "amount", message: "x" })).rejects.toMatchObject({ code: "outing_not_found" });
  });
});

describe("decidir", () => {
  it("o dono aceita uma contestação de valor: ela fica aceita, e ele corrige a despesa em seguida", async () => {
    await server.openDispute(maria, outingId, expenseId, { subject: "amount", message: "Valor alto" });
    const [open] = await server.listDisputes(lucas, outingId);
    await server.decideDispute(lucas, outingId, open.id, { approve: true, note: " certo " });

    const [after] = await server.listDisputes(lucas, outingId);
    expect(after).toMatchObject({ status: "approved", resultExpenseId: null });
    expect(after.approvals[0]).toMatchObject({ decision: "approved", note: "certo" });
  });

  it("\"não participei\" só vale quando o dono e todos os pagantes aprovam, e então nasce a nova versão sem a pessoa", async () => {
    await server.openDispute(maria, outingId, expenseId, { subject: "not_participated", message: "Não fui" });
    const [open] = await server.listDisputes(lucas, outingId);

    await server.decideDispute(lucas, outingId, open.id, { approve: true, note: "" });
    expect((await server.listDisputes(lucas, outingId))[0].status).toBe("open");
    expect((await expensesServer.listExpenses(lucas, outingId))[0].version).toBe(1);

    await server.decideDispute(ana, outingId, open.id, { approve: true, note: "" });
    const [done] = await server.listDisputes(lucas, outingId);
    expect(done.status).toBe("approved");

    const [active] = await expensesServer.listExpenses(lucas, outingId);
    expect(active).toMatchObject({ id: done.resultExpenseId, version: 2, totalCents: 10000 });
    expect(active.shares.map((share) => share.name).sort()).toEqual(["Ana", "Caio", "Lucas"]);
    expect(active.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(10000);
  });

  it("uma recusa rejeita a contestação e nada muda na despesa", async () => {
    await server.openDispute(maria, outingId, expenseId, { subject: "not_participated", message: "Não fui" });
    const [open] = await server.listDisputes(lucas, outingId);
    await server.decideDispute(ana, outingId, open.id, { approve: false, note: "Você estava lá" });

    expect((await server.listDisputes(lucas, outingId))[0].status).toBe("rejected");
    const [active] = await expensesServer.listExpenses(lucas, outingId);
    expect(active.version).toBe(1);
    expect(active.shares).toHaveLength(4);
  });

  it("só quem é aprovador decide, e uma vez só", async () => {
    await server.openDispute(maria, outingId, expenseId, { subject: "amount", message: "a" });
    const [open] = await server.listDisputes(lucas, outingId);
    await expect(server.decideDispute(caio, outingId, open.id, { approve: true, note: "" })).rejects.toMatchObject({ code: "not_an_approver" });
    await expect(server.decideDispute(ana, outingId, open.id, { approve: true, note: "" })).rejects.toMatchObject({ code: "not_an_approver" });
    await server.decideDispute(lucas, outingId, open.id, { approve: false, note: "" });
    await expect(server.decideDispute(lucas, outingId, open.id, { approve: true, note: "" })).rejects.toMatchObject({ code: "dispute_already_resolved" });
  });

  it("se a despesa mudou desde a contestação, aprovar \"não participei\" é recusado e a contestação continua aberta", async () => {
    await server.openDispute(maria, outingId, expenseId, { subject: "not_participated", message: "Não fui" });
    const [open] = await server.listDisputes(lucas, outingId);
    await expensesServer.voidExpense(lucas, outingId, expenseId, "Lançada errado");
    await server.decideDispute(lucas, outingId, open.id, { approve: true, note: "" });
    await expect(server.decideDispute(ana, outingId, open.id, { approve: true, note: "" })).rejects.toMatchObject({ code: "expense_not_active" });
    expect((await db().select().from(expenseDisputes).where(eq(expenseDisputes.id, open.id)))[0].status).toBe("open");
  });

  it("rolê encerrado não aceita contestação", async () => {
    const { outings } = await import("@/db/schema");
    await db().update(outings).set({ status: "closed", closedAt: new Date() });
    await expect(server.openDispute(maria, outingId, expenseId, { subject: "amount", message: "a" })).rejects.toMatchObject({ code: "outing_closed" });
  });
});
