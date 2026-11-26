import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { attachEvidence, reviseExpense } from "./expense";
import { evidenceStatus, type ExpenseEvidence } from "./evidence";

const receiptPhoto = (overrides: Partial<ExpenseEvidence> = {}): ExpenseEvidence => ({
  id: "evidence-1",
  kind: "receipt_photo",
  fileId: "file-123",
  uploadedBy: "lucas",
  uploadedAt: new Date("2026-11-09T21:00:00Z"),
  amountCents: 20000,
  documentDate: new Date("2026-11-09T00:00:00Z"),
  ...overrides,
});

// Only the total is informed: no receipt photo, no items.
const dinner = () =>
  anExpense({
    description: "Jantar",
    payers: [{ participantId: "lucas", amountCents: 20000 }],
    split: { method: "equal", participantIds: ["lucas", "maria"] },
  });

describe("expense evidence", () => {
  it("accepts an expense with just the total amount and shows it has no evidence", () => {
    const expense = dinner();
    expect(expense.evidence).toEqual([]);
    expect(evidenceStatus(expense.evidence, expense.totalCents)).toEqual({ hasEvidence: false });
  });

  it("flags the expense as backed by evidence when the amount on the document matches", () => {
    const expense = attachEvidence(dinner(), receiptPhoto());
    expect(evidenceStatus(expense.evidence, expense.totalCents)).toEqual({
      hasEvidence: true,
      amountMatchesTotal: true,
    });
  });

  it("shows when the document amount differs from the informed total", () => {
    const expense = attachEvidence(dinner(), receiptPhoto({ amountCents: 18000 }));
    expect(evidenceStatus(expense.evidence, expense.totalCents)).toEqual({
      hasEvidence: true,
      amountMatchesTotal: false,
    });
  });

  it("accepts a screenshot without amount or date", () => {
    const expense = attachEvidence(
      dinner(),
      receiptPhoto({ kind: "invoice_screenshot", amountCents: null, documentDate: null }),
    );
    expect(evidenceStatus(expense.evidence, expense.totalCents)).toEqual({
      hasEvidence: true,
      amountMatchesTotal: null,
    });
  });

  it("keeps the evidence when the expense is revised", () => {
    const original = attachEvidence(dinner(), receiptPhoto());
    const { revision } = reviseExpense(original, {
      id: "expense-2",
      description: "Jantar",
      totalCents: 20000,
      payers: [{ participantId: "lucas", amountCents: 20000 }],
      split: { method: "exact", shares: [{ participantId: "maria", amountCents: 20000 }] },
      registeredBy: "lucas",
      occurredAt: original.occurredAt,
      createdAt: new Date("2026-11-10T10:00:00Z"),
    });
    expect(revision.evidence).toHaveLength(1);
  });

  it("requires a file", () => {
    expect(() => attachEvidence(dinner(), receiptPhoto({ fileId: " " }))).toThrow("arquivo");
  });
});
