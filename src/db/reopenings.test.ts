import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { expenseDisputes, outingReopenings, people } from "@/db/schema";
import { createTestDatabase, insertExpense, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let stranger: string;
let disputeId: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901200001", "+5511901200002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [outsider] = await db.insert(people).values({ displayName: "Intruso", phone: "+5511901200003" }).returning();
  stranger = outsider.id;
  const { id: expenseId } = await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 3000, payers: { [lucas]: 3000 }, shares: { [lucas]: 1500, [maria]: 1500 } });
  const [dispute] = await db.insert(expenseDisputes).values({ outingId, expenseId, openedBy: maria, subject: "amount", message: "Valor errado" }).returning();
  disputeId = dispute.id;
  await db.insert(outingReopenings).values({ outingId, disputeId, reopenedBy: maria, previousClosedAt: new Date(Date.now() - 10 * 86_400_000), previousClosedBy: lucas });
});

describe("reaberturas do rolê", () => {
  it("participantes veem o registro, quem está fora não", async () => {
    expect(await as(maria, (tx) => tx.$count(outingReopenings))).toBe(1);
    expect(await as(stranger, (tx) => tx.$count(outingReopenings))).toBe(0);
  });

  it("o usuário não cria o registro, e ele não se altera nem se apaga", async () => {
    await expect(as(maria, (tx) => tx.insert(outingReopenings).values({ outingId, disputeId, reopenedBy: maria, previousClosedAt: new Date() }))).rejects.toThrow();
    await expect(db.update(outingReopenings).set({ reopenedBy: lucas })).rejects.toThrow();
    await expect(db.delete(outingReopenings)).rejects.toThrow();
  });
});
