import { describe, expect, it } from "vitest";
import {
  computeOutingBalances,
  type ParticipantBalance,
} from "./outing-balance";
import { anExpense } from "@/test/expense-fixtures";
import { aDeclaredPayment } from "@/test/payment-fixtures";
import {
  manualRoute,
  otherOutingsWithDebt,
  smartRoute,
  summarizeRoutes,
  type Transfer,
} from "./settlement-routes";

function balancesWithNets(nets: Record<string, number>): ParticipantBalance[] {
  return Object.entries(nets).map(([participantId, netCents]) => ({
    participantId,
    paidCents: 0,
    owedCents: 0,
    advancedCents: 0,
    sentCents: 0,
    receivedCents: 0,
    netCents,
    awaitingConfirmationSentCents: 0,
    awaitingConfirmationReceivedCents: 0,
    amnestyGivenCents: 0,
    amnestyReceivedCents: 0,
  }));
}

function applyTransfers(
  nets: Record<string, number>,
  transfers: Transfer[],
): Record<string, number> {
  const result = { ...nets };
  for (const { fromId, toId, amountCents } of transfers) {
    result[fromId] = (result[fromId] ?? 0) + amountCents;
    result[toId] = (result[toId] ?? 0) - amountCents;
  }
  return result;
}

describe("smartRoute", () => {
  it("lets Gustavo pay Aghata directly and leaves Karina out", () => {
    // Gustavo owes Karina R$ 40 and Karina owes Aghata R$ 40.
    const gustavoDinner = anExpense({
      id: "a",
      payers: [{ participantId: "karina", amountCents: 4000 }],
      split: { method: "exact", shares: [{ participantId: "gustavo", amountCents: 4000 }] },
    });
    const karinaUber = anExpense({
      id: "b",
      payers: [{ participantId: "aghata", amountCents: 4000 }],
      split: { method: "exact", shares: [{ participantId: "karina", amountCents: 4000 }] },
    });
    const expenses = [gustavoDinner, karinaUber];
    const balances = computeOutingBalances("outing-1", expenses, []);

    expect(smartRoute(balances.values())).toEqual([
      { fromId: "gustavo", toId: "aghata", amountCents: 4000 },
    ]);
    const manual = manualRoute("outing-1", expenses, []);
    expect(manual).toHaveLength(2);
    expect(manual).toEqual(
      expect.arrayContaining([
        { fromId: "gustavo", toId: "karina", amountCents: 4000 },
        { fromId: "karina", toId: "aghata", amountCents: 4000 },
      ]),
    );
    expect(summarizeRoutes("outing-1", balances.values(), expenses, []).transfersSaved).toBe(1);
  });

  it("finds the true minimum where pairing the largest amounts would use one Pix more", () => {
    const nets = { c6: 600, c4: 400, d4: -400, d3a: -300, d3b: -300 };
    const transfers = smartRoute(balancesWithNets(nets));
    expect(transfers).toHaveLength(3);
    expect(Object.values(applyTransfers(nets, transfers)).every((value) => value === 0)).toBe(true);
  });

  it("always settles everyone with at most n - 1 transfers", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 200; round += 1) {
      const size = 2 + Math.floor(random() * 9);
      const nets: Record<string, number> = {};
      let total = 0;
      for (let i = 0; i < size - 1; i += 1) {
        const value = Math.floor(random() * 20001) - 10000;
        nets[`p${i}`] = value;
        total += value;
      }
      nets[`p${size - 1}`] = -total;

      const transfers = smartRoute(balancesWithNets(nets));
      const open = Object.values(nets).filter((value) => value !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(open - 1, 0));
      expect(Object.values(applyTransfers(nets, transfers)).every((value) => value === 0)).toBe(
        true,
      );
      expect(transfers.every((transfer) => transfer.amountCents > 0)).toBe(true);
    }
  });

  it("still settles everyone above the exact search limit", () => {
    const nets: Record<string, number> = {};
    for (let i = 0; i < 20; i += 1) nets[`p${i}`] = i % 2 === 0 ? 1000 + i : -(1000 + i - 1);
    nets["p19"] = (nets["p19"] ?? 0) - Object.values(nets).reduce((sum, value) => sum + value, 0);
    const transfers = smartRoute(balancesWithNets(nets));
    expect(Object.values(applyTransfers(nets, transfers)).every((value) => value === 0)).toBe(true);
  });

  it("does not ask someone to pay again while their payment awaits confirmation", () => {
    const expense = anExpense({
      payers: [{ participantId: "aghata", amountCents: 20000 }],
      split: { method: "equal", participantIds: ["aghata", "gustavo"] },
    });
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 10000 });
    const balances = computeOutingBalances("outing-1", [expense], [declared]);
    expect(smartRoute(balances.values())).toEqual([]);
    expect(manualRoute("outing-1", [expense], [declared])).toEqual([]);
  });
});

describe("otherOutingsWithDebt", () => {
  it("points out other outings where the person still owes", () => {
    const trip = anExpense({
      outingId: "ubatuba",
      payers: [{ participantId: "lucas", amountCents: 10000 }],
      split: { method: "equal", participantIds: ["lucas", "joao"] },
    });
    const bbq = anExpense({
      outingId: "churrasco",
      payers: [{ participantId: "maria", amountCents: 6000 }],
      split: { method: "equal", participantIds: ["maria", "joao", "lucas"] },
    });
    const byOuting = new Map([
      ["ubatuba", computeOutingBalances("ubatuba", [trip], [])],
      ["churrasco", computeOutingBalances("churrasco", [bbq], [])],
    ]);
    expect(otherOutingsWithDebt("joao", "ubatuba", byOuting)).toEqual([
      { outingId: "churrasco", owedCents: 2000 },
    ]);
    expect(otherOutingsWithDebt("maria", "ubatuba", byOuting)).toEqual([]);
  });
});
