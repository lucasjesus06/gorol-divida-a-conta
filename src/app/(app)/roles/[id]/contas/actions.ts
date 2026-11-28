"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { addBillItem, answerLeftover, claimItem, closeBill, getBill, openBill, releaseClaim, removeBillItem, updateBillAmounts, updateBillItem } from "@/server/bills";
import { getRenderProfile } from "@/server/auth";
import { parseMoneyToCents } from "@/domain/money";
import { parseBillForm } from "./parse-bill-form";
import { parseCloseForm } from "./parse-close-form";

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
    const bill = await getBill(profile.personId, outingId, billId);
    await closeBill(profile.personId, outingId, billId, parseCloseForm(formData, bill.totalCents, bill.payersFixed));
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

function itemFields(formData: FormData) {
  return {
    description: String(formData.get("description") ?? ""),
    totalCents: parseMoneyToCents(String(formData.get("total") ?? "")),
    quantity: String(formData.get("quantity") ?? ""),
  };
}

export async function addBillItemAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    const billId = idFrom(formData, "billId");
    await addBillItem(profile.personId, outingId, billId, itemFields(formData));
    revalidatePath(`/roles/${outingId}/contas/${billId}`);
  });
}

export async function updateBillItemAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    const billId = idFrom(formData, "billId");
    await updateBillItem(profile.personId, outingId, billId, idFrom(formData, "itemId"), itemFields(formData));
    revalidatePath(`/roles/${outingId}/contas/${billId}`);
  });
}

export async function removeBillItemAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    const billId = idFrom(formData, "billId");
    await removeBillItem(profile.personId, outingId, billId, idFrom(formData, "itemId"));
    revalidatePath(`/roles/${outingId}/contas/${billId}`);
  });
}

function optionalMoney(formData: FormData, name: string): number | undefined {
  const text = String(formData.get(name) ?? "").trim();
  return text === "" ? undefined : parseMoneyToCents(text);
}

export async function updateBillAmountsAction(_prevState: BillFormState, formData: FormData): Promise<BillFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = idFrom(formData, "outingId");
    const billId = idFrom(formData, "billId");
    await updateBillAmounts(profile.personId, outingId, billId, {
      directTotalCents: optionalMoney(formData, "directTotal"),
      serviceChargeCents: optionalMoney(formData, "serviceCharge"),
      discountCents: optionalMoney(formData, "discount"),
    });
    revalidatePath(`/roles/${outingId}/contas/${billId}`);
  });
}
