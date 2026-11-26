import { DomainError } from "./domain-error";
import { Fraction } from "./fraction";
import type { Cents } from "./money";

export type Weight = {
  participantId: string;
  weight: Fraction;
};

/**
 * Splits a total in cents proportionally to the given weights.
 *
 * Each participant receives the floor of its exact proportional amount. The
 * indivisible cents left over are assigned one by one, in order, to the
 * leftover receivers (the payers of the expense), so the sum of all shares is
 * always exactly the total.
 */
export function allocateProportionally(
  totalCents: Cents,
  weights: Weight[],
  leftoverReceivers: string[],
): Map<string, Cents> {
  if (weights.length === 0) {
    throw new DomainError("no_participants", "O rateio precisa de pelo menos um participante.");
  }
  if (leftoverReceivers.length === 0) {
    throw new DomainError("no_payers", "O rateio precisa saber quem pagou a despesa.");
  }

  let totalWeight = Fraction.ZERO;
  for (const { weight } of weights) {
    if (weight.numerator < 0n) {
      throw new DomainError("invalid_weight", "O peso de um participante não pode ser negativo.");
    }
    totalWeight = totalWeight.add(weight);
  }
  if (!totalWeight.isPositive()) {
    throw new DomainError("invalid_weight", "A soma dos pesos do rateio precisa ser positiva.");
  }

  const shares = new Map<string, Cents>();
  let allocated = 0n;
  const total = BigInt(totalCents);
  for (const { participantId, weight } of weights) {
    // total * (weight / totalWeight), rounded down.
    const numerator = total * weight.numerator * totalWeight.denominator;
    const denominator = weight.denominator * totalWeight.numerator;
    const share = numerator / denominator;
    shares.set(participantId, (shares.get(participantId) ?? 0) + Number(share));
    allocated += share;
  }

  let leftover = Number(total - allocated);
  let index = 0;
  while (leftover > 0) {
    const receiver = leftoverReceivers[index % leftoverReceivers.length] as string;
    shares.set(receiver, (shares.get(receiver) ?? 0) + 1);
    leftover -= 1;
    index += 1;
  }

  return shares;
}
