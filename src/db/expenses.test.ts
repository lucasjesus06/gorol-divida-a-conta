import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { expensePayers, expenseShares, expenses, outingPayers, outingParticipants, people } from "@/db/schema";
import { createTestDatabase, insertExpense, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let caio: string;
let stranger: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

async function expectRejectedWith(promise: Promise<unknown>, reason: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught as { message: string; cause?: { message: string } },
  );
  expect(error, "deveria ter sido recusado").not.toBeNull();
  expect(`${error?.message} ${error?.cause?.message ?? ""}`).toContain(reason);
}

function registerAs(personId: string, total: number, payers: Record<string, number>, shares: Record<string, number>) {
  return as(personId, async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({ outingId, registeredBy: personId, totalCents: total, description: "Pizza", splitMethod: "exact", occurredAt: new Date() })
      .returning({ id: expenses.id });
    await tx.insert(expensePayers).values(Object.entries(payers).map(([id, amountCents]) => ({ expenseId: expense.id, personId: id, amountCents })));
    await tx.insert(expenseShares).values(Object.entries(shares).map(([id, amountCents]) => ({ expenseId: expense.id, personId: id, amountCents })));
    return expense.id;
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900100001", "+5511900100002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [caioRow, strangerRow] = await db
    .insert(people)
    .values([
      { displayName: "Caio", phone: "+5511900100003" },
      { displayName: "Intruso", phone: "+5511900100004" },
    ])
    .returning();
  caio = caioRow.id;
  stranger = strangerRow.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
  await db.insert(outingPayers).values({ outingId, personId: maria, declaredBy: lucas });
});

describe("a despesa fecha as contas", () => {
  it("aceita quando pagamentos e partes somam o total", async () => {
    await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 3000, payers: { [lucas]: 3000 }, shares: { [lucas]: 1000, [maria]: 1000, [caio]: 1000 } });
  });

  it.each([
    ["pagamentos diferentes do total", { payers: 2999, shares: 3000 }],
    ["partes diferentes do total", { payers: 3000, shares: 2999 }],
  ])("recusa %s", async (_name, sums) => {
    await expect(
      insertExpense(db, { outingId, registeredBy: lucas, totalCents: 3000, payers: { [lucas]: sums.payers }, shares: { [maria]: sums.shares } }),
    ).rejects.toThrow("expense_not_balanced");
  });

  it("recusa quem não participa do rolê", async () => {
    await expect(
      insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1000, payers: { [lucas]: 1000 }, shares: { [lucas]: 500, [stranger]: 500 } }),
    ).rejects.toThrow("expense_person_not_in_outing");
  });

  it("recusa pagador que não é o dono nem foi declarado", async () => {
    await expect(
      insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1000, payers: { [caio]: 1000 }, shares: { [lucas]: 500, [caio]: 500 } }),
    ).rejects.toThrow("expense_payer_not_declared");
  });

  it("aceita pagador declarado", async () => {
    await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1000, payers: { [maria]: 1000 }, shares: { [lucas]: 500, [maria]: 500 } });
  });
});

