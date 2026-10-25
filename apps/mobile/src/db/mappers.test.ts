/**
 * Mapper tests.
 *
 * These pin the row -> domain conversion, because it is the seam where a value
 * can silently change shape. The failures that matter most here:
 *
 *   * an empty numeric column becoming 0 instead of null, which would turn
 *     "no stop loss recorded" into "a stop loss at zero" and produce a
 *     nonsense R multiple;
 *   * a JSON array column taking the whole row down when it is malformed.
 */

import {
  accountFromRow,
  exitFromRow,
  journalFromRow,
  riskFromRow,
  strategyFromRow,
  tradeFromRow,
  type AccountRow,
  type ExitRow,
  type JournalRow,
  type RiskRow,
  type StrategyRow,
  type TradeRow,
} from "./mappers";

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const accountRow: AccountRow = {
  id: "acc-1",
  user_id: "user-1",
  name: "Main Account",
  broker: "Example Broker",
  currency: "EUR",
  starting_balance: "10000",
  balance_adjustments: "500",
  is_archived: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  revision: 3,
  deleted_at: null,
  dirty: 0,
};

const tradeRow: TradeRow = {
  id: "trade-1",
  user_id: "user-1",
  account_id: "acc-1",
  strategy_id: null,
  symbol: "EURUSD",
  asset_class: "forex",
  market: "FX",
  direction: "long",
  status: "closed",
  order_type: "market",
  entry_at: "2026-02-12T08:05:00.000Z",
  entry_price: "1.0920",
  exit_at: "2026-02-12T09:20:00.000Z",
  exit_price: "1.0960",
  quantity: "1",
  contract_multiplier: "100000",
  stop_loss: "1.0900",
  take_profit: "1.0960",
  entry_fees: "2",
  exit_fees: "2",
  funding_fees: "0",
  slippage: "0",
  strategy: "London Breakout",
  setup_type: null,
  session: "london",
  entry_reason: "Break of the Asian range",
  exit_reason: null,
  emotion_before: "calm",
  emotion_during: null,
  emotion_after: "satisfied",
  mistakes: null,
  lessons: null,
  notes: "Clean execution",
  manual_net_pnl: null,
  import_fingerprint: "fp-1",
  created_at: "2026-02-12T08:05:00.000Z",
  updated_at: "2026-02-12T09:20:00.000Z",
  revision: 1,
  deleted_at: null,
  dirty: 0,
};

const exitRow: ExitRow = {
  id: "exit-1",
  user_id: "user-1",
  trade_id: "trade-1",
  quantity: "1",
  price: "1.0960",
  fees: "2",
  exited_at: "2026-02-12T09:20:00.000Z",
  created_at: "2026-02-12T09:20:00.000Z",
  updated_at: "2026-02-12T09:20:00.000Z",
  revision: 1,
  deleted_at: null,
  dirty: 0,
};

const strategyRow: StrategyRow = {
  id: "str-1",
  user_id: "user-1",
  name: "London Breakout",
  description: "Trade the first decisive break.",
  markets: '["FX"]',
  instruments: '["EURUSD","GBPUSD"]',
  entry_rules: "Enter on a close beyond the range.",
  exit_rules: "Take half at 1R.",
  risk_rules: "Risk 1%.",
  session: "london",
  checklist: '["Range marked","Stop placed"]',
  tags: '["breakout"]',
  improvement_notes: null,
  is_archived: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  revision: 1,
  deleted_at: null,
  dirty: 0,
};

const journalRow: JournalRow = {
  id: "j-1",
  user_id: "user-1",
  entry_date: "2026-02-12",
  period: "daily",
  title: "London session",
  goals: "Wait for the range",
  market_observations: null,
  pre_market_plan: "Only the London open",
  trades_summary: "One clean trade",
  emotional_state: "calm",
  mistakes: null,
  lessons: "Patience paid",
  improvements: "Size up next time",
  notes: null,
  linked_trade_ids: '["trade-1"]',
  discipline_score: 8,
  tags: '["london"]',
  created_at: "2026-02-12T20:00:00.000Z",
  updated_at: "2026-02-12T20:00:00.000Z",
  revision: 1,
  deleted_at: null,
  dirty: 0,
};

const riskRow: RiskRow = {
  id: "risk-1",
  user_id: "user-1",
  account_id: "acc-1",
  default_risk_percent: "1",
  max_risk_per_trade_percent: "2",
  daily_loss_limit_amount: "500",
  weekly_loss_limit_amount: null,
  max_consecutive_losses: 3,
  cooldown_after_losses: 1,
  base_currency: "EUR",
  updated_at: "2026-02-12T00:00:00.000Z",
  revision: 2,
  dirty: 0,
};

