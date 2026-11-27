"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { answerLeftover, claimItem, closeBill, openBill, releaseClaim } from "@/server/bills";
import { getRenderProfile } from "@/server/auth";
import { parseBillForm } from "./parse-bill-form";

export type BillFormState = { error?: string };

function idFrom(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!isUuid(value)) {
    throw new DomainError("bill_not_found", "Conta não encontrada.");
  }
  return value;
}

async function guarded(work: () => Promise<void>): Promise<BillFormState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  return {};
}

export async function openBillAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  let outingId = "";
  let billId = "";
  const failure = await guarded(async () => {
    outingId = idFrom(formData, "outingId");
    billId = await openBill(profile.personId, outingId, parseBillForm(formData));
  });
  if (failure.error) {
    return failure;
  }
  revalidatePath(`/roles/${outingId}`);
  redirect(`/roles/${outingId}/contas/${billId}`);
}

export async function claimItemAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    const billId = idFrom(formData, "billId");
    await claimItem(profile.personId, outingId, billId, idFrom(formData, "itemId"), {
      quantity: String(formData.get("quantity") ?? ""),
      sharedWith: formData.getAll("sharedWith").map(String),
    });
    revalidatePath(`/roles/${outingId}/contas/${billId}`);
  });
}

export async function releaseClaimAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    const billId = idFrom(formData, "billId");
    await releaseClaim(profile.personId, outingId, billId, idFrom(formData, "itemId"));
    revalidatePath(`/roles/${outingId}/contas/${billId}`);
  });
}

export async function closeBillAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  let outingId = "";
  let billId = "";
  const failure = await guarded(async () => {
    outingId = idFrom(formData, "outingId");
    billId = idFrom(formData, "billId");
    const target = String(formData.get("leftover") ?? "spread");
    await closeBill(profile.personId, outingId, billId, target === "spread" ? { mode: "spread" } : { mode: "transfer", personId: target });
  });
  if (failure.error) {
    return failure;
  }
  revalidatePath(`/roles/${outingId}`, "layout");
  redirect(`/roles/${outingId}/contas/${billId}`);
}

export async function answerLeftoverAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    await answerLeftover(profile.personId, outingId, idFrom(formData, "billId"), formData.get("decision") === "accept");
    revalidatePath(`/roles/${outingId}`, "layout");
  });
}
