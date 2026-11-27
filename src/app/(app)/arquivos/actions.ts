"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { fileKinds, type FileKind } from "@/domain/file-kinds";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { confirmUpload, getFileUrl, removeFile, requestUpload } from "@/server/files";

export type UploadTicket = { error: string } | { fileId: string; path: string; token: string; bucket: string };
export type FileActionResult = { error?: string; url?: string };

function message(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }
  throw error;
}

export async function requestUploadAction(input: {
  kind: string;
  outingId?: string;
  subjectId?: string;
  mimeType: string;
  sizeBytes: number;
  name: string;
}): Promise<UploadTicket> {
  const profile = await getRenderProfile();
  try {
    if (!(fileKinds as readonly string[]).includes(input.kind)) {
      throw new DomainError("file_type_not_allowed", "Tipo de arquivo não permitido.");
    }
    if ((input.outingId && !isUuid(input.outingId)) || (input.subjectId && !isUuid(input.subjectId))) {
      throw new DomainError("file_subject_invalid", "Informe a despesa ou o pagamento do arquivo.");
    }
    return await requestUpload(profile.personId, { ...input, kind: input.kind as FileKind });
  } catch (error) {
    return { error: message(error) };
  }
}

export async function confirmUploadAction(fileId: string, revalidate: string): Promise<FileActionResult> {
  const profile = await getRenderProfile();
  try {
    if (!isUuid(fileId)) {
      throw new DomainError("file_not_found", "Arquivo não encontrado.");
    }
    await confirmUpload(profile.personId, fileId);
  } catch (error) {
    return { error: message(error) };
  }
  if (revalidate.startsWith("/")) {
    revalidatePath(revalidate);
  }
  return {};
}

export async function openFileAction(fileId: string): Promise<FileActionResult> {
  const profile = await getRenderProfile();
  try {
    if (!isUuid(fileId)) {
      throw new DomainError("file_not_found", "Arquivo não encontrado.");
    }
    return { url: await getFileUrl(profile.personId, fileId) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function removeFileAction(fileId: string, revalidate: string): Promise<FileActionResult> {
  const profile = await getRenderProfile();
  try {
    if (!isUuid(fileId)) {
      throw new DomainError("file_not_found", "Arquivo não encontrado.");
    }
    await removeFile(profile.personId, fileId);
  } catch (error) {
    return { error: message(error) };
  }
  if (revalidate.startsWith("/")) {
    revalidatePath(revalidate);
  }
  return {};
}
