import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { outingParticipants, outings, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let caio: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901000001", "+5511901000002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [row] = await db.insert(people).values({ displayName: "Caio", phone: "+5511901000003" }).returning();
  caio = row.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
});

describe("sair do rolê", () => {
  it("quem saiu perde o acesso ao rolê e deixa de ser visto pelos outros, mas a linha continua", async () => {
    expect(await as(maria, (tx) => tx.$count(outings))).toBe(1);
    await db.update(outingParticipants).set({ leftAt: new Date(), leftBy: lucas }).where(eq(outingParticipants.personId, maria));

    expect(await as(maria, (tx) => tx.$count(outings))).toBe(0);
    const names = await as(caio, (tx) => tx.select({ name: people.displayName }).from(people));
    expect(names.map((row) => row.name)).not.toContain("Maria");
    expect(await db.$count(outingParticipants, eq(outingParticipants.outingId, outingId))).toBe(3);
  });

  it("quem saiu não volta sozinho para o rolê", async () => {
    await expect(db.update(outingParticipants).set({ leftAt: null, leftBy: null }).where(eq(outingParticipants.personId, maria))).rejects.toThrow();
  });

  it("o dono não sai da própria linha e saída exige quem a registrou", async () => {
    await expect(db.update(outingParticipants).set({ leftAt: new Date(), leftBy: lucas }).where(eq(outingParticipants.personId, lucas))).rejects.toThrow();
    await expect(db.update(outingParticipants).set({ leftAt: new Date() }).where(eq(outingParticipants.personId, caio))).rejects.toThrow();
  });

  it("o dono continua enxergando o rolê", async () => {
    expect(await as(lucas, (tx) => tx.$count(outings))).toBe(1);
  });
});
