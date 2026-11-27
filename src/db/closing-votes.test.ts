import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { closingVoteChoices, closingVotes, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let stranger: string;
let voteId: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

const soon = () => new Date(Date.now() + 3 * 86_400_000);

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901100001", "+5511901100002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [outsider] = await db.insert(people).values({ displayName: "Intruso", phone: "+5511901100003" }).returning();
  stranger = outsider.id;
  const [vote] = await db.insert(closingVotes).values({ outingId, requestedBy: lucas, snapshot: "a:100", deadline: soon() }).returning();
  voteId = vote.id;
  await db.insert(closingVoteChoices).values({ voteId, personId: maria });
});

describe("votação de encerramento", () => {
  it("participantes veem a votação e os votos; quem está fora não vê", async () => {
    expect(await as(maria, (tx) => tx.$count(closingVotes))).toBe(1);
    expect(await as(maria, (tx) => tx.$count(closingVoteChoices))).toBe(1);
    expect(await as(stranger, (tx) => tx.$count(closingVotes))).toBe(0);
    expect(await as(stranger, (tx) => tx.$count(closingVoteChoices))).toBe(0);
  });

  it("ninguém cria nem altera voto pelo acesso do usuário", async () => {
    await expect(as(maria, (tx) => tx.insert(closingVotes).values({ outingId, requestedBy: maria, snapshot: "x", deadline: soon() }))).rejects.toThrow();
    await expect(as(maria, (tx) => tx.update(closingVoteChoices).set({ decision: "rejected", decidedAt: new Date() }))).rejects.toThrow();
  });

  it("só uma votação aberta por rolê", async () => {
    await expect(db.insert(closingVotes).values({ outingId, requestedBy: lucas, snapshot: "b", deadline: soon() })).rejects.toThrow();
  });

  it("votação encerrada precisa de data de resolução, e voto decidido de data de decisão", async () => {
    await expect(db.update(closingVotes).set({ status: "approved" })).rejects.toThrow();
    await expect(db.update(closingVoteChoices).set({ decision: "accepted" })).rejects.toThrow();
  });
});
