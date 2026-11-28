import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const lifecycle = vi.hoisted(() => ({ closeOuting: vi.fn(), leaveOuting: vi.fn(), removeParticipant: vi.fn() }));
const votes = vi.hoisted(() => ({ requestClosing: vi.fn(), answerClosing: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/outing-lifecycle", () => lifecycle);
vi.mock("@/server/closing-votes", () => votes);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const actions = await import("./lifecycle-actions");

const outingId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
});

describe("encerrar rolê", () => {
  it("encerra em nome de quem está logado", async () => {
    expect(await actions.closeOutingAction(outingId)).toEqual({});
    expect(lifecycle.closeOuting).toHaveBeenCalledWith("p1", outingId);
  });

  it("devolve a mensagem da regra quando ainda há saldo, sem encerrar", async () => {
    lifecycle.closeOuting.mockRejectedValue(new DomainError("outing_cannot_close", "Não dá para encerrar o rolê: ainda há saldo."));
    expect(await actions.closeOutingAction(outingId)).toEqual({ error: "Não dá para encerrar o rolê: ainda há saldo." });
    expect(await actions.closeOutingAction("x")).toEqual({ error: "Rolê não encontrado." });
  });
});

describe("remover e sair", () => {
  it("o dono remove uma pessoa; id inválido nem chama o servidor", async () => {
    expect(await actions.removeParticipantAction(outingId, targetId)).toEqual({});
    expect(lifecycle.removeParticipant).toHaveBeenCalledWith("p1", outingId, targetId);
    expect(await actions.removeParticipantAction(outingId, "x")).toHaveProperty("error");
    expect(lifecycle.removeParticipant).toHaveBeenCalledTimes(1);
  });

  it("ao sair volta para a lista de rolês; se a regra recusar, fica e mostra o motivo", async () => {
    await expect(actions.leaveOutingAction(outingId)).rejects.toThrow("REDIRECT:/roles");
    lifecycle.leaveOuting.mockRejectedValue(new DomainError("participant_cannot_leave", "Você não pode sair do rolê agora: há acerto em aberto."));
    expect(await actions.leaveOutingAction(outingId)).toEqual({ error: "Você não pode sair do rolê agora: há acerto em aberto." });
  });
});

describe("votação de encerramento", () => {
  it("o dono pede o encerramento e quem tem a receber responde, em nome de quem está logado", async () => {
    expect(await actions.requestClosingAction(outingId)).toEqual({});
    expect(votes.requestClosing).toHaveBeenCalledWith("p1", outingId);
    expect(await actions.answerClosingAction(outingId, false)).toEqual({});
    expect(votes.answerClosing).toHaveBeenCalledWith("p1", outingId, false);
  });

  it("devolve a mensagem da regra e recusa rolê inválido", async () => {
    votes.answerClosing.mockRejectedValue(new DomainError("not_a_voter", "Só quem tem a receber neste rolê responde, e uma vez."));
    expect(await actions.answerClosingAction(outingId, true)).toEqual({ error: "Só quem tem a receber neste rolê responde, e uma vez." });
    expect(await actions.requestClosingAction("x")).toEqual({ error: "Rolê não encontrado." });
  });
});
