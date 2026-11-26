import { DomainError } from "./domain-error";

export const DISPLAY_NAME_MAX_LENGTH = 80;

/** The name other people see in the outing; surrounding spaces are not kept. */
export function normalizeDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name === "") {
    throw new DomainError("display_name_required", "Informe o seu nome.");
  }
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new DomainError(
      "display_name_too_long",
      `O nome pode ter no máximo ${DISPLAY_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return name;
}
