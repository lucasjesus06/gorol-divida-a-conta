import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { amnestyItems, amnesties, outingParticipants, people } from "@/db/schema";
import { createTestDatabase, insertExpense, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let stranger: string;
let expenseId: string;

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

/** Forgives `items` as `creditor`, in one transaction, the way the server does. */
function forgive(creditor: string, debtor: string, items: { expenseId: string; outingId?: string; amountCents: number }[], totalCents?: number) {
  return as(creditor, async (tx) => {
    const [header] = await tx
      .insert(amnesties)
      .values({ creditorId: creditor, debtorId: debtor, totalCents: totalCents ?? items.reduce((sum, item) => sum + item.amountCents, 0) })
      .returning({ id: amnesties.id });
    await tx.insert(amnestyItems).values(items.map((item) => ({ amnestyId: header.id, outingId: item.outingId ?? outingId, expenseId: item.expenseId, amountCents: item.amountCents })));
    return header.id;
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900600001", "+5511900600002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [strangerRow] = await db.insert(people).values({ displayName: "Intruso", phone: "+5511900600003" }).returning();
  stranger = strangerRow.id;
  const expense = await insertExpense(db, { outingId, registeredBy: lucas, totalCents: 10000, payers: { [lucas]: 10000 }, shares: { [lucas]: 5000, [maria]: 5000 } });
  expenseId = expense.id;
});

describe("perdoar", () => {
  it("o credor perdoa parte de uma despesa e os dois enxergam o lançamento", async () => {
    const id = await forgive(lucas, maria, [{ expenseId, amountCents: 2000 }]);
    for (const person of [lucas, maria]) {
      const rows = await as(person, (tx) => tx.select().from(amnesties).where(eq(amnesties.id, id)));
      expect(rows).toHaveLength(1);
      expect(await as(person, (tx) => tx.select().from(amnestyItems).where(eq(amnestyItems.amnestyId, id)))).toHaveLength(1);
    }
  });

  it("quem não é parte não enxerga", async () => {
    await expect(as(stranger, (tx) => tx.select().from(amnesties))).resolves.toEqual([]);
    await expect(as(stranger, (tx) => tx.select().from(amnestyItems))).resolves.toEqual([]);
  });

  it("só o credor lança: o devedor não perdoa a própria dívida", async () => {
    await expectRejectedWith(
      as(maria, (tx) => tx.insert(amnesties).values({ creditorId: lucas, debtorId: maria, totalCents: 100 })),
      "row-level security",
    );
  });

  it("o total precisa bater com os itens", async () => {
    await expectRejectedWith(forgive(lucas, maria, [{ expenseId, amountCents: 1000 }], 1500), "amnesty_total_mismatch");
  });

  it("nenhum item passa do valor da despesa", async () => {
    await expectRejectedWith(forgive(lucas, maria, [{ expenseId, amountCents: 10001 }]), "amnesty_item_above_expense");
  });

  it("a despesa precisa ser do rolê informado", async () => {
    const other = await seedOuting(db, ["+5511900600011", "+5511900600012"]);
    await expectRejectedWith(forgive(lucas, maria, [{ expenseId, outingId: other.outing.id, amountCents: 100 }]), "amnesty_expense_not_in_outing");
  });

  it("os dois precisam estar no rolê da despesa", async () => {
    await db.insert(outingParticipants).values({ outingId, personId: stranger, displayName: "Intruso" });
    await db.update(outingParticipants).set({ confirmedAt: null }).where(eq(outingParticipants.personId, stranger));
    await expectRejectedWith(forgive(lucas, stranger, [{ expenseId, amountCents: 100 }]), "amnesty_person_not_in_outing");
  });

  it("não se acrescenta item a uma anistia já feita, nem se altera ou apaga", async () => {
    const id = await forgive(lucas, maria, [{ expenseId, amountCents: 100 }]);
    await expectRejectedWith(
      as(lucas, (tx) => tx.insert(amnestyItems).values({ amnestyId: id, outingId, expenseId, amountCents: 100 })),
      "",
    );
    await expectRejectedWith(db.update(amnesties).set({ totalCents: 1 }).where(eq(amnesties.id, id)), "financial_history_is_immutable");
    await expectRejectedWith(db.delete(amnesties).where(eq(amnesties.id, id)), "financial_history_is_immutable");
    await expectRejectedWith(db.delete(amnestyItems).where(eq(amnestyItems.amnestyId, id)), "financial_history_is_immutable");
  });

  it("o mesmo gesto não repete uma despesa", async () => {
    await expectRejectedWith(forgive(lucas, maria, [{ expenseId, amountCents: 100 }, { expenseId, amountCents: 100 }]), "");
  });
});
