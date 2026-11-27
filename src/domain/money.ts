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

/** Reads what a person types, such as "25,90" or "R$ 1.234,50", into integer cents. */
export function parseMoneyToCents(input: string): Cents {
  const cleaned = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(cleaned) ?? /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    throw new DomainError("invalid_amount", "Informe um valor válido, como 25,90.");
  }
  const reais = Number(match[1].replace(/\./g, ""));
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = reais * 100 + cents;
  assertPositiveCents(total, "O valor");
  return total;
}

export function formatCents(cents: Cents): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
