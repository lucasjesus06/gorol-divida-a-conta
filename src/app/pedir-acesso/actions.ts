"use server";

import { DomainError } from "@/domain/domain-error";
import { submitAccessRequest } from "@/server/access";

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
