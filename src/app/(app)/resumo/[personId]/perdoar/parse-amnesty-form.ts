import { parseMoneyToCents } from "@/domain/money";

/** The expenses ticked in the form, each with the amount typed for it (what is left of it by default). */
export function parseAmnestyForm(formData: FormData): { expenseId: string; amountCents: number }[] {
  return formData.getAll("expense").map((value) => {
    const expenseId = String(value);
    return { expenseId, amountCents: parseMoneyToCents(String(formData.get(`amount_${expenseId}`) ?? "")) };
  });
}
