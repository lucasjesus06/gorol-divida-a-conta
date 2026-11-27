import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { files, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  stored: new Map<string, Uint8Array>(),
  removed: [] as string[],
}));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));
vi.mock("./storage", () => ({
  BUCKET: "arquivos",
  createUploadToken: async (path: string) => `token:${path}`,
  readStored: async (path: string) => {
    const bytes = state.stored.get(path);
    return bytes ? { head: bytes.slice(0, 16), sizeBytes: bytes.length } : null;
  },
  removeStored: async (paths: string[]) => {
    state.removed.push(...paths);
    paths.forEach((path) => state.stored.delete(path));
  },
  createDownloadUrl: async (path: string) => `https://signed.example/${path}`,
}));

const outingsServer = await import("./outings");
const expensesServer = await import("./expenses");
const paymentsServer = await import("./payments");
const server = await import("./files");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, ...new Array(100).fill(1)]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(2)]);
const script = new TextEncoder().encode("<script>alert(1)</script>");

let lucas: string;
let maria: string;
let caio: string;
let stranger: string;
let outingId: string;
let expenseId: string;
let paymentId: string;

async function person(name: string, phone: string, inOuting = true) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  if (inOuting) await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

async function upload(personId: string, input: Parameters<typeof server.requestUpload>[1], content: Uint8Array) {
  const { fileId, path } = await server.requestUpload(personId, input);
  state.stored.set(path, content);
  await server.confirmUpload(personId, fileId);
  return fileId;
}

const evidence = () => ({ kind: "expense_evidence" as const, outingId, subjectId: expenseId, mimeType: "application/pdf", sizeBytes: pdf.length, name: "nota.pdf" });

beforeEach(async () => {
  state.db = await createTestDatabase();
  state.stored.clear();
  state.removed.length = 0;
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await person("Maria", "11999990001");
  caio = await person("Caio", "11999990002");
  stranger = await person("Intruso", "11999990003", false);
  expenseId = await expensesServer.registerExpense(lucas, outingId, {
    description: "Carne",
    totalCents: 9000,
    payers: [{ personId: lucas, amountCents: 9000 }],
    split: { method: "equal", personIds: [lucas, maria, caio] },
    occurredAt: new Date("2026-03-10T20:00:00Z"),
  });
  paymentId = await paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents: 3000 });
});

describe("evidência da despesa", () => {
  it("quem lançou envia, o arquivo vira pronto e os participantes abrem por link assinado", async () => {
    const fileId = await upload(lucas, evidence(), pdf);
    const [row] = await db().select().from(files).where(eq(files.id, fileId));
    expect(row).toMatchObject({ status: "ready", mimeType: "application/pdf", ownerId: lucas });

    expect((await server.listFiles(maria, "expense_evidence", outingId, [expenseId])).map((file) => file.name)).toEqual(["nota.pdf"]);
    expect(await server.getFileUrl(maria, fileId)).toBe(`https://signed.example/${row.path}`);
  });

  it("só quem lançou ou o dono anexa; os outros participantes não", async () => {
    await expect(server.requestUpload(maria, evidence())).rejects.toMatchObject({ code: "evidence_not_allowed" });
    expect(await db().$count(files)).toBe(0);
  });

  it("quem não participa não envia, não lista e não abre", async () => {
    await expect(server.requestUpload(stranger, evidence())).rejects.toMatchObject({ code: "outing_not_found" });
    const fileId = await upload(lucas, evidence(), pdf);
    await expect(server.listFiles(stranger, "expense_evidence", outingId, [expenseId])).rejects.toMatchObject({ code: "outing_not_found" });
    await expect(server.getFileUrl(stranger, fileId)).rejects.toMatchObject({ code: "file_not_found" });
  });

  it("não aceita despesa de outro rolê nem arquivo grande ou de tipo não permitido, antes de enviar", async () => {
    await expect(server.requestUpload(lucas, { ...evidence(), subjectId: crypto.randomUUID() })).rejects.toMatchObject({ code: "expense_not_found" });
    await expect(server.requestUpload(lucas, { ...evidence(), sizeBytes: 11 * 1024 * 1024 })).rejects.toMatchObject({ code: "file_too_large" });
    await expect(server.requestUpload(lucas, { ...evidence(), mimeType: "video/mp4" })).rejects.toMatchObject({ code: "file_type_not_allowed" });
  });
});

