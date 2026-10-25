/**
 * Currency conversion.
 *
 * The app must never combine balances in different currencies without a real
 * rate and a disclosed method. This module therefore:
 *
 * - refuses to convert without an explicit, dated rate,
 * - records the rate and its source on the result,
 * - reports when a rate is stale so the UI can warn the user,
 * - never invents a rate.
 */

import { multiplyExact, round, safeDivide } from "../domain/decimal";
import type { CurrencyCode, ISOTimestamp } from "../domain/types";

export interface ExchangeRate {
  base: CurrencyCode;
  quote: CurrencyCode;
  /** Units of `quote` per one unit of `base`. */
  rate: number;
  asOf: ISOTimestamp;
  source: string;
}

export interface ConversionResult {
  value: number | null;
  rate: number | null;
  from: CurrencyCode;
  to: CurrencyCode;
  asOf: ISOTimestamp | null;
  source: string | null;
  /** True when the rate is older than the caller's freshness limit. */
  stale: boolean;
  error: string | null;
}

/** A rate is considered stale after this many hours by default. */
export const DEFAULT_STALE_HOURS = 24;

export interface RateTable {
  rates: ExchangeRate[];
  /** Lookup a rate, or null when none is available. */
  get(from: CurrencyCode, to: CurrencyCode): ExchangeRate | null;
}

/** Build an in-memory rate table with inverse-rate derivation. */
export function createRateTable(rates: ExchangeRate[]): RateTable {
  const index = new Map<string, ExchangeRate>();
  for (const r of rates) {
    index.set(`${r.base}:${r.quote}`, r);
    // Derive the inverse only when it is not explicitly provided.
    const inverseKey = `${r.quote}:${r.base}`;
    if (!index.has(inverseKey) && r.rate > 0) {
      index.set(inverseKey, {
        base: r.quote,
        quote: r.base,
        rate: 1 / r.rate,
        asOf: r.asOf,
        source: `${r.source} (derived inverse)`,
      });
    }
  }

  return {
    rates,
    get(from, to) {
      if (from === to) {
        return {
          base: from,
          quote: to,
          rate: 1,
          asOf: new Date().toISOString(),
          source: "identity",
        };
      }
      return index.get(`${from}:${to}`) ?? null;
    },
  };
}

/**
 * Convert an amount between currencies.
 *
 * Returns an explicit error rather than a guessed value when no rate exists.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  table: RateTable,
  options: { now?: Date; staleHours?: number } = {}
): ConversionResult {
  const base: Omit<ConversionResult, "value" | "rate" | "asOf" | "source" | "stale" | "error"> = {
    from,
    to,
  };

  if (from === to) {
    return { ...base, value: amount, rate: 1, asOf: null, source: "identity", stale: false, error: null };
  }

  const rate = table.get(from, to);
  if (!rate) {
    return {
      ...base,
      value: null,
      rate: null,
      asOf: null,
      source: null,
      stale: false,
      error: `No exchange rate available for ${from} to ${to}. Add a rate to convert this figure.`,
    };
  }

  const now = options.now ?? new Date();
  const staleHours = options.staleHours ?? DEFAULT_STALE_HOURS;
  const asOfMs = Date.parse(rate.asOf);
  const ageHours = Number.isFinite(asOfMs)
    ? (now.getTime() - asOfMs) / 3_600_000
    : Number.POSITIVE_INFINITY;

  return {
    ...base,
    value: round(multiplyExact(amount, rate.rate), 8),
    rate: rate.rate,
    asOf: rate.asOf,
    source: rate.source,
    stale: ageHours > staleHours,
    error: null,
  };
}

/**
 * Aggregate P&L across accounts.
 *
 * Trades in different currencies are only summed when a rate exists for every
 * one of them; otherwise the result is marked incomplete and names the
 * currencies that could not be converted.
 */
export interface MultiCurrencyTotal {
  /** Total in the reporting currency, or null when conversion was impossible. */
  total: number | null;
  reportingCurrency: CurrencyCode;
  converted: Array<{ currency: CurrencyCode; amount: number; converted: number }>;
  /** Currencies that had no usable rate, with their unconverted amounts. */
  unconverted: Array<{ currency: CurrencyCode; amount: number }>;
  /** True when at least one amount could not be converted. */
  incomplete: boolean;
  notes: string[];
}

export function aggregateMultiCurrency(
  amounts: Array<{ currency: CurrencyCode; amount: number }>,
  reportingCurrency: CurrencyCode,
  table: RateTable
): MultiCurrencyTotal {
  const converted: MultiCurrencyTotal["converted"] = [];
  const unconverted: MultiCurrencyTotal["unconverted"] = [];
  const notes: string[] = [];

  for (const entry of amounts) {
    if (entry.amount === 0) continue;
    if (entry.currency === reportingCurrency) {
      converted.push({ ...entry, converted: entry.amount });
      continue;
    }
    const result = convert(entry.amount, entry.currency, reportingCurrency, table);
    if (result.value === null) {
      unconverted.push(entry);
    } else {
      converted.push({ ...entry, converted: result.value });
      if (result.stale) {
        notes.push(
          `The ${entry.currency}/${reportingCurrency} rate is from ${result.asOf} and may be out of date.`
        );
      }
    }
  }

  const incomplete = unconverted.length > 0;
  if (incomplete) {
    notes.push(
      `Totals exclude ${unconverted
        .map((u) => u.currency)
        .join(", ")} because no exchange rate is available.`
    );
  }

  return {
    total: incomplete ? null : converted.reduce((sum, c) => sum + c.converted, 0),
    reportingCurrency,
    converted,
    unconverted,
    incomplete,
    notes,
  };
}

/** Format an amount for display with the correct currency symbol and decimals. */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  locale = "en-US"
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Percentage split helper used by analytics (e.g. long vs short). */
export function sharePercent(part: number, whole: number): number | null {
  return safeDivide(part, whole);
}
