/**
 * Cloud store — Supabase.
 *
 * The real product. The web app and the mobile app both talk to this same
 * PostgreSQL database, which is what makes them "connected": sign in on your
 * phone, add a trade, open the website, and it is there.
 *
 * Every call runs as the signed-in user. Row Level Security scopes each query
 * to `auth.uid()`, so this code never filters "for security" — it filters for
 * convenience. Deleting the `user_id` filters below would still return only
 * the caller's rows; that is the whole point of 0002_rls_policies.sql.
 *
 * Deletes are soft (`deleted_at`), so an offline client can still converge and
 * a mistake is recoverable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateId } from "@tradevault/core";
import { describeError, getSupabase } from "./supabase";
import {
  accountFromRow,
  accountToRow,
  attachmentFromRow,
  journalAttachmentFromRow,
  exitFromRow,
  exitToRow,
  journalFromRow,
  journalToRow,
  strategyFromRow,
  strategyToRow,
  tradeFromRow,
  tradeToRow,
} from "./mappers";
import {
  buildAttachmentPath,
  buildJournalAttachmentPath,
  validateAttachmentFile,
  type AccountInput,
  type AdminOverview,
  type AttachmentInput,
  type JournalAttachmentInput,
  type ExitInput,
  type JournalInput,
  type SaveResult,
  type Snapshot,
  type StoreResult,
  type StrategyInput,
  type TradeInput,
  type TradeVaultStore,
} from "./store";
import type {
  AdminPlatformTotalsRow,
  AdminUserOverviewRow,
  JournalAttachmentRow,
  JournalEntryRow,
  TagRow,
  TradeAttachmentRow,
  TradeExitRow,
  TradeRow,
  TradeWithExits,
  TradingAccountRow,
  TradingStrategyRow,
} from "./database.types";

/** The one bucket these attachments live in. Mirrors 0003_storage.sql. */
const BUCKET = "trade-attachments";

/**
 * How long a signed URL stays valid.
 *
 * Short on purpose. A signed URL is a bearer token: anyone holding it can read
 * the object until it expires, with no further check. Five minutes is long
 * enough to load an image on a slow connection and short enough that a URL
 * leaking into a log or a shared screenshot is not a lasting exposure.
 */
const SIGNED_URL_TTL_SECONDS = 300;

async function requireUser(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error("Your session has expired. Sign in again to continue.");
  }
  return data.user.id;
}

