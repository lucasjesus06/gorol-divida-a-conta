import { DomainError } from "./domain-error";
import { normalizeDisplayName } from "./person";
import { normalizePhone } from "./phone";

export type ParticipantInput = { displayName: string; phone: string };

/** What the owner types for each participant: the name is only used inside that outing. */
export function normalizeParticipantInput(input: { name: string; phone: string }): ParticipantInput {
  if (input.name.trim() === "") {
    throw new DomainError("participant_name_required", "Informe o nome do participante.");
  }
  return { displayName: normalizeDisplayName(input.name), phone: normalizePhone(input.phone) };
}
