import { describe, expect, it } from "vitest";
import { billTotalCents, planBillClosing, validateBillItem, validateDirectTotal } from "./bill-closing";

const people = new Set(["lucas", "maria", "caio"]);
const base = { totalCents: 9000, allowedPayerIds: new Set(["lucas"]), participantIds: people };
const lucasPays = [{ participantId: "lucas", amountCents: 9000 }];

describe("validateBillItem", () => {
  it("limpa o nome e usa quantidade 1 quando não vem nada", () => {
    const item = validateBillItem({ description: "  Cerveja   long neck ", totalCents: 1200, quantity: "" });
    expect(item.description).toBe("Cerveja long neck");
    expect(item.quantity.toText()).toBe("1");
  });

  it("aceita frações e decimais na quantidade", () => {
    expect(validateBillItem({ description: "Pizza", totalCents: 5000, quantity: "1/2" }).quantity.toText()).toBe("1/2");
    expect(validateBillItem({ description: "Pizza", totalCents: 5000, quantity: "0,5" }).quantity.toText()).toBe("1/2");
  });

  it("recusa nome vazio ou enorme, valor zero ou quebrado e quantidade zero", () => {
    expect(() => validateBillItem({ description: "  ", totalCents: 100, quantity: "1" })).toThrow("nome");
    expect(() => validateBillItem({ description: "x".repeat(121), totalCents: 100, quantity: "1" })).toThrow("120");
    expect(() => validateBillItem({ description: "x", totalCents: 0, quantity: "1" })).toThrow("maior que zero");
    expect(() => validateBillItem({ description: "x", totalCents: 10.5, quantity: "1" })).toThrow("maior que zero");
    expect(() => validateBillItem({ description: "x", totalCents: 100, quantity: "0" })).toThrow("positiva");
  });
});

describe("billTotalCents", () => {
  it("na conta direta é o valor digitado", () => {
    expect(billTotalCents({ mode: "direct", directTotalCents: 8000, itemCents: [], serviceChargeCents: 0, discountCents: 0 })).toBe(8000);
    expect(() => validateDirectTotal(0)).toThrow("valor da conta");
  });

  it("na detalhada são os itens mais a taxa menos o desconto, e sem itens não há total", () => {
    expect(billTotalCents({ mode: "detailed", directTotalCents: null, itemCents: [5000, 5000], serviceChargeCents: 1000, discountCents: 500 })).toBe(10500);
    expect(() => billTotalCents({ mode: "detailed", directTotalCents: null, itemCents: [], serviceChargeCents: 0, discountCents: 0 })).toThrow("itens");
    expect(() => billTotalCents({ mode: "detailed", directTotalCents: null, itemCents: [100], serviceChargeCents: 0, discountCents: 100 })).toThrow("maior que zero");
  });
});

describe("planBillClosing: quem pagou", () => {
  const equal = { kind: "equal" as const, personIds: ["lucas", "maria", "caio"] };

  it("aceita quem pagou igual ao total, sendo dono ou pagante declarado", () => {
    expect(planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: equal }).payers).toEqual(lucasPays);
  });

  it("recusa soma diferente do total, com os dois valores na mensagem", () => {
    expect(() => planBillClosing({ ...base, mode: "direct", payers: [{ participantId: "lucas", amountCents: 8000 }], division: equal })).toThrow(/R\$.*80,00.*R\$.*90,00/s);
  });

  it("recusa quem não é dono nem pagante declarado, e pessoa de fora do rolê", () => {
    expect(() => planBillClosing({ ...base, mode: "direct", payers: [{ participantId: "maria", amountCents: 9000 }], division: equal })).toThrow("pagante declarado");
    expect(() => planBillClosing({ ...base, mode: "direct", allowedPayerIds: new Set(["fora"]), payers: [{ participantId: "fora", amountCents: 9000 }], division: equal })).toThrow("participar do rolê");
  });

  it("recusa sem pagantes, pagante repetido ou valor zero", () => {
    expect(() => planBillClosing({ ...base, mode: "direct", payers: [], division: equal })).toThrow("quem pagou");
    expect(() => planBillClosing({ ...base, mode: "direct", payers: [{ participantId: "lucas", amountCents: 4500 }, { participantId: "lucas", amountCents: 4500 }], division: equal })).toThrow("mais de uma vez");
    expect(() => planBillClosing({ ...base, mode: "direct", payers: [{ participantId: "lucas", amountCents: 0 }], division: equal })).toThrow("maior que zero");
  });

  it("vários pagantes somando o total", () => {
    const plan = planBillClosing({ ...base, allowedPayerIds: new Set(["lucas", "maria"]), mode: "direct", payers: [{ participantId: "lucas", amountCents: 6000 }, { participantId: "maria", amountCents: 3000 }], division: equal });
    expect(plan.payers).toHaveLength(2);
  });
});

describe("planBillClosing: a divisão", () => {
  it("por igual entre os escolhidos", () => {
    const plan = planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "equal", personIds: ["lucas", "maria"] } });
    expect(plan.split).toEqual({ method: "equal", participantIds: ["lucas", "maria"] });
  });

  it("recusa divisão sem ninguém, com repetido ou com gente de fora", () => {
    expect(() => planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "equal", personIds: [] } })).toThrow("quem divide");
    expect(() => planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "equal", personIds: ["maria", "maria"] } })).toThrow("mais de uma vez");
    expect(() => planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "equal", personIds: ["fora"] } })).toThrow("participar do rolê");
  });

  it("por valores precisa somar o total", () => {
    const shares = [{ personId: "lucas", amountCents: 5000 }, { personId: "maria", amountCents: 4000 }];
    expect(planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "exact", shares } }).split).toEqual({
      method: "exact",
      shares: [{ participantId: "lucas", amountCents: 5000 }, { participantId: "maria", amountCents: 4000 }],
    });
    expect(() => planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "exact", shares: [{ personId: "lucas", amountCents: 5000 }] } })).toThrow("soma das partes");
    expect(() => planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "exact", shares: [{ personId: "lucas", amountCents: -1 }, { personId: "maria", amountCents: 9001 }] } })).toThrow("zero ou mais");
  });

  it("pelo que cada um marcou só vale com itens", () => {
    expect(planBillClosing({ ...base, mode: "detailed", payers: lucasPays, division: { kind: "marks" } }).split).toBeNull();
    expect(() => planBillClosing({ ...base, mode: "direct", payers: lucasPays, division: { kind: "marks" } })).toThrow("itens");
  });
});
