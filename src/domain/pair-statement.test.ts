import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { aConfirmedPayment, aDeclaredPayment } from "@/test/payment-fixtures";
import { pairStatement } from "./pair-statement";

describe("pairStatement", () => {
  const trip = anExpense({
    id: "trip",
    outingId: "ubatuba",
    description: "Pousada",
    payers: [{ participantId: "lucas", amountCents: 40000 }],
    split: { method: "equal", participantIds: ["lucas", "joao", "maria", "pedro"] },
  });
  const football = anExpense({
    id: "football",
    outingId: "futebol",
    description: "Quadra",
    occurredAt: new Date("2026-11-12T20:00:00Z"),
    payers: [{ participantId: "joao", amountCents: 6000 }],
    split: { method: "equal", participantIds: ["lucas", "joao", "maria"] },
  });

  it("lists every expense between two people across outings, with origin and total", () => {
    const statement = pairStatement("lucas", "joao", [trip, football], []);
    expect(statement.entries.map((entry) => [entry.outingId, entry.effectCents])).toEqual([
      ["ubatuba", 10000],
      ["futebol", -2000],
    ]);
    expect(statement.netCents).toBe(8000);
    expect(Object.fromEntries(statement.netByOutingCents)).toEqual({
      ubatuba: 10000,
      futebol: -2000,
    });
  });

  it("shows declared payments as awaiting confirmation without changing the balance", () => {
    const declared = aDeclaredPayment({
      outingId: "ubatuba",
      fromId: "joao",
      toId: "lucas",
      amountCents: 5000,
    });
    const statement = pairStatement("lucas", "joao", [trip], [declared]);
    expect(statement.netCents).toBe(10000);
    expect(statement.awaitingConfirmationCents).toBe(5000);
    expect(statement.entries.at(-1)).toMatchObject({ kind: "payment", status: "declared" });
  });

  it("settles debt with a confirmed direct payment", () => {
    const paid = aConfirmedPayment({
      outingId: "ubatuba",
      fromId: "joao",
      toId: "lucas",
      amountCents: 10000,
    });
    expect(pairStatement("lucas", "joao", [trip], [paid]).netCents).toBe(0);
  });

  it("paying on someone's behalf moves the debt to the person who paid", () => {
    // Maria pays Lucas R$ 100 on behalf of Pedro: Pedro no longer owes Lucas, now owes Maria.
    const onBehalf = aConfirmedPayment({
      outingId: "ubatuba",
      fromId: "maria",
      toId: "lucas",
      amountCents: 10000,
      onBehalfOfId: "pedro",
    });
    expect(pairStatement("lucas", "pedro", [trip], [onBehalf]).netCents).toBe(0);
    expect(pairStatement("maria", "pedro", [trip], [onBehalf]).netCents).toBe(10000);
    expect(pairStatement("lucas", "maria", [trip], [onBehalf]).netCents).toBe(10000);
  });
});
