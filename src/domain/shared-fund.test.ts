import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { aConfirmedPayment, aDeclaredPayment } from "@/test/payment-fixtures";
import { computeOutingBalances, type ParticipantBalance } from "./outing-balance";
import { pairStatement } from "./pair-statement";
import { areNeutralAt, liveFundPairs, type SharedFund } from "./shared-fund";
import { manualRoute, smartRouteWithFunds, summarizeRoutes } from "./settlement-routes";

const T0 = new Date("2026-11-01T12:00:00Z");
const BEFORE = new Date("2026-10-20T12:00:00Z");
const AFTER = new Date("2026-11-10T12:00:00Z");
const END = new Date("2026-11-20T12:00:00Z");

const fund: SharedFund = { id: "f1", personA: "ana", personB: "lucas", acceptedAt: T0, endedAt: null };

function balance(participantId: string, netCents: number): ParticipantBalance {
  return { participantId, paidCents: 0, owedCents: 0, advancedCents: 0, sentCents: 0, receivedCents: 0, amnestyGivenCents: 0, amnestyReceivedCents: 0, fundAdjustmentCents: 0, netCents, awaitingConfirmationSentCents: 0, awaitingConfirmationReceivedCents: 0 };
}

const churrasco = (createdAt: Date) =>
  anExpense({
    id: "churrasco",
    outingId: "sabado",
    description: "Churrasco",
    createdAt,
    payers: [{ participantId: "lucas", amountCents: 9000 }],
    split: { method: "equal", participantIds: ["lucas", "ana", "joao"] },
  });

describe("areNeutralAt", () => {
  it("vale do aceite em diante, nos dois sentidos, e acaba quando o vínculo acaba", () => {
    expect(areNeutralAt([fund], "lucas", "ana", AFTER)).toBe(true);
    expect(areNeutralAt([fund], "ana", "lucas", AFTER)).toBe(true);
    expect(areNeutralAt([fund], "lucas", "ana", BEFORE)).toBe(false);
    const ended = { ...fund, endedAt: END };
    expect(areNeutralAt([ended], "lucas", "ana", AFTER)).toBe(true);
    expect(areNeutralAt([ended], "lucas", "ana", new Date("2026-11-25T12:00:00Z"))).toBe(false);
  });

  it("não vale com outra pessoa", () => {
    expect(areNeutralAt([fund], "lucas", "joao", AFTER)).toBe(false);
    expect(liveFundPairs([fund, { ...fund, id: "f2", endedAt: END }], new Date("2026-11-25T12:00:00Z"))).toEqual([["ana", "lucas"]]);
  });
});

describe("a despesa durante o vínculo", () => {
  const expense = churrasco(AFTER);

  it("entre as duas pessoas não há dívida, e com os outros nada muda", () => {
    expect(pairStatement("lucas", "ana", [expense], [], [], [fund]).netCents).toBe(0);
    expect(pairStatement("lucas", "ana", [expense], [], [], [fund]).entries).toEqual([]);
    expect(pairStatement("lucas", "joao", [expense], [], [], [fund]).netCents).toBe(3000);
  });

  it("sem vínculo (ou antes dele) a dívida continua como sempre", () => {
    expect(pairStatement("lucas", "ana", [expense], [], [], []).netCents).toBe(3000);
    expect(pairStatement("lucas", "ana", [churrasco(BEFORE)], [], [], [fund]).netCents).toBe(3000);
  });

  it("no saldo do rolê quem divide o fundo não deve à outra, e a soma continua zero", () => {
    const balances = computeOutingBalances("sabado", [expense], [], [], [fund]);
    expect(balances.get("lucas")?.netCents).toBe(3000);
    expect(balances.get("ana")?.netCents).toBe(0);
    expect(balances.get("joao")?.netCents).toBe(-3000);
    expect([...balances.values()].reduce((sum, item) => sum + item.netCents, 0)).toBe(0);
  });

  it("depois de desfeito, o que foi lançado durante o vínculo continua neutro", () => {
    const ended = { ...fund, endedAt: END };
    expect(pairStatement("lucas", "ana", [expense], [], [], [ended]).netCents).toBe(0);
    const later = churrasco(new Date("2026-11-25T12:00:00Z"));
    expect(pairStatement("lucas", "ana", [later], [], [], [ended]).netCents).toBe(3000);
  });

  it("a rota manual não manda um para o outro", () => {
    expect(manualRoute("sabado", [expense], [], [], [fund])).toEqual([{ fromId: "joao", toId: "lucas", amountCents: 3000 }]);
  });
});

