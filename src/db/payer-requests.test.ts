import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { outingParticipants, payerRequestPayers, payerRequestShares, payerRequests, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

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

function requestAs(
  personId: string,
  input: { total: number; payers: Record<string, number>; shares: Record<string, number> },
  requestedBy = personId,
) {
  return as(personId, async (tx) => {
    const [request] = await tx
      .insert(payerRequests)
      .values({ outingId, requestedBy, totalCents: input.total, description: "Uber", splitMethod: "exact", occurredAt: new Date() })
      .returning({ id: payerRequests.id });
    await tx.insert(payerRequestPayers).values(Object.entries(input.payers).map(([id, amountCents]) => ({ requestId: request.id, personId: id, amountCents })));
    await tx.insert(payerRequestShares).values(Object.entries(input.shares).map(([id, amountCents]) => ({ requestId: request.id, personId: id, amountCents })));
    return request.id;
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900200001", "+5511900200002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [caioRow, strangerRow] = await db
    .insert(people)
    .values([
      { displayName: "Caio", phone: "+5511900200003" },
      { displayName: "Intruso", phone: "+5511900200004" },
    ])
    .returning();
  caio = caioRow.id;
  stranger = strangerRow.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
});

describe("o pedido fecha as contas", () => {
  it("aceita quando quem pede está entre os pagantes e tudo soma o total", async () => {
    await requestAs(maria, { total: 3000, payers: { [maria]: 3000 }, shares: { [lucas]: 1000, [maria]: 1000, [caio]: 1000 } });
  });

  it("recusa pagamentos ou partes que não somam o total", async () => {
    await expectRejectedWith(requestAs(maria, { total: 3000, payers: { [maria]: 2900 }, shares: { [lucas]: 3000 } }), "request_not_balanced");
    await expectRejectedWith(requestAs(maria, { total: 3000, payers: { [maria]: 3000 }, shares: { [lucas]: 2900 } }), "request_not_balanced");
  });

  it("recusa pedido em que quem pede não aparece como pagante", async () => {
    await expectRejectedWith(requestAs(maria, { total: 1000, payers: { [lucas]: 1000 }, shares: { [maria]: 1000 } }), "requester_must_be_a_payer");
  });

  it("recusa quem não participa do rolê", async () => {
    await expectRejectedWith(requestAs(maria, { total: 1000, payers: { [maria]: 1000 }, shares: { [maria]: 500, [stranger]: 500 } }), "request_person_not_in_outing");
  });
});

describe("quem pode pedir e quem enxerga", () => {
  it("só participantes pedem, e só em nome próprio", async () => {
    await expect(requestAs(stranger, { total: 1000, payers: { [stranger]: 1000 }, shares: { [stranger]: 1000 } })).rejects.toThrow();
    await expect(requestAs(maria, { total: 1000, payers: { [caio]: 1000 }, shares: { [caio]: 1000 } }, caio)).rejects.toThrow();
  });

  it("o pedido é visto por quem pediu e pelo dono, e por mais ninguém", async () => {
    const id = await requestAs(caio, { total: 500, payers: { [caio]: 500 }, shares: { [lucas]: 250, [caio]: 250 } });
    expect(await as(caio, (tx) => tx.$count(payerRequests, eq(payerRequests.id, id)))).toBe(1);
    expect(await as(lucas, (tx) => tx.$count(payerRequests, eq(payerRequests.id, id)))).toBe(1);
    expect(await as(lucas, (tx) => tx.$count(payerRequestPayers, eq(payerRequestPayers.requestId, id)))).toBe(1);
    expect(await as(maria, (tx) => tx.$count(payerRequests, eq(payerRequests.id, id)))).toBe(0);
    expect(await as(maria, (tx) => tx.$count(payerRequestShares, eq(payerRequestShares.requestId, id)))).toBe(0);
    expect(await as(stranger, (tx) => tx.$count(payerRequests))).toBe(0);
  });
});

describe("a decisão", () => {
  const decide = (personId: string, id: string, status: "approved" | "rejected") =>
    as(personId, (tx) =>
      tx.update(payerRequests).set({ status, decidedBy: personId, decidedAt: new Date() }).where(eq(payerRequests.id, id)).returning({ id: payerRequests.id }),
    );

  it("só o dono decide, e uma vez só", async () => {
    const id = await requestAs(maria, { total: 800, payers: { [maria]: 800 }, shares: { [lucas]: 400, [maria]: 400 } });
    expect(await decide(maria, id, "approved")).toEqual([]);
    expect(await decide(lucas, id, "approved")).toHaveLength(1);
    await expectRejectedWith(decide(lucas, id, "rejected"), "payer_request_status_change_invalid");
  });

  it("o conteúdo do pedido não muda nem some", async () => {
    const id = await requestAs(maria, { total: 800, payers: { [maria]: 800 }, shares: { [lucas]: 400, [maria]: 400 } });
    await expectRejectedWith(db.update(payerRequests).set({ totalCents: 900 }).where(eq(payerRequests.id, id)), "payer_request_is_immutable");
    await expectRejectedWith(db.delete(payerRequests).where(eq(payerRequests.id, id)), "financial_history_is_immutable");
    await expectRejectedWith(db.update(payerRequestPayers).set({ amountCents: 1 }).where(eq(payerRequestPayers.requestId, id)), "financial_history_is_immutable");
  });
});
