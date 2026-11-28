"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { declarePayer, registerExpense, reviseExpense, voidExpense } from "@/server/expenses";
import { decideDispute, openDispute } from "@/server/disputes";
import { createPayerRequest, decidePayerRequest } from "@/server/payer-requests";
import { disputeSubjects } from "@/domain/dispute-status";
import { parseExpenseForm } from "./parse-expense-form";

export type ExpenseFormState = { error?: string; needsConfirmation?: boolean };

function outingIdFrom(formData: FormData) {
  const outingId = String(formData.get("outingId") ?? "");
  if (!isUuid(outingId)) {
    throw new DomainError("outing_not_found", "Rolê não encontrado.");
  }
  return outingId;
}

async function guarded(work: () => Promise<void>): Promise<ExpenseFormState> {
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

export async function saveExpenseAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  let outingId = "";
  let expenseId: string | null = null;

  const failure = await guarded(async () => {
    outingId = outingIdFrom(formData);
    const input = parseExpenseForm(formData);
    const previous = String(formData.get("expenseId") ?? "");
    expenseId = previous
      ? await reviseExpense(profile.personId, outingId, previous, input)
      : await registerExpense(profile.personId, outingId, input);
  });
  if (failure.error || !expenseId) {
    return failure;
  }

  revalidatePath(`/roles/${outingId}`);
  redirect(`/roles/${outingId}/despesas/${expenseId}`);
}

export async function voidExpenseAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  let outingId = "";
  const failure = await guarded(async () => {
    outingId = outingIdFrom(formData);
    await voidExpense(profile.personId, outingId, String(formData.get("expenseId") ?? ""), String(formData.get("reason") ?? ""));
  });
  if (failure.error) {
    return failure;
  }
  revalidatePath(`/roles/${outingId}`);
  redirect(`/roles/${outingId}?visao=despesas`);
}

export async function declarePayerAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  const failure = await guarded(async () => {
    const outingId = outingIdFrom(formData);
    await declarePayer(profile.personId, outingId, String(formData.get("personId") ?? ""));
    revalidatePath(`/roles/${outingId}`);
  });
  return failure;
}

export async function requestPayerAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  let outingId = "";
  const failure = await guarded(async () => {
    outingId = outingIdFrom(formData);
    const target = String(formData.get("targetExpenseId") ?? "");
    await createPayerRequest(profile.personId, outingId, {
      input: parseExpenseForm(formData),
      targetExpenseId: target || undefined,
    });
  });
  if (failure.error) {
    return failure;
  }
  revalidatePath(`/roles/${outingId}`);
  redirect(`/roles/${outingId}?visao=despesas`);
}

export async function decidePayerRequestAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  const failure = await guarded(async () => {
    const outingId = outingIdFrom(formData);
    await decidePayerRequest(profile.personId, outingId, String(formData.get("requestId") ?? ""), {
      approve: formData.get("decision") === "approve",
      note: String(formData.get("note") ?? ""),
    });
    revalidatePath(`/roles/${outingId}`);
  });
  return failure;
}

export async function openDisputeAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  const result = await guardedLate(async () => {
    const outingId = outingIdFrom(formData);
    const subject = String(formData.get("subject") ?? "");
    if (!(disputeSubjects as readonly string[]).includes(subject)) {
      throw new DomainError("invalid_dispute_subject", "Escolha o motivo da contestação.");
    }
    const expenseId = String(formData.get("expenseId") ?? "");
    await openDispute(profile.personId, outingId, expenseId, {
      subject: subject as (typeof disputeSubjects)[number],
      message: String(formData.get("message") ?? ""),
      confirmLate: formData.get("confirmLate") === "on",
    });
    revalidatePath(`/roles/${outingId}`, "layout");
  });
  return result;
}

/** Like `guarded`, but tells the form when the person still has to confirm that a late dispute reopens the outing. */
async function guardedLate(work: () => Promise<void>): Promise<ExpenseFormState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) {
      return error.code === "dispute_late_needs_confirmation" ? { error: error.message, needsConfirmation: true } : { error: error.message };
    }
    throw error;
  }
  return {};
}

export async function decideDisputeAction(_prevState: ExpenseFormState, formData: FormData): Promise<ExpenseFormState> {
  const profile = await getRenderProfile();
  return guarded(async () => {
    const outingId = outingIdFrom(formData);
    await decideDispute(profile.personId, outingId, String(formData.get("disputeId") ?? ""), {
      approve: formData.get("decision") === "approve",
      note: String(formData.get("note") ?? ""),
    });
    revalidatePath(`/roles/${outingId}`, "layout");
  });
}
