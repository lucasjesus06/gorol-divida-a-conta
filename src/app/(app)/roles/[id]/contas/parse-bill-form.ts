import { describeUnderTotal } from "@/domain/bill-document";
import { DomainError } from "@/domain/domain-error";
import { parseMoneyToCents } from "@/domain/money";
import type { BillInput } from "@/server/bills";

const SAO_PAULO_NOON = "T12:00:00-03:00";

function optionalMoney(value: string) {
  return value.trim() === "" ? 0 : parseMoneyToCents(value);
}

export function parseBillDate(formData: FormData): Date {
  const date = String(formData.get("date") ?? "");
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}${SAO_PAULO_NOON}`) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    throw new DomainError("invalid_date", "Informe a data da despesa.");
  }
  return occurredAt;
}

/** Items typed in the form: rows left empty are ignored. */
export function parseItemRows(formData: FormData) {
  const descriptions = formData.getAll("itemDescription").map(String);
  const totals = formData.getAll("itemTotal").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  return descriptions
    .map((description, index) => ({ description: description.trim(), total: (totals[index] ?? "").trim(), quantity: (quantities[index] ?? "").trim() || "1" }))
    .filter((item) => item.description !== "" || item.total !== "")
    .map((item) => ({ description: item.description, totalCents: parseMoneyToCents(item.total), quantity: item.quantity }));
}

/** A new bill: only a value (direct) or a name, with items typed now or later (detailed). Nothing about who paid. */
export function parseBillForm(formData: FormData): BillInput {
  const mode = formData.get("mode") === "direct" ? "direct" : "detailed";
  const base = {
    description: String(formData.get("description") ?? ""),
    occurredAt: parseBillDate(formData),
    idempotencyKey: String(formData.get("idempotencyKey") ?? "") || undefined,
  };
  if (mode === "direct") {
    return { ...base, mode, directTotalCents: parseMoneyToCents(String(formData.get("directTotal") ?? "")) };
  }
  // A card slip gives only the total: what is described cannot pass it, and the rest is added as one line.
  const slipTotal = String(formData.get("slipTotal") ?? "").trim();
  if (slipTotal !== "") {
    return { ...base, mode, items: describeUnderTotal(parseMoneyToCents(slipTotal), parseItemRows(formData)).items };
  }
  return {
    ...base,
    mode,
    items: parseItemRows(formData),
    serviceChargeCents: optionalMoney(String(formData.get("serviceCharge") ?? "")),
    discountCents: optionalMoney(String(formData.get("discount") ?? "")),
  };
}
