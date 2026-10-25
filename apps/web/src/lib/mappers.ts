/**
 * Row <-> domain mappers.
 *
 * The database uses snake_case columns; the shared core (`@tradevault/core`)
 * uses camelCase domain objects. Keeping the translation in one place means
 * the financial engine never has to know anything about Postgres.
 *
 * These functions are deliberately total: a missing numeric becomes "0" or
 * null rather than `undefined`, so nothing downstream has to defend against it.
 */

import type {
  Trade,
  TradeExit,
  TradeAttachment,
  JournalAttachment,
  TradingAccount,
  JournalEntry,
  TradingStrategy,
} from "@tradevault/core";
import type {
  TradeRow,
  TradeExitRow,
  TradeAttachmentRow,
  JournalAttachmentRow,
  TradingAccountRow,
  JournalEntryRow,
  TradingStrategyRow,
} from "./database.types";

const asNumeric = (v: string | number | null | undefined, fallback = "0"): string =>
  v === null || v === undefined ? fallback : String(v);

const asNullableNumeric = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined ? null : String(v);

const asText = (v: string | null | undefined): string | undefined =>
  v === null || v === undefined ? undefined : v;

/* ------------------------------------------------------------------ */
/* Accounts                                                           */
/* ------------------------------------------------------------------ */

export function accountFromRow(row: TradingAccountRow): TradingAccount {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    broker: asText(row.broker),
    currency: row.currency,
    startingBalance: asNumeric(row.starting_balance),
    balanceAdjustments: asNumeric(row.balance_adjustments),
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

export function accountToRow(
  account: Partial<TradingAccount>,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId };
  if (account.id !== undefined) row.id = account.id;
  if (account.name !== undefined) row.name = account.name;
  if (account.broker !== undefined) row.broker = account.broker ?? null;
  if (account.currency !== undefined) row.currency = account.currency;
  if (account.startingBalance !== undefined) row.starting_balance = account.startingBalance;
  if (account.balanceAdjustments !== undefined) row.balance_adjustments = account.balanceAdjustments;
  if (account.isArchived !== undefined) row.is_archived = account.isArchived;
  if (account.deletedAt !== undefined) row.deleted_at = account.deletedAt;
  return row;
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
    symbol: row.symbol,
    assetClass: row.asset_class,
    market: asText(row.market),
    direction: row.direction,
    status: row.status,
    orderType: row.order_type,
    entryAt: row.entry_at,
    entryPrice: asNumeric(row.entry_price),
    exitAt: row.exit_at,
    exitPrice: asNullableNumeric(row.exit_price),
    quantity: asNumeric(row.quantity),
    contractMultiplier: asNumeric(row.contract_multiplier, "1"),
    stopLoss: asNullableNumeric(row.stop_loss),
    takeProfit: asNullableNumeric(row.take_profit),
    entryFees: asNumeric(row.entry_fees),
    exitFees: asNumeric(row.exit_fees),
    fundingFees: asNumeric(row.funding_fees),
    slippage: asNumeric(row.slippage),
    strategy: asText(row.strategy),
    setupType: asText(row.setup_type),
    session: row.session,
    entryReason: asText(row.entry_reason),
    exitReason: asText(row.exit_reason),
    emotionBefore: row.emotion_before ?? undefined,
    emotionDuring: row.emotion_during ?? undefined,
    emotionAfter: row.emotion_after ?? undefined,
    mistakes: asText(row.mistakes),
    lessons: asText(row.lessons),
    notes: asText(row.notes),
    manualNetPnl: asNullableNumeric(row.manual_net_pnl),
    importFingerprint: row.import_fingerprint ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

export function tradeToRow(
  trade: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId };

  const direct: Array<[string, string]> = [
    ["id", "id"],
    ["accountId", "account_id"],
    ["strategyId", "strategy_id"],
    ["symbol", "symbol"],
    ["assetClass", "asset_class"],
    ["market", "market"],
    ["direction", "direction"],
    ["status", "status"],
    ["orderType", "order_type"],
    ["entryAt", "entry_at"],
    ["entryPrice", "entry_price"],
    ["exitAt", "exit_at"],
    ["exitPrice", "exit_price"],
    ["quantity", "quantity"],
    ["contractMultiplier", "contract_multiplier"],
    ["stopLoss", "stop_loss"],
    ["takeProfit", "take_profit"],
    ["entryFees", "entry_fees"],
    ["exitFees", "exit_fees"],
    ["fundingFees", "funding_fees"],
    ["slippage", "slippage"],
    ["strategy", "strategy"],
    ["setupType", "setup_type"],
    ["session", "session"],
    ["entryReason", "entry_reason"],
    ["exitReason", "exit_reason"],
    ["emotionBefore", "emotion_before"],
    ["emotionDuring", "emotion_during"],
    ["emotionAfter", "emotion_after"],
    ["mistakes", "mistakes"],
    ["lessons", "lessons"],
    ["notes", "notes"],
    ["manualNetPnl", "manual_net_pnl"],
    ["deletedAt", "deleted_at"],
    ["importFingerprint", "import_fingerprint"],
  ];

  for (const [from, to] of direct) {
    if (trade[from] !== undefined) {
      row[to] = to === "id" ? trade[from] : (trade[from] ?? null);
    }
  }
  return row;
}

