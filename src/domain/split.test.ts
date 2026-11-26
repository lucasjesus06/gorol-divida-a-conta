import { describe, expect, it } from "vitest";
import { Fraction } from "./fraction";
import { computeShares, payersByLargestPayment, type ExpenseItem } from "./split";

describe("computeShares — equal split", () => {
  it("splits R$ 200 paid by João among four people into R$ 50 each", () => {
    const shares = computeShares(
      20000,
      { method: "equal", participantIds: ["joao", "maria", "pedro", "lucas"] },
      [{ participantId: "joao", amountCents: 20000 }],
    );
    expect(Object.fromEntries(shares)).toEqual({
      joao: 5000,
      maria: 5000,
      pedro: 5000,
      lucas: 5000,
    });
  });

  it("keeps the extra cent of R$ 100 / 3 with whoever paid", () => {
    const shares = computeShares(
      10000,
      { method: "equal", participantIds: ["ana", "bia", "caio"] },
      [{ participantId: "caio", amountCents: 10000 }],
    );
    expect(Object.fromEntries(shares)).toEqual({ ana: 3333, bia: 3333, caio: 3334 });
  });

  it("spreads leftover cents among payers, largest payment first", () => {
    const shares = computeShares(
      50000,
      { method: "equal", participantIds: ["gustavo", "hyago", "maria"] },
      [
        { participantId: "hyago", amountCents: 20000 },
        { participantId: "gustavo", amountCents: 30000 },
      ],
    );
    // R$ 500 / 3 leaves 2 cents: one for Gustavo (paid more), then one for Hyago.
    expect(Object.fromEntries(shares)).toEqual({ gustavo: 16667, hyago: 16667, maria: 16666 });
  });

  it("rejects a participant listed twice", () => {
    expect(() =>
      computeShares(1000, { method: "equal", participantIds: ["a", "a"] }, [
        { participantId: "a", amountCents: 1000 },
      ]),
    ).toThrow("mais de uma vez");
  });
});

describe("computeShares — exact amounts", () => {
  it("uses the informed amounts when they add up to the total", () => {
    const shares = computeShares(
      30000,
      {
        method: "exact",
        shares: [
          { participantId: "ana", amountCents: 10000 },
          { participantId: "bia", amountCents: 20000 },
        ],
      },
      [{ participantId: "ana", amountCents: 30000 }],
    );
    expect(Object.fromEntries(shares)).toEqual({ ana: 10000, bia: 20000 });
  });

  it("rejects amounts that do not add up to the total", () => {
    expect(() =>
      computeShares(
        30000,
        { method: "exact", shares: [{ participantId: "ana", amountCents: 10000 }] },
        [{ participantId: "ana", amountCents: 30000 }],
      ),
    ).toThrow("diferente do total");
  });
});

describe("computeShares — itemized", () => {
  const beer: ExpenseItem = {
    id: "beer",
    description: "Cerveja",
    totalCents: 3000,
    quantity: Fraction.of(3),
    consumption: [
      { participantId: "aghata", quantity: Fraction.of(2) },
      { participantId: "lucasBranco", quantity: Fraction.of(1) },
    ],
  };
  const portion: ExpenseItem = {
    id: "portion",
    description: "Porção",
    totalCents: 4000,
    quantity: Fraction.of(1),
    consumption: [
      { participantId: "lucasBranco", quantity: Fraction.of(1, 2) },
      { participantId: "lucasPreto", quantity: Fraction.of(1, 2) },
    ],
  };

  it("charges each person for the items they picked", () => {
    const shares = computeShares(
      7000,
      { method: "itemized", items: [beer, portion], serviceChargeCents: 0, discountCents: 0 },
      [{ participantId: "aghata", amountCents: 7000 }],
    );
    // Aghata: 2 beers. Lucas Branco: 1 beer + half portion. Lucas Preto: half portion.
    expect(Object.fromEntries(shares)).toEqual({
      aghata: 2000,
      lucasBranco: 3000,
      lucasPreto: 2000,
    });
  });

  it("spreads the 10% service charge proportionally to consumption", () => {
    // Prototype scenario: Bia had half a picanha and one caipirinha and paid R$ 73,15.
    const picanha: ExpenseItem = {
      id: "picanha",
      description: "Picanha na Chapa",
      totalCents: 8900,
      quantity: Fraction.of(1),
      consumption: [
        { participantId: "bia", quantity: Fraction.of(1, 2) },
        { participantId: "lucas", quantity: Fraction.of(1, 2) },
      ],
    };
    const caipirinha: ExpenseItem = {
      id: "caipirinha",
      description: "Caipirinha de Limão",
      totalCents: 6600,
      quantity: Fraction.of(3),
      consumption: [
        { participantId: "bia", quantity: Fraction.of(1) },
        { participantId: "maria", quantity: Fraction.of(1) },
        { participantId: "joao", quantity: Fraction.of(1) },
      ],
    };
    const shares = computeShares(
      17050,
      {
        method: "itemized",
        items: [picanha, caipirinha],
        serviceChargeCents: 1550,
        discountCents: 0,
      },
      [{ participantId: "lucas", amountCents: 17050 }],
    );
    expect(shares.get("bia")).toBe(7315);
    expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(17050);
  });

  it("shares a portion among three people without losing a cent", () => {
    const shared: ExpenseItem = {
      id: "portion",
      description: "Porção",
      totalCents: 3800,
      quantity: Fraction.of(1),
      consumption: [
        { participantId: "a", quantity: Fraction.of(1, 3) },
        { participantId: "b", quantity: Fraction.of(1, 3) },
        { participantId: "c", quantity: Fraction.of(1, 3) },
      ],
    };
    const shares = computeShares(
      3800,
      { method: "itemized", items: [shared], serviceChargeCents: 0, discountCents: 0 },
      [{ participantId: "b", amountCents: 3800 }],
    );
    expect(Object.fromEntries(shares)).toEqual({ a: 1266, b: 1268, c: 1266 });
  });

  it("rejects an item whose consumption does not match the receipt quantity", () => {
    const incomplete: ExpenseItem = { ...beer, consumption: [beer.consumption[0]!] };
    expect(() =>
      computeShares(
        3000,
        { method: "itemized", items: [incomplete], serviceChargeCents: 0, discountCents: 0 },
        [{ participantId: "aghata", amountCents: 3000 }],
      ),
    ).toThrow("não fecha");
  });

  it("rejects items whose total differs from the expense total", () => {
    expect(() =>
      computeShares(
        9999,
        { method: "itemized", items: [beer], serviceChargeCents: 0, discountCents: 0 },
        [{ participantId: "aghata", amountCents: 9999 }],
      ),
    ).toThrow("diferente do total");
  });
});

describe("payersByLargestPayment", () => {
  it("orders by amount and keeps the original order on ties", () => {
    expect(
      payersByLargestPayment([
        { participantId: "a", amountCents: 100 },
        { participantId: "b", amountCents: 300 },
        { participantId: "c", amountCents: 100 },
      ]),
    ).toEqual(["b", "a", "c"]);
  });
});
