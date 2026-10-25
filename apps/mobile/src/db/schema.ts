/**
 * Local SQLite schema.
 *
 * This is the mobile app's source of truth while it is running. Every read goes
 * here first, so the app is fully usable with no network at all. Supabase is
 * reached through the sync queue in the background, never on the critical path
 * of writing a trade.
 *
 * Two decisions worth stating:
 *
 *   * Columns mirror the server schema exactly (snake_case, numeric-as-text).
 *     The mapping layer is therefore trivial and less likely to lose a field.
 *   * `revision` and `deleted_at` exist locally too. Soft deletes and revisions
 *     are what make the queue's conflict detection possible.
 */

export const SCHEMA_VERSION = 2;

export const CREATE_STATEMENTS: string[] = [
  `PRAGMA journal_mode = WAL;`,
  `PRAGMA foreign_keys = ON;`,

  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    broker TEXT,
    currency TEXT NOT NULL,
    starting_balance TEXT NOT NULL DEFAULT '0',
    balance_adjustments TEXT NOT NULL DEFAULT '0',
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    -- 0 = synced, 1 = has a pending local change
    dirty INTEGER NOT NULL DEFAULT 1
  );`,

  `CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    account_id TEXT NOT NULL,
    strategy_id TEXT,
    symbol TEXT NOT NULL,
    asset_class TEXT NOT NULL DEFAULT 'other',
    market TEXT,
    direction TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    order_type TEXT NOT NULL DEFAULT 'market',
    entry_at TEXT NOT NULL,
    entry_price TEXT NOT NULL,
    exit_at TEXT,
    exit_price TEXT,
    quantity TEXT NOT NULL,
    contract_multiplier TEXT NOT NULL DEFAULT '1',
    stop_loss TEXT,
    take_profit TEXT,
    entry_fees TEXT NOT NULL DEFAULT '0',
    exit_fees TEXT NOT NULL DEFAULT '0',
    funding_fees TEXT NOT NULL DEFAULT '0',
    slippage TEXT NOT NULL DEFAULT '0',
    strategy TEXT,
    setup_type TEXT,
    session TEXT NOT NULL DEFAULT 'outside',
    entry_reason TEXT,
    exit_reason TEXT,
    emotion_before TEXT,
    emotion_during TEXT,
    emotion_after TEXT,
    mistakes TEXT,
    lessons TEXT,
    notes TEXT,
    manual_net_pnl TEXT,
    import_fingerprint TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );`,

  `CREATE TABLE IF NOT EXISTS trade_exits (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    trade_id TEXT NOT NULL,
    quantity TEXT NOT NULL,
    price TEXT NOT NULL,
    fees TEXT NOT NULL DEFAULT '0',
    exited_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (trade_id) REFERENCES trades (id) ON DELETE CASCADE
  );`,

  `CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    markets TEXT,
    instruments TEXT,
    entry_rules TEXT,
    exit_rules TEXT,
    risk_rules TEXT,
    session TEXT,
    checklist TEXT,
    tags TEXT,
    improvement_notes TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );`,

  `CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    entry_date TEXT NOT NULL,
    period TEXT NOT NULL DEFAULT 'daily',
    title TEXT,
    goals TEXT,
    market_observations TEXT,
    pre_market_plan TEXT,
    trades_summary TEXT,
    emotional_state TEXT,
    mistakes TEXT,
    lessons TEXT,
    improvements TEXT,
    notes TEXT,
    linked_trade_ids TEXT,
    discipline_score INTEGER,
    tags TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );`,

  `CREATE TABLE IF NOT EXISTS risk_settings (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    account_id TEXT,
    default_risk_percent TEXT NOT NULL DEFAULT '1',
    max_risk_per_trade_percent TEXT NOT NULL DEFAULT '2',
    daily_loss_limit_amount TEXT,
    weekly_loss_limit_amount TEXT,
    max_consecutive_losses INTEGER NOT NULL DEFAULT 3,
    cooldown_after_losses INTEGER NOT NULL DEFAULT 0,
    base_currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    dirty INTEGER NOT NULL DEFAULT 1
  );`,

  `CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT NOT NULL,
    base_revision INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    local_revision INTEGER NOT NULL,
    remote_revision INTEGER NOT NULL,
    detected_at TEXT NOT NULL,
    resolution TEXT NOT NULL DEFAULT 'unresolved',
    resolved_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );`,

  // Trade screenshots. The image itself lives in the app's private document
  // directory; the row only points at it. `local_uri` is therefore a file://
  // path on this phone, never a URL anyone else can fetch.
  `CREATE TABLE IF NOT EXISTS trade_attachments (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    trade_id TEXT NOT NULL,
    local_uri TEXT NOT NULL,
    remote_path TEXT,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    caption TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );`,

  // Indexes that match the queries the app actually runs.
  `CREATE INDEX IF NOT EXISTS idx_attachments_trade ON trade_attachments (trade_id);`,
  `CREATE INDEX IF NOT EXISTS idx_trades_account ON trades (account_id);`,
  `CREATE INDEX IF NOT EXISTS idx_trades_entry_at ON trades (entry_at);`,
  `CREATE INDEX IF NOT EXISTS idx_trades_dirty ON trades (dirty);`,
  `CREATE INDEX IF NOT EXISTS idx_exits_trade ON trade_exits (trade_id);`,
  `CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries (entry_date);`,
  `CREATE INDEX IF NOT EXISTS idx_queue_entity ON sync_queue (entity, entity_id);`,
];
