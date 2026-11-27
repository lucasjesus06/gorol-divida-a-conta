import { DomainError } from "./domain-error";

const E164 = /^\+[1-9][0-9]{7,14}$/;
const BRAZIL = "55";

function candidateFor(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }
  if (trimmed.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+${BRAZIL}${digits}`;
  }
  if (digits.startsWith(BRAZIL) && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  return "";
}

export function normalizePhone(input: string): string {
  const candidate = candidateFor(input);
  if (!E164.test(candidate)) {
    throw new DomainError("invalid_phone", "Informe um telefone válido, com DDD.");
  }
  return candidate;
}
