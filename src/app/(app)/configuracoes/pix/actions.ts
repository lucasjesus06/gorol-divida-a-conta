"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { pixKeyTypes, type PixKeyType } from "@/domain/pix";
import { requireAccount } from "@/server/auth";
import { loadProfile } from "@/server/profiles";
import { savePixKey } from "@/server/pix";

export type PixState = { error?: string };

export async function savePixKeyAction(_prevState: PixState, formData: FormData): Promise<PixState> {
  const identity = await requireAccount();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect("/perfil");
  }

  const type = String(formData.get("type") ?? "");
  if (!(pixKeyTypes as readonly string[]).includes(type)) {
    return { error: "Escolha o tipo da chave Pix." };
  }

  try {
    await savePixKey(profile.personId, { type: type as PixKeyType, value: String(formData.get("value") ?? "") });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  redirect("/configuracoes");
}
