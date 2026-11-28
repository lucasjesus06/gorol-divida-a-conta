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

export const NICKNAME_MAX_LENGTH = 40;

/** What the person likes to be called; empty means "use my first name". */
export function normalizeNickname(value: string): string | null {
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname === "") {
    return null;
  }
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    throw new DomainError("nickname_too_long", `O apelido pode ter no máximo ${NICKNAME_MAX_LENGTH} caracteres.`);
  }
  return nickname;
}

/** How to address the person in a message: their nickname, or the first name of the registered one. */
export function greetingName(displayName: string, nickname: string | null): string {
  return nickname ?? displayName.trim().split(/\s+/)[0] ?? displayName;
}
