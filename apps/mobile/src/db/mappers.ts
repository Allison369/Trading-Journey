/**
 * Row <-> domain mapping.
 *
 * Kept identical in behaviour to the web app's mappers so a record written on
 * the phone and read in the browser produces the same domain object. Numeric
 * columns are stored as TEXT and parsed only at the boundary, which is what
 * keeps binary floating-point out of the money maths.
 */

import {
  type Trade,
  type TradeExit,
  type TradingAccount,
  type TradingStrategy,
  type JournalEntry,
  type RiskSettings,
  type CurrencyCode,
  type AssetClass,
  type TradeDirection,
  type TradeStatus,
  type OrderType,
  type TradingSession,
  type Emotion,
} from "@tradevault/core";

export interface AccountRow {
  id: string;
  user_id: string | null;
  name: string;
  broker: string | null;
  currency: string;
  starting_balance: string;
  balance_adjustments: string;
  is_archived: number;
  created_at: string;
  updated_at: string;
  revision: number;
  deleted_at: string | null;
  dirty: number;
}

export interface TradeRow {
  id: string;
  user_id: string | null;
  account_id: string;
  strategy_id: string | null;
  symbol: string;
  asset_class: string;
  market: string | null;
  direction: string;
  status: string;
  order_type: string;
  entry_at: string;
  entry_price: string;
  exit_at: string | null;
  exit_price: string | null;
  quantity: string;
  contract_multiplier: string;
  stop_loss: string | null;
  take_profit: string | null;
  entry_fees: string;
  exit_fees: string;
  funding_fees: string;
  slippage: string;
  strategy: string | null;
  setup_type: string | null;
  session: string;
  entry_reason: string | null;
  exit_reason: string | null;
  emotion_before: string | null;
  emotion_during: string | null;
  emotion_after: string | null;
  mistakes: string | null;
  lessons: string | null;
  notes: string | null;
  manual_net_pnl: string | null;
  import_fingerprint: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  deleted_at: string | null;
  dirty: number;
}

export interface ExitRow {
  id: string;
  user_id: string | null;
  trade_id: string;
  quantity: string;
  price: string;
  fees: string;
  exited_at: string;
  created_at: string;
  updated_at: string;
  revision: number;
  deleted_at: string | null;
  dirty: number;
}

export interface StrategyRow {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  markets: string | null;
  instruments: string | null;
  entry_rules: string | null;
  exit_rules: string | null;
  risk_rules: string | null;
  session: string | null;
  checklist: string | null;
  tags: string | null;
  improvement_notes: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
  revision: number;
  deleted_at: string | null;
  dirty: number;
}

export interface JournalRow {
  id: string;
  user_id: string | null;
  entry_date: string;
  period: string;
  title: string | null;
  goals: string | null;
  market_observations: string | null;
  pre_market_plan: string | null;
  trades_summary: string | null;
  emotional_state: string | null;
  mistakes: string | null;
  lessons: string | null;
  improvements: string | null;
  notes: string | null;
  linked_trade_ids: string | null;
  discipline_score: number | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  deleted_at: string | null;
  dirty: number;
}

/** Postgres numerics arrive as strings; a blank or unparseable value is null. */
function asNullableNumeric(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? trimmed : null;
}

function asText(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Parse a JSON array column, tolerating null and malformed content. */
function asArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // A hand-edited or truncated column must not take the whole row down.
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
}

/**
 * Collapse whitespace on a required text field.
 *
 * Symbols and account names are used as matching keys — grouping by symbol, or
 * finding an account by name. A stray space would silently split one instrument
 * into two groups, so it is normalised at the boundary rather than trusted.
 */
function asRequiredText(value: string): string {
  return value.trim();
}

/* ------------------------------------------------------------------ */
/* Accounts                                                           */
/* ------------------------------------------------------------------ */

