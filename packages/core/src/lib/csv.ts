/**
 * CSV parsing and column mapping.
 *
 * The parser is deliberately broker-agnostic: it produces rows and headers,
 * and a separate adapter describes how to map a given broker's columns onto
 * TradeVault fields. New brokers are added by writing a new adapter, never by
 * changing the parser.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** Rows that could not be parsed into the expected column count. */
  malformed: Array<{ line: number; raw: string; reason: string }>;
  delimiter: string;
}

export type ColumnMapping = Record<string, string | null>; // csvHeader -> fieldName

export interface ImportCandidate {
  rowNumber: number;
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
  /** Fingerprint used to detect duplicates. */
  fingerprint: string;
}

export interface ImportPreview {
  headers: string[];
  mapping: ColumnMapping;
  candidates: ImportCandidate[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

/** Guess the delimiter by counting candidates in the header line. */
export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Parse CSV text into rows.
 *
 * Handles quoted fields, escaped quotes (""), embedded delimiters and newlines
 * inside quotes, and CRLF or LF line endings — all of which appear in real
 * broker exports.
 */
export function parseCsv(text: string, delimiter?: string): ParsedCsv {
  const delim = delimiter ?? detectDelimiter(text);

  // Strip a UTF-8 BOM if present.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  const malformed: ParsedCsv["malformed"] = [];

  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    // Skip entirely blank lines rather than reporting them as malformed.
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delim) {
      pushField();
    } else if (char === "\r") {
      // handled by the \n branch
    } else if (char === "\n") {
      pushRow();
      line += 1;
    } else {
      field += char;
    }
  }

  // Flush any trailing content.
  if (field !== "" || row.length > 0) {
    pushRow();
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], malformed, delimiter: delim };
  }

  const headers = (rows[0] ?? []).map((h) => h.trim());

  // Normalise each row to the header length so downstream mapping is safe.
  const body = rows.slice(1).map((r, idx) => {
    if (r.length !== headers.length) {
      malformed.push({
        line: idx + 2,
        raw: r.join(delim),
        reason: `Expected ${headers.length} columns but found ${r.length}`,
      });
    }
    const out = headers.map((_, i) => r[i] ?? "");
    return out;
  });

  return { headers, rows: body, malformed, delimiter: delim };
}

/* ------------------------------------------------------------------ */
/* Value parsing helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Parse a number from a broker export.
 *
 * Handles thousands separators, currency symbols, parenthesised negatives
 * (accounting style), and both "1,234.56" and "1.234,56" decimal conventions.
 */
