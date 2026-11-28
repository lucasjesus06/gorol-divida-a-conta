"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { requireSuperAdmin } from "@/server/auth";
import { resetParameter, saveParameter } from "@/server/system-parameters";

export type ParameterState = { error?: string; saved?: boolean };

async function guarded(work: (adminId: string) => Promise<void>): Promise<ParameterState> {
  const { personId } = await requireSuperAdmin();
  try {
    await work(personId);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/configuracoes/parametros");
  return { saved: true };
}

export async function saveParameterAction(input: { key: string; value: string }): Promise<ParameterState> {
  return guarded((adminId) => {
    const text = input.value.trim();
    return saveParameter(adminId, input.key, text === "" ? Number.NaN : Number(text.replace(",", ".")));
  });
}

export async function resetParameterAction(key: string): Promise<ParameterState> {
  return guarded((adminId) => resetParameter(adminId, key));
}
