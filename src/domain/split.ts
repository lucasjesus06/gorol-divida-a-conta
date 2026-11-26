import { DomainError } from "./domain-error";
import { Fraction } from "./fraction";
import {
  assertNonNegativeCents,
  assertPositiveCents,
  sumCents,
  type Cents,
} from "./money";
import { allocateProportionally, type Weight } from "./allocation";

export type Payer = {
  participantId: string;
  amountCents: Cents;
};

export type ItemConsumption = {
  participantId: string;
  /** Portion of the item's quantity consumed, e.g. 2 beers or 1/3 of a portion. */
  quantity: Fraction;
};

export type ExpenseItem = {
  id: string;
  description: string;
  totalCents: Cents;
  quantity: Fraction;
  consumption: ItemConsumption[];
};

/** How the expense total is divided among participants, chosen by the rolê admin. */
export type SplitRule =
  | { method: "equal"; participantIds: string[] }
  | { method: "exact"; shares: Array<{ participantId: string; amountCents: Cents }> }
  | {
      method: "itemized";
      items: ExpenseItem[];
      serviceChargeCents: Cents;
      discountCents: Cents;
    };

/**
 * Computes how much of the expense each participant takes on.
 * The result always sums exactly to the expense total; indivisible cents
 * stay with whoever paid the expense (largest payment first).
 */
export function computeShares(
  totalCents: Cents,
  rule: SplitRule,
  payers: Payer[],
): Map<string, Cents> {
  assertPositiveCents(totalCents, "O total da despesa");
  const leftoverReceivers = payersByLargestPayment(payers);

  switch (rule.method) {
    case "equal":
      return splitEqually(totalCents, rule.participantIds, leftoverReceivers);
    case "exact":
      return splitByExactAmounts(totalCents, rule.shares);
    case "itemized":
      return splitByItems(totalCents, rule, leftoverReceivers);
  }
}

function splitEqually(
  totalCents: Cents,
  participantIds: string[],
  leftoverReceivers: string[],
): Map<string, Cents> {
  assertUnique(participantIds);
  const weights: Weight[] = participantIds.map((participantId) => ({
    participantId,
    weight: Fraction.of(1),
  }));
  return allocateProportionally(totalCents, weights, leftoverReceivers);
}

function splitByExactAmounts(
  totalCents: Cents,
  shares: Array<{ participantId: string; amountCents: Cents }>,
): Map<string, Cents> {
  if (shares.length === 0) {
    throw new DomainError("no_participants", "O rateio precisa de pelo menos um participante.");
  }
  assertUnique(shares.map((share) => share.participantId));
  for (const share of shares) {
    assertNonNegativeCents(share.amountCents, "O valor de cada participante");
  }
  const informed = sumCents(shares.map((share) => share.amountCents));
  if (informed !== totalCents) {
    throw new DomainError(
      "split_total_mismatch",
      `A soma dos valores informados (${informed}) é diferente do total da despesa (${totalCents}).`,
    );
  }
  return new Map(shares.map((share) => [share.participantId, share.amountCents]));
}

function splitByItems(
  totalCents: Cents,
  rule: Extract<SplitRule, { method: "itemized" }>,
  leftoverReceivers: string[],
): Map<string, Cents> {
  if (rule.items.length === 0) {
    throw new DomainError("no_items", "O rateio por itens precisa de pelo menos um item.");
  }
  assertNonNegativeCents(rule.serviceChargeCents, "A taxa de serviço");
  assertNonNegativeCents(rule.discountCents, "O desconto");

  const itemsTotal = sumCents(rule.items.map((item) => item.totalCents));
  const expected = itemsTotal + rule.serviceChargeCents - rule.discountCents;
  if (expected !== totalCents) {
    throw new DomainError(
      "split_total_mismatch",
      `Itens + taxa de serviço - desconto (${expected}) é diferente do total da despesa (${totalCents}).`,
    );
  }

  // Each participant's weight is the value of what they consumed. Allocating the
  // grand total by these weights makes service charge and discount proportional
  // to consumption.
  const consumedValue = new Map<string, Fraction>();
  for (const item of rule.items) {
    assertPositiveCents(item.totalCents, `O valor do item "${item.description}"`);
    if (!item.quantity.isPositive()) {
      throw new DomainError(
        "invalid_quantity",
        `A quantidade do item "${item.description}" precisa ser positiva.`,
      );
    }

    let consumedQuantity = Fraction.ZERO;
    for (const consumption of item.consumption) {
      if (!consumption.quantity.isPositive()) {
        throw new DomainError(
          "invalid_quantity",
          `O consumo do item "${item.description}" precisa ser positivo.`,
        );
      }
      consumedQuantity = consumedQuantity.add(consumption.quantity);
      const value = Fraction.of(item.totalCents)
        .multiply(consumption.quantity)
        .multiply(Fraction.of(item.quantity.denominator, item.quantity.numerator));
      const current = consumedValue.get(consumption.participantId) ?? Fraction.ZERO;
      consumedValue.set(consumption.participantId, current.add(value));
    }

    if (!consumedQuantity.equals(item.quantity)) {
      throw new DomainError(
        "item_not_fully_allocated",
        `O consumo do item "${item.description}" não fecha com a quantidade da nota.`,
      );
    }
  }

  const weights: Weight[] = [...consumedValue].map(([participantId, weight]) => ({
    participantId,
    weight,
  }));
  return allocateProportionally(totalCents, weights, leftoverReceivers);
}

/** Payers ordered by amount paid (largest first), keeping the given order on ties. */
export function payersByLargestPayment(payers: Payer[]): string[] {
  if (payers.length === 0) {
    throw new DomainError("no_payers", "A despesa precisa de pelo menos um pagador.");
  }
  return payers
    .map((payer, index) => ({ payer, index }))
    .sort((a, b) => b.payer.amountCents - a.payer.amountCents || a.index - b.index)
    .map(({ payer }) => payer.participantId);
}

function assertUnique(participantIds: string[]): void {
  if (participantIds.length === 0) {
    throw new DomainError("no_participants", "O rateio precisa de pelo menos um participante.");
  }
  if (new Set(participantIds).size !== participantIds.length) {
    throw new DomainError("duplicated_participant", "Um participante aparece mais de uma vez.");
  }
}
