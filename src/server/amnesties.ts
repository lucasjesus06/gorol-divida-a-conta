import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { amnestyItems, amnesties } from "@/db/schema";
import { forgivableBetween, planAmnesty, type Forgivable } from "@/domain/amnesty";
import { DomainError } from "@/domain/domain-error";
import { amnestyGranted } from "@/domain/notification";
import { groupAmnesties, loadLedger } from "./balances";
import { notify } from "./push";

export type ForgivableView = {
  debtor: { id: string; name: string };
  maxCents: number;
  expenses: (Forgivable["expenses"][number] & { outingName: string })[];
};

async function loadFor(creditorId: string, debtorId: string) {
  const ledger = await loadLedger(creditorId);
  if (creditorId === debtorId || !ledger.personNames.has(debtorId)) {
    throw new DomainError("person_not_found", "Pessoa não encontrada.");
  }
  return ledger;
}

/** What `debtorId` owes the reader, expense by expense, and how much of it can still be forgiven. */
export async function getForgivable(personId: string, debtorId: string): Promise<ForgivableView> {
  const ledger = await loadFor(personId, debtorId);
  const forgivable = forgivableBetween(personId, debtorId, ledger.expenses, ledger.payments, ledger.amnesties, ledger.funds);
  return {
    debtor: { id: debtorId, name: ledger.personNames.get(debtorId) ?? "Pessoa" },
    maxCents: forgivable.maxCents,
    expenses: forgivable.expenses.map((row) => ({ ...row, outingName: ledger.outingNames.get(row.outingId) ?? "Rolê" })),
  };
}

async function findByKey(creditorId: string, key: string) {
  const [existing] = await getDb()
    .select({ id: amnesties.id })
    .from(amnesties)
    .where(and(eq(amnesties.creditorId, creditorId), eq(amnesties.idempotencyKey, key)));
  return existing?.id ?? null;
}

/**
 * The creditor forgives part of what `debtorId` owes them. Recorded in one step, so the amnesty and its
 * items exist together or not at all; two at once for the same pair are put in line, so the second sees the first.
 */
export async function grantAmnesty(
  personId: string,
  debtorId: string,
  selection: { expenseId: string; amountCents: number }[],
  idempotencyKey?: string,
): Promise<string> {
  if (idempotencyKey) {
    const existing = await findByKey(personId, idempotencyKey);
    if (existing) {
      return existing;
    }
  }
  const ledger = await loadFor(personId, debtorId);

  const id = crypto.randomUUID();
  let totalCents = 0;
  try {
    await getDb().transaction(async (tx) => {
      const [low, high] = [personId, debtorId].sort();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`amnesty:${low}:${high}`}, 0))`);
      const rows = await tx
        .select({
          id: amnesties.id,
          creditorId: amnesties.creditorId,
          debtorId: amnesties.debtorId,
          createdAt: amnesties.createdAt,
          outingId: amnestyItems.outingId,
          expenseId: amnestyItems.expenseId,
          amountCents: amnestyItems.amountCents,
        })
        .from(amnestyItems)
        .innerJoin(amnesties, eq(amnesties.id, amnestyItems.amnestyId))
        .where(and(eq(amnesties.creditorId, personId), eq(amnesties.debtorId, debtorId)));
      // The pair's amnesties are read again under the lock; everything else comes from the ledger read above.
      const others = ledger.amnesties.filter((amnesty) => !(amnesty.creditorId === personId && amnesty.debtorId === debtorId));
      const plan = planAmnesty(personId, debtorId, selection, ledger.expenses, ledger.payments, [...others, ...groupAmnesties(rows)], ledger.funds);
      totalCents = plan.totalCents;
      await tx.insert(amnesties).values({ id, creditorId: personId, debtorId, totalCents: plan.totalCents, idempotencyKey });
      await tx.insert(amnestyItems).values(plan.items.map((item) => ({ amnestyId: id, outingId: item.outingId, expenseId: item.expenseId, amountCents: item.amountCents })));
    });
  } catch (error) {
    const existing = idempotencyKey ? await findByKey(personId, idempotencyKey) : null;
    if (existing) {
      return existing;
    }
    throw error;
  }

  const names = new Map(ledger.expenses.map((expense) => [expense.id, expense.description]));
  await notify(
    debtorId,
    amnestyGranted({
      creditorId: personId,
      creditorName: ledger.personNames.get(personId) ?? "Alguém",
      totalCents,
      descriptions: selection.map((choice) => names.get(choice.expenseId) ?? "Despesa"),
    }),
  );
  return id;
}
