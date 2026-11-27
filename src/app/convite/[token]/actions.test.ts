import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const access = vi.hoisted(() => ({ redeemInvite: vi.fn() }));
vi.mock("@/server/access", () => access);

const { redeemInviteAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const dados = { token: "tok", name: "Bruno", email: "bruno@exemplo.com", phone: "11999990002" };

beforeEach(() => {
  vi.clearAllMocks();
  access.redeemInvite.mockResolvedValue(undefined);
});

describe("redeemInviteAction", () => {
  it("cria a conta com o convite recebido", async () => {
    expect(await redeemInviteAction({}, form(dados))).toEqual({ done: true });
    expect(access.redeemInvite).toHaveBeenCalledWith("tok", { name: "Bruno", email: "bruno@exemplo.com", phone: "11999990002" });
  });

  it("mostra o motivo quando o convite não vale", async () => {
    access.redeemInvite.mockRejectedValue(new DomainError("invite_unavailable", "Este convite não vale mais."));
    expect(await redeemInviteAction({}, form(dados))).toEqual({ error: "Este convite não vale mais." });
  });
});
