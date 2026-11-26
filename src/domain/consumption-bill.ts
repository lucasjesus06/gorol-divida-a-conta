import { DomainError } from "./domain-error";
import { Fraction } from "./fraction";
import {
  assertNonNegativeCents,
  assertPositiveCents,
  type Cents,
} from "./money";
import type { SplitRule } from "./split";

/** Where the item list came from: read from the NFC-e receipt or typed by hand. */
export type ItemSource = "receipt" | "manual";

export type BillItem = {
  id: string;
  description: string;
  totalCents: Cents;
  quantity: Fraction;
};

/**
 * Items of a bill waiting for each participant to mark what they consumed
 * ("cada um paga o que consumiu"). Once every item is fully claimed it becomes
 * an itemized split for the expense.
 */
export type ConsumptionBill = {
  source: ItemSource;
  items: BillItem[];
  serviceChargeCents: Cents;
  discountCents: Cents;
  /** itemId → participantId → quantity claimed. */
  claims: Map<string, Map<string, Fraction>>;
};

export function openConsumptionBill(input: {
  source: ItemSource;
  items: BillItem[];
  serviceChargeCents: Cents;
  discountCents: Cents;
}): ConsumptionBill {
  if (input.items.length === 0) {
    throw new DomainError(
      "no_items",
      "Para cada um pagar o que consumiu, a conta precisa ter os itens (notinha ou digitados).",
    );
  }
  const ids = new Set<string>();
  for (const item of input.items) {
    if (ids.has(item.id)) {
      throw new DomainError("duplicated_item", "Um item aparece mais de uma vez.");
    }
    ids.add(item.id);
    assertPositiveCents(item.totalCents, `O valor do item "${item.description}"`);
    if (!item.quantity.isPositive()) {
      throw new DomainError(
        "invalid_quantity",
        `A quantidade do item "${item.description}" precisa ser positiva.`,
      );
    }
  }
  assertNonNegativeCents(input.serviceChargeCents, "A taxa de serviço");
  assertNonNegativeCents(input.discountCents, "O desconto");
  return { ...input, claims: new Map() };
}

/**
 * Sets how much of an item a participant consumed (replacing a previous mark).
 * Nobody can claim more than what is left on the receipt.
 */
export function claimItem(
  bill: ConsumptionBill,
  itemId: string,
  participantId: string,
  quantity: Fraction,
): ConsumptionBill {
  const item = findItem(bill, itemId);
  if (!quantity.isPositive()) {
    throw new DomainError("invalid_quantity", "A quantidade consumida precisa ser positiva.");
  }
  const available = remainingQuantity(bill, itemId).add(claimedBy(bill, itemId, participantId));
  if (quantity.compare(available) > 0) {
    throw new DomainError(
      "item_over_claimed",
      `Não sobrou essa quantidade de "${item.description}" para marcar.`,
    );
  }
  const claims = new Map(bill.claims);
  const itemClaims = new Map(claims.get(itemId));
  itemClaims.set(participantId, quantity);
  claims.set(itemId, itemClaims);
  return { ...bill, claims };
}

export function releaseItem(
  bill: ConsumptionBill,
  itemId: string,
  participantId: string,
): ConsumptionBill {
  findItem(bill, itemId);
  const claims = new Map(bill.claims);
  const itemClaims = new Map(claims.get(itemId));
  itemClaims.delete(participantId);
  claims.set(itemId, itemClaims);
  return { ...bill, claims };
}

/** How much of the item nobody marked yet. */
export function remainingQuantity(bill: ConsumptionBill, itemId: string): Fraction {
  const item = findItem(bill, itemId);
  let claimed = Fraction.ZERO;
  for (const quantity of bill.claims.get(itemId)?.values() ?? []) {
    claimed = claimed.add(quantity);
  }
  return item.quantity.subtract(claimed);
}

export function unclaimedItems(bill: ConsumptionBill): BillItem[] {
  return bill.items.filter((item) => !remainingQuantity(bill, item.id).isZero());
}

/** Turns a fully claimed bill into the itemized split of the expense. */
export function toItemizedSplit(bill: ConsumptionBill): SplitRule {
  const pending = unclaimedItems(bill);
  if (pending.length > 0) {
    throw new DomainError(
      "items_not_fully_claimed",
      `Ainda falta marcar quem consumiu: ${pending.map((item) => item.description).join(", ")}.`,
    );
  }
  return {
    method: "itemized",
    serviceChargeCents: bill.serviceChargeCents,
    discountCents: bill.discountCents,
    items: bill.items.map((item) => ({
      ...item,
      consumption: [...(bill.claims.get(item.id) ?? new Map<string, Fraction>())].map(
        ([participantId, quantity]) => ({ participantId, quantity }),
      ),
    })),
  };
}

function claimedBy(bill: ConsumptionBill, itemId: string, participantId: string): Fraction {
  return bill.claims.get(itemId)?.get(participantId) ?? Fraction.ZERO;
}

function findItem(bill: ConsumptionBill, itemId: string): BillItem {
  const item = bill.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new DomainError("item_not_found", "Item não encontrado nesta conta.");
  }
  return item;
}