export function createCloudStore(client: SupabaseClient): TradeVaultStore {
  const store: TradeVaultStore = {
    capabilities: {
      kind: "cloud",
      label: "Connected — saved to your TradeVault account",
      syncsAcrossDevices: true,
    },

    /* ---------------------------------------------------------------- */
    /* Load                                                             */
    /* ---------------------------------------------------------------- */

    async loadSnapshot(): Promise<StoreResult<Snapshot>> {
      try {
        await requireUser(client);

        // Six parallel reads. The embedded select on trades pulls each
        // trade's exits in the same round trip.
        const [accounts, trades, strategies, journal, attachments, journalAttachments] = await Promise.all([
          client.from("trading_accounts").select("*").is("deleted_at", null).order("created_at"),
          client
            .from("trades")
            .select("*, trade_exits(*)")
            .is("deleted_at", null)
            .order("entry_at", { ascending: false }),
          client.from("trading_strategies").select("*").is("deleted_at", null).order("name"),
          client.from("journal_entries").select("*").is("deleted_at", null).order("entry_date", { ascending: false }),
          client.from("trade_attachments").select("*").is("deleted_at", null).order("created_at"),
          client.from("journal_attachments").select("*").is("deleted_at", null).order("created_at"),
        ]);

        const firstError =
          accounts.error ??
          trades.error ??
          strategies.error ??
          journal.error ??
          attachments.error ??
          journalAttachments.error;
        if (firstError) {
          return { data: null, error: describeError(firstError) };
        }

        const tradeRows = (trades.data ?? []) as TradeWithExits[];
        const exits = tradeRows.flatMap((t) =>
          (t.trade_exits ?? []).filter((e) => !e.deleted_at).map(exitFromRow)
        );

        return {
          data: {
            accounts: ((accounts.data ?? []) as TradingAccountRow[]).map(accountFromRow),
            trades: tradeRows.map(tradeFromRow),
            exits,
            strategies: ((strategies.data ?? []) as TradingStrategyRow[]).map(strategyFromRow),
            journal: ((journal.data ?? []) as JournalEntryRow[]).map(journalFromRow),
            attachments: ((attachments.data ?? []) as TradeAttachmentRow[]).map(attachmentFromRow),
            journalAttachments: ((journalAttachments.data ?? []) as JournalAttachmentRow[]).map(
              journalAttachmentFromRow
            ),
          },
          error: null,
        };
      } catch (error) {
        return { data: null, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Trades                                                           */
    /* ---------------------------------------------------------------- */

    async createTrade(input: TradeInput) {
      try {
        const userId = await requireUser(client);
        const id = input.id ?? generateId();
        const row = tradeToRow({ ...input, id }, userId);

        const { error } = await client.from("trades").insert(row);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async updateTrade(id, input): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const row = tradeToRow(input as Record<string, unknown>, userId);
        delete row.user_id; // never reassign ownership on an update

        const { error } = await client.from("trades").update(row).eq("id", id);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async deleteTrade(id): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        // Soft delete: mark it so an offline client can still learn about it.
        // Exits are soft-deleted alongside it so they never resurrect.
        const now = new Date().toISOString();

        const { error } = await client
          .from("trades")
          .update({ deleted_at: now })
          .eq("id", id)
          .eq("user_id", userId);
        if (error) return { ok: false, error: describeError(error) };

        const exitResult = await client
          .from("trade_exits")
          .update({ deleted_at: now })
          .eq("trade_id", id)
          .eq("user_id", userId);
        if (exitResult.error) {
          // The trade itself is already hidden; report the partial failure
          // rather than claiming a clean delete.
          return { ok: false, error: describeError(exitResult.error) };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Exits                                                            */
    /* ---------------------------------------------------------------- */

    async createExit(input: ExitInput) {
      try {
        const userId = await requireUser(client);
        const id = input.id ?? generateId();
        const row = exitToRow({ ...input, id }, userId);

        // The database also guards this, but catching it here gives a clear
        // message before a round trip.
        const { error } = await client.from("trade_exits").insert(row);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async deleteExit(id): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const { error } = await client
          .from("trade_exits")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Accounts                                                         */
    /* ---------------------------------------------------------------- */

    async createAccount(input: AccountInput) {
      try {
        const userId = await requireUser(client);
        const id = input.id ?? generateId();
        const row = accountToRow({ ...input, id }, userId);
        const { error } = await client.from("trading_accounts").insert(row);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async updateAccount(id, input): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const row = accountToRow(input, userId);
        delete row.user_id;
        const { error } = await client.from("trading_accounts").update(row).eq("id", id);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Journal                                                          */
    /* ---------------------------------------------------------------- */

    async createJournalEntry(input: JournalInput) {
      try {
        const userId = await requireUser(client);
        const id = input.id ?? generateId();
        const row = journalToRow({ ...input, id }, userId);
        const { error } = await client.from("journal_entries").insert(row);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async updateJournalEntry(id, input): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const row = journalToRow(input as Record<string, unknown>, userId);
        delete row.user_id;
        const { error } = await client.from("journal_entries").update(row).eq("id", id);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async deleteJournalEntry(id): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const { error } = await client
          .from("journal_entries")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Strategies                                                       */
    /* ---------------------------------------------------------------- */

    async createStrategy(input: StrategyInput) {
      try {
        const userId = await requireUser(client);
        const id = input.id ?? generateId();
        const row = strategyToRow({ ...input, id }, userId);
        const { error } = await client.from("trading_strategies").insert(row);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async updateStrategy(id, input): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const row = strategyToRow(input as Record<string, unknown>, userId);
        delete row.user_id;
        const { error } = await client.from("trading_strategies").update(row).eq("id", id);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async deleteStrategy(id): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const { error } = await client
          .from("trading_strategies")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);
        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Attachments                                                      */
    /* ---------------------------------------------------------------- */

    /**
     * Upload an image and record it against a trade.
     *
     * The order here is deliberate: upload the bytes FIRST, then insert the
     * row. If we inserted the row first and the upload failed, the trade would
     * show an attachment that cannot be opened — a failure that looks like a
     * success. This way a failure leaves an orphaned object in the bucket,
     * which is invisible and harmless, rather than a broken record in the UI.
     *
     * The path is `<user_id>/<trade_id>/<uuid>.<ext>`. The bucket policies
     * match the first segment against `auth.uid()`, so even a hand-crafted
     * upload cannot land in another user's folder.
     */
    async uploadAttachment(input: AttachmentInput) {
      try {
        const userId = await requireUser(client);

        const invalid = validateAttachmentFile(input.file);
        if (invalid) return { ok: false, error: invalid };

        const id = input.id ?? generateId();
        const path = buildAttachmentPath(userId, input.tradeId, input.file);

        // `contentType` is set explicitly from the browser's view of the file.
        // It must be one the bucket allows, or the upload is rejected outright.
        const { error: uploadError } = await client.storage
          .from(BUCKET)
          .upload(path, input.file, {
            contentType: input.file.type,
            upsert: false,
          });

        if (uploadError) {
          return { ok: false, error: describeStorageError(uploadError) };
        }

        const { error: insertError } = await client.from("trade_attachments").insert({
          id,
          user_id: userId,
          trade_id: input.tradeId,
          remote_path: path,
          // The original name is kept for display only. It never forms part of
          // the storage key, so it cannot be used to traverse or collide.
          file_name: input.file.name.slice(0, 255),
          mime_type: input.file.type,
          byte_size: input.file.size,
          caption: input.caption ?? null,
        });

        if (insertError) {
          // The row is what makes the file visible. Without it the object is
          // unreachable, so remove it rather than leave litter in the bucket.
          await client.storage.from(BUCKET).remove([path]);
          return { ok: false, error: describeError(insertError) };
        }

        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /**
     * Mint a short-lived signed URL for an attachment.
     *
     * The bucket is private, so there is no permanent public URL — by design.
     * A signed URL is a bearer token valid for SIGNED_URL_TTL_SECONDS; it must
     * not be persisted or shared.
     */
    async attachmentUrl(attachment): Promise<StoreResult<string>> {
      try {
        if (!attachment.remotePath) {
          return { data: null, error: "That attachment has no stored file." };
        }
        const { data, error } = await client.storage
          .from(BUCKET)
          .createSignedUrl(attachment.remotePath, SIGNED_URL_TTL_SECONDS);

        if (error || !data?.signedUrl) {
          return { data: null, error: describeStorageError(error) };
        }
        return { data: data.signedUrl, error: null };
      } catch (error) {
        return { data: null, error: describeError(error) };
      }
    },

    async deleteAttachment(id): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);

        const { data: row, error: readError } = await client
          .from("trade_attachments")
          .select("remote_path")
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle();

        if (readError) return { ok: false, error: describeError(readError) };

        // Soft-delete the row first: hiding it from the UI is the user-visible
        // part, and it must not depend on the storage call succeeding.
        const { error: updateError } = await client
          .from("trade_attachments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);
        if (updateError) return { ok: false, error: describeError(updateError) };

        // Then remove the object, which frees the storage. A failure here leaves
        // an orphaned object but a correct UI, which is the right way round.
        const path = (row as { remote_path: string | null } | null)?.remote_path;
        if (path) {
          const { error: removeError } = await client.storage.from(BUCKET).remove([path]);
          if (removeError) {
            return {
              ok: false,
              error: `The image was removed from your trade, but its file could not be deleted from storage: ${describeStorageError(removeError)}`,
            };
          }
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Journal attachments                                              */
    /* ---------------------------------------------------------------- */

    /**
     * Upload an image and record it against a journal entry.
     *
     * Same ordering rule as the trade version: bytes first, row second. The
     * path carries a literal `journal` segment between the owner and the entry
     * id, so a journal object can never be mistaken for a trade's.
     */
    async uploadJournalAttachment(input: JournalAttachmentInput) {
      try {
        const userId = await requireUser(client);

        const invalid = validateAttachmentFile(input.file);
        if (invalid) return { ok: false, error: invalid };

        const id = input.id ?? generateId();
        const path = buildJournalAttachmentPath(userId, input.journalEntryId, input.file);

        const { error: uploadError } = await client.storage
          .from(BUCKET)
          .upload(path, input.file, {
            contentType: input.file.type,
            upsert: false,
          });

        if (uploadError) {
          return { ok: false, error: describeStorageError(uploadError) };
        }

        const { error: insertError } = await client.from("journal_attachments").insert({
          id,
          user_id: userId,
          journal_entry_id: input.journalEntryId,
          remote_path: path,
          file_name: input.file.name.slice(0, 255),
          mime_type: input.file.type,
          byte_size: input.file.size,
          caption: input.caption ?? null,
        });

        if (insertError) {
          // The row is what makes the file reachable. Without it the object is
          // litter, so take it back out.
          await client.storage.from(BUCKET).remove([path]);
          return { ok: false, error: describeError(insertError) };
        }

        return { ok: true, id };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    async journalAttachmentUrl(attachment): Promise<StoreResult<string>> {
      try {
        if (!attachment.remotePath) {
          return { data: null, error: "That attachment has no stored file." };
        }
        const { data, error } = await client.storage
          .from(BUCKET)
          .createSignedUrl(attachment.remotePath, SIGNED_URL_TTL_SECONDS);

        if (error || !data?.signedUrl) {
          return { data: null, error: describeStorageError(error) };
        }
        return { data: data.signedUrl, error: null };
      } catch (error) {
        return { data: null, error: describeError(error) };
      }
    },

    async deleteJournalAttachment(id): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);

        const { data: row, error: readError } = await client
          .from("journal_attachments")
          .select("remote_path")
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle();

        if (readError) return { ok: false, error: describeError(readError) };

        // Soft-delete first: hiding it from the entry is the user-visible part
        // and must not depend on the storage call succeeding.
        const { error: updateError } = await client
          .from("journal_attachments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);
        if (updateError) return { ok: false, error: describeError(updateError) };

        const path = (row as { remote_path: string | null } | null)?.remote_path;
        if (path) {
          const { error: removeError } = await client.storage.from(BUCKET).remove([path]);
          if (removeError) {
            return {
              ok: false,
              error: `The image was removed from your journal entry, but its file could not be deleted from storage: ${describeStorageError(removeError)}`,
            };
          }
        }

        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Admin                                                            */
    /* ---------------------------------------------------------------- */

    /**
     * Ask the database whether this session is an admin.
     *
     * Note what this is: a question, asked of the server, whose answer decides
     * which screen renders. It is NOT an access control. If someone patches the
     * front-end to force the admin screen open, every query behind it still
     * runs as them, and the policies still return nothing.
     */
    async checkIsAdmin(): Promise<boolean> {
      try {
        const userId = await requireUser(client);
        const { data, error } = await client
          .from("profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();

        if (error || !data) return false;
        return (data as { is_admin: boolean }).is_admin === true;
      } catch {
        // An unanswerable question is answered "no". Failing closed here is the
        // only safe direction: the cost is an admin seeing the normal app, not
        // a normal user seeing the admin one.
        return false;
      }
    },

    async loadAdminOverview(): Promise<StoreResult<AdminOverview>> {
      try {
        await requireUser(client);

        const [users, totals] = await Promise.all([
          client
            .from("admin_user_overview")
            .select("user_id, email, display_name, joined_at, is_admin, trade_count, journal_count, last_active_at")
            .order("joined_at", { ascending: false }),
          client.from("admin_platform_totals").select("*").maybeSingle(),
        ]);

        // A non-admin hitting this view gets zero rows rather than an error,
        // which is the intended behaviour. Surface it as an explicit refusal so
        // the page can say "not an admin" instead of "no users exist".
        if (users.error) {
          return { data: null, error: describeError(users.error) };
        }

        const rows = (users.data ?? []) as AdminUserOverviewRow[];
        const summary = (totals.data ?? null) as AdminPlatformTotalsRow | null;

        return {
          data: {
            users: rows.map((r) => ({
              userId: r.user_id,
              email: r.email,
              displayName: r.display_name,
              joinedAt: r.joined_at,
              isAdmin: r.is_admin,
              tradeCount: Number(r.trade_count ?? 0),
              journalCount: Number(r.journal_count ?? 0),
              lastActiveAt: r.last_active_at,
            })),
            totals: {
              userCount: Number(summary?.user_count ?? rows.length),
              adminCount: Number(summary?.admin_count ?? 0),
              newUsers7d: Number(summary?.new_users_7d ?? 0),
              tradeCount: Number(summary?.trade_count ?? 0),
              journalCount: Number(summary?.journal_count ?? 0),
            },
          },
          error: null,
        };
      } catch (error) {
        return { data: null, error: describeError(error) };
      }
    },

    async setAdminFlag(userId, isAdmin): Promise<SaveResult> {
      try {
        const callerId = await requireUser(client);

        // The database enforces this too, with a trigger, and would silently
        // ignore the change. Refusing here gives a real message instead of a
        // save that reports success and did nothing.
        if (callerId === userId && !isAdmin) {
          return {
            ok: false,
            error:
              "You cannot remove your own admin access. Ask another admin to do it, or run the SQL directly.",
          };
        }

        const { error } = await client
          .from("profiles")
          .update({ is_admin: isAdmin })
          .eq("id", userId);

        if (error) return { ok: false, error: describeError(error) };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },

    /* ---------------------------------------------------------------- */
    /* Erase                                                            */
    /* ---------------------------------------------------------------- */

    async eraseAllData(): Promise<SaveResult> {
      try {
        const userId = await requireUser(client);
        const now = new Date().toISOString();

        // Order matters only for readability; each is scoped to the caller and
        // RLS enforces the same thing on the server.
        const order: Array<{ table: string; column: string }> = [
          { table: "trade_exits", column: "user_id" },
          { table: "trade_attachments", column: "user_id" },
          { table: "trades", column: "user_id" },
          { table: "journal_entries", column: "user_id" },
          { table: "trading_strategies", column: "user_id" },
        ];

        for (const { table, column } of order) {
          const { error } = await client
            .from(table)
            .update({ deleted_at: now })
            .eq(column, userId);
          if (error) return { ok: false, error: describeError(error) };
        }

        // Accounts last, so nothing points at a hidden account mid-way.
        const { error } = await client
          .from("trading_accounts")
          .update({ deleted_at: now })
          .eq("user_id", userId);
        if (error) return { ok: false, error: describeError(error) };

        return { ok: true };
      } catch (error) {
        return { ok: false, error: describeError(error) };
      }
    },
  };

  return store;
}

/** Convenience accessor used by the app shell. */
export function cloudStoreIfConfigured(): TradeVaultStore | null {
  const client = getSupabase();
  return client ? createCloudStore(client) : null;
}

/**
 * Translate a Supabase Storage error into something a trader can act on.
 *
 * Storage failures are the most confusing ones to receive raw, because the
 * messages are aimed at developers ("new row violates row-level security
 * policy"). Each branch here is a real failure mode with a real remedy.
 */
function describeStorageError(error: unknown): string {
  if (!error) return "The image could not be uploaded.";

  const anyErr = error as { message?: string; error?: string; statusCode?: string | number };
  const message = anyErr.message ?? anyErr.error ?? String(error);
  const status = String(anyErr.statusCode ?? "");

  if (/bucket not found/i.test(message)) {
    return "Image storage is not set up on this project yet. Run supabase/migrations/0003_storage.sql.";
  }
  if (/exceeded the maximum allowed size|payload too large|entity too large/i.test(message) || status === "413") {
    return "That image is larger than the 10 MB limit. Resize or crop it and try again.";
  }
  if (/mime type .* is not supported|invalid mime type/i.test(message)) {
    return "That file type is not allowed. Use a PNG, JPEG, WebP or GIF.";
  }
  if (/duplicate|already exists/i.test(message)) {
    return "An image with that identifier already exists. Try the upload again.";
  }
  if (/row-level security|not authorized|unauthorized|permission/i.test(message) || status === "403") {
    return "You do not have permission to store this image. Sign in again and retry.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return "Could not reach storage. Check your connection and try again — nothing was saved.";
  }

  return message;
}

/** A tag row, exported for the tag editor which is not yet surfaced in the UI. */
export type { TagRow, TradeRow, TradeExitRow };
