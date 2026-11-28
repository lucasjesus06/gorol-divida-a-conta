import { DomainError } from "./domain-error";
import type { FileKind } from "./file-kinds";

export { fileKinds, type FileKind } from "./file-kinds";

export type DetectedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const MB = 1024 * 1024;

type Rule = { maxBytes: number; allowed: readonly DetectedMime[] };

export const fileRules: Record<FileKind, Rule> = {
  expense_evidence: { maxBytes: 10 * MB, allowed: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  bill_document: { maxBytes: 10 * MB, allowed: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  payment_receipt: { maxBytes: 10 * MB, allowed: ["image/jpeg", "image/png", "image/webp", "application/pdf"] },
  profile_photo: { maxBytes: 2 * MB, allowed: ["image/jpeg", "image/webp"] },
};

const TYPE_LABELS: Record<DetectedMime, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
};

function allowedLabel(kind: FileKind): string {
  return fileRules[kind].allowed.map((mime) => TYPE_LABELS[mime]).join(", ");
}

/** What the file really is, read from its first bytes instead of trusting the name or the declared type. */
export function detectMime(bytes: Uint8Array): DetectedMime | null {
  const startsWith = (signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type UploadRequest = { kind: FileKind; mimeType: string; sizeBytes: number; name: string };

/** Checks what the person says they will send, before any upload starts. */
export function validateUploadRequest(input: UploadRequest): UploadRequest & { name: string } {
  const rule = fileRules[input.kind];
  const name = input.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200) || "arquivo";
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new DomainError("file_empty", "O arquivo está vazio.");
  }
  if (input.sizeBytes > rule.maxBytes) {
    throw new DomainError("file_too_large", `O arquivo passa do limite de ${rule.maxBytes / MB} MB.`);
  }
  if (!(rule.allowed as readonly string[]).includes(input.mimeType)) {
    throw new DomainError("file_type_not_allowed", `Envie um arquivo ${allowedLabel(input.kind)}.`);
  }
  return { ...input, name };
}

/** Checks what was really stored; the real type must be allowed and the size must match what was announced. */
export function validateStoredFile(kind: FileKind, bytes: Uint8Array, totalSizeBytes: number): DetectedMime {
  const rule = fileRules[kind];
  if (totalSizeBytes > rule.maxBytes) {
    throw new DomainError("file_too_large", `O arquivo passa do limite de ${rule.maxBytes / MB} MB.`);
  }
  const detected = detectMime(bytes);
  if (!detected || !rule.allowed.includes(detected)) {
    throw new DomainError("file_type_not_allowed", `Envie um arquivo ${allowedLabel(kind)}.`);
  }
  return detected;
}

/** "850 KB" or "2,3 MB", for the screen. */
export function formatFileSize(bytes: number): string {
  if (bytes < MB) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`;
}