export function accountFromRow(row: AccountRow): TradingAccount {
  return {
    id: row.id,
    userId: row.user_id,
    name: asRequiredText(row.name),
    broker: asText(row.broker),
    currency: row.currency as CurrencyCode,
    startingBalance: row.starting_balance,
    balanceAdjustments: row.balance_adjustments,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------------ */
/* Trades                                                             */
/* ------------------------------------------------------------------ */

export function tradeFromRow(row: TradeRow): Trade {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    strategyId: row.strategy_id,
    symbol: asRequiredText(row.symbol),
    assetClass: row.asset_class as AssetClass,
    market: asText(row.market),
    direction: row.direction as TradeDirection,
    status: row.status as TradeStatus,
    orderType: row.order_type as OrderType,
    entryAt: row.entry_at,
    entryPrice: row.entry_price,
    exitAt: row.exit_at,
    exitPrice: asNullableNumeric(row.exit_price),
    quantity: row.quantity,
    contractMultiplier: row.contract_multiplier,
    stopLoss: asNullableNumeric(row.stop_loss),
    takeProfit: asNullableNumeric(row.take_profit),
    entryFees: row.entry_fees,
    exitFees: row.exit_fees,
    fundingFees: row.funding_fees,
    slippage: row.slippage,
    strategy: asText(row.strategy),
    setupType: asText(row.setup_type),
    session: row.session as TradingSession,
    entryReason: asText(row.entry_reason),
    exitReason: asText(row.exit_reason),
    emotionBefore: (asText(row.emotion_before) as Emotion | undefined) ?? undefined,
    emotionDuring: (asText(row.emotion_during) as Emotion | undefined) ?? undefined,
    emotionAfter: (asText(row.emotion_after) as Emotion | undefined) ?? undefined,
    mistakes: asText(row.mistakes),
    lessons: asText(row.lessons),
    notes: asText(row.notes),
    manualNetPnl: asNullableNumeric(row.manual_net_pnl),
    importFingerprint: row.import_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------------ */
/* Exits                                                              */
/* ------------------------------------------------------------------ */

export function exitFromRow(row: ExitRow): TradeExit {
  return {
    id: row.id,
    userId: row.user_id,
    tradeId: row.trade_id,
    quantity: row.quantity,
    price: row.price,
    fees: row.fees,
    exitedAt: row.exited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------------ */
/* Strategies                                                         */
/* ------------------------------------------------------------------ */

export function strategyFromRow(row: StrategyRow): TradingStrategy {
  return {
    id: row.id,
    userId: row.user_id,
    name: asRequiredText(row.name),
    description: asText(row.description),
    markets: asArray(row.markets),
    instruments: asArray(row.instruments),
    entryRules: asText(row.entry_rules),
    exitRules: asText(row.exit_rules),
    riskRules: asText(row.risk_rules),
    session: (asText(row.session) as TradingSession | undefined) ?? null,
    checklist: asArray(row.checklist),
    tags: asArray(row.tags),
    improvementNotes: asText(row.improvement_notes),
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------------ */
/* Journal                                                            */
/* ------------------------------------------------------------------ */

export function journalFromRow(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    userId: row.user_id,
    entryDate: row.entry_date,
    period: row.period as JournalEntry["period"],
    title: asText(row.title),
    goals: asText(row.goals),
    marketObservations: asText(row.market_observations),
    preMarketPlan: asText(row.pre_market_plan),
    tradesSummary: asText(row.trades_summary),
    emotionalState: asText(row.emotional_state),
    disciplineScore: row.discipline_score,
    mistakes: asText(row.mistakes),
    lessons: asText(row.lessons),
    improvements: asText(row.improvements),
    notes: asText(row.notes),
    linkedTradeIds: asArray(row.linked_trade_ids),
    tags: asArray(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------------ */
/* Risk settings                                                      */
/* ------------------------------------------------------------------ */

export interface RiskRow {
  id: string;
  user_id: string | null;
  account_id: string | null;
  default_risk_percent: string;
  max_risk_per_trade_percent: string;
  daily_loss_limit_amount: string | null;
  weekly_loss_limit_amount: string | null;
  max_consecutive_losses: number;
  cooldown_after_losses: number;
  base_currency: string;
  updated_at: string;
  revision: number;
  dirty: number;
}

export function riskFromRow(row: RiskRow): RiskSettings {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    defaultRiskPercent: row.default_risk_percent,
    maxRiskPerTradePercent: row.max_risk_per_trade_percent,
    dailyLossLimitAmount: asNullableNumeric(row.daily_loss_limit_amount),
    weeklyLossLimitAmount: asNullableNumeric(row.weekly_loss_limit_amount),
    maxConsecutiveLosses: row.max_consecutive_losses,
    cooldownAfterLosses: row.cooldown_after_losses,
    baseCurrency: row.base_currency as CurrencyCode,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}
