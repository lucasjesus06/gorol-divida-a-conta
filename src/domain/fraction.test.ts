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

describe("Fraction.parse e toText", () => {
  it.each([
    ["2", 2n, 1n],
    ["0,5", 1n, 2n],
    ["1.25", 5n, 4n],
    ["1/3", 1n, 3n],
    [" 2/4 ", 1n, 2n],
  ])("lê %j", (text, numerator, denominator) => {
    const fraction = Fraction.parse(text);
    expect([fraction.numerator, fraction.denominator]).toEqual([numerator, denominator]);
  });

  it.each(["", "abc", "-1", "1/0", "1,2345", "1/"])("recusa %j", (text) => {
    expect(() => Fraction.parse(text)).toThrow();
  });

  it("escreve inteiro sem barra e fração com barra", () => {
    expect(Fraction.of(3).toText()).toBe("3");
    expect(Fraction.of(2, 6).toText()).toBe("1/3");
  });
});
