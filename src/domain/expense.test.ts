import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { activeExpenses, reviseExpense, voidExpense } from "./expense";

describe("createExpense", () => {
  it("records who paid, who registered and what each participant takes on", () => {
    const expense = anExpense({
      registeredBy: "joao",
      payers: [{ participantId: "maria", amountCents: 20000 }],
      split: { method: "equal", participantIds: ["joao", "maria", "pedro", "lucas"] },
    });
    expect(expense.registeredBy).toBe("joao");
    expect(expense.payers).toEqual([{ participantId: "maria", amountCents: 20000 }]);
    expect(Object.fromEntries(expense.shares)).toEqual({
      joao: 5000,
      maria: 5000,
      pedro: 5000,
      lucas: 5000,
    });
    expect(expense.version).toBe(1);
    expect(expense.status).toBe("active");
  });

  it("accepts R$ 500 paid by Gustavo (R$ 300) and Hyago (R$ 200)", () => {
    const expense = anExpense({
      payers: [
        { participantId: "gustavo", amountCents: 30000 },
        { participantId: "hyago", amountCents: 20000 },
      ],
      split: { method: "equal", participantIds: ["gustavo", "hyago", "maria", "pedro"] },
    });
    expect(expense.totalCents).toBe(50000);
  });

  it("rejects payments that do not add up to the total", () => {
    expect(() =>
      anExpense({
        totalCents: 50000,
        payers: [{ participantId: "gustavo", amountCents: 30000 }],
        split: { method: "equal", participantIds: ["gustavo", "hyago"] },
      }),
    ).toThrow("soma dos pagamentos");
  });

  it("requires at least two people", () => {
    expect(() =>
      anExpense({
        payers: [{ participantId: "ana", amountCents: 1000 }],
        split: { method: "equal", participantIds: ["ana"] },
      }),
    ).toThrow("pelo menos duas pessoas");
  });
});

describe("expense versions", () => {
  const original = anExpense({
    payers: [{ participantId: "ana", amountCents: 10000 }],
    split: { method: "equal", participantIds: ["ana", "bia"] },
  });

  it("creates a new version and supersedes the previous one", () => {
    const { superseded, revision } = reviseExpense(original, {
      id: "expense-2",
      description: "Despesa corrigida",
      totalCents: 12000,
      payers: [{ participantId: "ana", amountCents: 12000 }],
      split: { method: "equal", participantIds: ["ana", "bia"] },
      registeredBy: "bia",
      occurredAt: original.occurredAt,
      createdAt: new Date("2026-11-10T10:00:00Z"),
    });
    expect(superseded.status).toBe("superseded");
    expect(superseded.totalCents).toBe(10000);
    expect(revision.version).toBe(2);
    expect(revision.previousVersionId).toBe(original.id);
    expect(revision.outingId).toBe(original.outingId);
    expect(activeExpenses([superseded, revision])).toEqual([revision]);
  });

  it("voids an expense keeping who did it and why", () => {
    const voided = voidExpense(original, "bia", "Lançada em duplicidade");
    expect(voided.status).toBe("voided");
    expect(voided.voidedBy).toBe("bia");
    expect(voided.voidReason).toBe("Lançada em duplicidade");
  });

  it("does not change a version that is no longer active", () => {
    const voided = voidExpense(original, "bia", "Duplicada");
    expect(() => voidExpense(voided, "ana", "De novo")).toThrow("versão ativa");
  });
});