export function parseNumber(raw: string): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === "") return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Remove currency symbols, spaces and thousands letters, keeping only
  // digits, separators and signs.
  s = s.replace(/[^\d.,\-+]/g, "");

  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/\+/g, "");

  // Nothing numeric survived (e.g. "abc", "Infinity", "$").
  if (s === "" || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal separator.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // A lone comma is ambiguous. Treat it as a decimal separator only when it
    // is followed by one or two digits; otherwise it is a thousands separator.
    const after = s.length - lastComma - 1;
    if (after === 1 || after === 2) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  }

  // Reject anything that is not a clean decimal after normalisation.
  if (!/^\d*\.?\d+$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Parse a date/time from a broker export.
 * Accepts ISO strings, common day-first and month-first layouts, and Unix
 * timestamps in seconds or milliseconds.
 */
export function parseDateTime(raw: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s === "") return null;

  // Unix timestamp (seconds or milliseconds).
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();

  // ISO 8601 (with an explicit offset or Z) is unambiguous.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }

  // A bare "YYYY-MM-DD[ HH:MM[:SS]]" has no zone. Treat it as UTC so the
  // result does not depend on the machine's local time zone.
  const isoLike = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (isoLike) {
    const [, y, mo, d, hh = "0", mi = "0", ss = "0"] = isoLike;
    const date = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss))
    );
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  // Day-first (dd/mm/yyyy) is the common convention outside the US, but only
  // when it is unambiguous: a first component above 12 must be a day.
  const slash = s.match(
    /^(\d{1,2})([/.])(\d{1,2})\2(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[3]);
    const year = Number(slash[4]);
    const hh = Number(slash[5] ?? "0");
    const mm = Number(slash[6] ?? "0");
    const ss = Number(slash[7] ?? "0");

    // Decide which component is the day: if one exceeds 12 it must be the day.
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      month = a;
    } else {
      // Both plausible: use day-first, the more common international layout.
      day = a;
      month = b;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
      // Reject rollovers such as 31/02 becoming 03/03.
      if (
        !Number.isNaN(date.getTime()) &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        return date.toISOString();
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Adapters                                                           */
/* ------------------------------------------------------------------ */

export interface BrokerAdapter {
  id: string;
  label: string;
  /** Header -> TradeVault field. */
  columns: Record<string, string>;
  /** Header substrings used to auto-detect this adapter. */
  signature: string[];
  /** Whether this adapter can infer direction from the data. */
  inferDirection?: (row: Record<string, string>) => "long" | "short" | null;
}

/** A generic adapter that matches the common shape of most exports. */
export const genericAdapter: BrokerAdapter = {
  id: "generic",
  label: "Generic CSV",
  signature: [],
  columns: {
    symbol: "symbol",
    instrument: "symbol",
    ticker: "symbol",
    pair: "symbol",
    direction: "direction",
    side: "direction",
    type: "direction",
    entryprice: "entryPrice",
    "entry price": "entryPrice",
    openprice: "entryPrice",
    exitprice: "exitPrice",
    "exit price": "exitPrice",
    closeprice: "exitPrice",
    entrytime: "entryAt",
    "entry time": "entryAt",
    opentime: "entryAt",
    "open time": "entryAt",
    exittime: "exitAt",
    "exit time": "exitAt",
    closetime: "exitAt",
    "close time": "exitAt",
    quantity: "quantity",
    size: "quantity",
    volume: "quantity",
    lots: "quantity",
    fees: "entryFees",
    commission: "entryFees",
    fee: "entryFees",
    stoploss: "stopLoss",
    "stop loss": "stopLoss",
    sl: "stopLoss",
    takeprofit: "takeProfit",
    "take profit": "takeProfit",
    tp: "takeProfit",
    profit: "manualNetPnl",
    pnl: "manualNetPnl",
    "net pnl": "manualNetPnl",
  },
};

/** Auto-detect an adapter from the CSV headers. */
export function detectAdapter(
  headers: string[],
  adapters: BrokerAdapter[] = [genericAdapter]
): BrokerAdapter {
  const normalised = headers.map((h) => h.toLowerCase().replace(/[_-]/g, " ").trim());
  for (const adapter of adapters) {
    if (adapter.signature.length === 0) continue;
    const hit = adapter.signature.every((sig) =>
      normalised.some((h) => h.includes(sig))
    );
    if (hit) return adapter;
  }
  return adapters[adapters.length - 1] ?? genericAdapter;
}

/** Suggest a column mapping from a header row. */
export function suggestMapping(
  headers: string[],
  adapter: BrokerAdapter = genericAdapter
): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const field = adapter.columns[normaliseHeader(header)];
    mapping[header] = field ?? null;
  }
  return mapping;
}

/** Normalise a header string for tolerant comparison. */
export function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Preview and duplicate detection                                    */
/* ------------------------------------------------------------------ */

const REQUIRED_FIELDS = ["symbol", "entryPrice", "entryAt", "quantity"] as const;

/** Build a stable fingerprint for duplicate detection. */
export function fingerprintOf(values: Record<string, string>): string {
  const symbol = (values.symbol ?? "").toUpperCase();
  const entryPrice = values.entryPrice ?? "";
  const entryAt = values.entryAt ?? "";
  const quantity = values.quantity ?? "";
  const direction = (values.direction ?? "").toLowerCase();
  return [symbol, direction, entryPrice, entryAt, quantity].join("|");
}