describe("pagar em nome de quem divide o fundo", () => {
  const owed = anExpense({
    id: "mercado",
    outingId: "sabado",
    createdAt: BEFORE,
    payers: [{ participantId: "joao", amountCents: 6000 }],
    split: { method: "exact", shares: [{ participantId: "ana", amountCents: 6000 }] },
  });

  it("quita a dívida da outra pessoa sem criar dívida entre as duas", () => {
    const payment = aConfirmedPayment({ outingId: "sabado", fromId: "lucas", toId: "joao", onBehalfOfId: "ana", amountCents: 6000, declaredAt: AFTER });
    const statement = pairStatement("lucas", "ana", [owed], [payment], [], [fund]);
    expect(statement.netCents).toBe(0);
    expect(pairStatement("joao", "ana", [owed], [payment], [], [fund]).netCents).toBe(0);
    const balances = computeOutingBalances("sabado", [owed], [payment], [], [fund]);
    expect(balances.get("ana")?.netCents).toBe(0);
    expect(balances.get("lucas")?.netCents ?? 0).toBe(0);
    expect(balances.get("joao")?.netCents).toBe(0);
  });

  it("sem vínculo, quem paga pela outra passa a ser credor dela", () => {
    const payment = aConfirmedPayment({ outingId: "sabado", fromId: "lucas", toId: "joao", onBehalfOfId: "ana", amountCents: 6000, declaredAt: AFTER });
    expect(pairStatement("lucas", "ana", [owed], [payment], [], []).netCents).toBe(6000);
  });

  it("pagamento declarado ainda não confirmado já conta na rota", () => {
    const payment = aDeclaredPayment({ outingId: "sabado", fromId: "lucas", toId: "joao", onBehalfOfId: "ana", amountCents: 6000, declaredAt: AFTER });
    const balances = computeOutingBalances("sabado", [owed], [payment], [], [fund]);
    expect(balances.get("ana")?.awaitingConfirmationSentCents).toBe(6000);
    expect(balances.get("lucas")?.awaitingConfirmationSentCents ?? 0).toBe(0);
  });
});

describe("rota inteligente com quem divide o fundo", () => {
  const balances = [balance("ana", 3000), balance("lucas", -2000), balance("joao", -1000)];

  it("sem vínculo o app mandaria o devedor pagar a quem divide o fundo com ele", () => {
    expect(smartRouteWithFunds(balances, [], AFTER)).toMatchObject({ avoided: [] });
  });

  it("com vínculo, o par é tratado como uma pessoa e o aviso diz que a transferência entre eles foi dispensada", () => {
    const { transfers, avoided } = smartRouteWithFunds(balances, [fund], AFTER);
    expect(avoided).toEqual([["ana", "lucas"]]);
    expect(transfers).toEqual([{ fromId: "joao", toId: "ana", amountCents: 1000 }]);
  });

  it("quem tem mais a pagar paga primeiro, e o resto fica com a outra pessoa do par", () => {
    const list = [balance("ana", -1000), balance("lucas", -500), balance("joao", 1500)];
    const { transfers } = smartRouteWithFunds(list, [fund], AFTER);
    expect(transfers.map((transfer) => [transfer.fromId, transfer.amountCents]).sort()).toEqual([["ana", 1000], ["lucas", 500]]);
    expect(transfers.every((transfer) => transfer.toId === "joao")).toBe(true);
  });

  it("a soma dos pagamentos zera os saldos de todo mundo", () => {
    const list = [balance("ana", 3000), balance("lucas", -2000), balance("joao", -1000)];
    const { transfers } = smartRouteWithFunds(list, [fund], AFTER);
    const net = new Map(list.map((item) => [item.participantId, item.netCents]));
    for (const transfer of transfers) {
      net.set(transfer.fromId, (net.get(transfer.fromId) ?? 0) + transfer.amountCents);
      net.set(transfer.toId, (net.get(transfer.toId) ?? 0) - transfer.amountCents);
    }
    // Inside the pair the two balances cancel, so only the pair's total has to reach zero.
    expect((net.get("ana") ?? 0) + (net.get("lucas") ?? 0)).toBe(0);
    expect(net.get("joao")).toBe(0);
  });

  it("o resumo traz os avisos e a rota já sem a transferência entre os dois", () => {
    const summary = summarizeRoutes("sabado", balances, [], [], [], [fund], AFTER);
    expect(summary.sharedFundNotices).toEqual([["ana", "lucas"]]);
    expect(summary.smartTransfers).toHaveLength(1);
  });
});
