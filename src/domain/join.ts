import { DomainError } from "./domain-error";

export const joinRequestStatuses = ["pending", "approved", "rejected"] as const;
export type JoinRequestStatus = (typeof joinRequestStatuses)[number];

export const JOIN_LINK_VALIDITY_DAYS = 3;
export const JOIN_ATTEMPT_WINDOW_MINUTES = 60;
export const MAX_FAILED_ATTEMPTS_PER_PARTICIPANT = 5;
export const MAX_FAILED_ATTEMPTS_PER_OUTING = 30;

export function joinLinkExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + JOIN_LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export type JoinLinkState = "usable" | "revoked" | "expired";

export function joinLinkState(link: { revokedAt: Date | null; expiresAt: Date }, now: Date): JoinLinkState {
  if (link.revokedAt !== null) return "revoked";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "usable";
}

export function assertJoinAttemptsAllowed(failed: { forParticipant: number; forOuting: number }) {
  if (
    failed.forParticipant >= MAX_FAILED_ATTEMPTS_PER_PARTICIPANT ||
    failed.forOuting >= MAX_FAILED_ATTEMPTS_PER_OUTING
  ) {
    throw new DomainError("too_many_join_attempts", "Muitas tentativas. Aguarde um pouco e tente de novo.");
  }
}
