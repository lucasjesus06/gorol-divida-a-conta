import { describe, expect, it } from "vitest";
import { parseBillForm } from "./parse-bill-form";

function form(entries: [string, string][]) {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

const base: [string, string][] = [
  ["description", "Bar do Zé"],
  ["date", "2026-03-10"],
  ["payer", "p1"],
  ["itemDescription", "Pizza"],
  ["itemTotal", "40,00"],
  ["itemQuantity", "1"],
  ["itemDescription", "Cerveja"],
  ["itemTotal", "20,00"],
  ["itemQuantity", "2"],
  ["serviceCharge", "6,00"],
  ["discount", ""],
  ["idempotencyKey", "k1"],
];

describe("parseBillForm", () => {
  it("lê itens repetidos, taxa e desconto, e o pagador paga o total da conta", () => {
    const input = parseBillForm(form(base));
    expect(input.items).toEqual([
      { description: "Pizza", totalCents: 4000, quantity: "1" },
      { description: "Cerveja", totalCents: 2000, quantity: "2" },
    ]);
    expect(input).toMatchObject({ serviceChargeCents: 600, discountCents: 0, idempotencyKey: "k1" });
    expect(input.payers).toEqual([{ personId: "p1", amountCents: 6600 }]);
  });

  it("ignora linhas de item vazias e usa quantidade 1 quando fica em branco", () => {
    const input = parseBillForm(form([...base.filter(([key]) => !key.startsWith("item")), ["itemDescription", "Água"], ["itemTotal", "5"], ["itemQuantity", ""], ["itemDescription", ""], ["itemTotal", ""], ["itemQuantity", ""]]));
    expect(input.items).toEqual([{ description: "Água", totalCents: 500, quantity: "1" }]);
  });

  it("recusa valor e data inválidos", () => {
    expect(() => parseBillForm(form([...base.filter(([key]) => key !== "date"), ["date", "10/03"]]))).toThrowError(expect.objectContaining({ code: "invalid_date" }));
    expect(() => parseBillForm(form([...base.filter(([key]) => key !== "itemTotal"), ["itemTotal", "abc"]]))).toThrowError(expect.objectContaining({ code: "invalid_amount" }));
  });
});
