"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { answerClosing, requestClosing } from "@/server/closing-votes";
import { closeOuting, leaveOuting, removeParticipant } from "@/server/outing-lifecycle";

export type LifecycleState = { error?: string };

async function guarded(outingId: string, work: (personId: string) => Promise<void>): Promise<LifecycleState> {
  const profile = await getRenderProfile();
  if (!isUuid(outingId)) {
    return { error: "Rolê não encontrado." };
  }
  try {
    await work(profile.personId);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/roles/${outingId}`);
  return {};
}

export async function closeOutingAction(outingId: string): Promise<LifecycleState> {
  return guarded(outingId, (personId) => closeOuting(personId, outingId));
}

export async function removeParticipantAction(outingId: string, targetId: string): Promise<LifecycleState> {
  return guarded(outingId, async (personId) => {
    if (!isUuid(targetId)) {
      throw new DomainError("participant_not_found", "Esta pessoa não está mais no rolê.");
    }
    await removeParticipant(personId, outingId, targetId);
  });
}

export async function leaveOutingAction(outingId: string): Promise<LifecycleState> {
  const result = await guarded(outingId, (personId) => leaveOuting(personId, outingId));
  if (!result.error) {
    revalidatePath("/roles");
    redirect("/roles");
  }
  return result;
}

export async function requestClosingAction(outingId: string): Promise<LifecycleState> {
  return guarded(outingId, async (personId) => {
    await requestClosing(personId, outingId);
  });
}

export async function answerClosingAction(outingId: string, accept: boolean): Promise<LifecycleState> {
  return guarded(outingId, (personId) => answerClosing(personId, outingId, accept));
}
