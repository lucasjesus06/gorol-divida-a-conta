import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { expensePayers, expenseShares, expenses, outings } from "@/db/schema";
import { createTestDatabase, insertExpense, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

let db: TestDb;
let outingId: string;
let expenseId: string;
let lucas: string;
let maria: string;

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901600001", "+5511901600002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  expenseId = (await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 3000, payers: { [lucas]: 3000 }, shares: { [lucas]: 1500, [maria]: 1500 } })).id;
});

describe("rolê copiado para quem pagou e para a divisão", () => {
  it("as partes de uma despesa guardam o rolê dela", async () => {
    const shares = await db.select({ outingId: expenseShares.outingId }).from(expenseShares).where(eq(expenseShares.expenseId, expenseId));
    const payers = await db.select({ outingId: expensePayers.outingId }).from(expensePayers).where(eq(expensePayers.expenseId, expenseId));
    expect([...shares, ...payers].every((row) => row.outingId === outingId)).toBe(true);
  });

  it("um rolê errado informado na inserção é corrigido pelo banco, para a cópia nunca divergir da despesa", async () => {
    const [other] = await db.insert(outings).values({ name: "Outro", kind: "event", createdBy: lucas }).returning();
    const id = await db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(expenses)
        .values({ outingId, registeredBy: lucas, totalCents: 1000, description: "Gelo", splitMethod: "exact", occurredAt: new Date() })
        .returning({ id: expenses.id });
      await tx.insert(expensePayers).values({ outingId: other.id, expenseId: expense.id, personId: lucas, amountCents: 1000 });
      await tx.insert(expenseShares).values({ outingId: other.id, expenseId: expense.id, personId: lucas, amountCents: 1000 });
      return expense.id;
    });
    const shares = await db.select({ outingId: expenseShares.outingId }).from(expenseShares).where(eq(expenseShares.expenseId, id));
    const payers = await db.select({ outingId: expensePayers.outingId }).from(expensePayers).where(eq(expensePayers.expenseId, id));
    expect([...shares, ...payers].every((row) => row.outingId === outingId)).toBe(true);
  });
});
