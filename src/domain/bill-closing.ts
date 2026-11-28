import { DomainError } from "./domain-error";
import { assertPayersAllowed, assertPeopleInOuting } from "./expense-access";
import { Fraction } from "./fraction";
import { formatCents, type Cents } from "./money";
import type { BillMode } from "./bill-status";
import type { Payer, SplitRule } from "./split";

export const MAX_ITEM_DESCRIPTION = 120;

export type BillItemInput = { description: string; totalCents: Cents; quantity: string };

/** An item typed while the bill is open: a name, what it cost and how many there were. */
export function validateBillItem(input: BillItemInput): { description: string; totalCents: Cents; quantity: Fraction } {
  const description = input.description.trim().replace(/\s+/g, " ");
  if (description === "") {
    throw new DomainError("item_description_required", "Dê um nome ao item.");
  }
  if (description.length > MAX_ITEM_DESCRIPTION) {
    throw new DomainError("item_description_too_long", `O nome do item pode ter no máximo ${MAX_ITEM_DESCRIPTION} caracteres.`);
  }
  if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
    throw new DomainError("item_total_invalid", "O valor do item precisa ser maior que zero.");
  }
  const quantity = Fraction.parse(input.quantity.trim() === "" ? "1" : input.quantity);
  if (!quantity.isPositive()) {
    throw new DomainError("invalid_quantity", "A quantidade do item precisa ser positiva.");
  }
  return { description, totalCents: input.totalCents, quantity };
}

/** The value typed for a direct bill. */
export function validateDirectTotal(totalCents: Cents): Cents {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new DomainError("direct_total_invalid", "Informe o valor da conta, maior que zero.");
  }
  return totalCents;
}

/** What the bill costs: the typed total, or the items plus the service charge minus the discount. */
export function billTotalCents(input: {
  mode: BillMode;
  directTotalCents: Cents | null;
  itemCents: Cents[];
  serviceChargeCents: Cents;
  discountCents: Cents;
}): Cents {
  if (input.mode === "direct") {
    return validateDirectTotal(input.directTotalCents ?? 0);
  }
  if (input.itemCents.length === 0) {
    throw new DomainError("no_items", "A conta ainda não tem itens. Adicione ao menos um.");
  }
  const total = input.itemCents.reduce((sum, cents) => sum + cents, 0) + input.serviceChargeCents - input.discountCents;
  if (total <= 0) {
    throw new DomainError("bill_total_invalid", "O total da conta precisa ser maior que zero.");
  }
  return total;
}

/** How the bill is divided when it is closed. */
export type BillDivision =
  | { kind: "marks" }
  | { kind: "equal"; personIds: string[] }
  | { kind: "exact"; shares: { personId: string; amountCents: Cents }[] };

export type ClosingPlan = {
  payers: Payer[];
  /** Null when each person pays what they marked (the split comes from the marks). */
  split: Extract<SplitRule, { method: "equal" | "exact" }> | null;
};

function unique(ids: string[], message: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new DomainError("duplicated_person", message);
  }
}

/**
 * Checks who paid and how the bill is divided, at the moment it is closed. Nothing about this is
 * asked while the bill is open: people only type what was consumed.
 */
export function planBillClosing(input: {
  mode: BillMode;
  totalCents: Cents;
  payers: Payer[];
  division: BillDivision;
  allowedPayerIds: Set<string>;
  participantIds: Set<string>;
}): ClosingPlan {
  if (input.payers.length === 0) {
    throw new DomainError("payers_required", "Informe quem pagou a conta.");
  }
  unique(input.payers.map((payer) => payer.participantId), "Uma pessoa aparece mais de uma vez entre quem pagou.");
  for (const payer of input.payers) {
    if (!Number.isInteger(payer.amountCents) || payer.amountCents <= 0) {
      throw new DomainError("payer_amount_invalid", "Cada pagamento precisa ser maior que zero.");
    }
  }
  const paid = input.payers.reduce((sum, payer) => sum + payer.amountCents, 0);
  if (paid !== input.totalCents) {
    throw new DomainError(
      "payers_total_mismatch",
      `A soma dos pagamentos (${formatCents(paid)}) é diferente do total da conta (${formatCents(input.totalCents)}).`,
    );
  }
  assertPayersAllowed(input.payers, input.allowedPayerIds);
  assertPeopleInOuting(new Set(input.payers.map((payer) => payer.participantId)), input.participantIds);

  const { division } = input;
  switch (division.kind) {
    case "marks":
      if (input.mode !== "detailed") {
        throw new DomainError("marks_need_items", "Só dá para dividir pelo que cada um consumiu quando a conta tem itens.");
      }
      return { payers: input.payers, split: null };
    case "equal": {
      if (division.personIds.length === 0) {
        throw new DomainError("division_people_required", "Escolha quem divide a conta.");
      }
      unique(division.personIds, "Uma pessoa aparece mais de uma vez na divisão.");
      assertPeopleInOuting(new Set(division.personIds), input.participantIds);
      return { payers: input.payers, split: { method: "equal", participantIds: division.personIds } };
    }
    case "exact": {
      if (division.shares.length === 0) {
        throw new DomainError("division_people_required", "Escolha quem divide a conta.");
      }
      unique(division.shares.map((share) => share.personId), "Uma pessoa aparece mais de uma vez na divisão.");
      for (const share of division.shares) {
        if (!Number.isInteger(share.amountCents) || share.amountCents < 0) {
          throw new DomainError("share_amount_invalid", "Cada parte precisa ser zero ou mais.");
        }
      }
      const shared = division.shares.reduce((sum, share) => sum + share.amountCents, 0);
      if (shared !== input.totalCents) {
        throw new DomainError(
          "shares_total_mismatch",
          `A soma das partes (${formatCents(shared)}) é diferente do total da conta (${formatCents(input.totalCents)}).`,
        );
      }
      assertPeopleInOuting(new Set(division.shares.map((share) => share.personId)), input.participantIds);
      return {
        payers: input.payers,
        split: { method: "exact", shares: division.shares.map((share) => ({ participantId: share.personId, amountCents: share.amountCents })) },
      };
    }
  }
}
