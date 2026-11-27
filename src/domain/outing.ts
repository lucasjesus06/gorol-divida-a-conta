import { DomainError } from "./domain-error";

export const outingKinds = ["event", "recurring"] as const;
export type OutingKind = (typeof outingKinds)[number];

export const outingStatuses = ["active", "closed"] as const;
export type OutingStatus = (typeof outingStatuses)[number];

export const outingRoles = ["admin", "member"] as const;
export type OutingRole = (typeof outingRoles)[number];

export const OUTING_NAME_MAX_LENGTH = 120;

export function normalizeOutingName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name === "") {
    throw new DomainError("outing_name_required", "Dê um nome para o rolê.");
  }
  if (name.length > OUTING_NAME_MAX_LENGTH) {
    throw new DomainError(
      "outing_name_too_long",
      `O nome do rolê pode ter no máximo ${OUTING_NAME_MAX_LENGTH} caracteres.`,
    );
  }
  return name;
}

export function parseOutingKind(value: unknown): OutingKind {
  if (outingKinds.includes(value as OutingKind)) {
    return value as OutingKind;
  }
  throw new DomainError("invalid_outing_kind", "Escolha se o rolê é pontual ou recorrente.");
}
