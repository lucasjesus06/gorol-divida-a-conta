import type { ClosingVoteDecision } from "./closing-vote-status";
import { DomainError } from "./domain-error";
import type { Cents } from "./money";

export { closingVoteDecisions, closingVoteStatuses, type ClosingVoteDecision, type ClosingVoteStatus } from "./closing-vote-status";

/** Default: silence counts as acceptance after this long. The system parameter can change it. */
export const CLOSING_VOTE_DAYS = 3;

export type PersonBalance = { personId: string; netCents: Cents };

export function closingVoteDeadline(now: Date, days: number = CLOSING_VOTE_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Only who has money to receive votes: whoever owes does not decide how others give up their credit. */
export function closingVoters(balances: PersonBalance[]): string[] {
  return balances.filter((balance) => balance.netCents > 0).map((balance) => balance.personId).sort();
}

/** True when the owner is the only one with something to receive, so nobody else needs to agree. */
export function ownerClosesAlone(balances: PersonBalance[], ownerId: string): boolean {
  const voters = closingVoters(balances);
  return voters.length > 0 && voters.every((personId) => personId === ownerId);
}

/** A fingerprint of who owes or is owed how much; a vote is only valid for the balances it was asked about. */
export function balanceSnapshot(balances: PersonBalance[]): string {
  return balances
    .filter((balance) => balance.netCents !== 0)
    .map((balance) => `${balance.personId}:${balance.netCents}`)
    .sort()
    .join("|");
}

export type ClosingVoteOutcome = "approved" | "rejected" | "open";

/**
 * One "no" keeps the outing open. When everybody accepted, or the deadline passed with nobody
 * refusing (silence is acceptance), the outing can close. Otherwise the vote goes on.
 */
export function closingVoteOutcome(decisions: ClosingVoteDecision[], deadline: Date, now: Date): ClosingVoteOutcome {
  if (decisions.some((decision) => decision === "rejected")) return "rejected";
  if (decisions.every((decision) => decision === "accepted")) return "approved";
  return now >= deadline ? "approved" : "open";
}

/** The vote the owner can ask for: only the open balance blocks, and guests without an account owe nothing. */
export function assertCanAskForVote(input: { onlyOpenBalanceBlocks: boolean; guestsInDebt: string[] }): void {
  if (!input.onlyOpenBalanceBlocks) {
    throw new DomainError("closing_vote_not_applicable", "Resolva os outros pontos em aberto antes de pedir o encerramento.");
  }
  if (input.guestsInDebt.length > 0) {
    throw new DomainError(
      "closing_vote_guest_debt",
      `${input.guestsInDebt.join(", ")} ainda deve e não tem conta: precisa pagar ou criar o cadastro antes de encerrar.`,
    );
  }
}
