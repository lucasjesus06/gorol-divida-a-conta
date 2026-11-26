import { describe, expect, it } from "vitest";
import { Fraction } from "./fraction";

describe("Fraction", () => {
  it("normalizes sign and common factors", () => {
    const value = Fraction.of(2, -6);
    expect(value.numerator).toBe(-1n);
    expect(value.denominator).toBe(3n);
  });

  it("adds thirds exactly", () => {
    const third = Fraction.of(1, 3);
    expect(third.add(third).add(third).equals(Fraction.of(1))).toBe(true);
  });

  it("rejects a zero denominator", () => {
    expect(() => Fraction.of(1, 0)).toThrow("denominador");
  });
});
