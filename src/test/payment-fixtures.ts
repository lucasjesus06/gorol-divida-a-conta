import {
  confirmPayment,
  declarePayment,
  type Payment,
  type PaymentInput,
} from "@/domain/payment";

const AT = new Date("2026-11-10T12:00:00Z");

type PaymentOverrides = Partial<PaymentInput> &
  Pick<PaymentInput, "fromId" | "toId" | "amountCents">;

export function aDeclaredPayment(overrides: PaymentOverrides): Payment {
  return declarePayment({ id: "payment-1", outingId: "outing-1", declaredAt: AT, ...overrides });
}

export function aConfirmedPayment(overrides: PaymentOverrides): Payment {
  const declared = aDeclaredPayment(overrides);
  return confirmPayment(declared, declared.toId, AT);
}
