import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { messageTemplates, reminderLog, reminderPauses } from "@/db/schema";
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
  const seeded = await seedOuting(db, ["+5511900800001", "+5511900800002"]);
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
});

describe("cobrança manual", () => {
  it("o usuário não lê nem grava o histórico de cobranças, nem as pausas, nem os textos", async () => {
    await db.insert(reminderLog).values({ debtorId: maria, creditorId: lucas, sequence: 1, channel: "whatsapp", sentBy: lucas });
    await db.insert(messageTemplates).values({ position: 1, body: "Oi {nome}" });
    await expect(as(maria, (tx) => tx.select().from(reminderLog))).rejects.toThrow();
    await expect(as(maria, (tx) => tx.select().from(reminderPauses))).rejects.toThrow();
    await expect(as(maria, (tx) => tx.select().from(messageTemplates))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.insert(reminderLog).values({ debtorId: maria, creditorId: lucas, sequence: 2, channel: "app", sentBy: lucas }))).rejects.toThrow();
  });

  it("o histórico não se altera nem se apaga", async () => {
    await expect(db.update(reminderLog).set({ sequence: 9 })).rejects.toThrow();
    await expect(db.delete(reminderLog)).rejects.toThrow();
  });

  it("recusa canal inválido, pessoa cobrando a si mesma e texto vazio ou enorme", async () => {
    await expect(db.insert(reminderLog).values({ debtorId: maria, creditorId: lucas, sequence: 2, channel: "sms" as "app", sentBy: lucas })).rejects.toThrow();
    await expect(db.insert(reminderLog).values({ debtorId: maria, creditorId: maria, sequence: 2, channel: "app", sentBy: lucas })).rejects.toThrow();
    await expect(db.insert(messageTemplates).values({ position: 2, body: "   " })).rejects.toThrow();
    await expect(db.insert(messageTemplates).values({ position: 3, body: "x".repeat(601) })).rejects.toThrow();
  });

  it("a pausa precisa terminar depois de começar", async () => {
    const past = new Date(Date.now() - 1000);
    await expect(db.insert(reminderPauses).values({ debtorId: maria, creditorId: lucas, pausedUntil: past, registeredBy: lucas })).rejects.toThrow();
  });
});
