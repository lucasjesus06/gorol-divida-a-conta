import { DomainError } from "./domain-error";

/**
 * Exact rational number backed by bigint, used for item quantities such as
 * "one third of a portion". Always kept normalized with a positive denominator.
 */
export class Fraction {
  private constructor(
    readonly numerator: bigint,
    readonly denominator: bigint,
  ) {}

  static of(numerator: number | bigint, denominator: number | bigint = 1): Fraction {
    const num = BigInt(numerator);
    const den = BigInt(denominator);
    if (den === 0n) {
      throw new DomainError("invalid_fraction", "O denominador de uma fração não pode ser zero.");
    }
    const sign = den < 0n ? -1n : 1n;
    const divisor = gcd(abs(num), abs(den));
    return new Fraction((sign * num) / divisor, (sign * den) / divisor);
  }

  static readonly ZERO = Fraction.of(0);

  add(other: Fraction): Fraction {
    return Fraction.of(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Fraction): Fraction {
    return this.add(Fraction.of(-other.numerator, other.denominator));
  }

  multiply(other: Fraction): Fraction {
    return Fraction.of(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  /** Negative when this < other, zero when equal, positive when this > other. */
  compare(other: Fraction): number {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  equals(other: Fraction): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  isZero(): boolean {
    return this.numerator === 0n;
  }

  isPositive(): boolean {
    return this.numerator > 0n;
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== 0n) {
    const rest = x % y;
    x = y;
    y = rest;
  }
  return x === 0n ? 1n : x;
}
