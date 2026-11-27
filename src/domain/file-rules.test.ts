import { describe, expect, it } from "vitest";
import { detectMime, fileRules, formatFileSize, validateStoredFile, validateUploadRequest } from "./file-rules";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const script = new TextEncoder().encode("<script>alert(1)</script>");

describe("detectMime", () => {
  it("reconhece JPEG, PNG, WebP e PDF pelos primeiros bytes", () => {
    expect([jpeg, png, webp, pdf].map(detectMime)).toEqual(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  });

  it("não reconhece texto, script nem arquivo vazio", () => {
    expect(detectMime(script)).toBeNull();
    expect(detectMime(new Uint8Array())).toBeNull();
  });
});

describe("validateUploadRequest", () => {
  const ok = { kind: "expense_evidence" as const, mimeType: "application/pdf", sizeBytes: 1000, name: "nota.pdf" };

  it("aceita o que o tipo permite e limpa o nome", () => {
    expect(validateUploadRequest({ ...ok, name: "  nota\n.pdf " }).name).toBe("nota.pdf");
  });

  it("recusa arquivo vazio, grande demais e tipo não permitido", () => {
    expect(() => validateUploadRequest({ ...ok, sizeBytes: 0 })).toThrow("vazio");
    expect(() => validateUploadRequest({ ...ok, sizeBytes: fileRules.expense_evidence.maxBytes + 1 })).toThrow("10 MB");
    expect(() => validateUploadRequest({ ...ok, mimeType: "video/mp4" })).toThrow("JPEG, PNG, WebP, PDF");
  });

  it("a foto de perfil é menor (2 MB) e só JPEG ou WebP", () => {
    const photo = { kind: "profile_photo" as const, mimeType: "image/png", sizeBytes: 1000, name: "eu.png" };
    expect(() => validateUploadRequest(photo)).toThrow("JPEG, WebP");
    expect(() => validateUploadRequest({ ...photo, mimeType: "image/jpeg", sizeBytes: 2 * 1024 * 1024 + 1 })).toThrow("2 MB");
  });
});

describe("validateStoredFile", () => {
  it("devolve o tipo verdadeiro quando é permitido", () => {
    expect(validateStoredFile("payment_receipt", pdf, 500)).toBe("application/pdf");
  });

  it("recusa arquivo que se declarou imagem mas é outra coisa", () => {
    expect(() => validateStoredFile("expense_evidence", script, 500)).toThrow("JPEG");
  });

  it("recusa PNG como foto de perfil e arquivo acima do limite", () => {
    expect(() => validateStoredFile("profile_photo", png, 500)).toThrow("JPEG, WebP");
    expect(() => validateStoredFile("profile_photo", jpeg, 3 * 1024 * 1024)).toThrow("2 MB");
  });
});

describe("formatFileSize", () => {
  it("mostra KB abaixo de 1 MB e MB com vírgula acima", () => {
    expect(formatFileSize(500)).toBe("1 KB");
    expect(formatFileSize(850 * 1024)).toBe("850 KB");
    expect(formatFileSize(2.3 * 1024 * 1024)).toBe("2,3 MB");
  });
});
