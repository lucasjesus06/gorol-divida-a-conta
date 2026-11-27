import { describe, expect, it } from "vitest";
import { parseExpenseForm } from "./parse-expense-form";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const base = { description: "Churrasco", total: "100,00", date: "2026-03-10", payerMode: "single", payerSingle: "ana", method: "equal" };

describe("parseExpenseForm", () => {
  it("um pagador paga o total, e a divisão igual leva só os marcados", () => {
    const input = parseExpenseForm(form({ ...base, equal_ana: "on", equal_bia: "on", idempotencyKey: "k1" }));
    expect(input).toEqual({
      description: "Churrasco",
      totalCents: 10000,
      payers: [{ personId: "ana", amountCents: 10000 }],
      split: { method: "equal", personIds: ["ana", "bia"] },
      occurredAt: new Date("2026-03-10T15:00:00.000Z"),
      idempotencyKey: "k1",
    });
  });

  it("vários pagadores usam os valores preenchidos e ignoram os vazios", () => {
    const input = parseExpenseForm(form({ ...base, payerMode: "multi", payer_ana: "60", payer_bia: "40,00", payer_caio: " ", equal_ana: "on" }));
    expect(input.payers).toEqual([
      { personId: "ana", amountCents: 6000 },
      { personId: "bia", amountCents: 4000 },
    ]);
  });

  it("valores informados leem uma parte por pessoa", () => {
    const input = parseExpenseForm(form({ ...base, method: "exact", share_ana: "70,50", share_bia: "29,50", share_caio: "" }));
    expect(input.split).toEqual({
      method: "exact",
      shares: [
        { personId: "ana", amountCents: 7050 },
        { personId: "bia", amountCents: 2950 },
      ],
    });
  });

  it("recusa valor e data inválidos com avisos claros", () => {
    expect(() => parseExpenseForm(form({ ...base, total: "abc" }))).toThrowError(expect.objectContaining({ code: "invalid_amount" }));
    expect(() => parseExpenseForm(form({ ...base, date: "10/03/2026" }))).toThrowError(expect.objectContaining({ code: "invalid_date" }));
  });
});
