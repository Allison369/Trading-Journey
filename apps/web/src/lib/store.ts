/**
 * The store contract.
 *
 * Everything above this line (pages, charts, forms) talks to `TradeVaultStore`
 * and has no idea whether the data lives in Supabase or in this browser.
 *
 * There are two implementations:
 *   * cloudStore   — Supabase. The real product: one journal, every device.
 *   * localStore   — browser storage. Used when Supabase is not configured, so
 *                    the app can be evaluated and previewed. Clearly labelled
 *                    in the UI so it is never mistaken for cloud data.
 *
 * Every method returns data in core domain types, never raw rows.
 */

import {
  capitalBase,
  type Trade,
  type TradeExit,
  type TradeAttachment,
  type JournalAttachment,
  type TradingAccount,
  type JournalEntry,
  type TradingStrategy,
  type PerformanceMetrics,
  type EquityPoint,
} from "@tradevault/core";

export interface StoreCapabilities {
  /** "cloud" = shared Supabase database; "local" = this browser only. */
  kind: "cloud" | "local";
  /** Human-readable label for the banner. */
  label: string;
  /** Whether changes reach other devices. */
  syncsAcrossDevices: boolean;
}

export interface Snapshot {
  accounts: TradingAccount[];
  trades: Trade[];
  exits: TradeExit[];
  strategies: TradingStrategy[];
  journal: JournalEntry[];
  attachments: TradeAttachment[];
  journalAttachments: JournalAttachment[];
}

export interface StoreResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * A save that reports exactly what happened.
 *
 * `ok: false` always has a reason. We never report success for a write that
 * did not land — a journal that loses a trade silently is worse than useless.
 */
export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

export interface TradeInput {
  id?: string;
  accountId: string;
  strategyId?: string | null;
  symbol: string;
  assetClass: Trade["assetClass"];
  market?: string;
  direction: Trade["direction"];
  status: Trade["status"];
  orderType: Trade["orderType"];
  entryAt: string;
  entryPrice: string;
  exitAt?: string | null;
  exitPrice?: string | null;
  quantity: string;
  contractMultiplier: string;
  stopLoss?: string | null;
  takeProfit?: string | null;
  entryFees: string;
  exitFees: string;
  fundingFees: string;
  slippage: string;
  strategy?: string;
  setupType?: string;
  session: Trade["session"];
  entryReason?: string;
  exitReason?: string;
  emotionBefore?: Trade["emotionBefore"];
  emotionDuring?: Trade["emotionDuring"];
  emotionAfter?: Trade["emotionAfter"];
  mistakes?: string;
  lessons?: string;
  notes?: string;
  manualNetPnl?: string | null;
  importFingerprint?: string | null;
}

export interface ExitInput {
  id?: string;
  tradeId: string;
  quantity: string;
  price: string;
  fees: string;
  exitedAt: string;
  notes?: string;
}

export interface AccountInput {
  id?: string;
  name: string;
  broker?: string;
  currency: TradingAccount["currency"];
  startingBalance: string;
  balanceAdjustments?: string;
  isArchived?: boolean;
}

export interface JournalInput {
  id?: string;
  entryDate: string;
  period: JournalEntry["period"];
  title?: string;
  goals?: string;
  marketObservations?: string;
  preMarketPlan?: string;
  tradesSummary?: string;
  emotionalState?: string;
  disciplineScore?: number | null;
  mistakes?: string;
  lessons?: string;
  improvements?: string;
  notes?: string;
  linkedTradeIds?: string[];
  tags?: string[];
}

export interface StrategyInput {
  id?: string;
  name: string;
  description?: string;
  markets?: string[];
  instruments?: string[];
  entryRules?: string;
  exitRules?: string;
  riskRules?: string;
  session?: TradingStrategy["session"];
  checklist?: string[];
  tags?: string[];
  improvementNotes?: string;
  isArchived?: boolean;
}

/**
 * A chart screenshot being attached to a trade.
 *
 * `file` is the raw browser `File`. The store decides how to place it — the
 * cloud store uploads it to the private bucket and then writes the row; the
 * local store keeps it in this browser only. Either way the caller does not
 * have to know which one it is talking to.
 */
export interface AttachmentInput {
  id?: string;
  tradeId: string;
  file: File;
  caption?: string;
}

/**
 * The journal equivalent. A separate interface rather than
 * `Omit<AttachmentInput, "tradeId"> & { journalEntryId }` so the two cannot be
 * passed to each other's methods by accident.
 */
export interface JournalAttachmentInput {
  id?: string;
  journalEntryId: string;
  file: File;
  caption?: string;
}

