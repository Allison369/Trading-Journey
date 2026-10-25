/**
 * Formatting.
 *
 * One rule governs this file: **an undefined figure is shown as N/A, never as
 * zero.** A zero is a fact about the trader's performance; N/A is the absence
 * of one. Conflating them is how a journal tells someone their win rate is 0%
 * when they simply have not closed a trade yet.
 */

import { formatCurrency, type CurrencyCode } from "@tradevault/core";

export const NA = "N/A";

/** Money, or N/A when the value is undefined. */
export function money(
  value: number | null | undefined,
  currency: CurrencyCode | string,
  options: { signed?: boolean } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const formatted = formatCurrency(value, currency as CurrencyCode);
  if (options.signed && value > 0) return `+${formatted}`;
  return formatted;
}

/** A plain number, or N/A. */
export function num(
  value: number | null | undefined,
  options: { decimals?: number } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const decimals = options.decimals ?? 2;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** A percentage, or N/A. `value` is a fraction (0.8 -> "80.0%"). */
export function pct(
  value: number | null | undefined,
  options: { decimals?: number; signed?: boolean } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const decimals = options.decimals ?? 1;
  const text = `${(value * 100).toFixed(decimals)}%`;
  return options.signed && value > 0 ? `+${text}` : text;
}

/** An R multiple, or N/A. Always signed and suffixed. */
export function rMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

/**
 * A duration in words, or N/A.
 *
 * Given in milliseconds; negative or non-finite input is treated as absent
 * rather than shown as a nonsense figure.
 */
export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return NA;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/** A short date like "12 Feb 2026". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return NA;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return NA;
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A date and time like "12 Feb 2026, 08:05". */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return NA;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return NA;
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The colour a signed value should be drawn in.
 *
 * Green for profit, red for loss, neutral for exactly zero. Returned as a
 * token name so the caller decides how to apply it.
 */
export function signTone(value: number | null | undefined): "profit" | "loss" | "neutral" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return "neutral";
  }
  return value > 0 ? "profit" : "loss";
}
