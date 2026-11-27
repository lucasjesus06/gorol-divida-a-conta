import { DomainError } from "./domain-error";

export const accessRequestStatuses = ["pending", "approved", "rejected"] as const;
export type AccessRequestStatus = (typeof accessRequestStatuses)[number];

export const accessRequestSources = ["request", "invite"] as const;
export type AccessRequestSource = (typeof accessRequestSources)[number];

export const INVITE_VALIDITY_DAYS = 7;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email) || email.length > EMAIL_MAX_LENGTH) {
    throw new DomainError("invalid_email", "Informe um e-mail válido.");
  }
  return email;
}

export function inviteExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export type InviteState = "usable" | "used" | "revoked" | "expired";

export function inviteState(
  invite: { usedAt: Date | null; revokedAt?: Date | null; expiresAt: Date },
  now: Date,
): InviteState {
  if (invite.usedAt !== null) return "used";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "usable";
}
