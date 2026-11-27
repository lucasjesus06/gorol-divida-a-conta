"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { addParticipant } from "@/server/outings";

export type AddParticipantState = { error?: string; added?: string };

export async function addParticipantAction(_prevState: AddParticipantState, formData: FormData): Promise<AddParticipantState> {
  const profile = await getRenderProfile();
  const outingId = String(formData.get("outingId") ?? "");
  if (!isUuid(outingId)) {
    return { error: "Rolê não encontrado." };
  }

  const name = String(formData.get("name") ?? "");
  try {
    await addParticipant(profile.personId, outingId, { name, phone: String(formData.get("phone") ?? "") });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/roles/${outingId}`);
  return { added: name.trim() };
}
