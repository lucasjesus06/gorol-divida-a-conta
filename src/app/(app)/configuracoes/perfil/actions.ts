"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { getRenderProfile } from "@/server/auth";
import { saveNickname } from "@/server/profiles";

export type NicknameState = { error?: string; saved?: boolean };

export async function saveNicknameAction(_prevState: NicknameState, formData: FormData): Promise<NicknameState> {
  const profile = await getRenderProfile();
  try {
    await saveNickname(profile.personId, String(formData.get("nickname") ?? ""));
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { saved: true };
}