/** A stored attachment plus a URL that can actually be rendered. */
export interface AttachmentView {
  attachment: TradeAttachment;
  /**
   * A URL the browser can load right now.
   *
   * For the cloud store this is a short-lived signed URL, minted on demand. It
   * expires, so it must never be cached or written into the database — only
   * held in memory for the lifetime of the view.
   */
  url: string;
  /** True when `url` is a browser object URL that must be revoked on unmount. */
  isObjectUrl: boolean;
}

/* ------------------------------------------------------------------ */
/* Admin                                                              */
/* ------------------------------------------------------------------ */

/**
 * A registered user, as seen by an admin.
 *
 * Identity and row counts only. There is no trading detail here by design —
 * see supabase/migrations/0004_admin_role.sql. An admin learns that someone
 * exists and roughly how much they use the app; they never learn what they
 * traded.
 */
export interface AdminUserSummary {
  userId: string;
  email: string | null;
  displayName: string;
  joinedAt: string;
  isAdmin: boolean;
  tradeCount: number;
  journalCount: number;
  lastActiveAt: string;
}

export interface AdminPlatformTotals {
  userCount: number;
  adminCount: number;
  newUsers7d: number;
  tradeCount: number;
  journalCount: number;
}

export interface AdminOverview {
  users: AdminUserSummary[];
  totals: AdminPlatformTotals;
}

export interface TradeVaultStore {
  capabilities: StoreCapabilities;

  /** Load everything needed to render the app in one pass. */
  loadSnapshot(): Promise<StoreResult<Snapshot>>;

  createTrade(input: TradeInput): Promise<SaveResult & { id?: string }>;
  updateTrade(id: string, input: Partial<TradeInput>): Promise<SaveResult>;
  deleteTrade(id: string): Promise<SaveResult>;

  createExit(input: ExitInput): Promise<SaveResult & { id?: string }>;
  deleteExit(id: string): Promise<SaveResult>;

  createAccount(input: AccountInput): Promise<SaveResult & { id?: string }>;
  updateAccount(id: string, input: Partial<AccountInput>): Promise<SaveResult>;

  createJournalEntry(input: JournalInput): Promise<SaveResult & { id?: string }>;
  updateJournalEntry(id: string, input: Partial<JournalInput>): Promise<SaveResult>;
  deleteJournalEntry(id: string): Promise<SaveResult>;

  createStrategy(input: StrategyInput): Promise<SaveResult & { id?: string }>;
  updateStrategy(id: string, input: Partial<StrategyInput>): Promise<SaveResult>;
  deleteStrategy(id: string): Promise<SaveResult>;

  /**
   * Attach an image to a trade.
   *
   * Must not report success unless the file is actually retrievable afterwards.
   * A row pointing at an object that failed to upload is worse than a rejected
   * upload, because it looks like it worked.
   */
  uploadAttachment(input: AttachmentInput): Promise<SaveResult & { id?: string }>;

  /** Resolve an attachment to something renderable. */
  attachmentUrl(attachment: TradeAttachment): Promise<StoreResult<string>>;

  deleteAttachment(id: string): Promise<SaveResult>;

  /**
   * Attach an image to a journal entry.
   *
   * The same contract as `uploadAttachment`: no success without a retrievable
   * file. Kept as separate methods rather than one method taking an optional
   * owner, so that a caller cannot attach a chart to a trade by passing the
   * wrong id and have it silently succeed.
   */
  uploadJournalAttachment(input: JournalAttachmentInput): Promise<SaveResult & { id?: string }>;

  journalAttachmentUrl(attachment: JournalAttachment): Promise<StoreResult<string>>;

  deleteJournalAttachment(id: string): Promise<SaveResult>;

  /** Remove every record this user owns. Guarded behind an explicit confirm. */
  eraseAllData(): Promise<SaveResult>;

  /**
   * Admin: the users overview. Optional because only the cloud store can
   * provide it — a local browser store has exactly one user, and pretending
   * otherwise would be a lie.
   */
  loadAdminOverview?(): Promise<StoreResult<AdminOverview>>;

  /** Admin: grant or revoke the admin flag on another user. */
  setAdminFlag?(userId: string, isAdmin: boolean): Promise<SaveResult>;

