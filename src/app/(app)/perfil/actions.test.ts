import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const server = vi.hoisted(() => ({
  requireAccount: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireAccount: server.requireAccount }));
vi.mock("@/server/profiles", () => ({ saveProfile: server.saveProfile }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveProfileAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  server.requireAccount.mockResolvedValue({ kind: "account", userId: "user-1", email: "ana@exemplo.com" });
  server.saveProfile.mockResolvedValue({ personId: "p1", displayName: "Ana" });
});

describe("saveProfileAction", () => {
  it("salva o telefone no formato internacional e vai para a página inicial", async () => {
    await expect(
      saveProfileAction({}, form({ displayName: "  Ana   Souza ", phone: "(11) 99999-0001" })),
    ).rejects.toThrow("REDIRECT:/");
    expect(server.saveProfile).toHaveBeenCalledWith("user-1", { displayName: "Ana Souza", phone: "+5511999990001" });
  });

  it("devolve a mensagem da regra quando o telefone é inválido", async () => {
    expect(await saveProfileAction({}, form({ displayName: "Ana", phone: "123" }))).toEqual({
      error: "Informe um telefone válido, com DDD.",
    });
    expect(server.saveProfile).not.toHaveBeenCalled();
  });

  it("devolve a mensagem quando o telefone já é de outra conta", async () => {
    server.saveProfile.mockRejectedValue(
      new DomainError("phone_already_linked", "Este telefone já está vinculado a outra conta."),
    );
    expect(await saveProfileAction({}, form({ displayName: "Ana", phone: "11999990001" }))).toEqual({
      error: "Este telefone já está vinculado a outra conta.",
    });
  });

  it("não engole erro inesperado", async () => {
    server.saveProfile.mockRejectedValue(new Error("banco fora do ar"));
    await expect(saveProfileAction({}, form({ displayName: "Ana", phone: "11999990001" }))).rejects.toThrow(
      "banco fora do ar",
    );
  });
});
