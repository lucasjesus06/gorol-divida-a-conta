import type { Amnesty } from "./amnesty";
import { activeExpenses, type Expense } from "./expense";
import { expenseObligations } from "./obligations";
import type { Cents } from "./money";
import type { Payment, PaymentStatus } from "./payment";
import { areNeutralAt, type SharedFund } from "./shared-fund";

export type PairEntry =
  | {
      kind: "expense";
      outingId: string;
      expenseId: string;
      description: string;
      occurredAt: Date;
      /** From the viewer's perspective: positive means the other person owes the viewer. */
      effectCents: Cents;
    }
  | {
      kind: "amnesty";
      outingId: string;
      amnestyId: string;
      expenseId: string;
      occurredAt: Date;
      /** From the viewer's perspective: negative when the viewer forgave, positive when the viewer was forgiven. */
      effectCents: Cents;
    }
  | {
      kind: "payment";
      outingId: string;
      paymentId: string;
      status: PaymentStatus;
      occurredAt: Date;
      effectCents: Cents;
    };

export type PairStatement = {
  viewerId: string;
  otherId: string;
  entries: PairEntry[];
  /** Positive: the other person owes the viewer. Only confirmed payments count. */
  netCents: Cents;
  /** Same as netCents but per outing, so each rolê can be settled on its own. */
  netByOutingCents: Map<string, Cents>;
  /** Declared payments between the two still waiting for confirmation. */
  awaitingConfirmationCents: Cents;
  /** Balance as if the declared payments were already confirmed. */
  projectedNetCents: Cents;
  projectedNetByOutingCents: Map<string, Cents>;
};

/**
 * Everything between two people, across all outings they share: the expense
 * obligations, the payments and their status, with the resulting balance.
 */
export function pairStatement(
  viewerId: string,
  otherId: string,
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[] = [],
  funds: SharedFund[] = [],
): PairStatement {
  const entries: PairEntry[] = [];

  for (const expense of activeExpenses(expenses)) {
    // Between two people who share the same money nothing is owed for what was registered while they did.
    if (areNeutralAt(funds, viewerId, otherId, expense.createdAt)) continue;
    let effect = 0;
    for (const obligation of expenseObligations(expense)) {
      if (obligation.debtorId === otherId && obligation.creditorId === viewerId) {
        effect += obligation.amountCents;
      } else if (obligation.debtorId === viewerId && obligation.creditorId === otherId) {
        effect -= obligation.amountCents;
      }
    }
    if (effect !== 0) {
      entries.push({
        kind: "expense",
        outingId: expense.outingId,
        expenseId: expense.id,
        description: expense.description,
        occurredAt: expense.occurredAt,
        effectCents: effect,
      });
    }
  }

  for (const payment of payments) {
    if (payment.status === "rejected") continue;
    const effect = paymentEffectForViewer(payment, viewerId, otherId, areNeutralAt(funds, viewerId, otherId, payment.declaredAt));
    if (effect !== 0) {
      entries.push({
        kind: "payment",
        outingId: payment.outingId,
        paymentId: payment.id,
        status: payment.status,
        occurredAt: payment.declaredAt,
        effectCents: effect,
      });
    }
  }

  for (const amnesty of amnesties) {
    const forgave = amnesty.creditorId === viewerId && amnesty.debtorId === otherId;
    const wasForgiven = amnesty.creditorId === otherId && amnesty.debtorId === viewerId;
    if (!forgave && !wasForgiven) continue;
    for (const item of amnesty.items) {
      entries.push({
        kind: "amnesty",
        outingId: item.outingId,
        amnestyId: amnesty.id,
        expenseId: item.expenseId,
        occurredAt: amnesty.createdAt,
        effectCents: forgave ? -item.amountCents : item.amountCents,
      });
    }
  }

  entries.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let netCents = 0;
  let projectedNetCents = 0;
  let awaitingConfirmationCents = 0;
  const netByOutingCents = new Map<string, Cents>();
  const projectedNetByOutingCents = new Map<string, Cents>();
  for (const entry of entries) {
    // Contested payments are listed for transparency but do not settle anything.
    if (entry.kind === "payment" && entry.status === "contested") continue;
    projectedNetCents += entry.effectCents;
    addTo(projectedNetByOutingCents, entry.outingId, entry.effectCents);
    if (entry.kind === "payment" && entry.status === "declared") {
      awaitingConfirmationCents += Math.abs(entry.effectCents);
      continue;
    }
    netCents += entry.effectCents;
    addTo(netByOutingCents, entry.outingId, entry.effectCents);
  }

  return {
    viewerId,
    otherId,
    entries,
    netCents,
    netByOutingCents,
    awaitingConfirmationCents,
    projectedNetCents,
    projectedNetByOutingCents,
  };
}

function addTo(totals: Map<string, Cents>, key: string, value: Cents): void {
  totals.set(key, (totals.get(key) ?? 0) + value);
}

/**
 * How a payment changes what `otherId` owes `viewerId` (positive = other owes more).
 * - Direct payment between the two settles debt between them.
 * - Payment received by one of them on behalf of the other settles the other's debt.
 * - Payment made by one of them on behalf of the other creates a debt to the payer.
 */
function paymentEffectForViewer(payment: Payment, viewerId: string, otherId: string, neutral: boolean): Cents {
  const { fromId, toId, onBehalfOfId, amountCents } = payment;
  const debtorId = onBehalfOfId ?? fromId;

  let effect = 0;
  // The receiver's credit against the debtor is reduced.
  if (debtorId === otherId && toId === viewerId) effect -= amountCents;
  if (debtorId === viewerId && toId === otherId) effect += amountCents;
  // Paying on someone's behalf makes them owe the payer, unless the two share the same money.
  if (!neutral) {
    if (onBehalfOfId === otherId && fromId === viewerId) effect += amountCents;
    if (onBehalfOfId === viewerId && fromId === otherId) effect -= amountCents;
  }
  return effect;
}
