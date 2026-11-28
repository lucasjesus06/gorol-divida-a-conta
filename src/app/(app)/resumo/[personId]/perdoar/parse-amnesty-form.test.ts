import { describe, expect, it } from "vitest";
import { parseAmnestyForm } from "./parse-amnesty-form";

function form(entries: [string, string][]) {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("parseAmnestyForm", () => {
  it("lê só as despesas marcadas, com o valor digitado para cada uma", () => {
    expect(parseAmnestyForm(form([["expense", "e1"], ["amount_e1", "30,00"], ["amount_e2", "10,00"], ["expense", "e3"], ["amount_e3", "5"]]))).toEqual([
      { expenseId: "e1", amountCents: 3000 },
      { expenseId: "e3", amountCents: 500 },
    ]);
  });

  it("sem nada marcado devolve vazio, e valor ilegível é recusado", () => {
    expect(parseAmnestyForm(form([["amount_e1", "10"]]))).toEqual([]);
    expect(() => parseAmnestyForm(form([["expense", "e1"], ["amount_e1", "abc"]]))).toThrowError(expect.objectContaining({ code: "invalid_amount" }));
  });
});
