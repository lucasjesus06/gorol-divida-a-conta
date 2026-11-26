import { DomainError } from "./domain-error";
import { assertPositiveCents, type Cents } from "./money";

/**
 * - declared: the payer says they paid; waits for a receipt or the creditor.
 * - confirmed: counts in the balances (by the creditor or by a receipt).
 * - contested: the creditor says the money did not arrive; does not count.
 * - rejected: the creditor refused it; does not count.
 */
export type PaymentStatus = "declared" | "confirmed" | "contested" | "rejected";

export type ConfirmationSource = "creditor" | "receipt";

/** How long the creditor has to contest a payment confirmed by a receipt. */
export const RECEIPT_CONTEST_DAYS = 3;

export type PaymentProof = {
  fileId: string;
  /** "share": sent straight from the bank app's share button; "upload": picked by hand. */
  source: "share" | "upload";
  uploadedAt: Date;
};

/**
 * Money sent from one person to another to settle debts of an outing (rolê).
 * The app does not move money: the payer declares it, and a bank receipt or the
 * creditor confirms it. With onBehalfOfId the payer settles someone else's debt
 * and becomes their creditor.
 */
export type Payment = {
  id: string;
  outingId: string;
  fromId: string;
  toId: string;
  amountCents: Cents;
  onBehalfOfId: string | null;
  status: PaymentStatus;
  proof: PaymentProof | null;
  confirmedBy: ConfirmationSource | null;
  /** Until when the creditor can contest a receipt-confirmed payment. */
  contestableUntil: Date | null;
  contestReason: string | null;
  declaredAt: Date;
  resolvedAt: Date | null;
};

export type PaymentInput = {
  id: string;
  outingId: string;
  fromId: string;
  toId: string;
  amountCents: Cents;
  declaredAt: Date;
  onBehalfOfId?: string | null;
  proof?: PaymentProof | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function declarePayment(input: PaymentInput): Payment {
  assertPositiveCents(input.amountCents, "O valor do pagamento");
  if (input.fromId === input.toId) {
    throw new DomainError(
      "payment_to_self",
      "Quem paga e quem recebe precisam ser pessoas diferentes.",
    );
  }
  const onBehalfOfId = input.onBehalfOfId ?? null;
  if (onBehalfOfId === input.fromId || onBehalfOfId === input.toId) {
    throw new DomainError(
      "invalid_on_behalf_of",
      "O pagamento em nome de alguém precisa indicar uma terceira pessoa.",
    );
  }
  const declared: Payment = {
    id: input.id,
    outingId: input.outingId,
    fromId: input.fromId,
    toId: input.toId,
    amountCents: input.amountCents,
    onBehalfOfId,
    status: "declared",
    proof: null,
    confirmedBy: null,
    contestableUntil: null,
    contestReason: null,
    declaredAt: input.declaredAt,
    resolvedAt: null,
  };
  return input.proof ? attachProof(declared, input.fromId, input.proof) : declared;
}

/**
 * The payer sends the bank receipt: the payment is confirmed right away, so
 * nobody needs to mark it as received, and the creditor can still contest it.
 */
export function attachProof(payment: Payment, by: string, proof: PaymentProof): Payment {
  if (payment.status !== "declared") {
    throw new DomainError(
      "payment_not_awaiting_proof",
      "O comprovante só pode ser enviado enquanto o pagamento aguarda confirmação.",
    );
  }
  if (by !== payment.fromId) {
    throw new DomainError("only_payer_sends_proof", "Só quem pagou pode enviar o comprovante.");
  }
  if (proof.fileId.trim() === "") {
    throw new DomainError("proof_file_required", "O comprovante precisa de um arquivo anexado.");
  }
  return {
    ...payment,
    status: "confirmed",
    proof,
    confirmedBy: "receipt",
    contestableUntil: new Date(proof.uploadedAt.getTime() + RECEIPT_CONTEST_DAYS * DAY_MS),
    resolvedAt: proof.uploadedAt,
  };
}

/** The creditor confirms a declared payment, or one they had contested. */
export function confirmPayment(payment: Payment, by: string, at: Date): Payment {
  assertCreditor(payment, by);
  if (payment.status !== "declared" && payment.status !== "contested") {
    throw new DomainError(
      "payment_already_resolved",
      "Este pagamento já foi confirmado ou recusado.",
    );
  }
  return {
    ...payment,
    status: "confirmed",
    confirmedBy: "creditor",
    contestableUntil: null,
    resolvedAt: at,
  };
}

export function rejectPayment(payment: Payment, by: string, at: Date): Payment {
  assertCreditor(payment, by);
  if (payment.status !== "declared" && payment.status !== "contested") {
    throw new DomainError(
      "payment_already_resolved",
      "Este pagamento já foi confirmado ou recusado.",
    );
  }
  return { ...payment, status: "rejected", resolvedAt: at };
}

/** "O dinheiro não caiu": the creditor contests a receipt-confirmed payment in time. */
export function contestPayment(payment: Payment, by: string, at: Date, reason: string): Payment {
  assertCreditor(payment, by);
  if (payment.status !== "confirmed" || payment.confirmedBy !== "receipt") {
    throw new DomainError(
      "payment_not_contestable",
      "Só pagamentos confirmados por comprovante podem ser contestados.",
    );
  }
  if (!payment.contestableUntil || at > payment.contestableUntil) {
    throw new DomainError("contest_window_closed", "O prazo para contestar este pagamento acabou.");
  }
  if (reason.trim() === "") {
    throw new DomainError("contest_reason_required", "Informe o motivo da contestação.");
  }
  return { ...payment, status: "contested", contestReason: reason.trim(), resolvedAt: at };
}

function assertCreditor(payment: Payment, by: string): void {
  if (by !== payment.toId) {
    throw new DomainError(
      "only_creditor_resolves",
      "Só quem recebeu o pagamento pode confirmar, recusar ou contestar.",
    );
  }
}