describe("conferência ao confirmar", () => {
  it("arquivo que não é o que disse ser é apagado do armazenamento e do banco", async () => {
    const { fileId, path } = await server.requestUpload(lucas, { ...evidence(), mimeType: "image/jpeg" });
    state.stored.set(path, script);
    await expect(server.confirmUpload(lucas, fileId)).rejects.toMatchObject({ code: "file_type_not_allowed" });
    expect(await db().$count(files)).toBe(0);
    expect(state.removed).toContain(path);
  });

  it("quando o arquivo não chegou, o pedido some e avisa", async () => {
    const { fileId } = await server.requestUpload(lucas, evidence());
    await expect(server.confirmUpload(lucas, fileId)).rejects.toMatchObject({ code: "file_not_received" });
    expect(await db().$count(files)).toBe(0);
  });

  it("só quem pediu confirma, e uma vez", async () => {
    const { fileId, path } = await server.requestUpload(lucas, evidence());
    state.stored.set(path, pdf);
    await expect(server.confirmUpload(maria, fileId)).rejects.toMatchObject({ code: "file_not_found" });
    await server.confirmUpload(lucas, fileId);
    await expect(server.confirmUpload(lucas, fileId)).rejects.toMatchObject({ code: "file_not_found" });
  });

  it("arquivo ainda não confirmado não aparece na lista", async () => {
    await server.requestUpload(lucas, evidence());
    expect(await server.listFiles(lucas, "expense_evidence", outingId, [expenseId])).toEqual([]);
  });
});

describe("comprovante do pagamento", () => {
  const receipt = () => ({ kind: "payment_receipt" as const, outingId, subjectId: paymentId, mimeType: "image/jpeg", sizeBytes: jpeg.length, name: "comprovante.jpg" });

  it("só quem pagou anexa", async () => {
    await upload(maria, receipt(), jpeg);
    await expect(server.requestUpload(lucas, receipt())).rejects.toMatchObject({ code: "receipt_not_allowed" });
    await expect(server.requestUpload(caio, receipt())).rejects.toMatchObject({ code: "receipt_not_allowed" });
    expect(await server.listFiles(lucas, "payment_receipt", outingId, [paymentId])).toHaveLength(1);
  });
});

describe("foto de perfil e remoção", () => {
  const photo = () => ({ kind: "profile_photo" as const, mimeType: "image/jpeg", sizeBytes: jpeg.length, name: "eu.jpg" });

  it("a foto nova substitui a antiga e quem divide rolê consegue abrir, quem não divide não", async () => {
    const first = await upload(lucas, photo(), jpeg);
    const second = await upload(lucas, photo(), jpeg);
    expect(await db().$count(files, eq(files.kind, "profile_photo"))).toBe(1);
    expect(await server.getFileUrl(maria, second)).toContain("profile_photo/");
    await expect(server.getFileUrl(stranger, second)).rejects.toMatchObject({ code: "file_not_found" });
    expect(first).not.toBe(second);
  });

  it("foto de perfil não aceita PNG nem estar ligada a um rolê", async () => {
    await expect(server.requestUpload(lucas, { ...photo(), mimeType: "image/png" })).rejects.toMatchObject({ code: "file_type_not_allowed" });
    await expect(server.requestUpload(lucas, { ...photo(), outingId })).rejects.toMatchObject({ code: "file_subject_invalid" });
  });

  it("só o dono remove o arquivo, do banco e do armazenamento", async () => {
    const fileId = await upload(lucas, evidence(), pdf);
    await expect(server.removeFile(maria, fileId)).rejects.toMatchObject({ code: "file_not_found" });
    await server.removeFile(lucas, fileId);
    expect(await db().$count(files)).toBe(0);
    expect(state.removed.some((path) => path.startsWith("expense_evidence/"))).toBe(true);
  });
});
