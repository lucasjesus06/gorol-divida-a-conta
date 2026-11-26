import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { aConfirmedPayment, aDeclaredPayment } from "@/test/payment-fixtures";
import { computeOutingBalances, debtSummary } from "./outing-balance";

const net = (balances: ReturnType<typeof computeOutingBalances>) =>
  Object.fromEntries([...balances].map(([id, balance]) => [id, balance.netCents]));

describe("computeOutingBalances", () => {
  it("shows who fronted money: consumed R$ 100, paid R$ 500, advanced R$ 400", () => {
    const expense = anExpense({
      payers: [{ participantId: "karina", amountCents: 50000 }],
      split: {
        method: "exact",
        shares: [
          { participantId: "karina", amountCents: 10000 },
          { participantId: "gustavo", amountCents: 20000 },
          { participantId: "aghata", amountCents: 20000 },
        ],
      },
    });
    const karina = computeOutingBalances("outing-1", [expense], []).get("karina");
    expect(karina?.paidCents).toBe(50000);
    expect(karina?.owedCents).toBe(10000);
    expect(karina?.advancedCents).toBe(40000);
  });

  it("accumulates several expenses and always nets to zero", () => {
    const dinner = anExpense({
      id: "dinner",
      payers: [{ participantId: "gustavo", amountCents: 30000 }],
      split: { method: "equal", participantIds: ["gustavo", "karina", "aghata"] },
    });
    const uber = anExpense({
      id: "uber",
      payers: [{ participantId: "karina", amountCents: 5000 }],
      split: { method: "equal", participantIds: ["karina", "aghata"] },
    });
    const balances = computeOutingBalances("outing-1", [dinner, uber], []);
    expect(net(balances)).toEqual({ gustavo: 20000, karina: -7500, aghata: -12500 });
    expect([...balances.values()].reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  it("counts a payment only after the creditor confirms it", () => {
    const expense = anExpense({
      payers: [{ participantId: "aghata", amountCents: 20000 }],
      split: { method: "equal", participantIds: ["aghata", "gustavo"] },
    });
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    const pending = computeOutingBalances("outing-1", [expense], [declared]);
    expect(pending.get("gustavo")?.netCents).toBe(-10000);
    expect(pending.get("gustavo")?.awaitingConfirmationSentCents).toBe(4000);

    const confirmed = aConfirmedPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    expect(computeOutingBalances("outing-1", [expense], [confirmed]).get("gustavo")?.netCents).toBe(
      -6000,
    );
  });

  it("summarizes a partial payment: owed R$ 100, paid R$ 40, pending R$ 60", () => {
    const expense = anExpense({
      payers: [{ participantId: "maria", amountCents: 20000 }],
      split: { method: "equal", participantIds: ["maria", "joao"] },
    });
    const payment = aConfirmedPayment({ fromId: "joao", toId: "maria", amountCents: 4000 });
    const joao = computeOutingBalances("outing-1", [expense], [payment]).get("joao");
    expect(joao && debtSummary(joao)).toEqual({
      originalDebtCents: 10000,
      paidCents: 4000,
      pendingCents: 6000,
    });
  });

  it("ignores superseded versions and other outings", () => {
    const other = anExpense({
      outingId: "outing-2",
      payers: [{ participantId: "a", amountCents: 1000 }],
      split: { method: "equal", participantIds: ["a", "b"] },
    });
    expect(computeOutingBalances("outing-1", [other], []).size).toBe(0);
  });
});
