"use server";

import { redirect } from "next/navigation";
import { DomainError } from "@/domain/domain-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getIdentity } from "@/server/auth";
import { requestJoin } from "@/server/join";

export type JoinState = { error?: string };

async function guestUserId() {
  const identity = await getIdentity();
  if (identity?.kind === "account") {
    throw new DomainError("already_account", "Você já está logado com uma conta. Para entrar como convidado, saia primeiro.");
  }
  if (identity) {
    return identity.userId;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(`Não foi possível criar a sessão de convidado: ${error?.message ?? "sem resposta"}`);
  }
  return data.user.id;
}

export async function joinAction(_prevState: JoinState, formData: FormData): Promise<JoinState> {
  try {
    const userId = await guestUserId();
    await requestJoin(String(formData.get("token") ?? ""), userId, {
      participantId: String(formData.get("participantId") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  redirect("/aguardando");
}
