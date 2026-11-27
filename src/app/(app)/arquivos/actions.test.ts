import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const files = vi.hoisted(() => ({ requestUpload: vi.fn(), confirmUpload: vi.fn(), getFileUrl: vi.fn(), removeFile: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/files", () => files);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

const id = "11111111-1111-4111-8111-111111111111";
const outingId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
});

describe("pedir envio", () => {
  const input = { kind: "expense_evidence", outingId, subjectId: id, mimeType: "application/pdf", sizeBytes: 1000, name: "nota.pdf" };

  it("repassa o pedido em nome de quem está logado", async () => {
    files.requestUpload.mockResolvedValue({ fileId: id, path: "p", token: "t", bucket: "arquivos" });
    expect(await actions.requestUploadAction(input)).toMatchObject({ fileId: id, token: "t" });
    expect(files.requestUpload).toHaveBeenCalledWith("p1", input);
  });

  it("recusa tipo de arquivo ou ids inválidos sem chamar o servidor", async () => {
    expect(await actions.requestUploadAction({ ...input, kind: "video" })).toHaveProperty("error");
    expect(await actions.requestUploadAction({ ...input, outingId: "x" })).toHaveProperty("error");
    expect(files.requestUpload).not.toHaveBeenCalled();
  });

  it("devolve a mensagem da regra, como arquivo grande demais", async () => {
    files.requestUpload.mockRejectedValue(new DomainError("file_too_large", "O arquivo passa do limite de 10 MB."));
    expect(await actions.requestUploadAction(input)).toEqual({ error: "O arquivo passa do limite de 10 MB." });
  });
});

describe("confirmar, abrir e remover", () => {
  it("confirma o envio e devolve a mensagem quando o conteúdo não serve", async () => {
    expect(await actions.confirmUploadAction(id, "/roles/x")).toEqual({});
    expect(files.confirmUpload).toHaveBeenCalledWith("p1", id);
    files.confirmUpload.mockRejectedValue(new DomainError("file_type_not_allowed", "Envie um arquivo PDF."));
    expect(await actions.confirmUploadAction(id, "/roles/x")).toEqual({ error: "Envie um arquivo PDF." });
    expect(await actions.confirmUploadAction("x", "/roles/x")).toHaveProperty("error");
  });

  it("abre o arquivo por um link assinado", async () => {
    files.getFileUrl.mockResolvedValue("https://signed.example/a");
    expect(await actions.openFileAction(id)).toEqual({ url: "https://signed.example/a" });
    files.getFileUrl.mockRejectedValue(new DomainError("file_not_found", "Arquivo não encontrado."));
    expect(await actions.openFileAction(id)).toEqual({ error: "Arquivo não encontrado." });
  });

  it("remove só em nome de quem está logado", async () => {
    expect(await actions.removeFileAction(id, "/roles/x")).toEqual({});
    expect(files.removeFile).toHaveBeenCalledWith("p1", id);
  });
});
