/**
 * Decimal helpers.
 *
 * Financial maths must not drift. Values are stored as strings/decimals and
 * arithmetic is done on scaled BigInts where exactness matters, avoiding the
 * classic 0.1 + 0.2 !== 0.3 problem.
 */

import type { Decimal } from "./types";

const SCALE = 1_000_000_000_000n; // 12 decimal places
const SCALE_NUM = 1e12;

/** Parse a decimal-ish input into a finite number, or null. */
export function toNumber(value: Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse and default to 0 — used for costs which are frequently omitted. */
export function toNumberOrZero(value: Decimal | number | null | undefined): number {
  return toNumber(value) ?? 0;
}

/** Convert to a scaled BigInt for exact arithmetic (half away from zero). */
export function toScaled(value: number): bigint {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot scale non-finite number: ${value}`);
  }
  const negative = value < 0;
  const abs = Math.abs(value);
  const rounded = Math.round(abs * SCALE_NUM);
  const big = BigInt(rounded);
  return negative ? -big : big;
}

/** Convert a scaled BigInt back to a number. */
export function fromScaled(value: bigint): number {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const result = Number(whole) + Number(frac) / SCALE_NUM;
  return negative ? -result : result;
}

/** Exact addition of a list of decimal values. */
export function sumExact(values: Array<Decimal | number | null | undefined>): number {
  let acc = 0n;
  for (const v of values) {
    const n = toNumber(v);
    if (n === null) continue;
    acc += toScaled(n);
  }
  return fromScaled(acc);
}

/** Exact multiplication. */
export function multiplyExact(a: number, b: number): number {
  return fromScaled((toScaled(a) * toScaled(b)) / SCALE);
}

/** Exact subtraction a - b. */
export function subtractExact(a: number, b: number): number {
  return fromScaled(toScaled(a) - toScaled(b));
}

/** Round to N decimal places, half away from zero, exactly. Display only. */
export function round(value: number, places: number): number {
  if (!Number.isFinite(value)) return value;
  // Use the scaled integer path so that values like 1.005 (which are slightly
  // below the half-way point as IEEE 754 doubles) round as a human expects.
  const scaled = toScaled(value);
  const divisor = 10n ** BigInt(12 - places);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const quotient = abs / divisor;
  const remainder = abs % divisor;
  // Half away from zero on the exact remainder.
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  const result = Number(rounded) / Math.pow(10, places);
  return negative ? -result : result;
}

/** Compare decimals for equality within a magnitude-relative tolerance. */
export function approxEqual(a: number, b: number, epsilon = 1e-9): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= epsilon * scale;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Safe division returning null instead of Infinity/NaN. */
export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}
