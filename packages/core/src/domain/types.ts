/**
 * TradeVault — core domain types.
 *
 * Every persisted entity carries a stable UUID `id` plus `createdAt`/`updatedAt`
 * timestamps so the sync layer can deduplicate and resolve conflicts
 * deterministically (see src/lib/sync.ts).
 */

export type UUID = string;

/** ISO-8601 UTC timestamp, e.g. "2026-03-04T09:31:00.000Z". */
export type ISOTimestamp = string;

/** Decimal stored as a string to avoid binary floating point rounding. */
export type Decimal = string;

export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "UGX"
  | "JPY"
  | "AUD"
  | "CAD"
  | "CHF";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "UGX",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
];

export type AssetClass =
  | "forex"
  | "crypto"
  | "stock"
  | "index"
  | "future"
  | "commodity"
  | "option"
  | "other";

export const ASSET_CLASSES: AssetClass[] = [
  "forex",
  "crypto",
  "stock",
  "index",
  "future",
  "commodity",
  "option",
  "other",
];

export type TradeDirection = "long" | "short";
export type TradeStatus = "open" | "partial" | "closed";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export type TradingSession =
  | "sydney"
  | "tokyo"
  | "london"
  | "new_york"
  | "outside";

export const TRADING_SESSIONS: TradingSession[] = [
  "sydney",
  "tokyo",
  "london",
  "new_york",
  "outside",
];

export type Emotion =
  | "calm"
  | "confident"
  | "anxious"
  | "fearful"
  | "greedy"
  | "frustrated"
  | "impatient"
  | "neutral"
  | "euphoric";

export const EMOTIONS: Emotion[] = [
  "calm",
  "confident",
  "neutral",
  "anxious",
  "fearful",
  "greedy",
  "frustrated",
  "impatient",
  "euphoric",
];

/* ------------------------------------------------------------------ */
/* Trading account                                                     */
/* ------------------------------------------------------------------ */

export interface TradingAccount {
  id: UUID;
  userId: UUID | null;
  name: string;
  broker?: string;
  currency: CurrencyCode;
  startingBalance: Decimal;
  /** Manual cash-flow adjustments (deposits positive, withdrawals negative). */
  balanceAdjustments: Decimal;
  isArchived: boolean;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  /** Incremented on every mutation; used for sync conflict detection. */
  revision: number;
  deletedAt: ISOTimestamp | null;
}

/* ------------------------------------------------------------------ */
/* Trades                                                             */
/* ------------------------------------------------------------------ */

export interface ContractSpec {
  multiplier: Decimal;
  quantityStep?: Decimal;
  pricePrecision: number;
  quantityPrecision: number;
  profitCurrency: CurrencyCode;
}

export interface Trade {
  id: UUID;
  userId: UUID | null;
  accountId: UUID;
  strategyId: UUID | null;

  symbol: string;
  assetClass: AssetClass;
  market?: string;
  direction: TradeDirection;
  status: TradeStatus;
  orderType: OrderType;

  entryAt: ISOTimestamp;
  entryPrice: Decimal;
  exitAt: ISOTimestamp | null;
  exitPrice: Decimal | null;

  /** Opening quantity. Sum of exits must never exceed this. */
  quantity: Decimal;
  contractMultiplier: Decimal;

  stopLoss: Decimal | null;
  takeProfit: Decimal | null;

  entryFees: Decimal;
  exitFees: Decimal;
  fundingFees: Decimal;
  slippage: Decimal;

  strategy?: string;
  setupType?: string;
  session: TradingSession;

  entryReason?: string;
  exitReason?: string;

  emotionBefore?: Emotion;
  emotionDuring?: Emotion;
  emotionAfter?: Emotion;

  mistakes?: string;
  lessons?: string;
  notes?: string;

  /** Optional override; the computed value is always retained alongside it. */
  manualNetPnl: Decimal | null;

