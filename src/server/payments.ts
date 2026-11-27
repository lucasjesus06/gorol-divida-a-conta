import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { payments } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import {
  confirmPayment as confirmPaymentDomain,
  declarePayment as declarePaymentDomain,
  rejectPayment as rejectPaymentDomain,
  type ConfirmationSource,
  type Payment,
  type PaymentStatus,
} from "@/domain/payment";
import { assertActiveOuting, outingContext } from "./expenses";

export type PaymentView = {
  id: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  onBehalfOf: { id: string; name: string } | null;
  amountCents: number;
  status: PaymentStatus;
  confirmedBy: ConfirmationSource | null;
  declaredAt: Date;
  resolvedAt: Date | null;
  canResolve: boolean;
};

async function findByKey(outingId: string, key: string) {
  const [existing] = await getDb()
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.outingId, outingId), eq(payments.idempotencyKey, key)));
  return existing?.id ?? null;
}

export async function declarePayment(
  personId: string,
  outingId: string,
  input: { toId: string; amountCents: number; onBehalfOfId?: string; idempotencyKey?: string },
): Promise<string> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);

  const involved = [input.toId, ...(input.onBehalfOfId ? [input.onBehalfOfId] : [])];
  if (involved.some((id) => !context.participantIds.has(id))) {
    throw new DomainError("person_not_in_outing", "Todas as pessoas da despesa precisam participar do rolê.");
  }

  if (input.idempotencyKey) {
    const existing = await findByKey(outingId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const payment = declarePaymentDomain({
    id: crypto.randomUUID(),
    outingId,
    fromId: personId,
    toId: input.toId,
    amountCents: input.amountCents,
    onBehalfOfId: input.onBehalfOfId ?? null,
    declaredAt: new Date(),
  });
  try {
    await getDb().insert(payments).values({
      id: payment.id,
      outingId,
      fromId: payment.fromId,
      toId: payment.toId,
      onBehalfOfId: payment.onBehalfOfId,
      amountCents: payment.amountCents,
      declaredAt: payment.declaredAt,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    const existing = input.idempotencyKey ? await findByKey(outingId, input.idempotencyKey) : null;
    if (existing) {
      return existing;
    }
    throw error;
  }
  return payment.id;
}

export async function listPayments(personId: string, outingId: string): Promise<PaymentView[]> {
  const context = await outingContext(personId, outingId);
  const rows = await getDb().select().from(payments).where(eq(payments.outingId, outingId)).orderBy(desc(payments.declaredAt));
  const nameOf = (id: string) => context.names.get(id) ?? "Pessoa";
  return rows.map((row) => ({
    id: row.id,
    from: { id: row.fromId, name: nameOf(row.fromId) },
    to: { id: row.toId, name: nameOf(row.toId) },
    onBehalfOf: row.onBehalfOfId ? { id: row.onBehalfOfId, name: nameOf(row.onBehalfOfId) } : null,
    amountCents: row.amountCents,
    status: row.status,
    confirmedBy: row.confirmedBy,
    declaredAt: row.declaredAt,
    resolvedAt: row.resolvedAt,
    canResolve: row.status === "declared" && row.toId === personId,
  }));
}

async function loadPayment(outingId: string, paymentId: string): Promise<Payment> {
  const [row] = await getDb().select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.outingId, outingId)));
  if (!row) {
    throw new DomainError("payment_not_found", "Pagamento não encontrado.");
  }
  return {
    id: row.id,
    outingId: row.outingId,
    fromId: row.fromId,
    toId: row.toId,
    amountCents: row.amountCents,
    onBehalfOfId: row.onBehalfOfId,
    status: row.status,
    proof: null,
    confirmedBy: row.confirmedBy,
    contestableUntil: null,
    contestReason: null,
    declaredAt: row.declaredAt,
    resolvedAt: row.resolvedAt,
  };
}

export async function confirmPayment(personId: string, outingId: string, paymentId: string) {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const confirmed = confirmPaymentDomain(await loadPayment(outingId, paymentId), personId, new Date());
  const changed = await getDb()
    .update(payments)
    .set({ status: "confirmed", confirmedBy: "creditor", resolvedAt: confirmed.resolvedAt })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "declared")))
    .returning({ id: payments.id });
  if (changed.length === 0) {
    throw new DomainError("payment_already_resolved", "Este pagamento já foi confirmado ou recusado.");
  }
}

export async function rejectPayment(personId: string, outingId: string, paymentId: string) {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const rejected = rejectPaymentDomain(await loadPayment(outingId, paymentId), personId, new Date());
  const changed = await getDb()
    .update(payments)
    .set({ status: "rejected", resolvedAt: rejected.resolvedAt })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "declared")))
    .returning({ id: payments.id });
  if (changed.length === 0) {
    throw new DomainError("payment_already_resolved", "Este pagamento já foi confirmado ou recusado.");
  }
}
