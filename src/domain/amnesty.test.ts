import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { aConfirmedPayment, aDeclaredPayment } from "@/test/payment-fixtures";
import { forgivableBetween, planAmnesty, planClearingAmnesty, type Amnesty } from "./amnesty";
import { computeOutingBalances } from "./outing-balance";
import { pairStatement } from "./pair-statement";
import { manualRoute } from "./settlement-routes";

const pousada = anExpense({
  id: "pousada",
  outingId: "ubatuba",
  description: "Pousada",
  occurredAt: new Date("2026-11-09T20:00:00Z"),
  payers: [{ participantId: "lucas", amountCents: 10000 }],
  split: { method: "equal", participantIds: ["lucas", "joao"] },
});
const quadra = anExpense({
  id: "quadra",
  outingId: "futebol",
  description: "Quadra",
  occurredAt: new Date("2026-11-12T20:00:00Z"),
  payers: [{ participantId: "lucas", amountCents: 4000 }],
  split: { method: "equal", participantIds: ["lucas", "joao"] },
});
const expenses = [pousada, quadra];

function amnesty(items: Amnesty["items"], overrides: Partial<Amnesty> = {}): Amnesty {
  return { id: "a1", creditorId: "lucas", debtorId: "joao", createdAt: new Date("2026-11-20T12:00:00Z"), items, ...overrides };
}

describe("forgivableBetween", () => {
  it("lista o que o devedor deve ao credor por despesa, na ordem em que aconteceram", () => {
    const forgivable = forgivableBetween("lucas", "joao", expenses, [], []);
    expect(forgivable.expenses.map((row) => [row.expenseId, row.owedCents, row.remainingCents])).toEqual([
      ["pousada", 5000, 5000],
      ["quadra", 2000, 2000],
    ]);
    expect(forgivable.maxCents).toBe(7000);
  });

  it("desconta o que já foi perdoado e o que já foi pago", () => {
    const paid = aConfirmedPayment({ outingId: "ubatuba", fromId: "joao", toId: "lucas", amountCents: 1000 });
    const forgivable = forgivableBetween("lucas", "joao", expenses, [paid], [amnesty([{ outingId: "ubatuba", expenseId: "pousada", amountCents: 2000 }])]);
    expect(forgivable.expenses.find((row) => row.expenseId === "pousada")).toMatchObject({ forgivenCents: 2000, remainingCents: 3000 });
    expect(forgivable.maxCents).toBe(4000);
  });

  it("não há o que perdoar para quem na verdade é credor", () => {
    expect(forgivableBetween("joao", "lucas", expenses, [], []).maxCents).toBe(0);
  });
});

describe("planAmnesty", () => {
  it("aceita parte de uma despesa e devolve os itens com o total", () => {
    const plan = planAmnesty("lucas", "joao", [{ expenseId: "pousada", amountCents: 3000 }], expenses, [], []);
    expect(plan).toEqual({ items: [{ outingId: "ubatuba", expenseId: "pousada", amountCents: 3000 }], totalCents: 3000 });
  });

  it("recusa escolha vazia, valor inválido, despesa repetida ou que não gera dívida", () => {
    const plan = (selection: { expenseId: string; amountCents: number }[]) => () => planAmnesty("lucas", "joao", selection, expenses, [], []);
    expect(plan([])).toThrowError(expect.objectContaining({ code: "amnesty_empty" }));
    expect(plan([{ expenseId: "pousada", amountCents: 0 }])).toThrowError(expect.objectContaining({ code: "amnesty_invalid_amount" }));
    expect(plan([{ expenseId: "pousada", amountCents: 1.5 }])).toThrowError(expect.objectContaining({ code: "amnesty_invalid_amount" }));
    expect(plan([{ expenseId: "pousada", amountCents: 100 }, { expenseId: "pousada", amountCents: 100 }])).toThrowError(expect.objectContaining({ code: "amnesty_duplicate_expense" }));
    expect(plan([{ expenseId: "nao-existe", amountCents: 100 }])).toThrowError(expect.objectContaining({ code: "amnesty_expense_not_owed" }));
  });

  it("recusa passar do que resta da despesa", () => {
    expect(() => planAmnesty("lucas", "joao", [{ expenseId: "pousada", amountCents: 5001 }], expenses, [], [])).toThrowError(expect.objectContaining({ code: "amnesty_above_expense" }));
  });

  it("recusa passar do que a pessoa ainda deve, mesmo havendo despesa sobrando", () => {
    const paid = aConfirmedPayment({ outingId: "ubatuba", fromId: "joao", toId: "lucas", amountCents: 5000 });
    expect(() => planAmnesty("lucas", "joao", [{ expenseId: "pousada", amountCents: 5000 }], expenses, [paid], [])).toThrowError(expect.objectContaining({ code: "amnesty_above_balance" }));
  });

  it("um pagamento declarado já conta como pago, para não perdoar o que está a caminho", () => {
    const declared = aDeclaredPayment({ outingId: "ubatuba", fromId: "joao", toId: "lucas", amountCents: 5000 });
    expect(() => planAmnesty("lucas", "joao", [{ expenseId: "pousada", amountCents: 5000 }], expenses, [declared], [])).toThrowError(expect.objectContaining({ code: "amnesty_above_balance" }));
  });

  it("não perdoa a si mesmo", () => {
    expect(() => planAmnesty("lucas", "lucas", [{ expenseId: "pousada", amountCents: 100 }], expenses, [], [])).toThrowError(expect.objectContaining({ code: "amnesty_same_person" }));
  });
});

