import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const access = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  rejectAccessRequest: vi.fn(),
  createInvite: vi.fn(),
}));
const auth = vi.hoisted(() => ({ requireSuperAdmin: vi.fn() }));

vi.mock("@/server/access", () => access);
vi.mock("@/server/auth", () => auth);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { approveRequestAction, createInviteAction, rejectRequestAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireSuperAdmin.mockResolvedValue({ userId: "u1", personId: "p1" });
  access.approveAccessRequest.mockResolvedValue(undefined);
  access.rejectAccessRequest.mockResolvedValue(undefined);
  access.createInvite.mockResolvedValue("tok");
});

describe("ações do painel", () => {
  it("aprova em nome do super admin logado", async () => {
    expect(await approveRequestAction({}, form({ id: "r1" }))).toEqual({});
    expect(access.approveAccessRequest).toHaveBeenCalledWith("r1", "p1");
  });

  it("recusa com o motivo informado", async () => {
    await rejectRequestAction({}, form({ id: "r1", note: "sem vaga" }));
    expect(access.rejectAccessRequest).toHaveBeenCalledWith("r1", "p1", "sem vaga");
  });

  it("quem não é super admin não executa nada", async () => {
    auth.requireSuperAdmin.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(approveRequestAction({}, form({ id: "r1" }))).rejects.toThrow("NOT_FOUND");
    await expect(createInviteAction()).rejects.toThrow("NOT_FOUND");
    expect(access.approveAccessRequest).not.toHaveBeenCalled();
    expect(access.createInvite).not.toHaveBeenCalled();
  });

  it("devolve o aviso da regra de negócio", async () => {
    access.approveAccessRequest.mockRejectedValue(new DomainError("email_already_registered", "Já existe uma conta com este e-mail."));
    expect(await approveRequestAction({}, form({ id: "r1" }))).toEqual({ error: "Já existe uma conta com este e-mail." });
  });

  it("gera o convite e devolve o caminho do link", async () => {
    expect(await createInviteAction()).toEqual({ invitePath: "/convite/tok" });
    expect(access.createInvite).toHaveBeenCalledWith("p1");
  });
});
