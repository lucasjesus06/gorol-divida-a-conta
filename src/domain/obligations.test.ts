import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { expenseObligations } from "./obligations";

const simplify = (obligations: ReturnType<typeof expenseObligations>) =>
  obligations.map(({ debtorId, creditorId, amountCents }) => ({
    debtorId,
    creditorId,
    amountCents,
  }));

describe("expenseObligations", () => {
  it("makes every participant owe the single payer their share", () => {
    const expense = anExpense({
      payers: [{ participantId: "joao", amountCents: 20000 }],
      split: { method: "equal", participantIds: ["joao", "maria", "pedro", "lucas"] },
    });
    expect(simplify(expenseObligations(expense))).toEqual([
      { debtorId: "maria", creditorId: "joao", amountCents: 5000 },
      { debtorId: "pedro", creditorId: "joao", amountCents: 5000 },
      { debtorId: "lucas", creditorId: "joao", amountCents: 5000 },
    ]);
  });

  it("splits each share among payers proportionally to what they paid", () => {
    // R$ 500: Gustavo paid R$ 300 (60%), Hyago R$ 200 (40%); R$ 125 for each of four people.
    const expense = anExpense({
      payers: [
        { participantId: "gustavo", amountCents: 30000 },
        { participantId: "hyago", amountCents: 20000 },
      ],
      split: { method: "equal", participantIds: ["gustavo", "hyago", "maria", "pedro"] },
    });
    expect(simplify(expenseObligations(expense))).toEqual([
      { debtorId: "gustavo", creditorId: "hyago", amountCents: 5000 },
      { debtorId: "hyago", creditorId: "gustavo", amountCents: 7500 },
      { debtorId: "maria", creditorId: "gustavo", amountCents: 7500 },
      { debtorId: "maria", creditorId: "hyago", amountCents: 5000 },
      { debtorId: "pedro", creditorId: "gustavo", amountCents: 7500 },
      { debtorId: "pedro", creditorId: "hyago", amountCents: 5000 },
    ]);
  });

  it("keeps every person's net exactly equal to what they paid minus their share", () => {
    for (let first = 1; first < 10000; first += 997) {
      for (let second = 1; second < 10000; second += 1301) {
        const expense = anExpense({
          payers: [
            { participantId: "a", amountCents: first },
            { participantId: "b", amountCents: second },
            { participantId: "c", amountCents: 333 },
          ],
          split: { method: "equal", participantIds: ["a", "b", "c", "d", "e", "f", "g"] },
        });
        const net = new Map<string, number>();
        for (const { debtorId, creditorId, amountCents } of expenseObligations(expense)) {
          net.set(debtorId, (net.get(debtorId) ?? 0) - amountCents);
          net.set(creditorId, (net.get(creditorId) ?? 0) + amountCents);
        }
        for (const [personId, share] of expense.shares) {
          const paid =
            expense.payers.find((payer) => payer.participantId === personId)?.amountCents ?? 0;
          expect(net.get(personId) ?? 0).toBe(paid - share);
        }
      }
    }
  });
});
