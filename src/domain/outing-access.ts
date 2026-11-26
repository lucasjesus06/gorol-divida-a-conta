import { DomainError } from "./domain-error";
import type { OutingRole } from "./outing";


/** How the caller takes part in an outing, or null when they are not in it. */
export type Membership = { role: OutingRole; status: "active" | "left" } | null;

/**
 * Only active participants see an outing. Anyone else gets "not found", so an
 * outing id alone does not reveal that the outing exists.
 */
export function assertParticipant(
  membership: Membership,
): asserts membership is NonNullable<Membership> {
  if (membership === null || membership.status !== "active") {
    throw new DomainError("outing_not_found", "Rolê não encontrado.");
  }
}

/** The outing admin manages it: split type, participants and dispute decisions. */
export function assertAdmin(membership: Membership): asserts membership is NonNullable<Membership> {
  assertParticipant(membership);
  if (membership.role !== "admin") {
    throw new DomainError(
      "only_admin_manages_outing",
      "Só quem administra o rolê pode fazer isso.",
    );
  }
}
