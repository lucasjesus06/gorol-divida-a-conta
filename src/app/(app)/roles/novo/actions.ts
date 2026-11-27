"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { getRenderProfile } from "@/server/auth";
import { createOuting } from "@/server/outings";

export type CreateOutingState = { error?: string };

export async function createOutingAction(_prevState: CreateOutingState, formData: FormData): Promise<CreateOutingState> {
  const profile = await getRenderProfile();

  let outingId: string;
  try {
    outingId = await createOuting(profile, {
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? ""),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/");
  redirect(`/roles/${outingId}`);
}
