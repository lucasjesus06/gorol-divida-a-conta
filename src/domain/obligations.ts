import type { Cents } from "./money";
import type { Expense } from "./expense";
import { payersByLargestPayment } from "./split";

/** "debtor owes creditor amountCents" because of one expense. */
export type Obligation = {
  debtorId: string;
  creditorId: string;
  amountCents: Cents;
  expenseId: string;
  outingId: string;
};

/**
 * Who owes whom because of a single expense, before any settlement.
 *
 * Each participant's share is split among the payers proportionally to how much
 * each one paid. The whole participant × payer table is rounded together so
 * that each row adds up to the participant's share and each column adds up to
 * what the payer paid. A payer's part of their own share is not a debt.
 */
export function expenseObligations(expense: Expense): Obligation[] {
  const total = BigInt(expense.totalCents);
  const payerIds = payersByLargestPayment(expense.payers);
  const paidBy = new Map(expense.payers.map((payer) => [payer.participantId, payer.amountCents]));
  const participants = [...expense.shares].filter(([, share]) => share > 0);

  type Cell = { debtorId: string; creditorId: string; cents: number; remainder: bigint };
  const cells: Cell[] = [];
  const rowMissing = new Map<string, number>();
  const columnMissing = new Map<string, number>();

  for (const [debtorId, share] of participants) {
    let rowSum = 0;
    for (const creditorId of payerIds) {
      const exact = BigInt(share) * BigInt(paidBy.get(creditorId) ?? 0);
      const cents = Number(exact / total);
      cells.push({ debtorId, creditorId, cents, remainder: exact % total });
      rowSum += cents;
      columnMissing.set(creditorId, (columnMissing.get(creditorId) ?? 0) + cents);
    }
    rowMissing.set(debtorId, share - rowSum);
  }
  for (const creditorId of payerIds) {
    columnMissing.set(
      creditorId,
      (paidBy.get(creditorId) ?? 0) - (columnMissing.get(creditorId) ?? 0),
    );
  }

  // Hand out the missing cents, largest fractional part first; the stable order
  // (participant order, then largest payer) breaks ties deterministically.
  const byRemainder = [...cells].sort((a, b) =>
    a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1,
  );
  let pending = [...rowMissing.values()].reduce((sum, value) => sum + value, 0);
  while (pending > 0) {
    const cell = byRemainder.find(
      (candidate) =>
        (rowMissing.get(candidate.debtorId) ?? 0) > 0 &&
        (columnMissing.get(candidate.creditorId) ?? 0) > 0,
    );
    if (!cell) {
      // Rows and columns always miss the same number of cents, so this cannot happen.
      throw new Error("Arredondamento inconsistente das obrigações da despesa.");
    }
    cell.cents += 1;
    rowMissing.set(cell.debtorId, (rowMissing.get(cell.debtorId) ?? 0) - 1);
    columnMissing.set(cell.creditorId, (columnMissing.get(cell.creditorId) ?? 0) - 1);
    pending -= 1;
  }

  return cells
    .filter((cell) => cell.debtorId !== cell.creditorId && cell.cents > 0)
    .map((cell) => ({
      debtorId: cell.debtorId,
      creditorId: cell.creditorId,
      amountCents: cell.cents,
      expenseId: expense.id,
      outingId: expense.outingId,
    }));
}
