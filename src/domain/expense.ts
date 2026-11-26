import { DomainError } from "./domain-error";
import { assertPositiveCents, sumCents, type Cents } from "./money";
import { validateEvidence, type ExpenseEvidence } from "./evidence";
import { computeShares, type Payer, type SplitRule } from "./split";

export type ExpenseStatus = "active" | "superseded" | "voided";

/**
 * A shared expense inside an outing (rolê). Financial history is never edited
 * in place: a correction creates a new version and supersedes the previous one.
 */
export type Expense = {
  id: string;
  outingId: string;
  version: number;
  previousVersionId: string | null;
  status: ExpenseStatus;
  description: string;
  totalCents: Cents;
  payers: Payer[];
  split: SplitRule;
  /** Resolved amount each participant takes on; the financial source of truth. */
  shares: Map<string, Cents>;
  /** Optional documents backing the amount; kept across versions. */
  evidence: ExpenseEvidence[];
  registeredBy: string;
  occurredAt: Date;
  createdAt: Date;
  voidedBy: string | null;
  voidReason: string | null;
};

export type ExpenseInput = {
  id: string;
  outingId: string;
  description: string;
  totalCents: Cents;
  payers: Payer[];
  split: SplitRule;
  registeredBy: string;
  occurredAt: Date;
  createdAt: Date;
  evidence?: ExpenseEvidence[];
};

export function createExpense(input: ExpenseInput): Expense {
  return buildExpense(input, 1, null);
}

/** Records a corrected version of an active expense. */
export function reviseExpense(
  current: Expense,
  changes: Omit<ExpenseInput, "outingId">,
): { superseded: Expense; revision: Expense } {
  assertActive(current);
  const revision = buildExpense(
    {
      ...changes,
      outingId: current.outingId,
      evidence: [...current.evidence, ...(changes.evidence ?? [])],
    },
    current.version + 1,
    current.id,
  );
  return { superseded: { ...current, status: "superseded" }, revision };
}

export function voidExpense(current: Expense, voidedBy: string, reason: string): Expense {
  assertActive(current);
  if (reason.trim() === "") {
    throw new DomainError("void_reason_required", "Informe o motivo para anular a despesa.");
  }
  return { ...current, status: "voided", voidedBy, voidReason: reason.trim() };
}

/** Attaches a document backing the amount. Evidence is only ever added, never removed. */
export function attachEvidence(current: Expense, evidence: ExpenseEvidence): Expense {
  assertActive(current);
  return { ...current, evidence: [...current.evidence, validateEvidence(evidence)] };
}

export function activeExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((expense) => expense.status === "active");
}

function buildExpense(
  input: ExpenseInput,
  version: number,
  previousVersionId: string | null,
): Expense {
  if (input.description.trim() === "") {
    throw new DomainError("description_required", "Informe a descrição da despesa.");
  }
  assertPositiveCents(input.totalCents, "O total da despesa");
  assertPayers(input.payers, input.totalCents);

  const shares = computeShares(input.totalCents, input.split, input.payers);

  const people = new Set([...input.payers.map((payer) => payer.participantId), ...shares.keys()]);
  if (people.size < 2) {
    throw new DomainError(
      "expense_needs_two_people",
      "Uma despesa compartilhada envolve pelo menos duas pessoas.",
    );
  }

  return {
    ...input,
    evidence: (input.evidence ?? []).map(validateEvidence),
    description: input.description.trim(),
    version,
    previousVersionId,
    status: "active",
    shares,
    voidedBy: null,
    voidReason: null,
  };
}

function assertPayers(payers: Payer[], totalCents: Cents): void {
  if (payers.length === 0) {
    throw new DomainError("no_payers", "A despesa precisa de pelo menos um pagador.");
  }
  const ids = payers.map((payer) => payer.participantId);
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("duplicated_payer", "Um pagador aparece mais de uma vez.");
  }
  for (const payer of payers) {
    assertPositiveCents(payer.amountCents, "O valor pago");
  }
  const paid = sumCents(payers.map((payer) => payer.amountCents));
  if (paid !== totalCents) {
    throw new DomainError(
      "payers_total_mismatch",
      `A soma dos pagamentos (${paid}) é diferente do total da despesa (${totalCents}).`,
    );
  }
}

function assertActive(expense: Expense): void {
  if (expense.status !== "active") {
    throw new DomainError(
      "expense_not_active",
      "Só é possível alterar ou anular a versão ativa da despesa.",
    );
  }
}
