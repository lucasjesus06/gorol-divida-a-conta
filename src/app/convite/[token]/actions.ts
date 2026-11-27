"use server";

import { DomainError } from "@/domain/domain-error";
import { redeemInvite } from "@/server/access";

export type RedeemInviteState = { done?: boolean; error?: string };

export async function redeemInviteAction(_prevState: RedeemInviteState, formData: FormData): Promise<RedeemInviteState> {
  try {
    await redeemInvite(String(formData.get("token") ?? ""), {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  return { done: true };
}
