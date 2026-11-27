import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { outingParticipants, payments, people } from "@/db/schema";
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

const declareAs = (personId: string, values: { toId: string; amountCents?: number; onBehalfOfId?: string; fromId?: string }) =>
  as(personId, (tx) =>
    tx
      .insert(payments)
      .values({ outingId, fromId: values.fromId ?? personId, toId: values.toId, amountCents: values.amountCents ?? 1000, onBehalfOfId: values.onBehalfOfId })
      .returning({ id: payments.id }),
  );

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900500001", "+5511900500002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [caioRow, strangerRow] = await db
    .insert(people)
    .values([
      { displayName: "Caio", phone: "+5511900500003" },
      { displayName: "Intruso", phone: "+5511900500004" },
    ])
    .returning();
  caio = caioRow.id;
  stranger = strangerRow.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
});

describe("declarar", () => {
  it("participante declara o próprio pagamento, a outro participante", async () => {
    await declareAs(maria, { toId: lucas });
    await declareAs(maria, { toId: lucas, onBehalfOfId: caio });
  });

  it("não declara em nome de outra pessoa, nem a si mesmo, nem com valor zero, nem a quem está fora", async () => {
    await expect(declareAs(maria, { toId: lucas, fromId: caio })).rejects.toThrow();
    await expectRejectedWith(declareAs(maria, { toId: maria }), "payments_different_people");
    await expectRejectedWith(declareAs(maria, { toId: lucas, onBehalfOfId: lucas }), "payments_different_people");
    await expectRejectedWith(declareAs(maria, { toId: lucas, amountCents: 0 }), "payments_amount_positive");
    await expectRejectedWith(declareAs(maria, { toId: stranger }), "payment_person_not_in_outing");
    await expect(declareAs(stranger, { toId: lucas })).rejects.toThrow();
  });

  it("só participantes enxergam os pagamentos", async () => {
    expect(await as(caio, (tx) => tx.$count(payments))).toBeGreaterThan(0);
    expect(await as(stranger, (tx) => tx.$count(payments))).toBe(0);
  });
});

describe("confirmar e recusar", () => {
  const resolveAs = (personId: string, id: string, status: "confirmed" | "rejected") =>
    as(personId, (tx) =>
      tx
        .update(payments)
        .set({ status, confirmedBy: status === "confirmed" ? "creditor" : null, resolvedAt: new Date() })
        .where(eq(payments.id, id))
        .returning({ id: payments.id }),
    );

  it("só quem recebe decide, e uma vez só", async () => {
    const [{ id }] = await declareAs(maria, { toId: lucas, amountCents: 1500 });
    expect(await resolveAs(maria, id, "confirmed")).toEqual([]);
    expect(await resolveAs(caio, id, "confirmed")).toEqual([]);
    expect(await resolveAs(lucas, id, "confirmed")).toHaveLength(1);
    await expectRejectedWith(resolveAs(lucas, id, "rejected"), "payment_status_change_invalid");
  });

  it("recusado fica no histórico, e valor, quem paga e quem recebe nunca mudam nem somem", async () => {
    const [{ id }] = await declareAs(maria, { toId: lucas, amountCents: 700 });
    expect(await resolveAs(lucas, id, "rejected")).toHaveLength(1);
    await expectRejectedWith(db.update(payments).set({ amountCents: 1 }).where(eq(payments.id, id)), "payment_is_immutable");
    await expectRejectedWith(db.delete(payments).where(eq(payments.id, id)), "financial_history_is_immutable");
  });
});
