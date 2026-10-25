/**
 * Local store — browser storage.
 *
 * Implements the exact same `TradeVaultStore` contract as the cloud store, so
 * every screen behaves identically. Used when Supabase is not configured.
 *
 * IMPORTANT AND DELIBERATE:
 *   * Data stays in this browser. It does NOT sync anywhere.
 *   * The app shows a persistent banner saying so. It is never presented as a
 *     connected account.
 *   * The sample data this store seeds is labelled as SAMPLE everywhere it is
 *     rendered, so it can never be mistaken for the user's own performance.
 *
 * Moving to the cloud store is a configuration change, not a rewrite: set
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, run the migrations, and this
 * file stops being used.
 */

import { generateId } from "@tradevault/core";
import type {
  AccountInput,
  AttachmentInput,
  ExitInput,
  JournalAttachmentInput,
  JournalInput,
  SaveResult,
  Snapshot,
  StoreResult,
  StrategyInput,
  TradeInput,
  TradeVaultStore,
} from "./store";
import { validateAttachmentFile, generateAttachmentId } from "./store";
import {
  clearAttachmentBlobs,
  deleteAttachmentBlob,
  getAttachmentBlob,
  localBlobId,
  localBlobPath,
  putAttachmentBlob,
} from "./attachmentBlobs";
import {
  seedAccounts,
  seedTrades,
  seedExits,
  seedJournal,
  seedStrategies,
  seedAttachments,
  seedJournalAttachments,
} from "./sampleData";
import type {
  JournalAttachmentRow,
  JournalEntryRow,
  TradeAttachmentRow,
  TradeExitRow,
  TradeRow,
  TradingAccountRow,
  TradingStrategyRow,
} from "./database.types";
import {
  accountFromRow,
  attachmentFromRow,
  journalAttachmentFromRow,
  exitFromRow,
  journalFromRow,
  strategyFromRow,
  tradeFromRow,
} from "./mappers";

const STORAGE_KEY = "tradevault.local.v1";

interface LocalDatabase {
  accounts: TradingAccountRow[];
  trades: TradeRow[];
  exits: TradeExitRow[];
  journal: JournalEntryRow[];
  strategies: TradingStrategyRow[];
  attachments: TradeAttachmentRow[];
  /**
   * Journal images. Optional on read, because a browser that has been running
   * the previous version holds a stored document without this key; `read()`
   * fills it in with an empty array. That is the whole migration.
   */
  journalAttachments: JournalAttachmentRow[];
  /** True once the sample rows have been inserted. */
  seeded: boolean;
}

const LOCAL_USER = "local-user-0000-0000-0000-000000000000";

function emptyDatabase(): LocalDatabase {
  return {
    accounts: [],
    trades: [],
    exits: [],
    journal: [],
    strategies: [],
    attachments: [],
    journalAttachments: [],
    seeded: false,
  };
}

function read(): LocalDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDatabase();
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    return {
      accounts: parsed.accounts ?? [],
      trades: parsed.trades ?? [],
      exits: parsed.exits ?? [],
      journal: parsed.journal ?? [],
      strategies: parsed.strategies ?? [],
      attachments: parsed.attachments ?? [],
      journalAttachments: parsed.journalAttachments ?? [],
      seeded: parsed.seeded ?? false,
    };
  } catch {
    // Corrupted or unreadable storage: start clean rather than crash the app.
    return emptyDatabase();
  }
}

function write(db: LocalDatabase): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/quota|exceeded/i.test(message)) {
      return { ok: false, error: "Browser storage is full. Export your data, then remove some attachments." };
    }
    return { ok: false, error: `Could not save to this browser: ${message}` };
  }
}

const nowIso = () => new Date().toISOString();

