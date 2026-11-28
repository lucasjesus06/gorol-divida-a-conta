"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { grantAmnesty } from "@/server/amnesties";
import { parseAmnestyForm } from "./parse-amnesty-form";

export type AmnestyFormState = { error?: string };

export async function grantAmnestyAction(_prevState: AmnestyFormState, formData: FormData): Promise<AmnestyFormState> {
  const profile = await getRenderProfile();
  const debtorId = String(formData.get("debtorId") ?? "");
  try {
    if (!isUuid(debtorId)) {
      throw new DomainError("person_not_found", "Pessoa não encontrada.");
    }
    await grantAmnesty(profile.personId, debtorId, parseAmnestyForm(formData), String(formData.get("idempotencyKey") ?? "") || undefined);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/resumo", "layout");
  redirect(`/resumo/${debtorId}`);
}
