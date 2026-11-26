import { DomainError } from "./domain-error";
import type { Payment } from "./payment";

/** Payments settle debts inside one outing, so everyone they mention must take part in it. */
export function assertPaymentPeopleInOuting(payment: Payment, participants: Set<string>): void {
  const people = [payment.fromId, payment.toId, payment.onBehalfOfId].filter(
    (id): id is string => id !== null,
  );
  if (people.some((id) => !participants.has(id))) {
    throw new DomainError(
      "person_not_in_outing",
      "Quem paga, quem recebe e por quem se paga precisam participar do rolê.",
    );
  }
}
