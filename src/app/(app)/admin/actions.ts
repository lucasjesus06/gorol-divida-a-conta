"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { approveAccessRequest, createInvite, rejectAccessRequest } from "@/server/access";
import { requireSuperAdmin } from "@/server/auth";

export type AdminActionState = { error?: string; invitePath?: string };

async function decide(work: (personId: string) => Promise<void>): Promise<AdminActionState> {
  const { personId } = await requireSuperAdmin();
  try {
    await work(personId);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/admin");
  return {};
}

export async function approveRequestAction(_prevState: AdminActionState, formData: FormData) {
  return decide((personId) => approveAccessRequest(String(formData.get("id") ?? ""), personId));
}

export async function rejectRequestAction(_prevState: AdminActionState, formData: FormData) {
  return decide((personId) =>
    rejectAccessRequest(String(formData.get("id") ?? ""), personId, String(formData.get("note") ?? "")),
  );
}

export async function createInviteAction(): Promise<AdminActionState> {
  const { personId } = await requireSuperAdmin();
  const token = await createInvite(personId);
  revalidatePath("/admin");
  return { invitePath: `/convite/${token}` };
}
