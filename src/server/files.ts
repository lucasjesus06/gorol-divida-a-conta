import "server-only";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { consumptionBills, expenses, files, outingParticipants, payments } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import type { FileKind } from "@/domain/file-kinds";
import { validateStoredFile, validateUploadRequest } from "@/domain/file-rules";
import { outingContext, readOutingContext } from "./expenses";
import { BUCKET, createDownloadUrl, createDownloadUrls, createUploadToken, readStored, removeStored } from "./storage";

const DOWNLOAD_SECONDS = 300;

export type UploadInput = {
  kind: FileKind;
  outingId?: string;
  subjectId?: string;
  mimeType: string;
  sizeBytes: number;
  name: string;
};

async function assertCanAttach(personId: string, input: UploadInput) {
  if (input.kind === "profile_photo") {
    if (input.outingId || input.subjectId) {
      throw new DomainError("file_subject_invalid", "A foto de perfil não pertence a um rolê.");
    }
    return;
  }
  if (!input.outingId || !input.subjectId) {
    throw new DomainError("file_subject_invalid", "Informe a despesa ou o pagamento do arquivo.");
  }
  const context = await outingContext(personId, input.outingId);

  if (input.kind === "expense_evidence") {
    const [expense] = await getDb()
      .select({ registeredBy: expenses.registeredBy })
      .from(expenses)
      .where(and(eq(expenses.id, input.subjectId), eq(expenses.outingId, input.outingId)));
    if (!expense) {
      throw new DomainError("expense_not_found", "Despesa não encontrada.");
    }
    if (expense.registeredBy !== personId && context.outing.role !== "admin") {
      throw new DomainError("evidence_not_allowed", "Só quem lançou a despesa ou o dono do rolê anexa evidência.");
    }
    return;
  }

  if (input.kind === "bill_document") {
    const [bill] = await getDb()
      .select({ openedBy: consumptionBills.openedBy })
      .from(consumptionBills)
      .where(and(eq(consumptionBills.id, input.subjectId), eq(consumptionBills.outingId, input.outingId)));
    if (!bill) {
      throw new DomainError("bill_not_found", "Conta não encontrada.");
    }
    if (bill.openedBy !== personId && context.outing.role !== "admin") {
      throw new DomainError("bill_document_not_allowed", "Só quem abriu a conta ou o dono do rolê anexa a nota.");
    }
    return;
  }

  const [payment] = await getDb()
    .select({ fromId: payments.fromId })
    .from(payments)
    .where(and(eq(payments.id, input.subjectId), eq(payments.outingId, input.outingId)));
  if (!payment) {
    throw new DomainError("payment_not_found", "Pagamento não encontrado.");
  }
  if (payment.fromId !== personId) {
    throw new DomainError("receipt_not_allowed", "Só quem pagou anexa o comprovante.");
  }
}

/** Step 1: checks the request, reserves the file and hands back a one-time upload permission. */
export async function requestUpload(personId: string, input: UploadInput): Promise<{ fileId: string; path: string; token: string; bucket: string }> {
  const request = validateUploadRequest(input);
  await assertCanAttach(personId, input);

  const fileId = crypto.randomUUID();
  const path = `${input.kind}/${fileId}`;
  await asService(() =>
    getDb().insert(files).values({
      id: fileId,
      kind: input.kind,
      ownerId: personId,
      outingId: input.outingId ?? null,
      subjectId: input.subjectId ?? null,
      path,
      mimeType: request.mimeType,
      sizeBytes: request.sizeBytes,
      originalName: request.name,
    }),
  );
  try {
    return { fileId, path, token: await createUploadToken(path), bucket: BUCKET };
  } catch (error) {
    await asService(() => getDb().delete(files).where(eq(files.id, fileId)));
    throw error;
  }
}

/**
 * Step 2, after the browser sent the file: reads what was really stored and only then
 * makes the file available. Anything that is not what it claimed to be is deleted.
 */
export async function confirmUpload(personId: string, fileId: string): Promise<void> {
  const [pending] = await asService(() =>
    getDb().select().from(files).where(and(eq(files.id, fileId), eq(files.ownerId, personId), eq(files.status, "pending"))),
  );
  if (!pending) {
    throw new DomainError("file_not_found", "Arquivo não encontrado.");
  }

  const stored = await readStored(pending.path);
  try {
    if (!stored) {
      throw new DomainError("file_not_received", "O arquivo não chegou. Tente enviar de novo.");
    }
    const mimeType = validateStoredFile(pending.kind, stored.head, stored.sizeBytes);
    const replaced =
      pending.kind === "profile_photo"
        ? await asService(() => getDb().select({ id: files.id, path: files.path }).from(files).where(and(eq(files.ownerId, personId), eq(files.kind, "profile_photo"), eq(files.status, "ready"))))
        : [];
    await asService(async () => {
      await getDb().update(files).set({ status: "ready", mimeType, sizeBytes: stored.sizeBytes }).where(eq(files.id, fileId));
      if (replaced.length > 0) {
        await getDb().delete(files).where(inArray(files.id, replaced.map((row) => row.id)));
      }
    });
    await removeStored(replaced.map((row) => row.path));
  } catch (error) {
    await asService(() => getDb().delete(files).where(eq(files.id, fileId)));
    await removeStored([pending.path]);
    throw error;
  }
}

export type FileView = { id: string; kind: FileKind; subjectId: string | null; name: string; mimeType: string; sizeBytes: number; ownerId: string; createdAt: Date };

