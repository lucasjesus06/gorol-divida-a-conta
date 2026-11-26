import { describe, expect, it } from "vitest";
import { Fraction } from "./fraction";
import { anExpense } from "@/test/expense-fixtures";
import {
  claimItem,
  openConsumptionBill,
  releaseItem,
  remainingQuantity,
  toItemizedSplit,
  unclaimedItems,
} from "./consumption-bill";

const receipt = () =>
  openConsumptionBill({
    source: "receipt",
    serviceChargeCents: 700,
    discountCents: 0,
    items: [
      { id: "beer", description: "Cerveja", totalCents: 3000, quantity: Fraction.of(3) },
      { id: "portion", description: "Porção", totalCents: 4000, quantity: Fraction.of(1) },
    ],
  });

describe("consumption bill — cada um paga o que consumiu", () => {
  it("is only available when the bill has items", () => {
    expect(() =>
      openConsumptionBill({ source: "manual", items: [], serviceChargeCents: 0, discountCents: 0 }),
    ).toThrow("precisa ter os itens");
  });

  it("lets each participant mark what they consumed and becomes the expense split", () => {
    let bill = receipt();
    bill = claimItem(bill, "beer", "aghata", Fraction.of(2));
    bill = claimItem(bill, "beer", "lucasBranco", Fraction.of(1));
    bill = claimItem(bill, "portion", "lucasBranco", Fraction.of(1, 2));
    bill = claimItem(bill, "portion", "lucasPreto", Fraction.of(1, 2));

    const expense = anExpense({
      totalCents: 7700,
      payers: [{ participantId: "aghata", amountCents: 7700 }],
      split: toItemizedSplit(bill),
    });
    // R$ 70 of items + R$ 7 of service, proportional to consumption.
    expect(Object.fromEntries(expense.shares)).toEqual({
      aghata: 2200,
      lucasBranco: 3300,
      lucasPreto: 2200,
    });
  });

  it("does not let anyone mark more than what is left on the receipt", () => {
    const bill = claimItem(receipt(), "beer", "aghata", Fraction.of(2));
    expect(remainingQuantity(bill, "beer").equals(Fraction.of(1))).toBe(true);
    expect(() => claimItem(bill, "beer", "lucas", Fraction.of(2))).toThrow("Não sobrou");
  });

  it("lets a participant change or remove their own mark", () => {
    let bill = claimItem(receipt(), "beer", "aghata", Fraction.of(3));
    bill = claimItem(bill, "beer", "aghata", Fraction.of(2));
    expect(remainingQuantity(bill, "beer").equals(Fraction.of(1))).toBe(true);
    bill = releaseItem(bill, "beer", "aghata");
    expect(remainingQuantity(bill, "beer").equals(Fraction.of(3))).toBe(true);
  });

  it("cannot close while some item has no one marked", () => {
    const bill = claimItem(receipt(), "beer", "aghata", Fraction.of(3));
    expect(unclaimedItems(bill).map((item) => item.id)).toEqual(["portion"]);
    expect(() => toItemizedSplit(bill)).toThrow("Porção");
  });
});