  /**
   * Whether this session is an admin, according to the database.
   *
   * Deliberately a question asked of the server rather than a value read from
   * local storage. The answer decides which screen renders; it is never the
   * thing that protects the data. That is the policies' job.
   */
  checkIsAdmin?(): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/* Derived helpers shared by both implementations                     */
/* ------------------------------------------------------------------ */

/** Group exits by trade id, which is what the core metrics functions want. */
export function exitsByTrade(exits: TradeExit[]): Record<string, TradeExit[]> {
  const map: Record<string, TradeExit[]> = {};
  for (const e of exits) {
    if (e.deletedAt) continue;
    const list = map[e.tradeId] ?? [];
    list.push(e);
    map[e.tradeId] = list;
  }
  return map;
}

export function liveTrades(trades: Trade[]): Trade[] {
  return trades.filter((t) => !t.deletedAt);
}

export function liveAccounts(accounts: TradingAccount[]): TradingAccount[] {
  return accounts.filter((a) => !a.deletedAt);
}

export function liveJournal(journal: JournalEntry[]): JournalEntry[] {
  return journal.filter((j) => !j.deletedAt);
}

export function liveStrategies(strategies: TradingStrategy[]): TradingStrategy[] {
  return strategies.filter((s) => !s.deletedAt);
}

export function liveAttachments(attachments: TradeAttachment[]): TradeAttachment[] {
  return attachments.filter((a) => !a.deletedAt);
}

/**
 * The journal equivalent of `liveAttachments`.
 *
 * A separate function rather than a generic filter over a union, so that
 * adding a field to one attachment type cannot silently change the other.
 */
export function liveJournalAttachments(
  attachments: JournalAttachment[]
): JournalAttachment[] {
  return attachments.filter((a) => !a.deletedAt);
}

/* ------------------------------------------------------------------ */
/* Attachment rules, shared so both stores enforce the same thing      */
/* ------------------------------------------------------------------ */

/** 10 MiB. Mirrors the bucket's `file_size_limit` and the table's CHECK. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Mirrors the bucket's `allowed_mime_types` and the table's CHECK. */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

/**
 * Validate a file before uploading it.
 *
 * This runs on the client, and it is a CONVENIENCE, not a security control.
 * Everything it checks is checked again by the bucket and the table, because
 * anything enforced only here can be skipped by anyone who can call the API
 * directly.
 *
 * Note what `file.type` actually proves: it is a string the browser derived
 * from the file extension, not a decoded format. Renaming `payload.exe` to
 * `chart.png` produces a file the browser reports as `image/png`. That is
 * survivable here because the bucket serves these objects with the stored
 * content type and they are never executed — but it means "MIME type check" is
 * not the same claim as "this is definitely an image", and the copy in the UI
 * says so rather than overpromising.
 */
export function validateAttachmentFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    const ext = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : "";
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])) {
      return `Attachments must be a PNG, JPEG, WebP or GIF. "${file.name}" is ${file.type || "an unknown type"}.`;
    }
  }

  if (file.size <= 0) {
    return `"${file.name}" is empty, so there is nothing to upload.`;
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `"${file.name}" is ${mb} MB. The limit is 10 MB — resize or crop the screenshot first.`;
  }

  return null;
}

/**
 * Build a storage object path.
 *
 * The first segment is the owner's id, which is what the bucket policies match
 * against. `trade_id` is the second segment so an object is always traceable to
 * the trade it belongs to.
 *
 * The stored filename is a fresh UUID plus a sanitised extension — never the
 * user's original name. A filename is attacker-controlled text that ends up in
 * a URL path; keeping it out of the key entirely removes a whole class of
 * problems. The original name is preserved in the database row instead, where
 * it is only ever displayed.
 */
export function buildAttachmentPath(userId: string, tradeId: string, file: File): string {
  return `${userId}/${tradeId}/${generateAttachmentId()}${extensionForFile(file)}`;
}

/**
 * The journal equivalent: `<user_id>/journal/<journal_entry_id>/<uuid>.<ext>`.
 *
 * The literal `journal` segment keeps journal objects from ever colliding with
 * a trade whose id happens to look like a uuid, and makes the bucket browsable
 * by hand. The FIRST segment is still the owner, so the storage policies in
 * 0003 apply unchanged.
 */
export function buildJournalAttachmentPath(userId: string, journalEntryId: string, file: File): string {
  return `${userId}/journal/${journalEntryId}/${generateAttachmentId()}${extensionForFile(file)}`;
}

/**
 * The extension to store for a file, derived from its name and restricted to
 * the types the bucket accepts.
 *
 * Never the user's original name: a filename is attacker-controlled text that
 * ends up in a URL path. Keeping it out of the key removes a whole class of
 * problems, and the original is preserved in the database row for display.
 */
function extensionForFile(file: File): string {
  const dot = file.name.lastIndexOf(".");
  const rawExt = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return ALLOWED_IMAGE_EXTENSIONS.includes(rawExt as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])
    ? rawExt
    : ".png";
}

/** A v4-shaped id, so the storage key and the row id agree in form. */
export function generateAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for browsers without crypto.randomUUID on a non-secure origin.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * The equity curve base: starting balance plus manual adjustments.
 *
 * Re-exported from core rather than redefined here, so the web app and the
 * mobile app can never compute a return figure against a different denominator.
 */
export { capitalBase };

export interface DashboardData {
  metrics: PerformanceMetrics;
  equityCurve: EquityPoint[];
  capitalBase: number;
}

export type { PerformanceMetrics, EquityPoint };