  /**
   * Fingerprint of the source row when this trade came from a CSV import.
   * Used to recognise the same row arriving twice; null for hand-entered trades.
   */
  importFingerprint: string | null;

  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

export interface TradeExit {
  id: UUID;
  userId: UUID | null;
  tradeId: UUID;
  quantity: Decimal;
  price: Decimal;
  fees: Decimal;
  exitedAt: ISOTimestamp;
  notes?: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

export interface TradeAttachment {
  id: UUID;
  userId: UUID | null;
  tradeId: UUID;
  /** Local file URI; on web this is a blob/object URL. */
  localUri: string | null;
  /** Storage object path once uploaded. */
  remotePath: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  caption?: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

/**
 * An image attached to a journal entry.
 *
 * Deliberately a separate shape from `TradeAttachment` rather than a union with
 * a nullable owner. A journal image belongs to a calendar day and outlives any
 * single trade, so the two are stored, deleted and reasoned about differently.
 */
export interface JournalAttachment {
  id: UUID;
  userId: UUID | null;
  journalEntryId: UUID;
  /** Local file URI; on web this is a blob/object URL. */
  localUri: string | null;
  /** Storage object path once uploaded. */
  remotePath: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  caption?: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

/* ------------------------------------------------------------------ */
/* Strategies, journal, tags                                          */
/* ------------------------------------------------------------------ */

export interface TradingStrategy {
  id: UUID;
  userId: UUID | null;
  name: string;
  description?: string;
  markets: string[];
  instruments: string[];
  entryRules?: string;
  exitRules?: string;
  riskRules?: string;
  session: TradingSession | null;
  checklist: string[];
  tags: string[];
  improvementNotes?: string;
  isArchived: boolean;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

export type JournalPeriod = "daily" | "weekly" | "monthly";

export interface JournalEntry {
  id: UUID;
  userId: UUID | null;
  entryDate: string; // YYYY-MM-DD in the user's time zone
  period: JournalPeriod;
  title?: string;
  goals?: string;
  marketObservations?: string;
  preMarketPlan?: string;
  tradesSummary?: string;
  emotionalState?: string;
  disciplineScore: number | null;
  mistakes?: string;
  lessons?: string;
  improvements?: string;
  notes?: string;
  linkedTradeIds: UUID[];
  tags: string[];
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

export interface Tag {
  id: UUID;
  userId: UUID | null;
  name: string;
  color: string;
  kind: "trade" | "journal" | "strategy";
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

/* ------------------------------------------------------------------ */
/* Risk & rules                                                       */
/* ------------------------------------------------------------------ */

export interface RiskSettings {
  id: UUID;
  userId: UUID | null;
  accountId: UUID | null;
  defaultRiskPercent: Decimal;
  maxRiskPerTradePercent: Decimal;
  dailyLossLimitAmount: Decimal | null;
  weeklyLossLimitAmount: Decimal | null;
  maxConsecutiveLosses: number;
  cooldownAfterLosses: number;
  baseCurrency: CurrencyCode;
  updatedAt: ISOTimestamp;
  revision: number;
}

export interface TradingRule {
  id: UUID;
  userId: UUID | null;
  label: string;
  description?: string;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

/* ------------------------------------------------------------------ */
/* Profile / preferences                                              */
/* ------------------------------------------------------------------ */

export interface UserProfile {
  id: UUID;
  email: string | null;
  displayName: string;
  currency: CurrencyCode;
  timeZone: string;
  defaultInstruments: string[];
  defaultMarkets: string[];
  theme: "dark" | "light" | "system";
  riskPercentDefault: Decimal;
  onboardingComplete: boolean;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  revision: number;
}

/* ------------------------------------------------------------------ */
/* Sync                                                               */
/* ------------------------------------------------------------------ */

export type SyncOp = "insert" | "update" | "delete";

export type SyncEntity =
  | "trading_accounts"
  | "trades"
  | "trade_exits"
  | "trade_attachments"
  | "trading_strategies"
  | "journal_entries"
  | "tags"
  | "trading_rules"
  | "risk_settings";

export interface SyncQueueItem {
  id: UUID;
  entity: SyncEntity;
  entityId: UUID;
  op: SyncOp;
  payload: string; // JSON snapshot at time of mutation
  baseRevision: number;
  attempts: number;
  lastError: string | null;
  createdAt: ISOTimestamp;
}

export type SyncState = "idle" | "syncing" | "offline" | "error" | "conflict";

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncedAt: ISOTimestamp | null;
  lastError: string | null;
  conflicts: SyncConflict[];
}

export interface SyncConflict {
  entity: SyncEntity;
  entityId: UUID;
  localRevision: number;
  remoteRevision: number;
  detectedAt: ISOTimestamp;
  resolution: "unresolved" | "kept_local" | "kept_remote" | "merged";
}

/* ------------------------------------------------------------------ */
/* Import / export                                                    */
/* ------------------------------------------------------------------ */

export interface ImportJob {
  id: UUID;
  userId: UUID | null;
  fileName: string;
  adapter: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  status: "preview" | "running" | "complete" | "failed" | "cancelled";
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface ImportError {
  id: UUID;
  userId: UUID | null;
  importJobId: UUID;
  rowNumber: number;
  column?: string;
  message: string;
  rawRow?: string;
  createdAt: ISOTimestamp;
}
