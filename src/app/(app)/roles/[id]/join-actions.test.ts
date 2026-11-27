import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const join = vi.hoisted(() => ({
  createJoinLink: vi.fn(),
  revokeJoinLink: vi.fn(),
  decideJoinRequest: vi.fn(),
  releaseParticipant: vi.fn(),
}));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/join", () => join);
vi.mock("@/lib/origin", () => ({ requestOrigin: async () => "https://gorole.app" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./join-actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const outingId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
  join.createJoinLink.mockResolvedValue("segredo");
  join.revokeJoinLink.mockResolvedValue(undefined);
  join.decideJoinRequest.mockResolvedValue(undefined);
  join.releaseParticipant.mockResolvedValue(undefined);
});

describe("ações do link e dos pedidos", () => {
  it("gera o link absoluto e o QR code dele", async () => {
    const result = await actions.createJoinLinkAction({}, form({ outingId }));
    expect(result.url).toBe("https://gorole.app/entrar/segredo");
    expect(result.qr).toMatch(/^data:image\/png;base64,/);
    expect(join.createJoinLink).toHaveBeenCalledWith("p1", outingId);
  });

  it("recusa identificador que não é UUID sem consultar nada", async () => {
    expect(await actions.revokeJoinLinkAction({}, form({ outingId: "x" }))).toEqual({ error: "Rolê não encontrado." });
    expect(join.revokeJoinLink).not.toHaveBeenCalled();
  });

  it("aprova e recusa em nome de quem está logado", async () => {
    await actions.decideJoinRequestAction({}, form({ outingId, requestId: "r1", decision: "approve" }));
    await actions.decideJoinRequestAction({}, form({ outingId, requestId: "r2", decision: "reject" }));
    expect(join.decideJoinRequest).toHaveBeenNthCalledWith(1, "p1", outingId, "r1", true);
    expect(join.decideJoinRequest).toHaveBeenNthCalledWith(2, "p1", outingId, "r2", false);
  });

  it("devolve o aviso da regra de negócio ao liberar um nome", async () => {
    join.releaseParticipant.mockRejectedValue(new DomainError("participant_not_releasable", "Não é possível liberar este nome."));
    expect(await actions.releaseParticipantAction({}, form({ outingId, participantId: "x" }))).toEqual({
      error: "Não é possível liberar este nome.",
    });
  });

  it("não esconde erro inesperado", async () => {
    join.createJoinLink.mockRejectedValue(new Error("banco fora"));
    await expect(actions.createJoinLinkAction({}, form({ outingId }))).rejects.toThrow("banco fora");
  });
});
