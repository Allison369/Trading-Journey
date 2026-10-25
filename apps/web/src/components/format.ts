/**
 * Display formatting.
 *
 * One rule governs this whole file: **an undefined statistic renders as "N/A",
 * never as 0, "—" or "Infinity".** A zero is a measurement; "N/A" is the honest
 * statement that there is not enough data to measure. Collapsing the two is the
 * single fastest way to mislead someone about their own trading.
 *
 * Numbers are formatted with Intl, so grouping and decimal separators follow
 * the user's locale. Money is always shown with its currency code when the
 * currency is not obvious from context, because combining currencies without
 * saying so is exactly the mistake this app must not make.
 */

import type { CurrencyCode, ISOTimestamp } from "@tradevault/core";

export const NA = "N/A";

/** A number that may be null/undefined. Format it, or say N/A. */
export function fmtNumber(
  value: number | null | undefined,
  options: { decimals?: number; signed?: boolean } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const decimals = options.decimals ?? 2;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  if (options.signed && value > 0) return `+${formatted}`;
  return formatted;
}

/** Money with an explicit currency, e.g. "$1,234.56". */
export function fmtMoney(
  value: number | null | undefined,
  currency: CurrencyCode,
  options: { signed?: boolean } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const sign = options.signed && value > 0 ? "+" : "";
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(value));
    const negative = value < 0 ? "-" : "";
    return `${sign}${negative}${formatted}`;
  } catch {
    return `${sign}${value.toFixed(2)} ${currency}`;
  }
}

/** Currency with a leading code, for when several currencies share a column. */
export function fmtMoneyWithCode(
  value: number | null | undefined,
  currency: CurrencyCode
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  return `${currency} ${fmtNumber(value, { decimals: 2 })}`;
}

/** A ratio such as a percentage stored as a fraction (0.42 -> "42.00%"). */
export function fmtPercent(
  fraction: number | null | undefined,
  options: { decimals?: number; signed?: boolean } = {}
): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return NA;
  const decimals = options.decimals ?? 2;
  const pct = fraction * 100;
  const sign = options.signed && pct > 0 ? "+" : "";
  return `${sign}${fmtNumber(pct, { decimals })}%`;
}

/** A trailing ratio, e.g. profit factor. Rendered with 2 dp, N/A when undefined. */
export function fmtRatio(value: number | null | undefined): string {
  return fmtNumber(value, { decimals: 2 });
}

/** An R-multiple, e.g. "1.85R". */
export function fmtR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtNumber(value, { decimals: 2 })}R`;
}

/** A price at the precision it was entered, without inventing extra digits. */
export function fmtPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NA;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return NA;
  const decimals = Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 1 ? 4 : 6;
  return fmtNumber(n, { decimals });
}

/** A duration in milliseconds as "2d 4h", "3h 20m", "45m", or N/A. */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return NA;
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return "< 1m";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** A date, e.g. "2 Feb 2026". */
export function fmtDate(iso: ISOTimestamp | null | undefined): string {
  if (!iso) return NA;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return NA;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/** A date and time, e.g. "2 Feb 2026, 14:20". */
export function fmtDateTime(iso: ISOTimestamp | null | undefined): string {
  if (!iso) return NA;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return NA;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/** Just the clock time, in UTC, e.g. "14:20". */
export function fmtTime(iso: ISOTimestamp | null | undefined): string {
  if (!iso) return NA;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return NA;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/** The local-timezone date string used as a key, e.g. "2026-02-02". */
export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The class name for a signed value.
 *
 * Zero is `flat`, not `pos`: calling a breakeven day a win is a small lie that
 * compounds when you read a column of them.
 */
export function signClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "flat";
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "flat";
}

/** Title-case a snake_case enum value for display: "new_york" -> "New York". */
export function humanise(value: string | null | undefined): string {
  if (!value) return NA;
  return value
    .split(/[_\s]+/)
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}
