import { DomainError } from "./domain-error";

/** After closing, an expense can be disputed without consequence for this long. */
export const DISPUTE_WINDOW_DAYS = 7;

export type DisputeWindow = "active" | "within" | "late";

/**
 * Where a dispute stands in relation to the outing: on an open outing it is the normal case,
 * on a closed one it is either inside the 7 days or late, and a late one reopens the outing.
 */
export function disputeWindow(closedAt: Date | null, now: Date): DisputeWindow {
  if (closedAt === null) return "active";
  return now.getTime() - closedAt.getTime() <= DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000 ? "within" : "late";
}

export const LATE_DISPUTE_WARNING =
  "Este rolê foi encerrado há mais de 7 dias. Contestar agora afeta o histórico das relações e reabre o rolê para o dono avaliar.";

/** A late dispute only goes ahead when the person understood that it reopens the outing. */
export function assertLateDisputeConfirmed(window: DisputeWindow, confirmed: boolean): void {
  if (window === "late" && !confirmed) {
    throw new DomainError("dispute_late_needs_confirmation", LATE_DISPUTE_WARNING);
  }
}
