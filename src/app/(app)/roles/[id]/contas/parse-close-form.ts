import { DomainError } from "@/domain/domain-error";
import type { BillDivision } from "@/domain/bill-closing";
import { parseMoneyToCents } from "@/domain/money";
import type { CloseBillInput, Leftover } from "@/server/bills";

function moneyField(formData: FormData, name: string): number | null {
  const text = String(formData.get(name) ?? "").trim();
  return text === "" ? null : parseMoneyToCents(text);
}

/**
 * Reads the closing form: who paid (one person gets the whole total unless amounts are typed),
 * and how the bill is divided. The total comes from the bill, not from the form.
 */
export function parseCloseForm(formData: FormData, totalCents: number, payersFixed: boolean): CloseBillInput {
  const kind = String(formData.get("division") ?? "marks");

  let division: BillDivision;
  if (kind === "equal") {
    division = { kind: "equal", personIds: formData.getAll("sharePerson").map(String) };
  } else if (kind === "exact") {
    const ids = formData.getAll("shareId").map(String);
    division = {
      kind: "exact",
      shares: ids.flatMap((id) => {
        const amount = moneyField(formData, `share_${id}`);
        return amount === null ? [] : [{ personId: id, amountCents: amount }];
      }),
    };
  } else if (kind === "marks") {
    division = { kind: "marks" };
  } else {
    throw new DomainError("invalid_division", "Escolha como dividir a conta.");
  }

  const target = String(formData.get("leftover") ?? "spread");
  const leftover: Leftover = target === "spread" ? { mode: "spread" } : { mode: "transfer", personId: target };
  if (payersFixed) {
    return { division, leftover };
  }

  const ids = formData.getAll("payer").map(String);
  const payers = ids.map((id) => ({ personId: id, amountCents: moneyField(formData, `paid_${id}`) ?? (ids.length === 1 ? totalCents : 0) }));
  return { payers, division, leftover };
}
