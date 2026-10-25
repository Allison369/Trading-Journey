/**
 * Database types.
 *
 * These mirror the SQL in supabase/migrations/0001_initial_schema.sql. They
 * are hand-written rather than generated so they stay reviewable and so the
 * repository has no dependency on a live project to typecheck.
 *
 * If you change the schema, change these too — `npm run typecheck` is what
 * catches the drift.
 *
 * Postgres `numeric` is transported by PostgREST as a JSON number, but we keep
 * it as a string in the app to avoid binary floating-point rounding on the way
 * in and out. See packages/core/src/domain/decimal.ts.
 */

export type UUID = string;
export type ISOTimestamp = string;
/** Decimal serialised as a string, e.g. "1.08500". */
export type Numeric = string;

export type CurrencyCode = "USD" | "EUR" | "GBP" | "UGX" | "JPY" | "AUD" | "CAD" | "CHF";
export type AssetClass =
  | "forex" | "crypto" | "stock" | "index" | "future" | "commodity" | "option" | "other";
export type TradeDirection = "long" | "short";
export type TradeStatus = "open" | "partial" | "closed";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TradingSession = "sydney" | "tokyo" | "london" | "new_york" | "outside";
export type Emotion =
  | "calm" | "confident" | "anxious" | "fearful" | "greedy"
  | "frustrated" | "impatient" | "neutral" | "euphoric";
export type JournalPeriod = "daily" | "weekly" | "monthly";
export type TagKind = "trade" | "journal" | "strategy";

export interface ProfileRow {
  id: UUID;
  email: string | null;
  display_name: string;
  currency: CurrencyCode;
  time_zone: string;
  default_instruments: string[];
  default_markets: string[];
  theme: "dark" | "light" | "system";
  risk_percent_default: Numeric;
  onboarding_complete: boolean;
  /** Grants the read-only users overview. Settable only by an existing admin. */
  is_admin: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
}

