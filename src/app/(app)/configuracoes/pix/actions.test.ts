import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const server = vi.hoisted(() => ({
  requireAccount: vi.fn(),
  loadProfile: vi.fn(),
  savePixKey: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireAccount: server.requireAccount }));
vi.mock("@/server/profiles", () => ({ loadProfile: server.loadProfile }));
vi.mock("@/server/pix", () => ({ savePixKey: server.savePixKey }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { savePixKeyAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  server.requireAccount.mockResolvedValue({ kind: "account", userId: "user-1", email: "ana@exemplo.com" });
  server.loadProfile.mockResolvedValue({ personId: "p1", displayName: "Ana" });
  server.savePixKey.mockResolvedValue(undefined);
});

describe("savePixKeyAction", () => {
  it("salva a chave da própria pessoa e volta para as configurações", async () => {
    await expect(savePixKeyAction({}, form({ type: "email", value: "ana@exemplo.com" }))).rejects.toThrow(
      "REDIRECT:/configuracoes",
    );
    expect(server.savePixKey).toHaveBeenCalledWith("p1", { type: "email", value: "ana@exemplo.com" });
  });

  it("recusa tipo desconhecido sem chamar o servidor", async () => {
    expect(await savePixKeyAction({}, form({ type: "outro", value: "x" }))).toEqual({
      error: "Escolha o tipo da chave Pix.",
    });
    expect(server.savePixKey).not.toHaveBeenCalled();
  });

  it("devolve a mensagem da regra quando a chave é inválida", async () => {
    server.savePixKey.mockRejectedValue(new DomainError("invalid_pix_key", "Confira a chave Pix."));
    expect(await savePixKeyAction({}, form({ type: "cpf", value: "1" }))).toEqual({ error: "Confira a chave Pix." });
  });

  it("manda para o cadastro quem ainda não tem perfil", async () => {
    server.loadProfile.mockResolvedValue(null);
    await expect(savePixKeyAction({}, form({ type: "email", value: "a@b.co" }))).rejects.toThrow("REDIRECT:/perfil");
  });
});
