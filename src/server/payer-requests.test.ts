import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenses, outingPayers, payerRequests, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const expensesServer = await import("./expenses");
const server = await import("./payer-requests");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

async function confirmedPerson(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

const day = new Date("2026-03-10T20:00:00Z");

function uber(personId: string, overrides: Partial<Parameters<typeof server.createPayerRequest>[2]["input"]> = {}) {
  return {
    input: {
      description: "Uber",
      totalCents: 6000,
      payers: [{ personId, amountCents: 6000 }],
      split: { method: "equal" as const, personIds: [lucas, maria, caio] },
      occurredAt: day,
      ...overrides,
    },
  };
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
});

describe("pedir para virar pagante", () => {
  it("guarda o pedido com a divisão proposta, visível a quem pediu e ao dono", async () => {
    const id = await server.createPayerRequest(maria, outingId, uber(maria));

    const [mine] = await server.listPayerRequests(maria, outingId);
    expect(mine).toMatchObject({ id, status: "pending", description: "Uber", totalCents: 6000, targetExpenseId: null });
    expect(mine.payers).toEqual([{ personId: maria, name: "Maria", amountCents: 6000 }]);
    expect(await server.listPayerRequests(lucas, outingId)).toHaveLength(1);
    expect(await server.listPayerRequests(caio, outingId)).toEqual([]);
  });

  it("quem já é pagante registra direto", async () => {
    await expensesServer.declarePayer(lucas, outingId, maria);
    await expect(server.createPayerRequest(maria, outingId, uber(maria))).rejects.toMatchObject({ code: "already_payer" });
  });

  it("quem pede precisa constar entre os pagantes, e os outros pagantes precisam ser permitidos", async () => {
    await expect(server.createPayerRequest(maria, outingId, uber(maria, { payers: [{ personId: lucas, amountCents: 6000 }] }))).rejects.toMatchObject({
      code: "requester_must_pay",
    });
    await expect(
      server.createPayerRequest(maria, outingId, uber(maria, { payers: [{ personId: maria, amountCents: 3000 }, { personId: caio, amountCents: 3000 }] })),
    ).rejects.toMatchObject({ code: "payer_not_declared" });
  });

  it("pedir de novo com a mesma chave não duplica", async () => {
    const first = await server.createPayerRequest(maria, outingId, uber(maria, { idempotencyKey: "f1" }));
    const second = await server.createPayerRequest(maria, outingId, uber(maria, { idempotencyKey: "f1" }));
    expect(second).toBe(first);
    expect(await db().$count(payerRequests)).toBe(1);
  });

  it("os valores precisam fechar, sem gravar nada se não fecharem", async () => {
    await expect(server.createPayerRequest(maria, outingId, uber(maria, { payers: [{ personId: maria, amountCents: 5000 }] }))).rejects.toMatchObject({
      code: "payers_total_mismatch",
    });
    expect(await db().$count(payerRequests)).toBe(0);
  });
});

describe("decisão do dono", () => {
  it("aprovar registra a despesa, torna a pessoa pagante e guarda o resultado", async () => {
    const id = await server.createPayerRequest(maria, outingId, uber(maria));
    await server.decidePayerRequest(lucas, outingId, id, { approve: true, note: " valeu " });

    const [request] = await server.listPayerRequests(lucas, outingId);
    expect(request).toMatchObject({ status: "approved", decisionNote: "valeu" });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    expect(expense).toMatchObject({ id: request.resultExpenseId, description: "Uber", totalCents: 6000, version: 1 });
    expect(expense.registeredBy.id).toBe(lucas);
    expect(await db().$count(outingPayers, eq(outingPayers.personId, maria))).toBe(1);
    await expensesServer.registerExpense(maria, outingId, { ...uber(maria).input, idempotencyKey: "depois" });
  });

  it("se o pedido era sobre uma despesa existente, aprovar cria a nova versão com a divisão dos pagantes", async () => {
    const original = await expensesServer.registerExpense(lucas, outingId, {
      description: "Churrasco",
      totalCents: 10000,
      payers: [{ personId: lucas, amountCents: 10000 }],
      split: { method: "equal", personIds: [lucas, maria, caio] },
      occurredAt: day,
    });
    const id = await server.createPayerRequest(maria, outingId, {
      targetExpenseId: original,
      input: {
        description: "Churrasco",
        totalCents: 10000,
        payers: [
          { personId: lucas, amountCents: 7000 },
          { personId: maria, amountCents: 3000 },
        ],
        split: { method: "equal", personIds: [lucas, maria, caio] },
        occurredAt: day,
      },
    });
    await server.decidePayerRequest(lucas, outingId, id, { approve: true, note: "" });

    const [active] = await expensesServer.listExpenses(lucas, outingId);
    expect(active).toMatchObject({ version: 2, totalCents: 10000 });
    expect(active.payers.map((payer) => [payer.name, payer.amountCents])).toEqual([
      ["Lucas", 7000],
      ["Maria", 3000],
    ]);
    const detail = await expensesServer.getExpense(lucas, outingId, active.id);
    expect(detail.history.map((version) => [version.version, version.status])).toEqual([[1, "superseded"]]);
  });

  it("se a despesa mudou desde o pedido, aprovar é recusado e o pedido continua pendente", async () => {
    const original = await expensesServer.registerExpense(lucas, outingId, {
      description: "Churrasco",
      totalCents: 10000,
      payers: [{ personId: lucas, amountCents: 10000 }],
      split: { method: "equal", personIds: [lucas, maria, caio] },
      occurredAt: day,
    });
    const id = await server.createPayerRequest(maria, outingId, {
      targetExpenseId: original,
      input: {
        description: "Churrasco",
        totalCents: 10000,
        payers: [{ personId: lucas, amountCents: 7000 }, { personId: maria, amountCents: 3000 }],
        split: { method: "equal", personIds: [lucas, maria, caio] },
        occurredAt: day,
      },
    });
    await expensesServer.voidExpense(lucas, outingId, original, "Lançada errado");

    await expect(server.decidePayerRequest(lucas, outingId, id, { approve: true, note: "" })).rejects.toMatchObject({ code: "expense_not_active" });
    expect((await server.listPayerRequests(lucas, outingId))[0].status).toBe("pending");
  });

  it("recusar guarda o motivo e não registra nada", async () => {
    const id = await server.createPayerRequest(maria, outingId, uber(maria));
    await server.decidePayerRequest(lucas, outingId, id, { approve: false, note: "Já estava contado" });

    expect((await server.listPayerRequests(lucas, outingId))[0]).toMatchObject({ status: "rejected", decisionNote: "Já estava contado" });
    expect(await db().$count(expenses)).toBe(0);
    expect(await db().$count(outingPayers)).toBe(0);
  });

  it("só o dono decide, e cada pedido uma vez só", async () => {
    const id = await server.createPayerRequest(maria, outingId, uber(maria));
    await expect(server.decidePayerRequest(maria, outingId, id, { approve: true, note: "" })).rejects.toMatchObject({ code: "only_admin_manages_outing" });
    await server.decidePayerRequest(lucas, outingId, id, { approve: true, note: "" });
    await expect(server.decidePayerRequest(lucas, outingId, id, { approve: false, note: "" })).rejects.toMatchObject({ code: "request_not_pending" });
  });
});
