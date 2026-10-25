/**
 * The mobile offline store.
 *
 * Every read and write in the app goes through here. The store owns three
 * responsibilities and keeps them separate on purpose:
 *
 *   1. **Persistence** — records live in SQLite, so the app works with no
 *      network and survives being killed.
 *   2. **Change tracking** — each mutation marks the row dirty and appends an
 *      entry to the sync queue with the revision the client believed was
 *      current. That belief is what makes conflict detection possible later.
 *   3. **Honesty about state** — deletes are soft (`deleted_at`), never
 *      destructive, so a delete made offline cannot be silently lost.
 *
 * The financial maths is NOT here. It lives in `@tradevault/core` and is shared
 * byte-for-byte with the web app, so the phone and the browser can never
 * disagree about what a trade was worth.
 */

import {
  generateId,
  nowIso,
  queueMutation,
  type SyncEntity,
  type SyncQueueItem,
  type SyncConflict,
  type SyncOp,
  type Trade,
  type TradeExit,
  type TradingAccount,
  type TradingStrategy,
  type JournalEntry,
  type RiskSettings,
  type ISOTimestamp,
} from "@tradevault/core";

import { all, one, run, transaction } from "../db/database";
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
} from "../db/mappers";

const LIVE = "deleted_at IS NULL";

/**
 * Core's `SyncEntity` names are the server table names. Keeping them in one
 * map means a rename in the database is a one-line change here, and it stops
 * the string literals being scattered through the write functions.
 */
const ENTITY = {
  account: "trading_accounts",
  trade: "trades",
  exit: "trade_exits",
  strategy: "trading_strategies",
  journal: "journal_entries",
  risk: "risk_settings",
} as const satisfies Record<string, SyncEntity>;

type EntityKey = keyof typeof ENTITY;

/* ------------------------------------------------------------------ */
/* Sync store adapter                                                 */
/* ------------------------------------------------------------------ */

