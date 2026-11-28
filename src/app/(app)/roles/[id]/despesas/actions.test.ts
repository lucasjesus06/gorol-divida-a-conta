import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const requests = vi.hoisted(() => ({ createPayerRequest: vi.fn(), decidePayerRequest: vi.fn() }));
const disputes = vi.hoisted(() => ({ openDispute: vi.fn(), decideDispute: vi.fn() }));
const expensesServer = vi.hoisted(() => ({ declarePayer: vi.fn(), registerExpense: vi.fn(), reviseExpense: vi.fn(), voidExpense: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/payer-requests", () => requests);
vi.mock("@/server/disputes", () => disputes);
vi.mock("@/server/expenses", () => expensesServer);
vi.mock("next/navigation", () => navigation);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const outingId = "11111111-1111-4111-8111-111111111111";
const valid = { outingId, description: "Uber", total: "60,00", date: "2026-03-10", payerMode: "single", payerSingle: "p1", method: "equal", equal_p1: "on", equal_p2: "on" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Maria" });
  requests.createPayerRequest.mockResolvedValue("r1");
  requests.decidePayerRequest.mockResolvedValue(undefined);
  disputes.openDispute.mockResolvedValue("d1");
  disputes.decideDispute.mockResolvedValue(undefined);
});

describe("requestPayerAction", () => {
  it("envia o pedido em nome de quem está logado e volta para as despesas", async () => {
    await expect(actions.requestPayerAction({}, form({ ...valid, targetExpenseId: "e1" }))).rejects.toThrow(`REDIRECT:/roles/${outingId}?visao=despesas`);
    expect(requests.createPayerRequest).toHaveBeenCalledWith("p1", outingId, {
      input: expect.objectContaining({ description: "Uber", totalCents: 6000 }),
      targetExpenseId: "e1",
    });
  });

  it("sem despesa escolhida, o pedido é de uma despesa nova", async () => {
    await expect(actions.requestPayerAction({}, form(valid))).rejects.toThrow("REDIRECT");
    expect(requests.createPayerRequest).toHaveBeenCalledWith("p1", outingId, expect.objectContaining({ targetExpenseId: undefined }));
  });

  it("mostra o aviso da regra de negócio e valor inválido, sem redirecionar", async () => {
    requests.createPayerRequest.mockRejectedValue(new DomainError("already_payer", "Você já é pagante: registre a despesa direto."));
    expect(await actions.requestPayerAction({}, form(valid))).toEqual({ error: "Você já é pagante: registre a despesa direto." });
    expect((await actions.requestPayerAction({}, form({ ...valid, total: "abc" }))).error).toContain("valor válido");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});

describe("decidePayerRequestAction", () => {
  it("aprova e recusa em nome do dono logado, com a observação", async () => {
    await actions.decidePayerRequestAction({}, form({ outingId, requestId: "r1", decision: "approve", note: "ok" }));
    await actions.decidePayerRequestAction({}, form({ outingId, requestId: "r2", decision: "reject", note: "" }));
    expect(requests.decidePayerRequest).toHaveBeenNthCalledWith(1, "p1", outingId, "r1", { approve: true, note: "ok" });
    expect(requests.decidePayerRequest).toHaveBeenNthCalledWith(2, "p1", outingId, "r2", { approve: false, note: "" });
  });

  it("devolve o aviso da regra de negócio", async () => {
    requests.decidePayerRequest.mockRejectedValue(new DomainError("request_not_pending", "Este pedido já foi decidido."));
    expect(await actions.decidePayerRequestAction({}, form({ outingId, requestId: "r1", decision: "approve" }))).toEqual({
      error: "Este pedido já foi decidido.",
    });
  });
});

describe("openDisputeAction", () => {
  it("contesta em nome de quem está logado", async () => {
    expect(await actions.openDisputeAction({}, form({ outingId, expenseId: "e1", subject: "not_participated", message: "Não fui" }))).toEqual({});
    expect(disputes.openDispute).toHaveBeenCalledWith("p1", outingId, "e1", { subject: "not_participated", message: "Não fui", confirmLate: false });
  });

  it("fora do prazo pede a confirmação e, confirmada, repassa ao servidor", async () => {
    disputes.openDispute.mockRejectedValueOnce(new DomainError("dispute_late_needs_confirmation", "Este rolê foi encerrado há mais de 7 dias."));
    expect(await actions.openDisputeAction({}, form({ outingId, expenseId: "e1", subject: "amount", message: "x" }))).toEqual({ error: "Este rolê foi encerrado há mais de 7 dias.", needsConfirmation: true });
    await actions.openDisputeAction({}, form({ outingId, expenseId: "e1", subject: "amount", message: "x", confirmLate: "on" }));
    expect(disputes.openDispute).toHaveBeenLastCalledWith("p1", outingId, "e1", { subject: "amount", message: "x", confirmLate: true });
  });

  it("recusa um motivo inventado sem consultar nada", async () => {
    expect((await actions.openDisputeAction({}, form({ outingId, expenseId: "e1", subject: "golpe", message: "x" }))).error).toContain("motivo");
    expect(disputes.openDispute).not.toHaveBeenCalled();
  });

  it("mostra o aviso da regra de negócio", async () => {
    disputes.openDispute.mockRejectedValue(new DomainError("dispute_already_open", "Você já tem uma contestação aberta para esta despesa."));
    expect(await actions.openDisputeAction({}, form({ outingId, expenseId: "e1", subject: "amount", message: "x" }))).toEqual({
      error: "Você já tem uma contestação aberta para esta despesa.",
    });
  });
});

describe("decideDisputeAction", () => {
  it("aceita e recusa em nome de quem está logado", async () => {
    await actions.decideDisputeAction({}, form({ outingId, disputeId: "d1", decision: "approve", note: "ok" }));
    await actions.decideDisputeAction({}, form({ outingId, disputeId: "d2", decision: "reject", note: "" }));
    expect(disputes.decideDispute).toHaveBeenNthCalledWith(1, "p1", outingId, "d1", { approve: true, note: "ok" });
    expect(disputes.decideDispute).toHaveBeenNthCalledWith(2, "p1", outingId, "d2", { approve: false, note: "" });
  });
});
