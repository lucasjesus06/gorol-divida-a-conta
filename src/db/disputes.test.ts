import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { expenseDisputeApprovals, expenseDisputes, outingParticipants, people } from "@/db/schema";
import { createTestDatabase, insertExpense, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let expenseId: string;
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

function openAs(personId: string, approvers: string[]) {
  return as(personId, async (tx) => {
    const [dispute] = await tx
      .insert(expenseDisputes)
      .values({ outingId, expenseId, openedBy: personId, subject: "split", message: "Não fui" })
      .returning({ id: expenseDisputes.id });
    await tx.insert(expenseDisputeApprovals).values(approvers.map((approver) => ({ disputeId: dispute.id, personId: approver })));
    return dispute.id;
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900300001", "+5511900300002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [caioRow, strangerRow] = await db
    .insert(people)
    .values([
      { displayName: "Caio", phone: "+5511900300003" },
      { displayName: "Intruso", phone: "+5511900300004" },
    ])
    .returning();
  caio = caioRow.id;
  stranger = strangerRow.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
  expenseId = (await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 3000, payers: { [lucas]: 3000 }, shares: { [lucas]: 1000, [maria]: 1000, [caio]: 1000 } })).id;
});

describe("abrir e enxergar", () => {
  it("participante abre em nome próprio; quem não participa não", async () => {
    await openAs(maria, [lucas]);
    await expect(openAs(stranger, [lucas])).rejects.toThrow();
    await expect(
      as(maria, (tx) => tx.insert(expenseDisputes).values({ outingId, expenseId, openedBy: caio, subject: "amount", message: "x" })),
    ).rejects.toThrow();
  });

  it("uma contestação aberta por pessoa e despesa", async () => {
    await expect(openAs(maria, [lucas])).rejects.toThrow();
  });

  it("quem abriu e quem aprova enxergam; os demais, não", async () => {
    const id = await openAs(caio, [lucas]);
    expect(await as(caio, (tx) => tx.$count(expenseDisputes, eq(expenseDisputes.id, id)))).toBe(1);
    expect(await as(lucas, (tx) => tx.$count(expenseDisputes, eq(expenseDisputes.id, id)))).toBe(1);
    expect(await as(maria, (tx) => tx.$count(expenseDisputes, eq(expenseDisputes.id, id)))).toBe(0);
    expect(await as(stranger, (tx) => tx.$count(expenseDisputeApprovals))).toBe(0);
  });

  it("só quem abriu define os aprovadores, e só enquanto aberta", async () => {
    const [{ id }] = await db.select({ id: expenseDisputes.id }).from(expenseDisputes).where(eq(expenseDisputes.openedBy, maria));
    await expect(as(caio, (tx) => tx.insert(expenseDisputeApprovals).values({ disputeId: id, personId: caio }))).rejects.toThrow();
  });
});

describe("a decisão e o histórico", () => {
  it("o cliente comum não decide nem apaga: só o servidor", async () => {
    const [{ id }] = await db.select({ id: expenseDisputes.id }).from(expenseDisputes).where(eq(expenseDisputes.openedBy, maria));
    await expect(as(lucas, (tx) => tx.update(expenseDisputeApprovals).set({ decision: "approved", decidedAt: new Date() }).where(eq(expenseDisputeApprovals.disputeId, id)))).rejects.toThrow();
    await expect(as(maria, (tx) => tx.delete(expenseDisputes).where(eq(expenseDisputes.id, id)))).rejects.toThrow();
  });

  it("a aprovação só sai de pendente para decidida, uma vez", async () => {
    const [{ id }] = await db.select({ id: expenseDisputes.id }).from(expenseDisputes).where(eq(expenseDisputes.openedBy, maria));
    await db.update(expenseDisputeApprovals).set({ decision: "approved", decidedAt: new Date() }).where(eq(expenseDisputeApprovals.disputeId, id));
    await expectRejectedWith(
      db.update(expenseDisputeApprovals).set({ decision: "rejected", decidedAt: new Date() }).where(eq(expenseDisputeApprovals.disputeId, id)),
      "dispute_approval_change_invalid",
    );
  });

  it("a contestação só sai de aberta para decidida, e o conteúdo não muda", async () => {
    const [{ id }] = await db.select({ id: expenseDisputes.id }).from(expenseDisputes).where(eq(expenseDisputes.openedBy, maria));
    await expectRejectedWith(db.update(expenseDisputes).set({ message: "outra" }).where(eq(expenseDisputes.id, id)), "dispute_is_immutable");
    await db.update(expenseDisputes).set({ status: "approved", decidedAt: new Date() }).where(eq(expenseDisputes.id, id));
    await expectRejectedWith(db.update(expenseDisputes).set({ status: "rejected", decidedAt: new Date() }).where(eq(expenseDisputes.id, id)), "dispute_status_change_invalid");
    await expectRejectedWith(db.delete(expenseDisputes).where(eq(expenseDisputes.id, id)), "financial_history_is_immutable");
  });
});
