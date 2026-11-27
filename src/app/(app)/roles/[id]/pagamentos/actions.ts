"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { parseMoneyToCents } from "@/domain/money";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { confirmPayment, declarePayment, rejectPayment } from "@/server/payments";

export type PaymentFormState = { error?: string; done?: boolean };

function outingIdFrom(formData: FormData) {
  const outingId = String(formData.get("outingId") ?? "");
  if (!isUuid(outingId)) {
    throw new DomainError("outing_not_found", "Rolê não encontrado.");
  }
  return outingId;
}

async function guarded(work: () => Promise<void>): Promise<PaymentFormState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  return { done: true };
}

export async function declarePaymentAction(_prevState: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = outingIdFrom(formData);
    const onBehalfOfId = String(formData.get("onBehalfOfId") ?? "");
    await declarePayment(profile.personId, outingId, {
      toId: String(formData.get("toId") ?? ""),
      amountCents: parseMoneyToCents(String(formData.get("amount") ?? "")),
      onBehalfOfId: onBehalfOfId || undefined,
      idempotencyKey: String(formData.get("idempotencyKey") ?? "") || undefined,
    });
    revalidatePath(`/roles/${outingId}`);
  });
}

export async function resolvePaymentAction(_prevState: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = outingIdFrom(formData);
    const paymentId = String(formData.get("paymentId") ?? "");
    if (formData.get("decision") === "confirm") {
      await confirmPayment(profile.personId, outingId, paymentId);
    } else {
      await rejectPayment(profile.personId, outingId, paymentId);
    }
    revalidatePath(`/roles/${outingId}`);
  });
}
