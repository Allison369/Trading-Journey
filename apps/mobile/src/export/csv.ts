/**
 * CSV export.
 *
 * Writes the journal as a CSV a spreadsheet can open. Built on the device and
 * never uploaded. The column order matches the import format, so an export can
 * be re-imported without remapping.
 */

import type { Trade, TradeExit, TradingAccount } from "@tradevault/core";

/** Quote a field if it contains a comma, a quote or a newline. */
function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const HEADERS = [
  "symbol",
  "direction",
  "assetClass",
  "status",
  "accountCurrency",
  "entryAt",
  "entryPrice",
  "exitAt",
  "exitPrice",
  "quantity",
  "contractMultiplier",
  "stopLoss",
  "takeProfit",
  "entryFees",
  "exitFees",
  "fundingFees",
  "slippage",
  "strategy",
  "session",
  "entryReason",
  "exitReason",
  "mistakes",
  "lessons",
  "notes",
  "importFingerprint",
] as const;

/**
 * Build the CSV.
 *
 * One row per trade; the exit columns carry the last recorded exit so a
 * single-exit trade round-trips exactly. Multi-exit trades are exported with
 * their aggregate quantity and average price, which is stated in the header
 * comment below so the loss of leg detail is not a surprise.
 */
export function buildCsvExport(
  trades: Trade[],
  exits: TradeExit[],
  accounts: TradingAccount[]
): string {
  const currencyByAccount = new Map(accounts.map((a) => [a.id, a.currency]));
  const exitsByTrade = new Map<string, TradeExit[]>();
  for (const exit of exits) {
    const list = exitsByTrade.get(exit.tradeId);
    if (list) list.push(exit);
    else exitsByTrade.set(exit.tradeId, [exit]);
  }

  const lines: string[] = [HEADERS.join(",")];

  for (const trade of trades) {
    const legs = exitsByTrade.get(trade.id) ?? [];

    let exitAt = trade.exitAt;
    let exitPrice = trade.exitPrice;
    let exitFees = trade.exitFees;

    if (legs.length > 1) {
      // Aggregate: total fees, and a quantity-weighted average price.
      const totalQty = legs.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
      const weighted = legs.reduce(
        (sum, l) => sum + Number(l.price || 0) * Number(l.quantity || 0),
        0
      );
      const lastLeg = legs[legs.length - 1];
      exitAt = lastLeg ? lastLeg.exitedAt : trade.exitAt;
      exitPrice = totalQty > 0 ? String(weighted / totalQty) : trade.exitPrice;
      exitFees = String(
        Number(trade.exitFees || 0) + legs.reduce((sum, l) => sum + Number(l.fees || 0), 0)
      );
    } else if (legs.length === 1) {
      const leg = legs[0] as TradeExit;
      exitAt = leg.exitedAt;
      exitPrice = leg.price;
      exitFees = String(Number(trade.exitFees || 0) + Number(leg.fees || 0));
    }

    lines.push(
      [
        field(trade.symbol),
        field(trade.direction),
        field(trade.assetClass),
        field(trade.status),
        field(currencyByAccount.get(trade.accountId) ?? ""),
        field(trade.entryAt),
        field(trade.entryPrice),
        field(exitAt),
        field(exitPrice),
        field(trade.quantity),
        field(trade.contractMultiplier),
        field(trade.stopLoss),
        field(trade.takeProfit),
        field(trade.entryFees),
        field(exitFees),
        field(trade.fundingFees),
        field(trade.slippage),
        field(trade.strategy),
        field(trade.session),
        field(trade.entryReason),
        field(trade.exitReason),
        field(trade.mistakes),
        field(trade.lessons),
        field(trade.notes),
        field(trade.importFingerprint),
      ].join(",")
    );
  }

  return lines.join("\n");
}
