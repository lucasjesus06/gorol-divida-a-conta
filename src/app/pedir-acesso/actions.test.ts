import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const access = vi.hoisted(() => ({ submitAccessRequest: vi.fn(), submitGuestAccessRequest: vi.fn() }));
const auth = vi.hoisted(() => ({ getIdentity: vi.fn() }));
vi.mock("@/server/access", () => access);
vi.mock("@/server/auth", () => auth);

const { requestAccess, requestGuestAccess } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const pedido = { name: "Maria", email: "maria@exemplo.com", phone: "11999990001" };

beforeEach(() => {
  vi.clearAllMocks();
  access.submitAccessRequest.mockResolvedValue(undefined);
  access.submitGuestAccessRequest.mockResolvedValue(undefined);
  auth.getIdentity.mockResolvedValue({ kind: "guest", userId: "g1" });
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

describe("requestGuestAccess", () => {
  it("pede o cadastro pela sessão do convidado, só com o e-mail", async () => {
    expect(await requestGuestAccess({}, form({ email: "bia@exemplo.com", name: "Outro", phone: "11900000000" }))).toEqual({ done: true });
    expect(access.submitGuestAccessRequest).toHaveBeenCalledWith("g1", { email: "bia@exemplo.com" });
  });

  it("quem não é convidado é avisado e nada é pedido", async () => {
    auth.getIdentity.mockResolvedValue(null);
    expect((await requestGuestAccess({}, form({ email: "bia@exemplo.com" }))).error).toContain("convidado");
    expect(access.submitGuestAccessRequest).not.toHaveBeenCalled();
  });

  it("mostra o aviso da regra de negócio", async () => {
    access.submitGuestAccessRequest.mockRejectedValue(new DomainError("invalid_email", "Informe um e-mail válido."));
    expect(await requestGuestAccess({}, form({ email: "x" }))).toEqual({ error: "Informe um e-mail válido." });
  });
});
