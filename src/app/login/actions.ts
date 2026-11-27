"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/domain/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SendCodeState = { email?: string; error?: string };
export type VerifyCodeState = { error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendCode(_prevState: SendCodeState, formData: FormData): Promise<SendCodeState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) {
    return { error: "Informe um e-mail válido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

  if (error?.status === 429) {
    return { error: "Muitas tentativas. Aguarde um pouco e tente de novo." };
  }
  return { email };
}

export async function verifyCode(_prevState: VerifyCodeState, formData: FormData): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!EMAIL.test(email) || !/^\d{6,10}$/.test(token)) {
    return { error: "Informe o código que chegou no e-mail." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return { error: "Código inválido ou vencido." };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
