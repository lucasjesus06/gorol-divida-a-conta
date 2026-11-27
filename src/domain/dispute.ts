import { approvalDecisions, disputeStatuses, disputeSubjects } from "./dispute-status";
import { DomainError } from "./domain-error";
import type { Expense } from "./expense";
import type { SplitRule } from "./split";

/** What the participant disagrees with. */
export type DisputeSubject = (typeof disputeSubjects)[number];

export type DisputeStatus = (typeof disputeStatuses)[number];

/**
 * A participant asking for an expense to be reviewed. If accepted, a new
 * version of the expense is recorded; either way the history is kept.
 */
export type ExpenseDispute = {
  id: string;
  expenseId: string;
  outingId: string;
  openedBy: string;
  subject: DisputeSubject;
  message: string;
  status: DisputeStatus;
  openedAt: Date;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
};

export function openDispute(
  expense: Expense,
  existing: ExpenseDispute[],
  input: { id: string; openedBy: string; subject: DisputeSubject; message: string; openedAt: Date },
): ExpenseDispute {
  if (expense.status !== "active") {
    throw new DomainError(
      "expense_not_active",
      "Só é possível contestar a versão ativa da despesa.",
    );
  }
  const involved =
    expense.shares.has(input.openedBy) ||
    expense.payers.some((payer) => payer.participantId === input.openedBy);
  if (!involved) {
    throw new DomainError(
      "not_involved_in_expense",
      "Só quem participa da despesa pode contestá-la.",
    );
  }
  if (input.message.trim() === "") {
    throw new DomainError("dispute_message_required", "Explique o que precisa ser revisto.");
  }
  if (input.subject === "not_participated") {
    equalSplitWithout(expense, input.openedBy);
    if (expense.payers.some((payer) => payer.participantId === input.openedBy)) {
      throw new DomainError("payer_cannot_opt_out", "Quem pagou a despesa participou dela.");
    }
  }
  const alreadyOpen = existing.some(
    (dispute) =>
      dispute.expenseId === expense.id &&
      dispute.openedBy === input.openedBy &&
      dispute.status === "open",
  );
  if (alreadyOpen) {
    throw new DomainError(
      "dispute_already_open",
      "Você já tem uma contestação aberta para esta despesa.",
    );
  }
  return {
    ...input,
    message: input.message.trim(),
    expenseId: expense.id,
    outingId: expense.outingId,
    status: "open",
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
  };
}

export type ApprovalDecision = (typeof approvalDecisions)[number];

/**
 * Who has to agree before a dispute is accepted. Amount and split disputes are
 * decided by the outing admin alone; "I did not take part" also needs everyone
 * who paid, because their share would move to the others.
 */
export function requiredApprovers(subject: DisputeSubject, adminIds: string[], payerIds: string[]): string[] {
  return [...new Set(subject === "not_participated" ? [...adminIds, ...payerIds] : adminIds)];
}

/** Accepted only when every approver agrees; one refusal rejects it. */
export function disputeOutcome(decisions: ApprovalDecision[]): DisputeStatus {
  if (decisions.some((decision) => decision === "rejected")) {
    return "rejected";
  }
  if (decisions.length > 0 && decisions.every((decision) => decision === "approved")) {
    return "approved";
  }
  return "open";
}

/** The equal split of an expense once someone who did not take part is taken out. */
export function equalSplitWithout(expense: Expense, personId: string): SplitRule {
  if (expense.split.method !== "equal") {
    throw new DomainError("not_participated_needs_equal_split", "Esta opção vale para despesas divididas por igual.");
  }
  return { method: "equal", participantIds: expense.split.participantIds.filter((id) => id !== personId) };
}

/** While someone has an open dispute in an outing, their payment reminders are on hold. */
export function hasOpenDispute(
  participantId: string,
  outingId: string,
  disputes: ExpenseDispute[],
): boolean {
  return disputes.some(
    (dispute) =>
      dispute.openedBy === participantId &&
      dispute.outingId === outingId &&
      dispute.status === "open",
  );
}
