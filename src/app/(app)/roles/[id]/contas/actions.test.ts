import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const bills = vi.hoisted(() => ({ openBill: vi.fn(), claimItem: vi.fn(), releaseClaim: vi.fn(), closeBill: vi.fn(), answerLeftover: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/bills", () => bills);
vi.mock("next/navigation", () => navigation);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

function form(entries: [string, string][]) {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

const outingId = "11111111-1111-4111-8111-111111111111";
const billId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
  bills.openBill.mockResolvedValue(billId);
  bills.closeBill.mockResolvedValue({ status: "closed" });
});

describe("openBillAction", () => {
  const valid: [string, string][] = [["outingId", outingId], ["description", "Bar"], ["date", "2026-03-10"], ["payer", "p1"], ["itemDescription", "Pizza"], ["itemTotal", "40"], ["itemQuantity", "1"]];

  it("abre a conta em nome de quem está logado e vai para ela", async () => {
    await expect(actions.openBillAction({}, form(valid))).rejects.toThrow(`REDIRECT:/roles/${outingId}/contas/${billId}`);
    expect(bills.openBill).toHaveBeenCalledWith("p1", outingId, expect.objectContaining({ description: "Bar", payers: [{ personId: "p1", amountCents: 4000 }] }));
  });

  it("mostra o aviso da regra de negócio, sem redirecionar", async () => {
    bills.openBill.mockRejectedValue(new DomainError("no_items", "A conta precisa ter os itens."));
    expect(await actions.openBillAction({}, form(valid))).toEqual({ error: "A conta precisa ter os itens." });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });
});

describe("claimItemAction e releaseClaimAction", () => {
  it("marca com quem dividiu o item", async () => {
    await actions.claimItemAction({}, form([["outingId", outingId], ["billId", billId], ["itemId", itemId], ["quantity", "1"], ["sharedWith", "p2"], ["sharedWith", "p3"]]));
    expect(bills.claimItem).toHaveBeenCalledWith("p1", outingId, billId, itemId, { quantity: "1", sharedWith: ["p2", "p3"] });
  });

  it("recusa identificadores que não são UUID", async () => {
    expect((await actions.claimItemAction({}, form([["outingId", "x"], ["billId", billId], ["itemId", itemId], ["quantity", "1"]]))).error).toBeDefined();
    expect(bills.claimItem).not.toHaveBeenCalled();
  });

  it("não consumi retira a marcação própria", async () => {
    await actions.releaseClaimAction({}, form([["outingId", outingId], ["billId", billId], ["itemId", itemId]]));
    expect(bills.releaseClaim).toHaveBeenCalledWith("p1", outingId, billId, itemId);
  });
});

describe("closeBillAction e answerLeftoverAction", () => {
  const close = (leftover: string): [string, string][] => [["outingId", outingId], ["billId", billId], ["leftover", leftover]];

  it("ratear ou transferir para alguém", async () => {
    await expect(actions.closeBillAction({}, form(close("spread")))).rejects.toThrow("REDIRECT");
    expect(bills.closeBill).toHaveBeenLastCalledWith("p1", outingId, billId, { mode: "spread" });
    await expect(actions.closeBillAction({}, form(close("p2")))).rejects.toThrow("REDIRECT");
    expect(bills.closeBill).toHaveBeenLastCalledWith("p1", outingId, billId, { mode: "transfer", personId: "p2" });
  });

  it("aceitar ou recusar a parte transferida", async () => {
    await actions.answerLeftoverAction({}, form([["outingId", outingId], ["billId", billId], ["decision", "accept"]]));
    await actions.answerLeftoverAction({}, form([["outingId", outingId], ["billId", billId], ["decision", "decline"]]));
    expect(bills.answerLeftover).toHaveBeenNthCalledWith(1, "p1", outingId, billId, true);
    expect(bills.answerLeftover).toHaveBeenNthCalledWith(2, "p1", outingId, billId, false);
  });
});
