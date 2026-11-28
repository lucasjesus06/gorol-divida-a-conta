import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { files, paymentReceiptReadings, payments } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { paymentContested, paymentReceiptNeedsReview, paymentSettledByReceipt } from "@/domain/notification";
import { attachProof, contestPayment as contestPaymentDomain, type Payment } from "@/domain/payment";
import { compareReceipt, isPixReceiptText, readPixReceipt, type ReceiptIssue } from "@/domain/pix-receipt";
import { assertActiveOuting, outingContext } from "./expenses";
import { notify } from "./push";
import { getParameterValues } from "./system-parameters";

/** The text the device read from the receipt is only a few lines; anything bigger is not a receipt. */
const MAX_TEXT_LENGTH = 20000;

export type ReceiptOutcome = { outcome: "settled" | "review"; issues: ReceiptIssue[] };

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
    contestableUntil: row.contestableUntil,
    contestReason: row.contestReason,
    declaredAt: row.declaredAt,
    resolvedAt: row.resolvedAt,
  };
}

/**
 * The payer sends the receipt they already attached. The device read its text; here it is read again
 * into fields and compared with the declared payment. If everything matches the payment is settled
 * and the creditor can still contest it; otherwise it stays waiting, with every difference listed for the creditor.
 */
export async function sendReceipt(personId: string, outingId: string, paymentId: string, input: { fileId: string; text: string }): Promise<ReceiptOutcome> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const payment = await loadPayment(outingId, paymentId);
  if (payment.fromId !== personId) {
    throw new DomainError("only_payer_sends_proof", "Só quem pagou pode enviar o comprovante.");
  }
  if (payment.status !== "declared") {
    throw new DomainError("payment_not_awaiting_proof", "O comprovante só pode ser enviado enquanto o pagamento aguarda confirmação.");
  }
  if (input.text.length > MAX_TEXT_LENGTH) {
    throw new DomainError("receipt_text_too_long", "O texto lido do comprovante é grande demais.");
  }

  const [file] = await getDb()
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, input.fileId), eq(files.kind, "payment_receipt"), eq(files.subjectId, paymentId), eq(files.ownerId, personId), eq(files.status, "ready")));
  if (!file) {
    throw new DomainError("receipt_file_not_found", "Anexe o comprovante deste pagamento antes de enviar.");
  }

  const reading = readPixReceipt(input.text);
  const contestDays = (await getParameterValues())["receipt.contest_days"] as number;
  const creditorName = context.names.get(payment.toId) ?? "Pessoa";

  const result = await asService(() =>
    getDb().transaction(async (tx) => {
      // The same code can settle only one live payment; two sends at once for it are put in line.
      if (reading.transactionId) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`receipt:${reading.transactionId}`}, 0))`);
      }
      const [already] = reading.transactionId
        ? await tx
            .select({ id: paymentReceiptReadings.id })
            .from(paymentReceiptReadings)
            .innerJoin(payments, eq(payments.id, paymentReceiptReadings.paymentId))
            .where(and(eq(paymentReceiptReadings.transactionId, reading.transactionId), ne(payments.status, "rejected"), ne(payments.id, paymentId)))
            .limit(1)
        : [];
      const comparison = compareReceipt(
        reading,
        { amountCents: payment.amountCents, recipientName: creditorName, declaredAt: payment.declaredAt },
        { isPixReceipt: isPixReceiptText(input.text), codeAlreadyUsed: Boolean(already) },
      );

      try {
        await tx.insert(paymentReceiptReadings).values({
          paymentId,
          outingId,
          fileId: input.fileId,
          amountCents: reading.amountCents,
          readDate: reading.date,
          recipientName: reading.recipientName,
          transactionId: reading.transactionId,
          issues: comparison.issues,
        });
      } catch (error) {
        const text = `${(error as Error)?.message ?? ""} ${(error as { cause?: Error })?.cause?.message ?? ""}`;
        if (text.includes("payment_receipt_readings_payment_id_unique")) {
          throw new DomainError("receipt_already_sent", "Já foi enviado um comprovante para este pagamento.");
        }
        throw error;
      }

      if (comparison.ok) {
        const settled = attachProof(payment, personId, { fileId: input.fileId, source: "upload", uploadedAt: new Date() }, contestDays);
        const changed = await tx
          .update(payments)
          .set({ status: "confirmed", confirmedBy: "receipt", resolvedAt: settled.resolvedAt, contestableUntil: settled.contestableUntil })
          .where(and(eq(payments.id, paymentId), eq(payments.status, "declared")))
          .returning({ id: payments.id });
        if (changed.length === 0) {
          throw new DomainError("payment_already_resolved", "Este pagamento já foi confirmado ou recusado.");
        }
      }
      return comparison;
    }),
  );

  const notice = { fromName: context.names.get(personId) ?? "Alguém", amountCents: payment.amountCents, outingId, outingName: context.outing.name };
  await notify(payment.toId, result.ok ? paymentSettledByReceipt({ ...notice, contestDays }) : paymentReceiptNeedsReview(notice));
  return { outcome: result.ok ? "settled" : "review", issues: result.issues };
}

/** "O dinheiro não caiu": the creditor contests a payment settled by a receipt, while the deadline lasts. */
export async function contestReceiptPayment(personId: string, outingId: string, paymentId: string, reason: string): Promise<void> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const payment = await loadPayment(outingId, paymentId);
  const contested = contestPaymentDomain(payment, personId, new Date(), reason);

  const changed = await getDb()
    .update(payments)
    .set({ status: "contested", confirmedBy: null, contestReason: contested.contestReason, resolvedAt: contested.resolvedAt })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "confirmed"), eq(payments.confirmedBy, "receipt")))
    .returning({ id: payments.id });
  if (changed.length === 0) {
    throw new DomainError("payment_not_contestable", "Só pagamentos confirmados por comprovante podem ser contestados.");
  }
  await notify(
    payment.fromId,
    paymentContested({ toName: context.names.get(personId) ?? "Alguém", amountCents: payment.amountCents, outingId, outingName: context.outing.name }),
  );
}