/** The ready files of these subjects that the person is allowed to see (the database decides). */
export async function listFiles(personId: string, kind: FileKind, outingId: string, subjectIds: string[]): Promise<FileView[]> {
  await readOutingContext(personId, outingId);
  if (subjectIds.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select()
    .from(files)
    .where(and(eq(files.kind, kind), eq(files.outingId, outingId), eq(files.status, "ready"), inArray(files.subjectId, subjectIds)));
  return rows.map((row) => ({ id: row.id, kind: row.kind, subjectId: row.subjectId, name: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes, ownerId: row.ownerId, createdAt: row.createdAt }));
}

async function canSee(personId: string, file: { outingId: string | null; ownerId: string }): Promise<boolean> {
  if (file.outingId) {
    return outingContext(personId, file.outingId).then(
      () => true,
      () => false,
    );
  }
  if (file.ownerId === personId) {
    return true;
  }
  const mine = await getDb()
    .select({ outingId: outingParticipants.outingId })
    .from(outingParticipants)
    .where(and(eq(outingParticipants.personId, personId), isNotNull(outingParticipants.confirmedAt), isNull(outingParticipants.leftAt)));
  if (mine.length === 0) {
    return false;
  }
  const shared = await getDb()
    .select({ id: outingParticipants.id })
    .from(outingParticipants)
    .where(
      and(
        eq(outingParticipants.personId, file.ownerId),
        isNotNull(outingParticipants.confirmedAt),
        isNull(outingParticipants.leftAt),
        inArray(outingParticipants.outingId, mine.map((row) => row.outingId)),
      ),
    );
  return shared.length > 0;
}

/** A short-lived link, only if the database lets this person see the file. */
export async function getFileUrl(personId: string, fileId: string): Promise<string> {
  const [file] = await getDb()
    .select({ path: files.path, outingId: files.outingId, ownerId: files.ownerId })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.status, "ready")));
  if (!file || !(await canSee(personId, file))) {
    throw new DomainError("file_not_found", "Arquivo não encontrado.");
  }
  return createDownloadUrl(file.path, DOWNLOAD_SECONDS);
}

/** Only profile photos can be removed: evidence and receipts stay, as part of the history. */
export async function removeFile(personId: string, fileId: string): Promise<void> {
  const [file] = await asService(() =>
    getDb().select({ path: files.path, kind: files.kind }).from(files).where(and(eq(files.id, fileId), eq(files.ownerId, personId))),
  );
  if (!file) {
    throw new DomainError("file_not_found", "Arquivo não encontrado.");
  }
  if (file.kind !== "profile_photo") {
    throw new DomainError("file_not_removable", "Evidência e comprovante não podem ser removidos: fazem parte do histórico.");
  }
  await asService(() => getDb().delete(files).where(eq(files.id, fileId)));
  await removeStored([file.path]);
}

/** Everyone the viewer may see a photo of: themselves and whoever shares an outing with them. */
async function visibleOwners(viewerId: string, ownerIds: string[]): Promise<Set<string>> {
  const visible = new Set(ownerIds.filter((id) => id === viewerId));
  const others = ownerIds.filter((id) => id !== viewerId);
  if (others.length === 0) {
    return visible;
  }
  const mine = await getDb()
    .select({ outingId: outingParticipants.outingId })
    .from(outingParticipants)
    .where(and(eq(outingParticipants.personId, viewerId), isNotNull(outingParticipants.confirmedAt), isNull(outingParticipants.leftAt)));
  if (mine.length === 0) {
    return visible;
  }
  const shared = await getDb()
    .select({ personId: outingParticipants.personId })
    .from(outingParticipants)
    .where(
      and(
        inArray(outingParticipants.personId, others),
        isNotNull(outingParticipants.confirmedAt),
        isNull(outingParticipants.leftAt),
        inArray(outingParticipants.outingId, mine.map((row) => row.outingId)),
      ),
    );
  shared.forEach((row) => visible.add(row.personId));
  return visible;
}

/** Profile photos the viewer is allowed to see, as short-lived links by person. */
export async function getPhotoUrls(viewerId: string, ownerIds: string[]): Promise<Map<string, string>> {
  const allowed = [...(await visibleOwners(viewerId, [...new Set(ownerIds)]))];
  if (allowed.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({ ownerId: files.ownerId, path: files.path })
    .from(files)
    .where(and(eq(files.kind, "profile_photo"), eq(files.status, "ready"), inArray(files.ownerId, allowed)));
  const urls = await createDownloadUrls(rows.map((row) => row.path), DOWNLOAD_SECONDS);
  return new Map(rows.flatMap((row) => (urls.has(row.path) ? [[row.ownerId, urls.get(row.path) as string] as const] : [])));
}

/** The person's own photo: its id (to remove it) and a link to show it. */
export async function getMyPhoto(personId: string): Promise<{ id: string; url: string } | null> {
  // The menu card asks for this before any page has tied the request to a person (the terms screen, for
  // one), so it reads as the server and filters by the person explicitly.
  const [row] = await asService(() =>
    getDb()
      .select({ id: files.id, path: files.path })
      .from(files)
      .where(and(eq(files.kind, "profile_photo"), eq(files.status, "ready"), eq(files.ownerId, personId))),
  );
  if (!row) {
    return null;
  }
  return { id: row.id, url: await createDownloadUrl(row.path, DOWNLOAD_SECONDS) };
}
