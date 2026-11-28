import { DomainError } from "./domain-error";
import { activeExpenses, type Expense } from "./expense";
import type { Cents } from "./money";
import { expenseObligations } from "./obligations";
import { pairStatement } from "./pair-statement";
import type { Payment } from "./payment";
import { areNeutralAt, type SharedFund } from "./shared-fund";

export type AmnestyItem = { outingId: string; expenseId: string; amountCents: Cents };

/** The creditor forgave part of what the debtor owed them. It lowers the balance and erases nothing. */
export type Amnesty = {
  id: string;
  creditorId: string;
  debtorId: string;
  createdAt: Date;
  items: AmnestyItem[];
};

export type ForgivableExpense = {
  expenseId: string;
  outingId: string;
  description: string;
  occurredAt: Date;
  /** What the debtor owes the creditor because of this expense, before payments and amnesties. */
  owedCents: Cents;
  forgivenCents: Cents;
  /** What can still be forgiven on this expense. */
  remainingCents: Cents;
};

export type Forgivable = {
  expenses: ForgivableExpense[];
  /** The most the creditor can forgive now: what the debtor still owes them, payments and amnesties included. */
  maxCents: Cents;
};

/** What `debtorId` owes `creditorId`, expense by expense, and how much of it the creditor may still forgive. */
export function forgivableBetween(
  creditorId: string,
  debtorId: string,
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[],
  funds: SharedFund[] = [],
): Forgivable {
  const forgivenBy = new Map<string, Cents>();
  for (const amnesty of amnesties) {
    if (amnesty.creditorId !== creditorId || amnesty.debtorId !== debtorId) continue;
    for (const item of amnesty.items) {
      forgivenBy.set(item.expenseId, (forgivenBy.get(item.expenseId) ?? 0) + item.amountCents);
    }
  }

  const rows: ForgivableExpense[] = [];
  for (const expense of activeExpenses(expenses)) {
    if (areNeutralAt(funds, creditorId, debtorId, expense.createdAt)) continue;
    const owedCents = expenseObligations(expense)
      .filter((obligation) => obligation.debtorId === debtorId && obligation.creditorId === creditorId)
      .reduce((sum, obligation) => sum + obligation.amountCents, 0);
    if (owedCents === 0) continue;
    const forgivenCents = forgivenBy.get(expense.id) ?? 0;
    rows.push({
      expenseId: expense.id,
      outingId: expense.outingId,
      description: expense.description,
      occurredAt: expense.occurredAt,
      owedCents,
      forgivenCents,
      remainingCents: Math.max(owedCents - forgivenCents, 0),
    });
  }
  rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const net = pairStatement(creditorId, debtorId, expenses, payments, amnesties, funds).projectedNetCents;
  return { expenses: rows, maxCents: Math.max(net, 0) };
}

/**
 * Checks what the creditor chose to forgive and returns it ready to record. Each item is at most
 * what is left of its expense, and the whole is at most what the debtor still owes the creditor.
 */
export function planAmnesty(
  creditorId: string,
  debtorId: string,
  selection: { expenseId: string; amountCents: Cents }[],
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[],
  funds: SharedFund[] = [],
): { items: AmnestyItem[]; totalCents: Cents } {
  if (creditorId === debtorId) {
    throw new DomainError("amnesty_same_person", "Você não pode perdoar a si mesmo.");
  }
  if (selection.length === 0) {
    throw new DomainError("amnesty_empty", "Escolha ao menos uma despesa para perdoar.");
  }

  const forgivable = forgivableBetween(creditorId, debtorId, expenses, payments, amnesties, funds);
  const byExpense = new Map(forgivable.expenses.map((row) => [row.expenseId, row]));
  const seen = new Set<string>();
  const items: AmnestyItem[] = [];
  for (const choice of selection) {
    if (!Number.isSafeInteger(choice.amountCents) || choice.amountCents <= 0) {
      throw new DomainError("amnesty_invalid_amount", "Informe um valor maior que zero para cada despesa perdoada.");
    }
    const row = byExpense.get(choice.expenseId);
    if (!row) {
      throw new DomainError("amnesty_expense_not_owed", "Essa despesa não gera dívida dessa pessoa com você.");
    }
    if (seen.has(choice.expenseId)) {
      throw new DomainError("amnesty_duplicate_expense", "Cada despesa só pode aparecer uma vez.");
    }
    seen.add(choice.expenseId);
    if (choice.amountCents > row.remainingCents) {
      throw new DomainError("amnesty_above_expense", `Só dá para perdoar o que resta de "${row.description}".`);
    }
    items.push({ outingId: row.outingId, expenseId: row.expenseId, amountCents: choice.amountCents });
  }

  const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (totalCents > forgivable.maxCents) {
    throw new DomainError("amnesty_above_balance", "Você só pode perdoar até o que essa pessoa ainda deve a você.");
  }
  return { items, totalCents };
}

/**
 * Forgives, oldest expense first, everything the debtor still owes the creditor. Used when two people
 * start sharing the same money: what was between them before is cleared on the spot.
 */
export function planClearingAmnesty(
  creditorId: string,
  debtorId: string,
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[],
): { items: AmnestyItem[]; totalCents: Cents } | null {
  const forgivable = forgivableBetween(creditorId, debtorId, expenses, payments, amnesties);
  let left = forgivable.maxCents;
  const selection: { expenseId: string; amountCents: Cents }[] = [];
  for (const row of forgivable.expenses) {
    if (left === 0) break;
    const amountCents = Math.min(row.remainingCents, left);
    if (amountCents > 0) {
      selection.push({ expenseId: row.expenseId, amountCents });
      left -= amountCents;
    }
  }
  return selection.length === 0 ? null : planAmnesty(creditorId, debtorId, selection, expenses, payments, amnesties);
}