export function exitFromRow(row: TradeExitRow): TradeExit {
  return {
    id: row.id,
    userId: row.user_id,
    tradeId: row.trade_id,
    quantity: asNumeric(row.quantity),
    price: asNumeric(row.price),
    fees: asNumeric(row.fees),
    exitedAt: row.exited_at,
    notes: asText(row.notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

export function exitToRow(
  exit: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId };
  const direct: Array<[string, string]> = [
    ["id", "id"],
    ["tradeId", "trade_id"],
    ["quantity", "quantity"],
    ["price", "price"],
    ["fees", "fees"],
    ["exitedAt", "exited_at"],
    ["notes", "notes"],
    ["deletedAt", "deleted_at"],
  ];
  for (const [from, to] of direct) {
    if (exit[from] !== undefined) {
      row[to] = to === "id" ? exit[from] : (exit[from] ?? null);
    }
  }
  return row;
}

/* ------------------------------------------------------------------ */
/* Attachments                                                        */
/* ------------------------------------------------------------------ */

export function attachmentFromRow(row: TradeAttachmentRow): TradeAttachment {
  return {
    id: row.id,
    userId: row.user_id,
    tradeId: row.trade_id,
    // On the web there is no meaningful local file URI once the page reloads:
    // a blob URL from a previous session is dead. The stored object path is the
    // real location, and a signed URL is minted from it on demand.
    localUri: null,
    remotePath: row.remote_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size ?? 0),
    caption: asText(row.caption),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

export function journalAttachmentFromRow(row: JournalAttachmentRow): JournalAttachment {
  return {
    id: row.id,
    userId: row.user_id,
    journalEntryId: row.journal_entry_id,
    // Same reasoning as a trade attachment: a blob URL does not survive a
    // reload, so the stored object path is the real location.
    localUri: null,
    remotePath: row.remote_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size ?? 0),
    caption: asText(row.caption),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------------ */
/* Journal                                                            */
/* ------------------------------------------------------------------ */

export function journalFromRow(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    userId: row.user_id,
    entryDate: row.entry_date,
    period: row.period,
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
    linkedTradeIds: row.linked_trade_ids ?? [],
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

export function journalToRow(
  entry: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId };
  const direct: Array<[string, string]> = [
    ["id", "id"],
    ["entryDate", "entry_date"],
    ["period", "period"],
    ["title", "title"],
    ["goals", "goals"],
    ["marketObservations", "market_observations"],
    ["preMarketPlan", "pre_market_plan"],
    ["tradesSummary", "trades_summary"],
    ["emotionalState", "emotional_state"],
    ["disciplineScore", "discipline_score"],
    ["mistakes", "mistakes"],
    ["lessons", "lessons"],
    ["improvements", "improvements"],
    ["notes", "notes"],
    ["linkedTradeIds", "linked_trade_ids"],
    ["tags", "tags"],
    ["deletedAt", "deleted_at"],
  ];
  for (const [from, to] of direct) {
    if (entry[from] !== undefined) {
      row[to] = to === "id" ? entry[from] : (entry[from] ?? null);
    }
  }
  return row;
}

/* ------------------------------------------------------------------ */
/* Strategies                                                         */
/* ------------------------------------------------------------------ */

export function strategyFromRow(row: TradingStrategyRow): TradingStrategy {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: asText(row.description),
    markets: row.markets ?? [],
    instruments: row.instruments ?? [],
    entryRules: asText(row.entry_rules),
    exitRules: asText(row.exit_rules),
    riskRules: asText(row.risk_rules),
    session: row.session,
    checklist: row.checklist ?? [],
    tags: row.tags ?? [],
    improvementNotes: asText(row.improvement_notes),
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    deletedAt: row.deleted_at,
  };
}

export function strategyToRow(
  strategy: Record<string, unknown>,
  userId: string
): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId };
  const direct: Array<[string, string]> = [
    ["id", "id"],
    ["name", "name"],
    ["description", "description"],
    ["markets", "markets"],
    ["instruments", "instruments"],
    ["entryRules", "entry_rules"],
    ["exitRules", "exit_rules"],
    ["riskRules", "risk_rules"],
    ["session", "session"],
    ["checklist", "checklist"],
    ["tags", "tags"],
    ["improvementNotes", "improvement_notes"],
    ["isArchived", "is_archived"],
    ["deletedAt", "deleted_at"],
  ];
  for (const [from, to] of direct) {
    if (strategy[from] !== undefined) {
      row[to] = to === "id" ? strategy[from] : (strategy[from] ?? null);
    }
  }
  return row;
}