/** Apply a mapping to produce normalised import candidates. */
export function buildPreview(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  existingFingerprints: Set<string> = new Set()
): ImportPreview {
  const candidates: ImportCandidate[] = [];
  const seen = new Set<string>();
  let duplicateRows = 0;

  parsed.rows.forEach((row, idx) => {
    const values: Record<string, string> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    parsed.headers.forEach((header, colIndex) => {
      const field = mapping[header];
      if (!field) return;
      const raw = row[colIndex] ?? "";
      values[field] = raw.trim();
    });

    // Required fields.
    for (const field of REQUIRED_FIELDS) {
      if (!values[field] || values[field] === "") {
        errors.push(`Missing required value for "${field}".`);
      }
    }

    // Numeric validation.
    for (const numericField of [
      "entryPrice",
      "exitPrice",
      "quantity",
      "stopLoss",
      "takeProfit",
      "entryFees",
    ]) {
      const raw = values[numericField];
      if (raw && raw !== "" && parseNumber(raw) === null) {
        errors.push(`"${numericField}" is not a valid number: "${raw}".`);
      }
    }

    // Date validation.
    for (const dateField of ["entryAt", "exitAt"]) {
      const raw = values[dateField];
      if (raw && raw !== "" && parseDateTime(raw) === null) {
        errors.push(`"${dateField}" is not a valid date: "${raw}".`);
      }
    }

    // Direction inference and validation.
    if (values.direction) {
      const d = values.direction.toLowerCase();
      if (["buy", "long", "b", "l"].includes(d)) values.direction = "long";
      else if (["sell", "short", "s"].includes(d)) values.direction = "short";
      else {
        warnings.push(`Unrecognised direction "${values.direction}", assuming long.`);
        values.direction = "long";
      }
    } else {
      values.direction = "long";
      warnings.push("No direction column mapped, assuming long.");
    }

    const fingerprint = fingerprintOf(values);
    const isDuplicate = existingFingerprints.has(fingerprint) || seen.has(fingerprint);
    if (isDuplicate) {
      duplicateRows += 1;
      warnings.push("Possible duplicate of a trade already in your journal.");
    }
    seen.add(fingerprint);

    candidates.push({
      rowNumber: idx + 2, // +2 accounts for the header and 1-based numbering
      values,
      errors,
      warnings,
      fingerprint,
    });
  });

  const errorRows = candidates.filter((c) => c.errors.length > 0).length;

  return {
    headers: parsed.headers,
    mapping,
    candidates,
    totalRows: candidates.length,
    validRows: candidates.length - errorRows,
    errorRows,
    duplicateRows,
  };
}

/** Convert a preview into trade input objects ready for validation. */
export function candidatesToTrades(
  preview: ImportPreview,
  accountId: string
): Array<Record<string, unknown>> {
  return preview.candidates
    .filter((c) => c.errors.length === 0)
    .map((c) => {
      const v = c.values;
      const entryAt = v.entryAt ? parseDateTime(v.entryAt) : null;
      const exitAt = v.exitAt ? parseDateTime(v.exitAt) : null;
      const exitPrice = v.exitPrice ? parseNumber(v.exitPrice) : null;

      return {
        accountId,
        symbol: (v.symbol ?? "").toUpperCase(),
        direction: v.direction ?? "long",
        assetClass: v.assetClass ?? "other",
        entryAt: entryAt ?? new Date().toISOString(),
        entryPrice: v.entryPrice ?? "",
        exitAt,
        exitPrice: exitPrice === null ? null : String(exitPrice),
        quantity: v.quantity ?? "",
        contractMultiplier: v.contractMultiplier ?? "1",
        stopLoss: v.stopLoss ? String(parseNumber(v.stopLoss) ?? "") : null,
        takeProfit: v.takeProfit ? String(parseNumber(v.takeProfit) ?? "") : null,
        entryFees: v.entryFees ? String(parseNumber(v.entryFees) ?? "0") : "0",
        status: exitPrice === null ? "open" : "closed",
        importFingerprint: c.fingerprint,
      };
    });
}
