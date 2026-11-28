import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { systemParameterChanges, systemParameters } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let lucas: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901400001", "+5511901400002"]);
  lucas = seeded.lucas.id;
  await db.insert(systemParameters).values({ key: "closing.vote_days", value: 5, updatedBy: lucas });
  await db.insert(systemParameterChanges).values({ key: "closing.vote_days", previousValue: 3, newValue: 5, changedBy: lucas });
});

describe("parâmetros do sistema", () => {
  it("nem a própria pessoa lê ou altera os parâmetros pelo acesso do usuário", async () => {
    await expect(as(lucas, (tx) => tx.select().from(systemParameters))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.insert(systemParameters).values({ key: "x", value: 1, updatedBy: lucas }))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.select().from(systemParameterChanges))).rejects.toThrow();
  });

  it("o histórico de mudanças não se altera nem se apaga", async () => {
    await expect(db.update(systemParameterChanges).set({ newValue: 9 })).rejects.toThrow();
    await expect(db.delete(systemParameterChanges)).rejects.toThrow();
  });
});
