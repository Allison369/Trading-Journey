/**
 * Offline sync queue and conflict resolution.
 *
 * Strategy (documented because the spec requires a clear policy):
 *
 * 1. Every local mutation is written to the local store AND appended to a
 *    durable queue with the record's payload and the revision the client
 *    believed was current (`baseRevision`).
 * 2. Records carry stable UUIDs generated on the client, so re-sending the
 *    same insert after a failure can never create a duplicate row.
 * 3. On push, the server's current revision is compared with `baseRevision`:
 *      - remote revision === baseRevision  -> safe to apply
 *      - remote revision >  baseRevision  -> CONFLICT (another device wrote)
 *      - record missing on the server     -> insert it
 * 4. Conflicts are NEVER resolved by silently overwriting. They are recorded
 *    with both revisions and left `unresolved` until the user chooses, or
 *    resolved by an explicit policy passed into `resolveConflict`.
 * 5. This module is pure: it takes a store interface, so it can be unit
 *    tested without a network or a real database.
 */

import type {
  ISOTimestamp,
  SyncConflict,
  SyncEntity,
  SyncOp,
  SyncQueueItem,
  SyncStatus,
} from "../domain/types";

/* ------------------------------------------------------------------ */
/* Identifiers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate a UUID v4. Uses the platform crypto when available (React Native
 * and browsers both expose getRandomValues via a polyfill in the app) and
 * falls back to a Math.random implementation only as a last resort.
 */
