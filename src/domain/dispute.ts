import { DomainError } from "./domain-error";
import type { Expense } from "./expense";

/** What the participant disagrees with. */
export type DisputeSubject = "amount" | "split" | "other";

export type DisputeStatus = "open" | "approved" | "rejected";

/**
 * A participant asking the outing admin to review an expense. If approved, the
 * admin records a new version of the expense; either way the history is kept.
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

/** Only the outing admin decides. Approving means the expense will be revised. */
export function resolveDispute(
  dispute: ExpenseDispute,
  decision: { by: string; outingAdminId: string; approved: boolean; note: string; at: Date },
): ExpenseDispute {
  if (dispute.status !== "open") {
    throw new DomainError("dispute_already_resolved", "Esta contestação já foi decidida.");
  }
  if (decision.by !== decision.outingAdminId) {
    throw new DomainError("only_admin_resolves", "Só o dono do rolê pode decidir a contestação.");
  }
  return {
    ...dispute,
    status: decision.approved ? "approved" : "rejected",
    resolvedBy: decision.by,
    resolvedAt: decision.at,
    resolutionNote: decision.note.trim() === "" ? null : decision.note.trim(),
  };
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
