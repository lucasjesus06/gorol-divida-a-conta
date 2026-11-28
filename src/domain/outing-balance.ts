import { activeExpenses, type Expense } from "./expense";
import type { Amnesty } from "./amnesty";
import type { Cents } from "./money";
import type { Payment } from "./payment";

export type ParticipantBalance = {
  participantId: string;
  /** Paid to merchants for shared expenses. */
  paidCents: Cents;
  /** Total of the shares taken on (what was consumed). */
  owedCents: Cents;
  /** paid - owed: positive means this person fronted money for the others. */
  advancedCents: Cents;
  /** Confirmed payments sent to / received from other participants. */
  sentCents: Cents;
  receivedCents: Cents;
  /** Amnesties: what this person forgave to others / was forgiven by others. */
  amnestyGivenCents: Cents;
  amnestyReceivedCents: Cents;
  /** Positive: has money to receive. Negative: has money to pay. */
  netCents: Cents;
  /** Declared payments still waiting for the creditor's confirmation. */
  awaitingConfirmationSentCents: Cents;
  awaitingConfirmationReceivedCents: Cents;
};

/**
 * Consolidated position of each participant in one outing (rolê), derived only
 * from the active expenses and the confirmed payments. Nets always add up to zero.
 */
export function computeOutingBalances(
  outingId: string,
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[] = [],
): Map<string, ParticipantBalance> {
  const balances = new Map<string, ParticipantBalance>();
  const of = (participantId: string): ParticipantBalance => {
    let balance = balances.get(participantId);
    if (!balance) {
      balance = {
        participantId,
        paidCents: 0,
        owedCents: 0,
        advancedCents: 0,
        sentCents: 0,
        receivedCents: 0,
        amnestyGivenCents: 0,
        amnestyReceivedCents: 0,
        netCents: 0,
        awaitingConfirmationSentCents: 0,
        awaitingConfirmationReceivedCents: 0,
      };
      balances.set(participantId, balance);
    }
    return balance;
  };

  for (const expense of activeExpenses(expenses)) {
    if (expense.outingId !== outingId) continue;
    for (const payer of expense.payers) {
      of(payer.participantId).paidCents += payer.amountCents;
    }
    for (const [participantId, share] of expense.shares) {
      of(participantId).owedCents += share;
    }
  }

  for (const payment of payments) {
    if (payment.outingId !== outingId) continue;
    if (payment.status === "confirmed") {
      of(payment.fromId).sentCents += payment.amountCents;
      of(payment.toId).receivedCents += payment.amountCents;
    } else if (payment.status === "declared") {
      of(payment.fromId).awaitingConfirmationSentCents += payment.amountCents;
      of(payment.toId).awaitingConfirmationReceivedCents += payment.amountCents;
    }
  }

  for (const amnesty of amnesties) {
    for (const item of amnesty.items) {
      if (item.outingId !== outingId) continue;
      of(amnesty.creditorId).amnestyGivenCents += item.amountCents;
      of(amnesty.debtorId).amnestyReceivedCents += item.amountCents;
    }
  }

  for (const balance of balances.values()) {
    balance.advancedCents = balance.paidCents - balance.owedCents;
    balance.netCents = balance.advancedCents + balance.sentCents - balance.receivedCents + balance.amnestyReceivedCents - balance.amnestyGivenCents;
  }
  return balances;
}

export type DebtSummary = {
  /** What this person owed from the expenses, before any payment. */
  originalDebtCents: Cents;
  /** Confirmed payments this person already made. */
  paidCents: Cents;
  /** What is still left to pay. */
  pendingCents: Cents;
};

/** "Devido originalmente / pago / pendente" for someone who owes money. */
export function debtSummary(balance: ParticipantBalance): DebtSummary {
  return {
    originalDebtCents: Math.max(-balance.advancedCents, 0),
    paidCents: balance.sentCents,
    pendingCents: Math.max(-balance.netCents, 0),
  };
}