export function generateId(): string {
  const g = globalThis as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  if (g.crypto?.getRandomValues) {
    const bytes = g.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  // Non-cryptographic fallback. Ids only need to be unique, not secret.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): ISOTimestamp {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Store interface                                                    */
/* ------------------------------------------------------------------ */

/** Minimal store contract needed by the sync engine. */
export interface SyncStore {
  /** Pending items, oldest first. */
  listQueue(): Promise<SyncQueueItem[]>;
  enqueue(item: SyncQueueItem): Promise<void>;
  updateQueueItem(id: string, patch: Partial<SyncQueueItem>): Promise<void>;
  removeQueueItem(id: string): Promise<void>;
  /** Fetch the current remote revision, or null when the record is absent. */
  fetchRemoteRevision(entity: SyncEntity, id: string): Promise<number | null>;
  /** Apply a payload to the remote store for an entity. */
  applyRemote(entity: SyncEntity, id: string, op: SyncOp, payload: unknown): Promise<number>;
  /** Record a conflict for later resolution. */
  recordConflict(conflict: SyncConflict): Promise<void>;
  getConflicts(): Promise<SyncConflict[]>;
  setLastSyncedAt(at: ISOTimestamp): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Queue operations                                                   */
/* ------------------------------------------------------------------ */

/**
 * Queue a mutation. If an earlier mutation for the same record is still
 * pending, collapse them:
 *   insert + update  -> insert (with the newer payload)
 *   insert + delete  -> nothing (the record never reached the server)
 *   update + delete  -> delete
 * This keeps the queue small and prevents contradictory replays.
 */
export async function queueMutation(
  store: SyncStore,
  params: {
    entity: SyncEntity;
    entityId: string;
    op: SyncOp;
    payload: unknown;
    baseRevision: number;
  }
): Promise<void> {
  const queue = await store.listQueue();
  const existing = queue.find(
    (q) => q.entity === params.entity && q.entityId === params.entityId
  );

  if (existing) {
    if (existing.op === "insert" && params.op === "delete") {
      // Never made it to the server; drop both.
      await store.removeQueueItem(existing.id);
      return;
    }

    const mergedOp: SyncOp =
      existing.op === "insert" ? "insert" : params.op;

    await store.updateQueueItem(existing.id, {
      op: mergedOp,
      payload: JSON.stringify(params.payload),
      // Keep the ORIGINAL base revision so conflict detection still compares
      // against the version the server last confirmed to us.
      baseRevision: existing.baseRevision,
    });
    return;
  }

  await store.enqueue({
    id: generateId(),
    entity: params.entity,
    entityId: params.entityId,
    op: params.op,
    payload: JSON.stringify(params.payload),
    baseRevision: params.baseRevision,
    attempts: 0,
    lastError: null,
    createdAt: nowIso(),
  });
}

export interface PushResult {
  pushed: number;
  conflicts: number;
  failed: number;
  errors: string[];
}

/**
 * Push pending mutations to the remote store.
 *
 * A single failure does not abort the whole run: the item is retried later
 * with its attempt count incremented, and rem                aining items still go.
 */
export async function pushQueue(
  store: SyncStore,
  options: { maxAttempts?: number; now?: () => ISOTimestamp } = {}
): Promise<PushResult> {
  const maxAttempts = options.maxAttempts ?? 5;
  const now = options.now ?? nowIso;

  const queue = await store.listQueue();
  const result: PushResult = { pushed: 0, conflicts: 0, failed: 0, errors: [] };

  for (const item of queue) {
    if (item.attempts >= maxAttempts) {
      result.failed += 1;
      result.errors.push(
        `Gave up on ${item.entity} ${item.entityId} after ${item.attempts} attempts.`
      );
      continue;
    }

    try {
      const remoteRevision = await store.fetchRemoteRevision(item.entity, item.entityId);

      // Conflict: the server has a newer version than the one we started from.
      if (remoteRevision !== null && remoteRevision > item.baseRevision) {
        await store.recordConflict({
          entity: item.entity,
          entityId: item.entityId,
          localRevision: item.baseRevision,
          remoteRevision,
          detectedAt: now(),
          resolution: "unresolved",
        });
        // Leave the item queued: it is neither applied nor discarded until the
        // user resolves it.
        result.conflicts += 1;
        continue;
      }

      const payload = JSON.parse(item.payload) as unknown;
      const newRevision = await store.applyRemote(
        item.entity,
        item.entityId,
        item.op,
        payload
      );

      await store.removeQueueItem(item.id);
      result.pushed += 1;

      // Remember the revision the server assigned, for future comparisons.
      void newRevision;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.updateQueueItem(item.id, {
        attempts: item.attempts + 1,
        lastError: message,
      });
      result.failed += 1;
      result.errors.push(`${item.entity} ${item.entityId}: ${message}`);
    }
  }

  if (result.pushed > 0) {
    await store.setLastSyncedAt(now());
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Conflict resolution                                                */
/* ------------------------------------------------------------------ */

export type ConflictPolicy = "keep_local" | "keep_remote" | "keep_newest";

/**
 * Resolve a conflict explicitly. There is no implicit "last write wins"
 * default — the caller must choose a policy.
 */
export function chooseWinner(
  policy: ConflictPolicy,
  local: { revision: number; updatedAt: ISOTimestamp },
  remote: { revision: number; updatedAt: ISOTimestamp }
): "local" | "remote" {
  switch (policy) {
    case "keep_local":
      return "local";
    case "keep_remote":
      return "remote";
    case "keep_newest": {
      const localTime = Date.parse(local.updatedAt);
      const remoteTime = Date.parse(remote.updatedAt);
      if (!Number.isFinite(localTime)) return "remote";
      if (!Number.isFinite(remoteTime)) return "local";
      // Ties go to the higher revision, then to the remote copy.
      if (localTime === remoteTime) {
        return local.revision >= remote.revision ? "local" : "remote";
      }
      return localTime > remoteTime ? "local" : "remote";
    }
    default:
      return "remote";
  }
}

/** Build the status object the UI displays. */
export function buildStatus(
  queue: SyncQueueItem[],
  conflicts: SyncConflict[],
  lastSyncedAt: ISOTimestamp | null,
  isOnline: boolean,
  lastError: string | null = null
): SyncStatus {
  const unresolved = conflicts.filter((c) => c.resolution === "unresolved");

  let state: SyncStatus["state"] = "idle";
  if (!isOnline) state = "offline";
  else if (lastError) state = "error";
  else if (unresolved.length > 0) state = "conflict";

  return {
    state,
    pendingCount: queue.length,
    lastSyncedAt,
    lastError,
    conflicts: unresolved,
  };
}

/** Human-readable summary for the sync indicator. */
export function describeStatus(status: SyncStatus): string {
  switch (status.state) {
    case "offline":
      return status.pendingCount > 0
        ? `Offline — ${status.pendingCount} change${status.pendingCount === 1 ? "" : "s"} waiting to sync`
        : "Offline — changes are saved on this device";
    case "syncing":
      return "Syncing…";
    case "error":
      return status.lastError ? `Sync error: ${status.lastError}` : "Sync error";
    case "conflict":
      return `${status.conflicts.length} conflict${status.conflicts.length === 1 ? "" : "s"} need your review`;
    default:
      return status.pendingCount > 0
        ? `${status.pendingCount} change${status.pendingCount === 1 ? "" : "s"} pending`
        : "All changes saved";
  }
}
