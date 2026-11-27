"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { requestOrigin } from "@/lib/origin";
import { getRenderProfile } from "@/server/auth";
import { createJoinLink, decideJoinRequest, releaseParticipant, revokeJoinLink } from "@/server/join";

export type JoinLinkState = { error?: string; url?: string; qr?: string };
export type JoinManageState = { error?: string };

async function guarded<T extends { error?: string }>(work: (personId: string) => Promise<T>, empty: T): Promise<T> {
  const profile = await getRenderProfile();
  try {
    return await work(profile.personId);
  } catch (error) {
    if (error instanceof DomainError) {
      return { ...empty, error: error.message };
    }
    throw error;
  }
}

function outingIdFrom(formData: FormData) {
  const outingId = String(formData.get("outingId") ?? "");
  if (!isUuid(outingId)) {
    throw new DomainError("outing_not_found", "Rolê não encontrado.");
  }
  return outingId;
}

export async function createJoinLinkAction(_prevState: JoinLinkState, formData: FormData): Promise<JoinLinkState> {
  return guarded(async (personId) => {
    const outingId = outingIdFrom(formData);
    const token = await createJoinLink(personId, outingId);
    const url = `${await requestOrigin()}/entrar/${token}`;
    revalidatePath(`/roles/${outingId}`);
    return { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 260 }) };
  }, {} as JoinLinkState);
}

export async function revokeJoinLinkAction(_prevState: JoinManageState, formData: FormData): Promise<JoinManageState> {
  return guarded(async (personId) => {
    const outingId = outingIdFrom(formData);
    await revokeJoinLink(personId, outingId);
    revalidatePath(`/roles/${outingId}`);
    return {};
  }, {} as JoinManageState);
}

export async function decideJoinRequestAction(_prevState: JoinManageState, formData: FormData): Promise<JoinManageState> {
  return guarded(async (personId) => {
    const outingId = outingIdFrom(formData);
    await decideJoinRequest(personId, outingId, String(formData.get("requestId") ?? ""), formData.get("decision") === "approve");
    revalidatePath(`/roles/${outingId}`);
    return {};
  }, {} as JoinManageState);
}

export async function releaseParticipantAction(_prevState: JoinManageState, formData: FormData): Promise<JoinManageState> {
  return guarded(async (personId) => {
    const outingId = outingIdFrom(formData);
    await releaseParticipant(personId, outingId, String(formData.get("participantId") ?? ""));
    revalidatePath(`/roles/${outingId}`);
    return {};
  }, {} as JoinManageState);
}
