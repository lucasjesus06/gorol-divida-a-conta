import { createExpense, type Expense, type ExpenseInput } from "@/domain/expense";

const AT = new Date("2026-11-09T20:00:00Z");

/** Builds a valid expense for tests; only what matters for each case needs to be given. */
export function anExpense(
  overrides: Partial<ExpenseInput> & Pick<ExpenseInput, "payers" | "split">,
): Expense {
  const totalCents =
    overrides.totalCents ?? overrides.payers.reduce((sum, payer) => sum + payer.amountCents, 0);
  return createExpense({
    id: "expense-1",
    outingId: "outing-1",
    description: "Despesa",
    registeredBy: overrides.payers[0]?.participantId ?? "someone",
    occurredAt: AT,
    createdAt: AT,
    ...overrides,
    totalCents,
  });
}