/** Build a row from a partial camelCase input, filling required defaults. */
function rowFromTrade(input: Partial<TradeInput>, existing: TradeRow | null): TradeRow {
  const now = nowIso();
  return {
    id: existing?.id ?? input.id ?? generateId(),
    user_id: LOCAL_USER,
    account_id: input.accountId ?? existing?.account_id ?? "",
    strategy_id: input.strategyId ?? existing?.strategy_id ?? null,
    symbol: (input.symbol ?? existing?.symbol ?? "").toUpperCase(),
    asset_class: input.assetClass ?? existing?.asset_class ?? "other",
    market: input.market ?? existing?.market ?? null,
    direction: input.direction ?? existing?.direction ?? "long",
    status: input.status ?? existing?.status ?? "open",
    order_type: input.orderType ?? existing?.order_type ?? "market",
    entry_at: input.entryAt ?? existing?.entry_at ?? now,
    entry_price: input.entryPrice ?? existing?.entry_price ?? "0",
    exit_at: input.exitAt ?? existing?.exit_at ?? null,
    exit_price: input.exitPrice ?? existing?.exit_price ?? null,
    quantity: input.quantity ?? existing?.quantity ?? "0",
    contract_multiplier: input.contractMultiplier ?? existing?.contract_multiplier ?? "1",
    stop_loss: input.stopLoss ?? existing?.stop_loss ?? null,
    take_profit: input.takeProfit ?? existing?.take_profit ?? null,
    entry_fees: input.entryFees ?? existing?.entry_fees ?? "0",
    exit_fees: input.exitFees ?? existing?.exit_fees ?? "0",
    funding_fees: input.fundingFees ?? existing?.funding_fees ?? "0",
    slippage: input.slippage ?? existing?.slippage ?? "0",
    strategy: input.strategy ?? existing?.strategy ?? null,
    setup_type: input.setupType ?? existing?.setup_type ?? null,
    session: input.session ?? existing?.session ?? "outside",
    entry_reason: input.entryReason ?? existing?.entry_reason ?? null,
    exit_reason: input.exitReason ?? existing?.exit_reason ?? null,
    emotion_before: input.emotionBefore ?? existing?.emotion_before ?? null,
    emotion_during: input.emotionDuring ?? existing?.emotion_during ?? null,
    emotion_after: input.emotionAfter ?? existing?.emotion_after ?? null,
    mistakes: input.mistakes ?? existing?.mistakes ?? null,
    lessons: input.lessons ?? existing?.lessons ?? null,
    notes: input.notes ?? existing?.notes ?? null,
    manual_net_pnl: input.manualNetPnl ?? existing?.manual_net_pnl ?? null,
    import_fingerprint: input.importFingerprint ?? existing?.import_fingerprint ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    revision: (existing?.revision ?? 0) + 1,
    deleted_at: existing?.deleted_at ?? null,
  };
}