describe("o histórico é imutável", () => {
  it("não deixa mudar valor, nem apagar, nem mexer em pagamentos e partes", async () => {
    const expense = await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1000, payers: { [lucas]: 1000 }, shares: { [lucas]: 500, [maria]: 500 } });
    await expectRejectedWith(db.update(expenses).set({ totalCents: 2000 }).where(eq(expenses.id, expense.id)), "expense_is_immutable");
    await expectRejectedWith(db.delete(expenses).where(eq(expenses.id, expense.id)), "financial_history_is_immutable");
    await expectRejectedWith(db.update(expensePayers).set({ amountCents: 1 }).where(eq(expensePayers.expenseId, expense.id)), "financial_history_is_immutable");
    await expectRejectedWith(db.delete(expenseShares).where(eq(expenseShares.expenseId, expense.id)), "financial_history_is_immutable");
  });

  it("só a versão ativa muda de situação, e só para substituída ou anulada", async () => {
    const expense = await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1000, payers: { [lucas]: 1000 }, shares: { [lucas]: 500, [maria]: 500 } });
    await expect(db.update(expenses).set({ status: "voided" }).where(eq(expenses.id, expense.id))).rejects.toThrow();
    await db.update(expenses).set({ status: "voided", voidedBy: lucas, voidReason: "Duplicada" }).where(eq(expenses.id, expense.id));
    await expect(
      db.update(expenses).set({ status: "superseded", voidedBy: null, voidReason: null }).where(eq(expenses.id, expense.id)),
    ).rejects.toThrow();
  });

  it("cada versão tem uma única revisão", async () => {
    const first = await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1000, payers: { [lucas]: 1000 }, shares: { [lucas]: 500, [maria]: 500 } });
    await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1200, payers: { [lucas]: 1200 }, shares: { [lucas]: 600, [maria]: 600 }, version: 2, previousVersionId: first.id });
    await expect(
      insertExpense(db, { outingId, registeredBy: lucas, totalCents: 1300, payers: { [lucas]: 1300 }, shares: { [lucas]: 650, [maria]: 650 }, version: 2, previousVersionId: first.id }),
    ).rejects.toThrow();
  });
});

describe("quem registra e quem enxerga", () => {
  it("dono e pagante declarado registram; os demais participantes não", async () => {
    await registerAs(lucas, 1000, { [lucas]: 1000 }, { [lucas]: 500, [caio]: 500 });
    await registerAs(maria, 1000, { [maria]: 1000 }, { [maria]: 500, [caio]: 500 });
    await expect(registerAs(caio, 1000, { [lucas]: 1000 }, { [lucas]: 500, [caio]: 500 })).rejects.toThrow();
    await expect(registerAs(stranger, 1000, { [lucas]: 1000 }, { [lucas]: 1000 })).rejects.toThrow();
  });

  it("ninguém registra em nome de outra pessoa", async () => {
    await expect(registerAs(maria, 1000, { [maria]: 1000 }, { [maria]: 1000 }).then(() => as(maria, (tx) => tx.insert(expenses).values({ outingId, registeredBy: lucas, totalCents: 10, description: "x", splitMethod: "exact", occurredAt: new Date() })))).rejects.toThrow();
  });

  it("só participantes enxergam despesas, pagamentos e partes", async () => {
    expect(await as(caio, (tx) => tx.$count(expenses))).toBeGreaterThan(0);
    expect(await as(caio, (tx) => tx.$count(expensePayers))).toBeGreaterThan(0);
    expect(await as(stranger, (tx) => tx.$count(expenses))).toBe(0);
    expect(await as(stranger, (tx) => tx.$count(expenseShares))).toBe(0);
    expect(await as(stranger, (tx) => tx.$count(outingPayers))).toBe(0);
  });

  it("só o dono declara pagantes", async () => {
    await expect(as(maria, (tx) => tx.insert(outingPayers).values({ outingId, personId: caio, declaredBy: maria }))).rejects.toThrow();
    await as(lucas, (tx) => tx.insert(outingPayers).values({ outingId, personId: caio, declaredBy: lucas }));
  });

  it("quem registrou ou o dono anulam; outro pagante não", async () => {
    const own = await registerAs(maria, 500, { [maria]: 500 }, { [maria]: 250, [caio]: 250 });
    const lucasOwn = await registerAs(lucas, 500, { [lucas]: 500 }, { [lucas]: 250, [caio]: 250 });
    const voidIt = (personId: string, id: string) =>
      as(personId, (tx) => tx.update(expenses).set({ status: "voided", voidedBy: personId, voidReason: "Erro" }).where(eq(expenses.id, id)).returning({ id: expenses.id }));

    expect(await voidIt(maria, lucasOwn)).toEqual([]);
    expect(await voidIt(maria, own)).toHaveLength(1);
    const another = await registerAs(maria, 500, { [maria]: 500 }, { [maria]: 250, [caio]: 250 });
    expect(await voidIt(lucas, another)).toHaveLength(1);
  });
});
