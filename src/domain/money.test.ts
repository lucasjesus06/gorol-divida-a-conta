import { describe, expect, it } from "vitest";
import { formatCents, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it.each([
    ["25,90", 2590],
    ["25", 2500],
    ["0,5", 50],
    ["1.234,56", 123456],
    ["R$ 1.234,50", 123450],
    ["12.5", 1250],
    ["  7,05 ", 705],
  ])("lê %j como %d centavos", (text, cents) => {
    expect(parseMoneyToCents(text)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", "-5", "1,234", "1.2.3", "12,345", "R$"])("recusa %j", (text) => {
    expect(() => parseMoneyToCents(text)).toThrowError(expect.objectContaining({ code: "invalid_amount" }));
  });
});

describe("formatCents", () => {
  it("mostra em reais, no formato brasileiro", () => {
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatCents(5).replace(/\s/g, " ")).toBe("R$ 0,05");
  });
});
