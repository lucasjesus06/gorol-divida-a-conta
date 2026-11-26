import { describe, expect, it } from "vitest";
import { Fraction } from "./fraction";
import { allocateProportionally } from "./allocation";

const equalWeights = (...ids: string[]) =>
  ids.map((participantId) => ({ participantId, weight: Fraction.of(1) }));

describe("allocateProportionally", () => {
  it("gives the indivisible cent to the payer", () => {
    const shares = allocateProportionally(10000, equalWeights("ana", "bia", "caio"), ["bia"]);
    expect(Object.fromEntries(shares)).toEqual({ ana: 3333, bia: 3334, caio: 3333 });
  });

  it("charges the leftover cent to a payer who is not a participant", () => {
    const shares = allocateProportionally(10000, equalWeights("ana", "bia", "caio"), ["dani"]);
    expect(Object.fromEntries(shares)).toEqual({ ana: 3333, bia: 3333, caio: 3333, dani: 1 });
  });

  it("spreads several leftover cents among payers in order", () => {
    const shares = allocateProportionally(100, equalWeights("a", "b", "c", "d", "e", "f", "g"), [
      "a",
      "b",
    ]);
    // 100 / 7 = 14 each, 2 cents left: one for each payer.
    expect(shares.get("a")).toBe(15);
    expect(shares.get("b")).toBe(15);
    expect(shares.get("c")).toBe(14);
  });

  it("always sums exactly to the total", () => {
    for (let total = 1; total <= 2000; total += 7) {
      const shares = allocateProportionally(
        total,
        [
          { participantId: "a", weight: Fraction.of(1, 3) },
          { participantId: "b", weight: Fraction.of(2, 7) },
          { participantId: "c", weight: Fraction.of(5) },
        ],
        ["c"],
      );
      expect([...shares.values()].reduce((sum, value) => sum + value, 0)).toBe(total);
    }
  });

  it("requires a payer to receive leftover cents", () => {
    expect(() => allocateProportionally(100, equalWeights("a"), [])).toThrow("quem pagou");
  });
});
