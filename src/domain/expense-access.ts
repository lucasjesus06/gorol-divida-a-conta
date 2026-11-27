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

/** Only the outing admin and the payers the admin declared register expenses. */
export function assertCanRegisterExpense(callerRole: OutingRole, isDeclaredPayer: boolean): void {
  if (callerRole !== "admin" && !isDeclaredPayer) {
    throw new DomainError(
      "only_payers_register_expense",
      "Só o dono do rolê e os pagantes declarados registram despesas.",
    );
  }
}

/** Everyone who paid an expense is the admin or a declared payer; anyone else asks to become one. */
export function assertPayersAllowed(payers: Payer[], allowedPayerIds: Set<string>): void {
  for (const payer of payers) {
    if (!allowedPayerIds.has(payer.participantId)) {
      throw new DomainError(
        "payer_not_declared",
        "Quem pagou precisa ser o dono do rolê ou um pagante declarado.",
      );
    }
  }
}

/** Correcting or voiding is for whoever registered the expense or the admin. */
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
