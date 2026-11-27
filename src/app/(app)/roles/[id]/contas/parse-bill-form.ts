import { DomainError } from "@/domain/domain-error";
import { parseMoneyToCents } from "@/domain/money";
import type { BillInput } from "@/server/bills";

const SAO_PAULO_NOON = "T12:00:00-03:00";

function optionalMoney(value: string) {
  return value.trim() === "" ? 0 : parseMoneyToCents(value);
}

export function parseBillForm(formData: FormData): BillInput {
  const descriptions = formData.getAll("itemDescription").map(String);
  const totals = formData.getAll("itemTotal").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);

  const items = descriptions
    .map((description, index) => ({ description: description.trim(), total: (totals[index] ?? "").trim(), quantity: (quantities[index] ?? "").trim() || "1" }))
    .filter((item) => item.description !== "" || item.total !== "")
    .map((item) => ({ description: item.description, totalCents: parseMoneyToCents(item.total), quantity: item.quantity }));

  const serviceChargeCents = optionalMoney(String(formData.get("serviceCharge") ?? ""));
  const discountCents = optionalMoney(String(formData.get("discount") ?? ""));
  const total = items.reduce((sum, item) => sum + item.totalCents, 0) + serviceChargeCents - discountCents;

  const date = String(formData.get("date") ?? "");
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}${SAO_PAULO_NOON}`) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    throw new DomainError("invalid_date", "Informe a data da despesa.");
  }

  return {
    description: String(formData.get("description") ?? ""),
    occurredAt,
    serviceChargeCents,
    discountCents,
    items,
    payers: [{ personId: String(formData.get("payer") ?? ""), amountCents: total }],
    idempotencyKey: String(formData.get("idempotencyKey") ?? "") || undefined,
  };
}
