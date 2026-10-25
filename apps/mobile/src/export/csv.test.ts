/**
 * CSV export tests.
 *
 * The export is the user's escape hatch: if they ever want to leave, this file
 * is what they take with them. So the tests focus on the two ways an export
 * can betray someone — silently losing a field, or corrupting a value that
 * contains a comma or a quote.
 */

import { buildCsvExport } from "./csv";
import type { Trade, TradeExit, TradingAccount } from "@tradevault/core";

const account: TradingAccount = {
  id: "acc-1",
  userId: null,
  name: "Main",
  broker: undefined,
  currency: "USD",
  startingBalance: "10000",
  balanceAdjustments: "0",
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 1,
  deletedAt: null,
};

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "trade-1",
    userId: null,
    accountId: "acc-1",
    strategyId: null,
    symbol: "EURUSD",
    assetClass: "forex",
    market: "FX",
    direction: "long",
    status: "closed",
    orderType: "market",
    entryAt: "2026-02-12T08:05:00.000Z",
    entryPrice: "1.0920",
    exitAt: "2026-02-12T09:20:00.000Z",
    exitPrice: "1.0960",
    quantity: "1",
    contractMultiplier: "100000",
    stopLoss: "1.0900",
    takeProfit: null,
    entryFees: "2",
    exitFees: "0",
    fundingFees: "0",
    slippage: "0",
    strategy: "London Breakout",
    setupType: undefined,
    session: "london",
    entryReason: undefined,
    exitReason: undefined,
    emotionBefore: undefined,
    emotionDuring: undefined,
    emotionAfter: undefined,
    mistakes: undefined,
    lessons: undefined,
    notes: undefined,
    manualNetPnl: null,
    importFingerprint: "fp-1",
    createdAt: "2026-02-12T08:05:00.000Z",
    updatedAt: "2026-02-12T09:20:00.000Z",
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

function makeExit(overrides: Partial<TradeExit> = {}): TradeExit {
  return {
    id: "exit-1",
    userId: null,
    tradeId: "trade-1",
    quantity: "1",
    price: "1.0960",
    fees: "2",
    exitedAt: "2026-02-12T09:20:00.000Z",
    createdAt: "2026-02-12T09:20:00.000Z",
    updatedAt: "2026-02-12T09:20:00.000Z",
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

/** Split a CSV line, honouring quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

describe("buildCsvExport", () => {
  it("emits a header row even with no trades", () => {
    const csv = buildCsvExport([], [], [account]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("symbol");
    expect(lines[0]).toContain("entryPrice");
    expect(lines[0]).toContain("importFingerprint");
  });

  it("emits one row per trade", () => {
    const csv = buildCsvExport(
      [makeTrade({ id: "a" }), makeTrade({ id: "b", symbol: "GBPUSD" })],
      [],
      [account]
    );
    expect(csv.split("\n")).toHaveLength(3);
  });

  it("writes the same number of columns on every row", () => {
    const csv = buildCsvExport([makeTrade(), makeTrade({ id: "b" })], [makeExit()], [account]);
    const widths = csv.split("\n").map((line) => splitCsvLine(line).length);
    expect(new Set(widths).size).toBe(1);
  });

  it("carries the account currency onto the trade row", () => {
    const csv = buildCsvExport([makeTrade()], [], [account]);
    const header = splitCsvLine(csv.split("\n")[0] as string);
    const row = splitCsvLine(csv.split("\n")[1] as string);
    expect(row[header.indexOf("accountCurrency")]).toBe("USD");
  });

  it("uses the recorded exit leg for a single-exit trade", () => {
    const csv = buildCsvExport(
      [makeTrade({ exitPrice: "1.0000" })],
      [makeExit({ price: "1.0960" })],
      [account]
    );
    const header = splitCsvLine(csv.split("\n")[0] as string);
    const row = splitCsvLine(csv.split("\n")[1] as string);
    expect(row[header.indexOf("exitPrice")]).toBe("1.0960");
  });

  it("aggregates a multi-exit trade into a quantity-weighted average price", () => {
    const exits = [
      makeExit({ id: "e1", quantity: "1", price: "1.0000", fees: "1" }),
      makeExit({ id: "e2", quantity: "3", price: "1.2000", fees: "1" }),
    ];
    const csv = buildCsvExport([makeTrade()], exits, [account]);
    const header = splitCsvLine(csv.split("\n")[0] as string);
    const row = splitCsvLine(csv.split("\n")[1] as string);

    // (1*1.00 + 3*1.20) / 4 = 1.15
    expect(Number(row[header.indexOf("exitPrice")])).toBeCloseTo(1.15, 10);
  });

  it("sums exit-leg fees into the exported exit fee", () => {
    const exits = [
      makeExit({ id: "e1", quantity: "1", price: "1.0", fees: "1.5" }),
      makeExit({ id: "e2", quantity: "1", price: "1.2", fees: "2.5" }),
    ];
    const csv = buildCsvExport([makeTrade({ exitFees: "0" })], exits, [account]);
    const header = splitCsvLine(csv.split("\n")[0] as string);
    const row = splitCsvLine(csv.split("\n")[1] as string);
    expect(Number(row[header.indexOf("exitFees")])).toBeCloseTo(4, 10);
  });

  it("quotes a field containing a comma so the columns do not shift", () => {
    const csv = buildCsvExport(
      [makeTrade({ notes: "Waited, then entered" })],
      [],
      [account]
    );
    const header = splitCsvLine(csv.split("\n")[0] as string);
    const row = splitCsvLine(csv.split("\n")[1] as string);
    expect(row[header.indexOf("notes")]).toBe("Waited, then entered");
    expect(row).toHaveLength(header.length);
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = buildCsvExport(
      [makeTrade({ notes: 'He said "go"' })],
      [],
      [account]
    );
    const header = splitCsvLine(csv.split("\n")[0] as string);
    const row = splitCsvLine(csv.split("\n")[1] as string);
    expect(row[header.indexOf("notes")]).toBe('He said "go"');
  });

  it("writes absent optional fields as empty, never as the word null", () => {
    const csv = buildCsvExport([makeTrade({ takeProfit: null, notes: undefined })], [], [account]);
    expect(csv).not.toContain("null");
    expect(csv).not.toContain("undefined");
  });

  it("keeps the import fingerprint so a re-import de-duplicates correctly", () => {
    const csv = buildCsvExport([makeTrade()], [], [account]);
    expect(csv).toContain("fp-1");
  });
});