/** The slice of this store that the pure sync engine needs. */
export function syncAdapter() {
  return {
    async listQueue(): Promise<SyncQueueItem[]> {
      const rows = all<{
        id: string;
        entity: string;
        entity_id: string;
        op: string;
        payload: string;
        base_revision: number;
        attempts: number;
        last_error: string | null;
        created_at: string;
      }>(`SELECT * FROM sync_queue ORDER BY created_at ASC`);
      return rows.map((r) => ({
        id: r.id,
        entity: r.entity as SyncEntity,
        entityId: r.entity_id,
        op: r.op as SyncOp,
        payload: r.payload,
        baseRevision: r.base_revision,
        attempts: r.attempts,
        lastError: r.last_error,
        createdAt: r.created_at,
      }));
    },
    async enqueue(item: SyncQueueItem): Promise<void> {
      run(
        `INSERT INTO sync_queue
           (id, entity, entity_id, op, payload, base_revision, attempts, last_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.entity,
          item.entityId,
          item.op,
          item.payload,
          item.baseRevision,
          item.attempts,
          item.lastError,
          item.createdAt,
        ]
      );
    },
    async updateQueueItem(id: string, patch: Partial<SyncQueueItem>): Promise<void> {
      if (patch.op !== undefined) run(`UPDATE sync_queue SET op = ? WHERE id = ?`, [patch.op, id]);
      if (patch.payload !== undefined)
        run(`UPDATE sync_queue SET payload = ? WHERE id = ?`, [patch.payload, id]);
      if (patch.baseRevision !== undefined)
        run(`UPDATE sync_queue SET base_revision = ? WHERE id = ?`, [patch.baseRevision, id]);
      if (patch.attempts !== undefined)
        run(`UPDATE sync_queue SET attempts = ? WHERE id = ?`, [patch.attempts, id]);
      if (patch.lastError !== undefined)
        run(`UPDATE sync_queue SET last_error = ? WHERE id = ?`, [patch.lastError, id]);
    },
    async removeQueueItem(id: string): Promise<void> {
      run(`DELETE FROM sync_queue WHERE id = ?`, [id]);
    },
    async fetchRemoteRevision(entity: SyncEntity, id: string): Promise<number | null> {
      // Local-only adapter: the cloud store overrides this. Reporting "absent"
      // keeps `pushQueue` usable in a pure-local test without inventing data.
      void entity;
      void id;
      return null;
    },
    async applyRemote(): Promise<number> {
      throw new Error("applyRemote is provided by the cloud store, not the local adapter.");
    },
    async recordConflict(conflict: SyncConflict): Promise<void> {
      run(
        `INSERT OR REPLACE INTO sync_conflicts
           (id, entity, entity_id, local_revision, remote_revision, detected_at, resolution, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          conflict.entity,
          conflict.entityId,
          conflict.localRevision,
          conflict.remoteRevision,
          conflict.detectedAt,
          conflict.resolution,
          null,
        ]
      );
    },
    async getConflicts(): Promise<SyncConflict[]> {
      const rows = all<{
        entity: string;
        entity_id: string;
        local_revision: number;
        remote_revision: number;
        detected_at: string;
        resolution: string;
      }>(`SELECT * FROM sync_conflicts ORDER BY detected_at DESC`);
      return rows.map((r) => ({
        entity: r.entity as SyncEntity,
        entityId: r.entity_id,
        localRevision: r.local_revision,
        remoteRevision: r.remote_revision,
        detectedAt: r.detected_at,
        resolution: r.resolution as SyncConflict["resolution"],
      }));
    },
    async setLastSyncedAt(at: ISOTimestamp): Promise<void> {
      setMeta("last_synced_at", at);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Metadata                                                           */
/* ------------------------------------------------------------------ */

export function setMeta(key: string, value: string | null): void {
  run(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export function getMeta(key: string): string | null {
  const row = one<{ value: string | null }>(`SELECT value FROM app_meta WHERE key = ?`, [key]);
  return row?.value ?? null;
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

export interface MobileSnapshot {
  accounts: TradingAccount[];
  trades: Trade[];
  exits: TradeExit[];
  strategies: TradingStrategy[];
  journal: JournalEntry[];
  risk: RiskSettings[];
}

export function readSnapshot(): MobileSnapshot {
  return {
    accounts: all<AccountRow>(`SELECT * FROM accounts WHERE ${LIVE} ORDER BY created_at ASC`).map(
      accountFromRow
    ),
    trades: all<TradeRow>(`SELECT * FROM trades WHERE ${LIVE} ORDER BY entry_at DESC`).map(
      tradeFromRow
    ),
    exits: all<ExitRow>(`SELECT * FROM trade_exits WHERE ${LIVE} ORDER BY exited_at ASC`).map(
      exitFromRow
    ),
    strategies: all<StrategyRow>(
      `SELECT * FROM strategies WHERE ${LIVE} ORDER BY created_at ASC`
    ).map(strategyFromRow),
    journal: all<JournalRow>(
      `SELECT * FROM journal_entries WHERE ${LIVE} ORDER BY entry_date DESC`
    ).map(journalFromRow),
    risk: all<RiskRow>(`SELECT * FROM risk_settings`).map(riskFromRow),
  };
}

/* ------------------------------------------------------------------ */
/* Writes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Queue a change for sync.
 *
 * `baseRevision` is the revision the client last saw. The sync engine compares
 * it against the server's, which is how a genuine conflict is told apart from a
 * clean update.
 */
function queue(entity: EntityKey, entityId: string, op: SyncOp, payload: unknown, baseRevision: number): void {
  void queueMutation(syncAdapter(), {
    entity: ENTITY[entity],
    entityId,
    op,
    payload,
    baseRevision,
  });
}

export function insertAccount(account: TradingAccount): void {
  transaction(() => {
    run(
      `INSERT INTO accounts
         (id, user_id, name, broker, currency, starting_balance, balance_adjustments,
          is_archived, created_at, updated_at, revision, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        account.id,
        account.userId,
        account.name,
        account.broker ?? null,
        account.currency,
        account.startingBalance,
        account.balanceAdjustments,
        account.isArchived ? 1 : 0,
        account.createdAt,
        account.updatedAt,
        account.revision,
      ]
    );
    queue("account", account.id, "insert", account, 0);
  });
}

export function updateAccount(id: string, patch: Partial<TradingAccount>): void {
  const current = one<AccountRow>(`SELECT * FROM accounts WHERE id = ?`, [id]);
  if (!current) throw new Error(`No account with id ${id}.`);

  const next = accountFromRow({
    ...current,
    name: patch.name ?? current.name,
    broker: patch.broker ?? current.broker,
    currency: patch.currency ?? current.currency,
    starting_balance: patch.startingBalance ?? current.starting_balance,
    balance_adjustments: patch.balanceAdjustments ?? current.balance_adjustments,
    is_archived:
      patch.isArchived === undefined ? current.is_archived : patch.isArchived ? 1 : 0,
    updated_at: nowIso(),
    revision: current.revision + 1,
    dirty: 1,
  });

  transaction(() => {
    run(
      `UPDATE accounts SET name = ?, broker = ?, currency = ?, starting_balance = ?,
         balance_adjustments = ?, is_archived = ?, updated_at = ?, revision = ?, dirty = 1
       WHERE id = ?`,
      [
        next.name,
        next.broker ?? null,
        next.currency,
        next.startingBalance,
        next.balanceAdjustments,
        next.isArchived ? 1 : 0,
        next.updatedAt,
        next.revision,
        id,
      ]
    );
    queue("account", id, "update", next, current.revision);
  });
}

export function insertTrade(trade: Trade, exits: TradeExit[]): void {
  transaction(() => {
    run(
      `INSERT INTO trades
         (id, user_id, account_id, strategy_id, symbol, asset_class, market, direction, status,
          order_type, entry_at, entry_price, exit_at, exit_price, quantity, contract_multiplier,
          stop_loss, take_profit, entry_fees, exit_fees, funding_fees, slippage, strategy,
          setup_type, session, entry_reason, exit_reason, emotion_before, emotion_during,
          emotion_after, mistakes, lessons, notes, manual_net_pnl, import_fingerprint,
          created_at, updated_at, revision, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        trade.id,
        trade.userId,
        trade.accountId,
        trade.strategyId,
        trade.symbol,
        trade.assetClass,
        trade.market ?? null,
        trade.direction,
        trade.status,
        trade.orderType,
        trade.entryAt,
        trade.entryPrice,
        trade.exitAt,
        trade.exitPrice,
        trade.quantity,
        trade.contractMultiplier,
        trade.stopLoss,
        trade.takeProfit,
        trade.entryFees,
        trade.exitFees,
        trade.fundingFees,
        trade.slippage,
        trade.strategy ?? null,
        trade.setupType ?? null,
        trade.session,
        trade.entryReason ?? null,
        trade.exitReason ?? null,
        trade.emotionBefore ?? null,
        trade.emotionDuring ?? null,
        trade.emotionAfter ?? null,
        trade.mistakes ?? null,
        trade.lessons ?? null,
        trade.notes ?? null,
        trade.manualNetPnl,
        trade.importFingerprint,
        trade.createdAt,
        trade.updatedAt,
        trade.revision,
      ]
    );

    for (const exit of exits) {
      insertExitRow(exit);
    }

    queue("trade", trade.id, "insert", { trade, exits }, 0);
  });
}

function insertExitRow(exit: TradeExit): void {
  run(
    `INSERT INTO trade_exits
       (id, user_id, trade_id, quantity, price, fees, exited_at, created_at, updated_at,
        revision, deleted_at, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
    [
      exit.id,
      exit.userId,
      exit.tradeId,
      exit.quantity,
      exit.price,
      exit.fees,
      exit.exitedAt,
      exit.createdAt,
      exit.updatedAt,
      exit.revision,
    ]
  );
}

export function insertExit(exit: TradeExit): void {
  transaction(() => {
    insertExitRow(exit);
    queue("exit", exit.id, "insert", exit, 0);
  });
}

/** Soft-delete a trade together with its exits. */
export function softDeleteTrade(id: string): void {
  const current = one<TradeRow>(`SELECT * FROM trades WHERE id = ?`, [id]);
  if (!current) return;
  const at = nowIso();

  transaction(() => {
    run(`UPDATE trades SET deleted_at = ?, updated_at = ?, revision = ?, dirty = 1 WHERE id = ?`, [
      at,
      at,
      current.revision + 1,
      id,
    ]);
    for (const exit of all<ExitRow>(`SELECT * FROM trade_exits WHERE trade_id = ? AND ${LIVE}`, [
      id,
    ])) {
      run(
        `UPDATE trade_exits SET deleted_at = ?, updated_at = ?, revision = ?, dirty = 1 WHERE id = ?`,
        [at, at, exit.revision + 1, exit.id]
      );
    }
    queue("trade", id, "delete", { id }, current.revision);
  });
}

export function insertStrategy(strategy: TradingStrategy): void {
  transaction(() => {
    run(
      `INSERT INTO strategies
         (id, user_id, name, description, markets, instruments, entry_rules, exit_rules,
          risk_rules, session, checklist, tags, improvement_notes, is_archived,
          created_at, updated_at, revision, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        strategy.id,
        strategy.userId,
        strategy.name,
        strategy.description ?? null,
        JSON.stringify(strategy.markets),
        JSON.stringify(strategy.instruments),
        strategy.entryRules ?? null,
        strategy.exitRules ?? null,
        strategy.riskRules ?? null,
        strategy.session,
        JSON.stringify(strategy.checklist),
        JSON.stringify(strategy.tags),
        strategy.improvementNotes ?? null,
        strategy.isArchived ? 1 : 0,
        strategy.createdAt,
        strategy.updatedAt,
        strategy.revision,
      ]
    );
    queue("strategy", strategy.id, "insert", strategy, 0);
  });
}

export function insertJournal(entry: JournalEntry): void {
  transaction(() => {
    run(
      `INSERT INTO journal_entries
         (id, user_id, entry_date, period, title, goals, market_observations, pre_market_plan,
          trades_summary, emotional_state, mistakes, lessons, improvements, notes,
          linked_trade_ids, discipline_score, tags, created_at, updated_at, revision, deleted_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        entry.id,
        entry.userId,
        entry.entryDate,
        entry.period,
        entry.title ?? null,
        entry.goals ?? null,
        entry.marketObservations ?? null,
        entry.preMarketPlan ?? null,
        entry.tradesSummary ?? null,
        entry.emotionalState ?? null,
        entry.mistakes ?? null,
        entry.lessons ?? null,
        entry.improvements ?? null,
        entry.notes ?? null,
        JSON.stringify(entry.linkedTradeIds),
        entry.disciplineScore,
        JSON.stringify(entry.tags),
        entry.createdAt,
        entry.updatedAt,
        entry.revision,
      ]
    );
    queue("journal", entry.id, "insert", entry, 0);
  });
}

export function upsertRiskSettings(settings: RiskSettings): void {
  transaction(() => {
    run(
      `INSERT INTO risk_settings
         (id, user_id, account_id, default_risk_percent, max_risk_per_trade_percent,
          daily_loss_limit_amount, weekly_loss_limit_amount, max_consecutive_losses,
          cooldown_after_losses, base_currency, updated_at, revision, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        settings.id,
        settings.userId,
        settings.accountId,
        settings.defaultRiskPercent,
        settings.maxRiskPerTradePercent,
        settings.dailyLossLimitAmount,
        settings.weeklyLossLimitAmount,
        settings.maxConsecutiveLosses,
        settings.cooldownAfterLosses,
        settings.baseCurrency,
        settings.updatedAt,
        settings.revision,
      ]
    );
    queue("risk", settings.id, "update", settings, settings.revision - 1);
  });
}

/* ------------------------------------------------------------------ */
/* Local wipe                                                         */
/* ------------------------------------------------------------------ */

/**
 * Remove every record kept on this device.
 *
 * This clears the local copy and the queue. It deliberately does NOT reach the
 * server: an offline wipe cannot prove what is on the server, and pretending it
 * did would be exactly the kind of false reassurance this app avoids. The
 * settings screen says so in as many words.
 */
export function wipeLocalData(): void {
  transaction(() => {
    for (const table of [
      "trade_exits",
      "trades",
      "strategies",
      "journal_entries",
      "risk_settings",
      "accounts",
      "sync_queue",
      "sync_conflicts",
    ]) {
      run(`DELETE FROM ${table}`);
    }
    run(`DELETE FROM app_meta WHERE key = 'last_synced_at'`);
  });
}
