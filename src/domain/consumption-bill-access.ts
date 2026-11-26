import { DomainError } from "./domain-error";
import type { OutingRole } from "./outing";

/**
 * Each participant marks what they consumed. The admin can also mark for others,
 * for friends who were added by name and do not use the app yet.
 */
export function assertCanClaimFor(
  personId: string,
  callerId: string,
  callerRole: OutingRole,
): void {
  if (personId !== callerId && callerRole !== "admin") {
    throw new DomainError(
      "only_admin_claims_for_others",
      "Só quem administra o rolê pode marcar o consumo de outra pessoa.",
    );
  }
}

/** Closing the bill turns it into an expense: for whoever opened it or the admin. */
export function assertCanCloseBill(
  openedBy: string,
  callerId: string,
  callerRole: OutingRole,
): void {
  if (openedBy !== callerId && callerRole !== "admin") {
    throw new DomainError(
      "only_opener_or_admin_closes_bill",
      "Só quem abriu a conta ou quem administra o rolê pode fechá-la.",
    );
  }
}

export function assertBillOpen(status: "open" | "closed"): void {
  if (status !== "open") {
    throw new DomainError("bill_already_closed", "Esta conta já foi fechada.");
  }
}
