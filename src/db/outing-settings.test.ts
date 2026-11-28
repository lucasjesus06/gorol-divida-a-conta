import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { outingSettings, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let stranger: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901500001", "+5511901500002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [outsider] = await db.insert(people).values({ displayName: "Intruso", phone: "+5511901500003" }).returning();
  stranger = outsider.id;
  await db.insert(outingSettings).values({ outingId, voteDays: 5, updatedBy: lucas });
});

describe("ajustes do rolê", () => {
  it("participantes leem os ajustes, quem está fora não", async () => {
    expect(await as(maria, (tx) => tx.$count(outingSettings))).toBe(1);
    expect(await as(stranger, (tx) => tx.$count(outingSettings))).toBe(0);
  });

  it("ninguém grava ajuste pelo acesso do usuário, nem o dono", async () => {
    await expect(as(lucas, (tx) => tx.update(outingSettings).set({ voteDays: 2 }))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.delete(outingSettings))).rejects.toThrow();
  });

  it("recusa valores fora dos limites e opções inexistentes", async () => {
    await expect(db.update(outingSettings).set({ voteDays: 0 })).rejects.toThrow();
    await expect(db.update(outingSettings).set({ voteDays: 15 })).rejects.toThrow();
    await expect(db.update(outingSettings).set({ disputeWindowDays: 61 })).rejects.toThrow();
    await expect(db.update(outingSettings).set({ defaultSplit: "itemized" })).rejects.toThrow();
    await expect(db.update(outingSettings).set({ suggestedRoute: "rapida" })).rejects.toThrow();
    await expect(db.update(outingSettings).set({ serviceFeePercent: 12 })).rejects.toThrow();
  });
});
