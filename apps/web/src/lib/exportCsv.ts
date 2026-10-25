/**
 * CSV export and browser file download.
 *
 * Export is the user's escape hatch. It must produce a file that opens cleanly
 * in a spreadsheet and contains the same numbers the app displays — including
 * the fact that an open trade has no realised result, which is why realised
 * columns are written empty rather than as 0.
 */

import { computeTrade, toNumber } from "@tradevault/core";
import type { ISOTimestamp, Trade, TradeExit, TradingAccount } from "@tradevault/core";

/** RFC 4180 quoting: wrap when the value contains a delimiter, quote or newline. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRows(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export const EXPORT_COLUMNS = [
  "Symbol",
  "Direction",
  "Status",
  "Asset class",
  "Session",
  "Account",
  "Account currency",
  "Strategy",
  "Entry at (UTC)",
  "Entry price",
  "Exit at (UTC)",
  "Exit price",
  "Quantity",
  "Contract multiplier",
  "Stop loss",
  "Take profit",
  "Entry fees",
  "Exit fees",
  "Funding fees",
  "Slippage",
  "Costs total",
  "Gross P&L",
  "Net P&L",
  "Manual net P&L",
  "R multiple",
  "Holding (ms)",
  "Exits",
  "Entry reason",
  "Exit reason",
  "Mistakes",
  "Lessons",
  "Notes",
  "Trade id",
];

/**
 * Build the trades CSV.
 *
 * Only closed/partial trades get a realised P&L. An open trade's realised
 * columns are blank, because writing 0 would read as "this trade made nothing
 * yet" when the truth is "this trade has not finished".
 */
export function buildTradesCsv(
  trades: Trade[],
  exits: TradeExit[],
  accounts: TradingAccount[]
): string {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const exitsByTrade = new Map<string, TradeExit[]>();
  for (const e of exits) {
    if (e.deletedAt) continue;
    const list = exitsByTrade.get(e.tradeId) ?? [];
    list.push(e);
    exitsByTrade.set(e.tradeId, list);
  }

  const rows: Array<Array<string | number | null>> = [EXPORT_COLUMNS];

  for (const trade of trades) {
    if (trade.deletedAt) continue;
    const tradeExits = exitsByTrade.get(trade.id) ?? [];
    const comp = computeTrade(trade, tradeExits);
    const realised = trade.status !== "open";
    const account = accountById.get(trade.accountId);

    rows.push([
      trade.symbol,
      trade.direction,
      trade.status,
      trade.assetClass,
      trade.session,
      account?.name ?? NA_TEXT,
      account?.currency ?? NA_TEXT,
      trade.strategy ?? "",
      trade.entryAt,
      trade.entryPrice,
      trade.exitAt ?? "",
      trade.exitPrice ?? "",
      trade.quantity,
      trade.contractMultiplier,
      trade.stopLoss ?? "",
      trade.takeProfit ?? "",
      trade.entryFees,
      trade.exitFees,
      trade.fundingFees,
      trade.slippage,
      realised ? comp.costs.total.toFixed(4) : "",
      realised ? comp.grossPnl.toFixed(4) : "",
      realised ? comp.netPnl.toFixed(4) : "",
      trade.manualNetPnl ?? "",
      comp.rMultiple !== null ? comp.rMultiple.toFixed(4) : "",
      comp.holdingMs !== null ? String(Math.round(comp.holdingMs)) : "",
      tradeExits.length,
      trade.entryReason ?? "",
      trade.exitReason ?? "",
      trade.mistakes ?? "",
      trade.lessons ?? "",
      trade.notes ?? "",
      trade.id,
    ]);
  }

  return csvRows(rows);
}

const NA_TEXT = "N/A";

/** A stable filename with a date stamp, e.g. tradevault-trades-2026-02-14.csv. */
export function exportFileName(prefix: string, at: Date = new Date()): string {
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
  return `tradevault-${prefix}-${stamp}.csv`;
}

/**
 * Trigger a download in the browser.
 *
 * Uses an object URL and revokes it afterwards. This works offline and never
 * sends the data anywhere, which matters: the export contains the user's full
 * trading history.
 */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  // A BOM makes Excel open UTF-8 correctly, which matters for any non-ASCII
  // characters in notes.
  const blob = new Blob(["\ufeff", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the click has definitely been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a user-selected file as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsText(file, "utf-8");
  });
}

/** Normalise a date input value ("2026-02-14") to a UTC ISO timestamp. */
export function dateKeyToIso(dateKey: string, time = "00:00"): ISOTimestamp {
  const [h, m] = time.split(":");
  const parts = dateKey.split("-").map(Number);
  const [y, mo, d] = [parts[0] ?? 1970, parts[1] ?? 1, parts[2] ?? 1];
  return new Date(Date.UTC(y, mo - 1, d, Number(h ?? 0), Number(m ?? 0), 0)).toISOString();
}

export { toNumber };
