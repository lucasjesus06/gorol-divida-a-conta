import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const pix = vi.hoisted(() => ({ getPixPayment: vi.fn() }));
const payments = vi.hoisted(() => ({ declarePayment: vi.fn(), confirmPayment: vi.fn(), rejectPayment: vi.fn() }));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/payments", () => payments);
vi.mock("@/server/pix", () => pix);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const outingId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Maria" });
  payments.declarePayment.mockResolvedValue("pay1");
});

describe("declarePaymentAction", () => {
  it("declara em nome de quem está logado, com o valor em centavos", async () => {
    expect(await actions.declarePaymentAction({}, form({ outingId, toId: "p2", amount: "25,50", idempotencyKey: "k" }))).toEqual({ done: true });
    expect(payments.declarePayment).toHaveBeenCalledWith("p1", outingId, { toId: "p2", amountCents: 2550, onBehalfOfId: undefined, idempotencyKey: "k" });
  });

  it("leva o pagamento em nome de outra pessoa", async () => {
    await actions.declarePaymentAction({}, form({ outingId, toId: "p2", amount: "10", onBehalfOfId: "p3" }));
    expect(payments.declarePayment).toHaveBeenCalledWith("p1", outingId, expect.objectContaining({ onBehalfOfId: "p3" }));
  });

  it("valor inválido e aviso da regra de negócio voltam como erro, sem gravar", async () => {
    expect((await actions.declarePaymentAction({}, form({ outingId, toId: "p2", amount: "abc" }))).error).toContain("valor válido");
    payments.declarePayment.mockRejectedValue(new DomainError("payment_to_self", "Quem paga e quem recebe precisam ser pessoas diferentes."));
    expect(await actions.declarePaymentAction({}, form({ outingId, toId: "p1", amount: "10" }))).toEqual({
      error: "Quem paga e quem recebe precisam ser pessoas diferentes.",
    });
  });
});

describe("resolvePaymentAction", () => {
  it("confirma ou recusa em nome de quem está logado", async () => {
    await actions.resolvePaymentAction({}, form({ outingId, paymentId: "pay1", decision: "confirm" }));
    await actions.resolvePaymentAction({}, form({ outingId, paymentId: "pay2", decision: "reject" }));
    expect(payments.confirmPayment).toHaveBeenCalledWith("p1", outingId, "pay1");
    expect(payments.rejectPayment).toHaveBeenCalledWith("p1", outingId, "pay2");
  });

  it("devolve o aviso quando não é o credor", async () => {
    payments.confirmPayment.mockRejectedValue(new DomainError("only_creditor_resolves", "Só quem recebeu o pagamento pode confirmar, recusar ou contestar."));
    expect((await actions.resolvePaymentAction({}, form({ outingId, paymentId: "pay1", decision: "confirm" }))).error).toContain("Só quem recebeu");
  });
});

describe("revealPixAction", () => {
  it("devolve a chave, o copia e cola e o QR para quem precisa pagar", async () => {
    pix.getPixPayment.mockResolvedValue({ display: "lucas@exemplo.com", payload: "000201...", receiverName: "Lucas" });
    const result = await actions.revealPixAction({}, form({ outingId, toId: "p2", amountCents: "3000" }));
    expect(pix.getPixPayment).toHaveBeenCalledWith("p1", outingId, "p2", 3000);
    expect(result).toMatchObject({ display: "lucas@exemplo.com", payload: "000201..." });
    expect(result.qr).toMatch(/^data:image\/png;base64,/);
  });

  it("devolve a mensagem da regra quando não pode ver a chave", async () => {
    pix.getPixPayment.mockRejectedValue(new DomainError("pix_not_allowed", "Sem permissão."));
    expect(await actions.revealPixAction({}, form({ outingId, toId: "p2", amountCents: "3000" }))).toEqual({ error: "Sem permissão." });
  });
});