export function createLocalStore(options: { seed?: boolean } = {}): TradeVaultStore {
  const shouldSeed = options.seed ?? true;

  /** Load the database, seeding sample data on first run. */
  function withSeed(): LocalDatabase {
    const db = read();
    if (db.seeded && shouldSeed) {
      // Migrate: an earlier version seeded the trades but had no notion of
      // journal images. Add them now rather than force a full re-seed, which
      // would wipe anything the user has already written.
      if (db.journalAttachments.length === 0 && db.journal.length > 0) {
        db.journalAttachments = seedJournalAttachments(LOCAL_USER);
        write(db);
      }
      return db;
    }
    if (db.seeded || !shouldSeed) return db;

    const seeded: LocalDatabase = {
      accounts: seedAccounts(LOCAL_USER),
      trades: seedTrades(LOCAL_USER),
      exits: seedExits(LOCAL_USER),
      journal: seedJournal(LOCAL_USER),
      strategies: seedStrategies(LOCAL_USER),
      attachments: seedAttachments(LOCAL_USER),
      journalAttachments: seedJournalAttachments(LOCAL_USER),
      seeded: true,
    };
    write(seeded);
    return seeded;
  }

  return {
    capabilities: {
      kind: "local",
      label: "Offline — saved in this browser only",
      syncsAcrossDevices: false,
    },

    async loadSnapshot(): Promise<StoreResult<Snapshot>> {
      const db = withSeed();
      return {
        data: {
          accounts: db.accounts.map(accountFromRow),
          trades: db.trades.map(tradeFromRow),
          exits: db.exits.map(exitFromRow),
          strategies: db.strategies.map(strategyFromRow),
          journal: db.journal.map(journalFromRow),
          attachments: db.attachments.map(attachmentFromRow),
          journalAttachments: db.journalAttachments.map(journalAttachmentFromRow),
        },
        error: null,
      };
    },

    /* Trades ---------------------------------------------------------- */

    async createTrade(input: TradeInput) {
      const db = withSeed();
      const row = rowFromTrade(input, null);
      db.trades = [row, ...db.trades];
      const result = write(db);
      return result.ok ? { ok: true as const, id: row.id } : result;
    },

    async updateTrade(id, input): Promise<SaveResult> {
      const db = withSeed();
      const index = db.trades.findIndex((t) => t.id === id);
      if (index < 0) return { ok: false, error: "That trade no longer exists." };
      const existing = db.trades[index] as TradeRow;
      db.trades[index] = rowFromTrade(input, existing);
      return write(db);
    },

    async deleteTrade(id): Promise<SaveResult> {
      const db = withSeed();
      const at = nowIso();
      const index = db.trades.findIndex((t) => t.id === id);
      if (index < 0) return { ok: false, error: "That trade no longer exists." };
      (db.trades[index] as TradeRow).deleted_at = at;
      (db.trades[index] as TradeRow).updated_at = at;
      // Soft-delete the exits alongside it so they cannot resurrect.
      db.exits = db.exits.map((e) => (e.trade_id === id ? { ...e, deleted_at: at, updated_at: at } : e));
      return write(db);
    },

    /* Exits ----------------------------------------------------------- */

    async createExit(input: ExitInput) {
      const db = withSeed();
      const now = nowIso();
      const row: TradeExitRow = {
        id: input.id ?? generateId(),
        user_id: LOCAL_USER,
        trade_id: input.tradeId,
        quantity: input.quantity,
        price: input.price,
        fees: input.fees,
        exited_at: input.exitedAt,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
        revision: 1,
        deleted_at: null,
      };

      // Mirror the database guard so the local and cloud stores behave the
      // same way. The core validateExits() checks the same thing.
      const trade = db.trades.find((t) => t.id === input.tradeId);
      if (!trade) return { ok: false, error: "That trade no longer exists." };
      const alreadyClosed = db.exits
        .filter((e) => e.trade_id === input.tradeId && !e.deleted_at)
        .reduce((sum, e) => sum + Number(e.quantity), 0);
      const opened = Number(trade.quantity);
      if (alreadyClosed + Number(input.quantity) > opened + 1e-9) {
        return {
          ok: false,
          error: `Those exits close more than the position size. ${opened - alreadyClosed} remains open.`,
        };
      }

      db.exits = [...db.exits, row];

      // Keep the trade's status consistent with its exits.
      const totalClosed = alreadyClosed + Number(input.quantity);
      const tradeIndex = db.trades.findIndex((t) => t.id === input.tradeId);
      if (tradeIndex >= 0) {
        const t = db.trades[tradeIndex] as TradeRow;
        t.status = totalClosed >= opened - 1e-9 ? "closed" : "partial";
        t.exit_at = input.exitedAt;
        t.exit_price = input.price;
        t.updated_at = now;
        t.revision += 1;
      }

      const result = write(db);
      return result.ok ? { ok: true as const, id: row.id } : result;
    },

    async deleteExit(id): Promise<SaveResult> {
      const db = withSeed();
      const exit = db.exits.find((e) => e.id === id);
      if (!exit) return { ok: false, error: "That exit no longer exists." };
      const at = nowIso();
      exit.deleted_at = at;
      exit.updated_at = at;

      // Recompute the trade's status from what is left.
      const tradeIndex = db.trades.findIndex((t) => t.id === exit.trade_id);
      if (tradeIndex >= 0) {
        const t = db.trades[tradeIndex] as TradeRow;
        const remaining = db.exits
          .filter((e) => e.trade_id === t.id && !e.deleted_at)
          .reduce((sum, e) => sum + Number(e.quantity), 0);
        t.status = remaining <= 1e-9 ? "open" : remaining >= Number(t.quantity) - 1e-9 ? "closed" : "partial";
        t.updated_at = at;
        t.revision += 1;
      }

      return write(db);
    },

    /* Accounts -------------------------------------------------------- */

    async createAccount(input: AccountInput) {
      const db = withSeed();
      const now = nowIso();
      const row: TradingAccountRow = {
        id: input.id ?? generateId(),
        user_id: LOCAL_USER,
        name: input.name,
        broker: input.broker ?? null,
        currency: input.currency,
        starting_balance: input.startingBalance,
        balance_adjustments: input.balanceAdjustments ?? "0",
        is_archived: input.isArchived ?? false,
        created_at: now,
        updated_at: now,
        revision: 1,
        deleted_at: null,
      };
      db.accounts = [...db.accounts, row];
      const result = write(db);
      return result.ok ? { ok: true as const, id: row.id } : result;
    },

    async updateAccount(id, input): Promise<SaveResult> {
      const db = withSeed();
      const index = db.accounts.findIndex((a) => a.id === id);
      if (index < 0) return { ok: false, error: "That account no longer exists." };
      const existing = db.accounts[index] as TradingAccountRow;
      db.accounts[index] = {
        ...existing,
        name: input.name ?? existing.name,
        broker: input.broker ?? existing.broker,
        currency: input.currency ?? existing.currency,
        starting_balance: input.startingBalance ?? existing.starting_balance,
        balance_adjustments: input.balanceAdjustments ?? existing.balance_adjustments,
        is_archived: input.isArchived ?? existing.is_archived,
        updated_at: nowIso(),
        revision: existing.revision + 1,
      };
      return write(db);
    },

    /* Journal --------------------------------------------------------- */

    async createJournalEntry(input: JournalInput) {
      const db = withSeed();
      const now = nowIso();
      const row: JournalEntryRow = {
        id: input.id ?? generateId(),
        user_id: LOCAL_USER,
        entry_date: input.entryDate,
        period: input.period,
        title: input.title ?? null,
        goals: input.goals ?? null,
        market_observations: input.marketObservations ?? null,
        pre_market_plan: input.preMarketPlan ?? null,
        trades_summary: input.tradesSummary ?? null,
        emotional_state: input.emotionalState ?? null,
        discipline_score: input.disciplineScore ?? null,
        mistakes: input.mistakes ?? null,
        lessons: input.lessons ?? null,
        improvements: input.improvements ?? null,
        notes: input.notes ?? null,
        linked_trade_ids: input.linkedTradeIds ?? [],
        tags: input.tags ?? [],
        created_at: now,
        updated_at: now,
        revision: 1,
        deleted_at: null,
      };
      db.journal = [row, ...db.journal];
      const result = write(db);
      return result.ok ? { ok: true as const, id: row.id } : result;
    },

    async updateJournalEntry(id, input): Promise<SaveResult> {
      const db = withSeed();
      const index = db.journal.findIndex((j) => j.id === id);
      if (index < 0) return { ok: false, error: "That journal entry no longer exists." };
      const existing = db.journal[index] as JournalEntryRow;
      db.journal[index] = {
        ...existing,
        entry_date: input.entryDate ?? existing.entry_date,
        period: input.period ?? existing.period,
        title: input.title ?? existing.title,
        goals: input.goals ?? existing.goals,
        market_observations: input.marketObservations ?? existing.market_observations,
        pre_market_plan: input.preMarketPlan ?? existing.pre_market_plan,
        trades_summary: input.tradesSummary ?? existing.trades_summary,
        emotional_state: input.emotionalState ?? existing.emotional_state,
        discipline_score: input.disciplineScore ?? existing.discipline_score,
        mistakes: input.mistakes ?? existing.mistakes,
        lessons: input.lessons ?? existing.lessons,
        improvements: input.improvements ?? existing.improvements,
        notes: input.notes ?? existing.notes,
        linked_trade_ids: input.linkedTradeIds ?? existing.linked_trade_ids,
        tags: input.tags ?? existing.tags,
        updated_at: nowIso(),
        revision: existing.revision + 1,
      };
      return write(db);
    },

    async deleteJournalEntry(id): Promise<SaveResult> {
      const db = withSeed();
      const at = nowIso();
      const index = db.journal.findIndex((j) => j.id === id);
      if (index < 0) return { ok: false, error: "That journal entry no longer exists." };
      (db.journal[index] as JournalEntryRow).deleted_at = at;
      (db.journal[index] as JournalEntryRow).updated_at = at;
      // Soft-delete the images alongside the entry, so a row cannot outlive the
      // thing it was attached to and reappear if the entry is restored.
      db.journalAttachments = db.journalAttachments.map((a) =>
        a.journal_entry_id === id ? { ...a, deleted_at: at, updated_at: at } : a
      );
      return write(db);
    },

    /* Strategies ------------------------------------------------------ */

    async createStrategy(input: StrategyInput) {
      const db = withSeed();
      const now = nowIso();
      const row: TradingStrategyRow = {
        id: input.id ?? generateId(),
        user_id: LOCAL_USER,
        name: input.name,
        description: input.description ?? null,
        markets: input.markets ?? [],
        instruments: input.instruments ?? [],
        entry_rules: input.entryRules ?? null,
        exit_rules: input.exitRules ?? null,
        risk_rules: input.riskRules ?? null,
        session: input.session ?? null,
        checklist: input.checklist ?? [],
        tags: input.tags ?? [],
        improvement_notes: input.improvementNotes ?? null,
        is_archived: input.isArchived ?? false,
        created_at: now,
        updated_at: now,
        revision: 1,
        deleted_at: null,
      };
      db.strategies = [...db.strategies, row];
      const result = write(db);
      return result.ok ? { ok: true as const, id: row.id } : result;
    },

    async updateStrategy(id, input): Promise<SaveResult> {
      const db = withSeed();
      const index = db.strategies.findIndex((s) => s.id === id);
      if (index < 0) return { ok: false, error: "That strategy no longer exists." };
      const existing = db.strategies[index] as TradingStrategyRow;
      db.strategies[index] = {
        ...existing,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        markets: input.markets ?? existing.markets,
        instruments: input.instruments ?? existing.instruments,
        entry_rules: input.entryRules ?? existing.entry_rules,
        exit_rules: input.exitRules ?? existing.exit_rules,
        risk_rules: input.riskRules ?? existing.risk_rules,
        session: input.session ?? existing.session,
        checklist: input.checklist ?? existing.checklist,
        tags: input.tags ?? existing.tags,
        improvement_notes: input.improvementNotes ?? existing.improvement_notes,
        is_archived: input.isArchived ?? existing.is_archived,
        updated_at: nowIso(),
        revision: existing.revision + 1,
      };
      return write(db);
    },

    async deleteStrategy(id): Promise<SaveResult> {
      const db = withSeed();
      const at = nowIso();
      const index = db.strategies.findIndex((s) => s.id === id);
      if (index < 0) return { ok: false, error: "That strategy no longer exists." };
      (db.strategies[index] as TradingStrategyRow).deleted_at = at;
      (db.strategies[index] as TradingStrategyRow).updated_at = at;
      return write(db);
    },

    /* Attachments ----------------------------------------------------- */

    /**
     * Store an image in this browser.
     *
     * The bytes go to IndexedDB (see attachmentBlobs.ts) and only the metadata
     * goes into localStorage. The previous version kept the file itself as a
     * base64 data URL in the localStorage record, where the roughly 5 MB origin
     * quota refused the first real screenshot.
     *
     * The blob is written first and removed again if the metadata write fails,
     * so a quota failure cannot leave an orphaned file behind.
     *
     * The same validation runs as in the cloud store, from the same function,
     * so a file accepted here is a file the bucket would also accept.
     */
    async uploadAttachment(input: AttachmentInput) {
      const invalid = validateAttachmentFile(input.file);
      if (invalid) return { ok: false, error: invalid };

      const id = input.id ?? generateAttachmentId();

      try {
        await putAttachmentBlob(id, input.file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          error: /quota|space/i.test(message)
            ? "This browser's local image storage is full. Delete a few screenshots and try again."
            : `This browser could not store the image (${message}). Private-browsing windows often block local storage.`,
        };
      }

      const db = withSeed();
      const row: TradeAttachmentRow = {
        id,
        user_id: LOCAL_USER,
        trade_id: input.tradeId,
        // Not a remote path at all: a marker naming the IndexedDB entry.
        // attachmentUrl reads that key back and hands out a blob URL.
        remote_path: localBlobPath(id),
        file_name: input.file.name.slice(0, 255),
        mime_type: input.file.type,
        byte_size: input.file.size,
        caption: input.caption ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
        revision: 1,
        deleted_at: null,
      };

      db.attachments = [row, ...db.attachments];
      const result = write(db);
      if (!result.ok) {
        await deleteAttachmentBlob(id).catch(() => undefined);
        return result;
      }
      return { ok: true as const, id: row.id };
    },

    async attachmentUrl(attachment): Promise<StoreResult<string>> {
      if (!attachment.remotePath) {
        return { data: null, error: "That attachment has no stored file." };
      }

      const blobId = localBlobId(attachment.remotePath);
      if (blobId === null) {
        // Rows written by the previous version hold a data URL, and the sample
        // rows hold a plain /samples/... file path. An <img> can display
        // either one directly. No migration needed.
        return { data: attachment.remotePath, error: null };
      }

      try {
        const blob = await getAttachmentBlob(blobId);
        if (!blob) {
          return {
            data: null,
            error: "That image is no longer in this browser. Clearing site data removes it.",
          };
        }
        // The gallery revokes blob URLs when the thumbnail unmounts.
        return { data: URL.createObjectURL(blob), error: null };
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : "The image could not be read.",
        };
      }
    },

    async deleteAttachment(id): Promise<SaveResult> {
      const db = withSeed();
      const index = db.attachments.findIndex((a) => a.id === id);
      if (index < 0) return { ok: false, error: "That attachment no longer exists." };
      (db.attachments[index] as TradeAttachmentRow).deleted_at = nowIso();
      (db.attachments[index] as TradeAttachmentRow).updated_at = nowIso();
      const result = write(db);
      // A sample screenshot is a file in the app's own bundle, not a blob, so
      // there is nothing to release: only its row is removed.
      if (result.ok) await deleteAttachmentBlob(id).catch(() => undefined);
      return result;
    },

    /* Journal attachments --------------------------------------------- */

    /**
     * Store a journal image in this browser.
     *
     * Exactly the trade path: the blob goes into IndexedDB first, and if the
     * metadata write then fails the blob is removed again, so a quota failure
     * cannot leave an orphaned file nobody can see or delete.
     */
    async uploadJournalAttachment(input: JournalAttachmentInput) {
      const invalid = validateAttachmentFile(input.file);
      if (invalid) return { ok: false, error: invalid };

      const id = input.id ?? generateAttachmentId();

      try {
        await putAttachmentBlob(id, input.file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          error: /quota|space/i.test(message)
            ? "This browser's local image storage is full. Delete a few screenshots and try again."
            : `This browser could not store the image (${message}). Private-browsing windows often block local storage.`,
        };
      }

      const db = withSeed();
      const row: JournalAttachmentRow = {
        id,
        user_id: LOCAL_USER,
        journal_entry_id: input.journalEntryId,
        // A marker naming the IndexedDB entry, not a real path.
        remote_path: localBlobPath(id),
        file_name: input.file.name.slice(0, 255),
        mime_type: input.file.type,
        byte_size: input.file.size,
        caption: input.caption ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
        revision: 1,
        deleted_at: null,
      };

      db.journalAttachments = [row, ...db.journalAttachments];
      const result = write(db);
      if (!result.ok) {
        await deleteAttachmentBlob(id).catch(() => undefined);
        return result;
      }
      return { ok: true as const, id: row.id };
    },

    async journalAttachmentUrl(attachment): Promise<StoreResult<string>> {
      if (!attachment.remotePath) {
        return { data: null, error: "That attachment has no stored file." };
      }

      const blobId = localBlobId(attachment.remotePath);
      if (blobId === null) {
        // The sample rows hold a plain /samples/... file path, which an <img>
        // can display directly.
        return { data: attachment.remotePath, error: null };
      }

      try {
        const blob = await getAttachmentBlob(blobId);
        if (!blob) {
          return {
            data: null,
            error: "That image is no longer in this browser. Clearing site data removes it.",
          };
        }
        return { data: URL.createObjectURL(blob), error: null };
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : "The image could not be read.",
        };
      }
    },

    async deleteJournalAttachment(id): Promise<SaveResult> {
      const db = withSeed();
      const index = db.journalAttachments.findIndex((a) => a.id === id);
      if (index < 0) return { ok: false, error: "That attachment no longer exists." };
      (db.journalAttachments[index] as JournalAttachmentRow).deleted_at = nowIso();
      (db.journalAttachments[index] as JournalAttachmentRow).updated_at = nowIso();
      const result = write(db);
      if (result.ok) await deleteAttachmentBlob(id).catch(() => undefined);
      return result;
    },

    /* Erase ----------------------------------------------------------- */

    async eraseAllData(): Promise<SaveResult> {
      // A genuine wipe, not a soft delete: the point is to leave nothing, and
      // that includes the image blobs held in IndexedDB.
      const result = write(emptyDatabase());
      if (result.ok) await clearAttachmentBlobs().catch(() => undefined);
      return result;
    },
  };
}