describe("a anistia no saldo", () => {
  const forgiven = amnesty([{ outingId: "ubatuba", expenseId: "pousada", amountCents: 3000 }]);

  it("reduz o que o devedor deve ao credor, por rolê, sem apagar a despesa", () => {
    const statement = pairStatement("lucas", "joao", expenses, [], [forgiven]);
    expect(statement.netCents).toBe(4000);
    expect(Object.fromEntries(statement.netByOutingCents)).toEqual({ ubatuba: 2000, futebol: 2000 });
    expect(statement.entries.map((entry) => entry.kind)).toEqual(["expense", "expense", "amnesty"]);
    expect(statement.entries.find((entry) => entry.kind === "amnesty")?.effectCents).toBe(-3000);
  });

  it("vista pelo devedor, o lançamento tem o sinal oposto e o saldo é o mesmo com o sinal trocado", () => {
    const statement = pairStatement("joao", "lucas", expenses, [], [forgiven]);
    expect(statement.netCents).toBe(-4000);
    expect(statement.entries.find((entry) => entry.kind === "amnesty")?.effectCents).toBe(3000);
  });

  it("ignora anistias de outros pares", () => {
    const other = amnesty([{ outingId: "ubatuba", expenseId: "pousada", amountCents: 3000 }], { debtorId: "maria" });
    expect(pairStatement("lucas", "joao", expenses, [], [other]).netCents).toBe(7000);
  });

  it("muda o saldo no rolê dos dois lados e a soma continua zero", () => {
    const balances = computeOutingBalances("ubatuba", expenses, [], [forgiven]);
    expect(balances.get("lucas")?.netCents).toBe(2000);
    expect(balances.get("joao")?.netCents).toBe(-2000);
    expect([...balances.values()].reduce((sum, balance) => sum + balance.netCents, 0)).toBe(0);
  });

  it("não aparece no saldo de outro rolê", () => {
    const balances = computeOutingBalances("futebol", expenses, [], [forgiven]);
    expect(balances.get("joao")?.netCents).toBe(-2000);
  });

  it("a rota manual do rolê já considera o perdão", () => {
    expect(manualRoute("ubatuba", expenses, [], [forgiven])).toEqual([{ fromId: "joao", toId: "lucas", amountCents: 2000 }]);
  });
});

describe("planClearingAmnesty", () => {
  it("perdoa tudo o que resta, da despesa mais antiga para a mais nova", () => {
    expect(planClearingAmnesty("lucas", "joao", expenses, [], [])).toEqual({
      items: [
        { outingId: "ubatuba", expenseId: "pousada", amountCents: 5000 },
        { outingId: "futebol", expenseId: "quadra", amountCents: 2000 },
      ],
      totalCents: 7000,
    });
  });

  it("para no que a pessoa ainda deve, depois de pagamentos e perdões", () => {
    const paid = aConfirmedPayment({ outingId: "ubatuba", fromId: "joao", toId: "lucas", amountCents: 6000 });
    const plan = planClearingAmnesty("lucas", "joao", expenses, [paid], []);
    expect(plan?.totalCents).toBe(1000);
    expect(plan?.items).toEqual([{ outingId: "ubatuba", expenseId: "pousada", amountCents: 1000 }]);
  });

  it("não há nada a perdoar quando ninguém deve", () => {
    expect(planClearingAmnesty("joao", "lucas", expenses, [], [])).toBeNull();
  });
});
