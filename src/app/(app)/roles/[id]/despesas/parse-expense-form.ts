import { DomainError } from "@/domain/domain-error";
import { parseMoneyToCents } from "@/domain/money";
import type { ExpenseInput } from "@/server/expenses";

const SAO_PAULO_NOON = "T12:00:00-03:00";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}

function idsWithPrefix(formData: FormData, prefix: string) {
  return [...formData.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
}

export function parseExpenseForm(formData: FormData): ExpenseInput {
  const totalCents = parseMoneyToCents(text(formData, "total"));

  const date = text(formData, "date");
  const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}${SAO_PAULO_NOON}`) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    throw new DomainError("invalid_date", "Informe a data da despesa.");
  }

  const payers =
    text(formData, "payerMode") === "multi"
      ? idsWithPrefix(formData, "payer_")
          .map((personId) => ({ personId, raw: text(formData, `payer_${personId}`).trim() }))
          .filter((payer) => payer.raw !== "")
          .map((payer) => ({ personId: payer.personId, amountCents: parseMoneyToCents(payer.raw) }))
      : [{ personId: text(formData, "payerSingle"), amountCents: totalCents }];

  const method = text(formData, "method");
  const split: ExpenseInput["split"] =
    method === "exact"
      ? {
          method: "exact",
          shares: idsWithPrefix(formData, "share_")
            .map((personId) => ({ personId, raw: text(formData, `share_${personId}`).trim() }))
            .filter((share) => share.raw !== "")
            .map((share) => ({ personId: share.personId, amountCents: parseMoneyToCents(share.raw) })),
        }
      : { method: "equal", personIds: idsWithPrefix(formData, "equal_") };

  return {
    description: text(formData, "description"),
    totalCents,
    payers,
    split,
    occurredAt,
    idempotencyKey: text(formData, "idempotencyKey") || undefined,
  };
}
