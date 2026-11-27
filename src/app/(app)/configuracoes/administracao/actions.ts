"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { approveAccessRequest, createInvite, rejectAccessRequest, revokeInvite } from "@/server/access";
import { requireSuperAdmin } from "@/server/auth";

const ADMIN_PATH = "/configuracoes/administracao";

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
  revalidatePath(ADMIN_PATH);
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
  revalidatePath(ADMIN_PATH);
  return { invitePath: `/convite/${token}` };
}

export async function revokeInviteAction(_prevState: AdminActionState, formData: FormData) {
  return decide((personId) => revokeInvite(personId, String(formData.get("id") ?? "")));
}
