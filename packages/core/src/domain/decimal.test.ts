import {
  approxEqual,
  fromScaled,
  multiplyExact,
  round,
  safeDivide,
  subtractExact,
  sumExact,
  toNumber,
  toScaled,
} from "../domain/decimal";

describe("decimal helpers", () => {
  it("parses decimal strings and numbers", () => {
    expect(toNumber("1.25")).toBe(1.25);
    expect(toNumber(42)).toBe(42);
    expect(toNumber("")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });

  it("avoids binary floating point drift on addition", () => {
    // The classic: 0.1 + 0.2 === 0.30000000000000004 in IEEE 754.
    expect(sumExact([0.1, 0.2])).toBe(0.3);
    expect(sumExact([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumExact([1.005, 2.005])).toBe(3.01);
  });

  it("sums large lists without drift", () => {
    const values = Array.from({ length: 1000 }, () => 0.01);
    expect(sumExact(values)).toBe(10);
  });

  it("ignores null and undefined entries when summing", () => {
    expect(sumExact([1, null, 2, undefined, "3"])).toBe(6);
  });

  it("multiplies exactly", () => {
    expect(multiplyExact(0.1, 3)).toBe(0.3);
    expect(multiplyExact(1.1, 1.1)).toBeCloseTo(1.21, 12);
    expect(multiplyExact(100, 1.5)).toBe(150);
  });

  it("subtracts exactly", () => {
    expect(subtractExact(0.3, 0.1)).toBe(0.2);
    expect(subtractExact(5, 10)).toBe(-5);
  });

  it("round-trips through the scaled representation", () => {
    for (const v of [0, 1, -1, 0.1, -0.1, 1234.5678, 1e-6, -98765.4321]) {
      expect(approxEqual(fromScaled(toScaled(v)), v, 1e-9)).toBe(true);
    }
  });

  it("rejects non-finite values when scaling", () => {
    expect(() => toScaled(NaN)).toThrow();
    expect(() => toScaled(Infinity)).toThrow();
  });

  it("rounds half away from zero at the given precision", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(2.5, 0)).toBe(3);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(1.23456789, 4)).toBe(1.2346);
  });

  it("returns null from safeDivide on zero or invalid denominators", () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(10, 0)).toBeNull();
    expect(safeDivide(0, 0)).toBeNull();
    expect(safeDivide(NaN, 2)).toBeNull();
    expect(safeDivide(10, Infinity)).toBeNull();
  });
});
