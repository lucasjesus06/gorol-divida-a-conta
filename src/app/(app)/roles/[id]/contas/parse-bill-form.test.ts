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
  it("lê itens repetidos, taxa e desconto, sem nada sobre quem pagou", () => {
    const input = parseBillForm(form(base));
    expect(input).toMatchObject({ mode: "detailed" });
    expect("items" in input && input.items).toEqual([
      { description: "Pizza", totalCents: 4000, quantity: "1" },
      { description: "Cerveja", totalCents: 2000, quantity: "2" },
    ]);
    expect(input).toMatchObject({ serviceChargeCents: 600, discountCents: 0, idempotencyKey: "k1" });
  });

  it("ignora linhas de item vazias e usa quantidade 1 quando fica em branco", () => {
    const input = parseBillForm(form([...base.filter(([key]) => !key.startsWith("item")), ["itemDescription", "Água"], ["itemTotal", "5"], ["itemQuantity", ""], ["itemDescription", ""], ["itemTotal", ""], ["itemQuantity", ""]]));
    expect("items" in input && input.items).toEqual([{ description: "Água", totalCents: 500, quantity: "1" }]);
  });

  it("na conta direta lê só o valor", () => {
    const input = parseBillForm(form([["mode", "direct"], ["description", "Mercado"], ["date", "2026-03-10"], ["directTotal", "123,45"]]));
    expect(input).toMatchObject({ mode: "direct", directTotalCents: 12345 });
  });

  it("com o total da maquininha, o que não foi descrito entra como uma linha só", () => {
    const input = parseBillForm(form([["mode", "detailed"], ["description", "Bar"], ["date", "2026-03-10"], ["slipTotal", "120,00"], ["itemDescription", "Pizza"], ["itemTotal", "40,00"], ["itemQuantity", "1"]]));
    expect("items" in input && input.items).toEqual([
      { description: "Pizza", totalCents: 4000, quantity: "1" },
      { description: "Sem descrição", totalCents: 8000, quantity: "1" },
    ]);
  });

  it("com o total da maquininha, descrever mais que o total é recusado", () => {
    expect(() => parseBillForm(form([["mode", "detailed"], ["description", "Bar"], ["date", "2026-03-10"], ["slipTotal", "30,00"], ["itemDescription", "Pizza"], ["itemTotal", "40,00"], ["itemQuantity", "1"]]))).toThrowError(expect.objectContaining({ code: "described_above_total" }));
  });

  it("recusa valor e data inválidos", () => {
    expect(() => parseBillForm(form([...base.filter(([key]) => key !== "date"), ["date", "10/03"]]))).toThrowError(expect.objectContaining({ code: "invalid_date" }));
    expect(() => parseBillForm(form([...base.filter(([key]) => key !== "itemTotal"), ["itemTotal", "abc"]]))).toThrowError(expect.objectContaining({ code: "invalid_amount" }));
  });
});
