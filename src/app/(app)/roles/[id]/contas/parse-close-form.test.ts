import { describe, expect, it } from "vitest";
import { parseCloseForm } from "./parse-close-form";

function form(entries: [string, string][]) {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("parseCloseForm", () => {
  it("um pagante sem valor digitado paga o total da conta", () => {
    const input = parseCloseForm(form([["payer", "p1"], ["division", "marks"]]), 6600, false);
    expect(input.payers).toEqual([{ personId: "p1", amountCents: 6600 }]);
    expect(input.division).toEqual({ kind: "marks" });
    expect(input.leftover).toEqual({ mode: "spread" });
  });

  it("vários pagantes usam os valores digitados", () => {
    const input = parseCloseForm(form([["payer", "p1"], ["payer", "p2"], ["paid_p1", "40,00"], ["paid_p2", "26,00"], ["division", "equal"], ["sharePerson", "p1"], ["sharePerson", "p2"]]), 6600, false);
    expect(input.payers).toEqual([{ personId: "p1", amountCents: 4000 }, { personId: "p2", amountCents: 2600 }]);
    expect(input.division).toEqual({ kind: "equal", personIds: ["p1", "p2"] });
  });

  it("divisão por valores ignora campos vazios e a sobra pode ir para uma pessoa", () => {
    const input = parseCloseForm(form([["division", "exact"], ["shareId", "p1"], ["shareId", "p2"], ["share_p1", "10"], ["share_p2", ""], ["leftover", "p2"]]), 1000, true);
    expect(input.payers).toBeUndefined();
    expect(input.division).toEqual({ kind: "exact", shares: [{ personId: "p1", amountCents: 1000 }] });
    expect(input.leftover).toEqual({ mode: "transfer", personId: "p2" });
  });

  it("recusa divisão desconhecida", () => {
    expect(() => parseCloseForm(form([["division", "x"]]), 100, true)).toThrowError(expect.objectContaining({ code: "invalid_division" }));
  });
});
