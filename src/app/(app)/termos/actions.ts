"use server";

import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { requireAccount } from "@/server/auth";
import { loadProfile } from "@/server/profiles";
import { acceptTerms } from "@/server/terms";

export type TermsState = { error?: string };

export async function acceptTermsAction(_prevState: TermsState, formData: FormData): Promise<TermsState> {
  const identity = await requireAccount();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect("/perfil");
  }
  try {
    await acceptTerms(profile.personId, {
      acceptedTerms: formData.get("terms") === "on",
      acceptedReminders: formData.get("reminders") === "on",
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  redirect("/");
}
