import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const access = vi.hoisted(() => ({ submitAccessRequest: vi.fn() }));
vi.mock("@/server/access", () => access);

const { requestAccess } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const pedido = { name: "Maria", email: "maria@exemplo.com", phone: "11999990001" };

beforeEach(() => {
  vi.clearAllMocks();
  access.submitAccessRequest.mockResolvedValue(undefined);
});

describe("requestAccess", () => {
  it("guarda o pedido e confirma", async () => {
    expect(await requestAccess({}, form(pedido))).toEqual({ done: true });
    expect(access.submitAccessRequest).toHaveBeenCalledWith(pedido);
  });

  it("robô que preenche o campo escondido recebe a mesma confirmação, sem guardar nada", async () => {
    expect(await requestAccess({}, form({ ...pedido, website: "http://spam" }))).toEqual({ done: true });
    expect(access.submitAccessRequest).not.toHaveBeenCalled();
  });

  it("mostra o erro de validação da regra de negócio", async () => {
    access.submitAccessRequest.mockRejectedValue(new DomainError("invalid_email", "Informe um e-mail válido."));
    expect(await requestAccess({}, form(pedido))).toEqual({ error: "Informe um e-mail válido." });
  });

  it("não esconde erro inesperado", async () => {
    access.submitAccessRequest.mockRejectedValue(new Error("banco fora"));
    await expect(requestAccess({}, form(pedido))).rejects.toThrow("banco fora");
  });
});
