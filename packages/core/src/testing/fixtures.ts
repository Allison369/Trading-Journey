/**
 * Test fixtures.
 *
 * These are clearly separate from real user data — they only exist to drive
 * the automated tests and are never bundled into the application.
 */

import type {
  ISOTimestamp,
  JournalEntry,
  Trade,
  TradeExit,
  TradingAccount,
} from "../domain/types";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter).padStart(4, "0")}`;
}

export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  const now: ISOTimestamp = "2026-01-01T10:00:00.000Z";
  return {
    id: nextId("trade"),
    userId: null,
    accountId: "acct-1",
    strategyId: null,
    symbol: "EURUSD",
    assetClass: "forex",
    market: "FX",
    direction: "long",
    status: "open",
    orderType: "market",
    entryAt: now,
    entryPrice: "1.1000",
    exitAt: null,
    exitPrice: null,
    quantity: "1",
    contractMultiplier: "100000",
    stopLoss: null,
    takeProfit: null,
    entryFees: "0",
    exitFees: "0",
    fundingFees: "0",
    slippage: "0",
    session: "london",
    manualNetPnl: null,
    importFingerprint: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function makeExit(overrides: Partial<TradeExit> = {}): TradeExit {
  const now: ISOTimestamp = "2026-01-01T12:00:00.000Z";
  return {
    id: nextId("exit"),
    userId: null,
    tradeId: "trade-0001",
    quantity: "1",
    price: "1.1100",
    fees: "0",
    exitedAt: now,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  const now: ISOTimestamp = "2026-01-01T00:00:00.000Z";
  return {
    id: nextId("acct"),
    userId: null,
    name: "Test Account",
    currency: "USD",
    startingBalance: "10000",
    balanceAdjustments: "0",
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function makeJournalEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  const now: ISOTimestamp = "2026-01-01T00:00:00.000Z";
  return {
    id: nextId("journal"),
    userId: null,
    entryDate: "2026-01-01",
    period: "daily",
    linkedTradeIds: [],
    tags: [],
    disciplineScore: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * A fully closed trade with its single exit, ready to feed into the engines.
 *
 * The exit quantity defaults to the trade's full quantity, and the exit time
 * defaults to the trade's exit time, so the returned pair genuinely represents
 * a complete close unless the caller overrides either.
 */
export function closedTrade(
  overrides: Partial<Trade> = {},
  exitOverrides: Partial<TradeExit> = {}
): { trade: Trade; exit: TradeExit } {
  const trade = makeTrade({
    status: "closed",
    exitAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  });
  const exit = makeExit({
    tradeId: trade.id,
    quantity: trade.quantity,
    exitedAt: trade.exitAt ?? "2026-01-01T12:00:00.000Z",
    ...exitOverrides,
  });
  return { trade, exit };
}

/** Build an exitsByTradeId map from a list of exits. */
export function exitsMap(exits: TradeExit[]): Record<string, TradeExit[]> {
  const map: Record<string, TradeExit[]> = {};
  for (const e of exits) {
    const list = map[e.tradeId] ?? [];
    list.push(e);
    map[e.tradeId] = list;
  }
  return map;
}

/** Reset the id counter so snapshots stay stable between tests. */
export function resetIds(): void {
  counter = 0;
}
