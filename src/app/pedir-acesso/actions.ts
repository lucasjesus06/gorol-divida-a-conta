"use server";

import { DomainError } from "@/domain/domain-error";
import { getIdentity } from "@/server/auth";
import { submitAccessRequest, submitGuestAccessRequest } from "@/server/access";

export type RequestAccessState = { done?: boolean; error?: string };

export async function requestAccess(_prevState: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  if (String(formData.get("website") ?? "") !== "") {
    return { done: true };
  }

  try {
    await submitAccessRequest({
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

export async function requestGuestAccess(_prevState: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  const identity = await getIdentity();
  if (identity?.kind !== "guest") {
    return { error: "Esta opção é para quem entrou em um rolê como convidado." };
  }

  try {
    await submitGuestAccessRequest(identity.userId, { email: String(formData.get("email") ?? "") });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  return { done: true };
}
