import { DomainError } from "./domain-error";

/** Monetary amount in integer cents (BRL). Never a floating-point value. */
export type Cents = number;

export function assertCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError("invalid_amount", `${field} deve ser um valor inteiro em centavos.`);
  }
}

export function assertPositiveCents(value: number, field: string): void {
  assertCents(value, field);
  if (value <= 0) {
    throw new DomainError("invalid_amount", `${field} deve ser maior que zero.`);
  }
}

export function assertNonNegativeCents(value: number, field: string): void {
  assertCents(value, field);
  if (value < 0) {
    throw new DomainError("invalid_amount", `${field} não pode ser negativo.`);
  }
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}