export interface TradingAccountRow {
  id: UUID;
  user_id: UUID;
  name: string;
  broker: string | null;
  currency: CurrencyCode;
  starting_balance: Numeric;
  balance_adjustments: Numeric;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface TradingStrategyRow {
  id: UUID;
  user_id: UUID;
  name: string;
  description: string | null;
  markets: string[];
  instruments: string[];
  entry_rules: string | null;
  exit_rules: string | null;
  risk_rules: string | null;
  session: TradingSession | null;
  checklist: string[];
  tags: string[];
  improvement_notes: string | null;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface TradeRow {
  id: UUID;
  user_id: UUID;
  account_id: UUID;
  strategy_id: UUID | null;
  symbol: string;
  asset_class: AssetClass;
  market: string | null;
  direction: TradeDirection;
  status: TradeStatus;
  order_type: OrderType;
  entry_at: ISOTimestamp;
  entry_price: Numeric;
  exit_at: ISOTimestamp | null;
  exit_price: Numeric | null;
  quantity: Numeric;
  contract_multiplier: Numeric;
  stop_loss: Numeric | null;
  take_profit: Numeric | null;
  entry_fees: Numeric;
  exit_fees: Numeric;
  funding_fees: Numeric;
  slippage: Numeric;
  strategy: string | null;
  setup_type: string | null;
  session: TradingSession;
  entry_reason: string | null;
  exit_reason: string | null;
  emotion_before: Emotion | null;
  emotion_during: Emotion | null;
  emotion_after: Emotion | null;
  mistakes: string | null;
  lessons: string | null;
  notes: string | null;
  manual_net_pnl: Numeric | null;
  import_fingerprint: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface TradeExitRow {
  id: UUID;
  user_id: UUID;
  trade_id: UUID;
  quantity: Numeric;
  price: Numeric;
  fees: Numeric;
  exited_at: ISOTimestamp;
  notes: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface TradeAttachmentRow {
  id: UUID;
  user_id: UUID;
  trade_id: UUID;
  remote_path: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  caption: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface JournalAttachmentRow {
  id: UUID;
  user_id: UUID;
  journal_entry_id: UUID;
  remote_path: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  caption: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface JournalEntryRow {
  id: UUID;
  user_id: UUID;
  entry_date: string;
  period: JournalPeriod;
  title: string | null;
  goals: string | null;
  market_observations: string | null;
  pre_market_plan: string | null;
  trades_summary: string | null;
  emotional_state: string | null;
  discipline_score: number | null;
  mistakes: string | null;
  lessons: string | null;
  improvements: string | null;
  notes: string | null;
  linked_trade_ids: UUID[];
  tags: string[];
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface TagRow {
  id: UUID;
  user_id: UUID;
  name: string;
  color: string;
  kind: TagKind;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface TradingRuleRow {
  id: UUID;
  user_id: UUID;
  label: string;
  description: string | null;
  is_enabled: boolean;
  sort_order: number;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
  deleted_at: ISOTimestamp | null;
}

export interface RiskSettingsRow {
  id: UUID;
  user_id: UUID;
  account_id: UUID | null;
  default_risk_percent: Numeric;
  max_risk_per_trade_percent: Numeric;
  daily_loss_limit_amount: Numeric | null;
  weekly_loss_limit_amount: Numeric | null;
  max_consecutive_losses: number;
  cooldown_after_losses: number;
  base_currency: CurrencyCode;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  revision: number;
}

export interface ImportJobRow {
  id: UUID;
  user_id: UUID;
  file_name: string;
  adapter: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  status: "preview" | "running" | "complete" | "failed" | "cancelled";
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface ImportErrorRow {
  id: UUID;
  user_id: UUID;
  import_job_id: UUID;
  row_number: number;
  column_name: string | null;
  message: string;
  raw_row: string | null;
  created_at: ISOTimestamp;
}

export interface SyncMetadataRow {
  user_id: UUID;
  last_synced_at: ISOTimestamp | null;
  device_id: string | null;
  app_version: string | null;
  updated_at: ISOTimestamp;
}

export interface SubscriptionEntitlementRow {
  user_id: UUID;
  tier: "free" | "premium";
  verified_at: ISOTimestamp | null;
  expires_at: ISOTimestamp | null;
  provider: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/* ------------------------------------------------------------------ */
/* Insert / update payloads                                           */
/* ------------------------------------------------------------------ */

export type TradingAccountInsert =
  Omit<TradingAccountRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<TradingAccountRow, "id" | "deleted_at">>;

export type TradeInsert =
  Omit<TradeRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<TradeRow, "id" | "deleted_at">>;

export type TradeExitInsert =
  Omit<TradeExitRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<TradeExitRow, "id" | "deleted_at">>;

export type JournalEntryInsert =
  Omit<JournalEntryRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<JournalEntryRow, "id" | "deleted_at">>;

export type TradingStrategyInsert =
  Omit<TradingStrategyRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<TradingStrategyRow, "id" | "deleted_at">>;

export type TagInsert =
  Omit<TagRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<TagRow, "id" | "deleted_at">>;

export type TradingRuleInsert =
  Omit<TradingRuleRow, "id" | "created_at" | "updated_at" | "revision"> &
  Partial<Pick<TradingRuleRow, "id" | "deleted_at">>;

/**
 * Shapes returned by the Supabase client.
 *
 * PostgREST returns nested rows when a select embeds a relation, e.g.
 * `select("*, trade_exits(*)")`. Modelling that explicitly keeps the pages
 * type-safe without casts.
 */
export interface TradeWithExits extends TradeRow {
  trade_exits: TradeExitRow[];
}

/* ------------------------------------------------------------------ */
/* Admin views (migration 0004)                                        */
/* ------------------------------------------------------------------ */

/**
 * A row of `admin_user_overview`.
 *
 * Identity and row counts only. There is deliberately no trading column here —
 * no balance, no P&L, no symbol — and the RLS suite asserts the view's shape to
 * keep it that way. See supabase/migrations/0004_admin_role.sql.
 */
export interface AdminUserOverviewRow {
  user_id: UUID;
  email: string | null;
  display_name: string;
  joined_at: ISOTimestamp;
  is_admin: boolean;
  trade_count: number;
  journal_count: number;
  last_active_at: ISOTimestamp;
}

/** The single row of `admin_platform_totals`. Counts only. */
export interface AdminPlatformTotalsRow {
  user_count: number;
  admin_count: number;
  new_users_7d: number;
  trade_count: number;
  journal_count: number;
}
