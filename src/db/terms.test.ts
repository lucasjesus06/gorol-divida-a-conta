import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { termsAcceptances } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let lucas: string;
let maria: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901300001", "+5511901300002"]);
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  await db.insert(termsAcceptances).values({ personId: lucas, version: "v1", remindersConsent: true });
});

describe("aceite dos termos", () => {
  it("cada pessoa vê só o próprio aceite", async () => {
    expect(await as(lucas, (tx) => tx.$count(termsAcceptances))).toBe(1);
    expect(await as(maria, (tx) => tx.$count(termsAcceptances))).toBe(0);
  });

  it("o usuário não registra, altera nem apaga aceite pelo próprio acesso", async () => {
    await expect(as(maria, (tx) => tx.insert(termsAcceptances).values({ personId: maria, version: "v1", remindersConsent: true }))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.update(termsAcceptances).set({ remindersWithdrawnAt: new Date() }))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.delete(termsAcceptances))).rejects.toThrow();
  });

  it("só uma vez por versão, e o aceite não se apaga", async () => {
    await expect(db.insert(termsAcceptances).values({ personId: lucas, version: "v1", remindersConsent: true })).rejects.toThrow();
    await expect(db.delete(termsAcceptances)).rejects.toThrow();
  });

  it("só o consentimento dos lembretes pode ser retirado e devolvido; o resto é imutável", async () => {
    await db.update(termsAcceptances).set({ remindersWithdrawnAt: new Date() }).where(eq(termsAcceptances.personId, lucas));
    await db.update(termsAcceptances).set({ remindersWithdrawnAt: null }).where(eq(termsAcceptances.personId, lucas));
    await expect(db.update(termsAcceptances).set({ version: "v2" }).where(eq(termsAcceptances.personId, lucas))).rejects.toThrow();
    await expect(db.update(termsAcceptances).set({ acceptedAt: new Date(0) }).where(eq(termsAcceptances.personId, lucas))).rejects.toThrow();
  });

  it("não se retira o que nunca se consentiu", async () => {
    await expect(db.insert(termsAcceptances).values({ personId: maria, version: "v1", remindersConsent: false, remindersWithdrawnAt: new Date() })).rejects.toThrow();
  });
});
