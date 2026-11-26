import { DomainError } from "./domain-error";
import type { OutingRole } from "./outing";
import type { Payer, SplitRule } from "./split";

/** Everyone an expense mentions: who paid and who takes on a part. */
export function peopleInExpense(payers: Payer[], split: SplitRule): Set<string> {
  const people = new Set(payers.map((payer) => payer.participantId));
  switch (split.method) {
    case "equal":
      split.participantIds.forEach((id) => people.add(id));
      break;
    case "exact":
      split.shares.forEach((share) => people.add(share.participantId));
      break;
    case "itemized":
      split.items.forEach((item) =>
        item.consumption.forEach((consumption) => people.add(consumption.participantId)),
      );
      break;
  }
  return people;
}

/** An expense only involves people who take part in its outing. */
export function assertPeopleInOuting(people: Set<string>, participants: Set<string>): void {
  for (const id of people) {
    if (!participants.has(id)) {
      throw new DomainError(
        "person_not_in_outing",
        "Todas as pessoas da despesa precisam participar do rolê.",
      );
    }
  }
}

/** Any participant registers expenses; correcting or voiding is for whoever registered it or the admin. */
export function assertCanChangeExpense(
  registeredBy: string,
  callerId: string,
  callerRole: OutingRole,
): void {
  if (registeredBy !== callerId && callerRole !== "admin") {
    throw new DomainError(
      "only_registrant_or_admin_changes_expense",
      "Só quem registrou a despesa ou quem administra o rolê pode corrigi-la ou anulá-la.",
    );
  }
}