/* ------------------------------------------------------------------ */
/* Accounts                                                           */
/* ------------------------------------------------------------------ */

describe("accountFromRow", () => {
  it("converts snake_case columns to domain camelCase", () => {
    const account = accountFromRow(accountRow);
    expect(account.id).toBe("acc-1");
    expect(account.name).toBe("Main Account");
    expect(account.currency).toBe("EUR");
    expect(account.startingBalance).toBe("10000");
    expect(account.balanceAdjustments).toBe("500");
    expect(account.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(account.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(account.revision).toBe(3);
    expect(account.deletedAt).toBeNull();
  });

  it("keeps amounts as strings so no float rounding happens at the boundary", () => {
    const account = accountFromRow({ ...accountRow, starting_balance: "0.1" });
    expect(typeof account.startingBalance).toBe("string");
    expect(account.startingBalance).toBe("0.1");
  });

  it("maps the integer archive flag to a boolean", () => {
    expect(accountFromRow({ ...accountRow, is_archived: 1 }).isArchived).toBe(true);
    expect(accountFromRow({ ...accountRow, is_archived: 0 }).isArchived).toBe(false);
  });

  it("treats a blank optional text column as absent, not empty", () => {
    expect(accountFromRow({ ...accountRow, broker: "" }).broker).toBeUndefined();
    expect(accountFromRow({ ...accountRow, broker: "   " }).broker).toBeUndefined();
    expect(accountFromRow({ ...accountRow, broker: null }).broker).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Trades                                                             */
/* ------------------------------------------------------------------ */

describe("tradeFromRow", () => {
  it("converts a complete trade row", () => {
    const trade = tradeFromRow(tradeRow);
    expect(trade.id).toBe("trade-1");
    expect(trade.accountId).toBe("acc-1");
    expect(trade.symbol).toBe("EURUSD");
    expect(trade.direction).toBe("long");
    expect(trade.status).toBe("closed");
    expect(trade.entryPrice).toBe("1.0920");
    expect(trade.exitPrice).toBe("1.0960");
    expect(trade.contractMultiplier).toBe("100000");
    expect(trade.strategy).toBe("London Breakout");
    expect(trade.importFingerprint).toBe("fp-1");
  });

  it("keeps a null stop loss null rather than turning it into zero", () => {
    const trade = tradeFromRow({ ...tradeRow, stop_loss: null });
    expect(trade.stopLoss).toBeNull();
    // The distinction is load-bearing: null means "no R multiple", 0 would
    // mean "a stop at the entry price", which is a different claim.
    expect(trade.stopLoss).not.toBe(0);
  });

  it("treats an empty numeric column as null", () => {
    expect(tradeFromRow({ ...tradeRow, stop_loss: "" }).stopLoss).toBeNull();
    expect(tradeFromRow({ ...tradeRow, stop_loss: "   " }).stopLoss).toBeNull();
  });

  it("treats an unparseable numeric column as null rather than passing it through", () => {
    expect(tradeFromRow({ ...tradeRow, stop_loss: "not-a-number" }).stopLoss).toBeNull();
  });

  it("preserves a genuine zero in a numeric column", () => {
    // Zero is a real value here — a stop exactly at the entry price — so it
    // must survive the blank check.
    expect(tradeFromRow({ ...tradeRow, stop_loss: "0" }).stopLoss).toBe("0");
  });

  it("handles optional text columns consistently", () => {
    const trade = tradeFromRow({
      ...tradeRow,
      market: null,
      setup_type: "",
      entry_reason: "  ",
      exit_reason: null,
      mistakes: null,
      lessons: null,
      notes: "",
    });
    expect(trade.market).toBeUndefined();
    expect(trade.setupType).toBeUndefined();
    expect(trade.entryReason).toBeUndefined();
    expect(trade.exitReason).toBeUndefined();
    expect(trade.mistakes).toBeUndefined();
    expect(trade.lessons).toBeUndefined();
    expect(trade.notes).toBeUndefined();
  });

  it("keeps a manual net P&L override when one was recorded", () => {
    const trade = tradeFromRow({ ...tradeRow, manual_net_pnl: "123.45" });
    expect(trade.manualNetPnl).toBe("123.45");
  });

  it("carries a soft delete marker through", () => {
    const trade = tradeFromRow({ ...tradeRow, deleted_at: "2026-03-01T00:00:00.000Z" });
    expect(trade.deletedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("trims surrounding whitespace from values a user typed", () => {
    const trade = tradeFromRow({ ...tradeRow, symbol: " EURUSD ", strategy: " London Breakout " });
    // Symbol is upper-cased at input, but the mapper must at least not carry
    // stray whitespace into matching and grouping.
    expect(trade.strategy).toBe("London Breakout");
    expect(trade.symbol).toBe("EURUSD");
  });
});

/* ------------------------------------------------------------------ */
/* Exits                                                              */
/* ------------------------------------------------------------------ */

describe("exitFromRow", () => {
  it("converts an exit row", () => {
    const exit = exitFromRow(exitRow);
    expect(exit.id).toBe("exit-1");
    expect(exit.tradeId).toBe("trade-1");
    expect(exit.quantity).toBe("1");
    expect(exit.price).toBe("1.0960");
    expect(exit.fees).toBe("2");
    expect(exit.exitedAt).toBe("2026-02-12T09:20:00.000Z");
  });
});

/* ------------------------------------------------------------------ */
/* Strategies                                                         */
/* ------------------------------------------------------------------ */

describe("strategyFromRow", () => {
  it("parses JSON array columns", () => {
    const strategy = strategyFromRow(strategyRow);
    expect(strategy.markets).toEqual(["FX"]);
    expect(strategy.instruments).toEqual(["EURUSD", "GBPUSD"]);
    expect(strategy.checklist).toEqual(["Range marked", "Stop placed"]);
    expect(strategy.tags).toEqual(["breakout"]);
  });

  it("maps a null session to null, not undefined", () => {
    expect(strategyFromRow({ ...strategyRow, session: null }).session).toBeNull();
  });

  it("returns an empty array for a null array column", () => {
    const strategy = strategyFromRow({ ...strategyRow, markets: null, tags: null });
    expect(strategy.markets).toEqual([]);
    expect(strategy.tags).toEqual([]);
  });

  it("survives a malformed array column instead of throwing", () => {
    // A truncated or hand-edited column must not take the whole row down.
    const strategy = strategyFromRow({ ...strategyRow, markets: "{not json" });
    expect(Array.isArray(strategy.markets)).toBe(true);
    expect(strategy.markets).toEqual(["{not json"]);
  });

  it("falls back to comma splitting when a column is not JSON at all", () => {
    const strategy = strategyFromRow({ ...strategyRow, tags: "breakout, london" });
    expect(strategy.tags).toEqual(["breakout", "london"]);
  });

  it("filters non-string members out of an array column", () => {
    const strategy = strategyFromRow({ ...strategyRow, markets: '["FX", 5, null, "Metals"]' });
    expect(strategy.markets).toEqual(["FX", "Metals"]);
  });

  it("ignores a JSON value that is not an array", () => {
    const strategy = strategyFromRow({ ...strategyRow, markets: '{"a":1}' });
    expect(strategy.markets).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Journal                                                            */
/* ------------------------------------------------------------------ */

describe("journalFromRow", () => {
  it("converts a journal row", () => {
    const entry = journalFromRow(journalRow);
    expect(entry.id).toBe("j-1");
    expect(entry.entryDate).toBe("2026-02-12");
    expect(entry.period).toBe("daily");
    expect(entry.title).toBe("London session");
    expect(entry.preMarketPlan).toBe("Only the London open");
    expect(entry.tradesSummary).toBe("One clean trade");
    expect(entry.disciplineScore).toBe(8);
    expect(entry.linkedTradeIds).toEqual(["trade-1"]);
    expect(entry.tags).toEqual(["london"]);
  });

  it("keeps an absent discipline score null", () => {
    expect(journalFromRow({ ...journalRow, discipline_score: null }).disciplineScore).toBeNull();
  });

  it("preserves a discipline score of zero", () => {
    // A self-rated 0 is a real rating, not an absent one.
    expect(journalFromRow({ ...journalRow, discipline_score: 0 }).disciplineScore).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Risk settings                                                      */
/* ------------------------------------------------------------------ */

describe("riskFromRow", () => {
  it("converts a risk row", () => {
    const risk = riskFromRow(riskRow);
    expect(risk.id).toBe("risk-1");
    expect(risk.accountId).toBe("acc-1");
    expect(risk.defaultRiskPercent).toBe("1");
    expect(risk.maxRiskPerTradePercent).toBe("2");
    expect(risk.dailyLossLimitAmount).toBe("500");
    expect(risk.maxConsecutiveLosses).toBe(3);
    expect(risk.cooldownAfterLosses).toBe(1);
    expect(risk.baseCurrency).toBe("EUR");
  });

  it("keeps an unset loss limit null rather than zero", () => {
    const risk = riskFromRow({ ...riskRow, weekly_loss_limit_amount: null });
    expect(risk.weeklyLossLimitAmount).toBeNull();
  });
});
