"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { normalizeDisplayName } from "@/domain/person";
import { normalizePhone } from "@/domain/phone";
import { requireAccount } from "@/server/auth";
import { saveProfile } from "@/server/profiles";

export type ProfileState = { error?: string };

export async function saveProfileAction(_prevState: ProfileState, formData: FormData): Promise<ProfileState> {
  const identity = await requireAccount();

  try {
    const displayName = normalizeDisplayName(String(formData.get("displayName") ?? ""));
    const phone = normalizePhone(String(formData.get("phone") ?? ""));
    await saveProfile(identity.userId, { displayName, phone });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  redirect("/");
}
