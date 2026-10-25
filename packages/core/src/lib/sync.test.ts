import {
  buildStatus,
  chooseWinner,
  describeStatus,
  generateId,
  pushQueue,
  queueMutation,
  type SyncStore,
} from "../lib/sync";
import type {
  ISOTimestamp,
  SyncConflict,
  SyncEntity,
  SyncOp,
  SyncQueueItem,
} from "../domain/types";

/** In-memory fake store so the sync engine can be tested without a network. */
function createFakeStore(options: { failIds?: string[]; maxAttempts?: number } = {}) {
  const queue: SyncQueueItem[] = [];
  const conflicts: SyncConflict[] = [];
  const remote = new Map<string, { revision: number; payload: unknown }>();
  let lastSyncedAt: ISOTimestamp | null = null;
  let applyCount = 0;

  const key = (entity: SyncEntity, id: string) => `${entity}:${id}`;

  const store: SyncStore = {
    async listQueue() {
      return [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async enqueue(item) {
      queue.push(item);
    },
    async updateQueueItem(id, patch) {
      const idx = queue.findIndex((q) => q.id === id);
      if (idx >= 0) queue[idx] = { ...(queue[idx] as SyncQueueItem), ...patch };
    },
    async removeQueueItem(id) {
      const idx = queue.findIndex((q) => q.id === id);
      if (idx >= 0) queue.splice(idx, 1);
    },
    async fetchRemoteRevision(entity, id) {
      const record = remote.get(key(entity, id));
      return record ? record.revision : null;
    },
    async applyRemote(entity, id, op, payload) {
      applyCount += 1;
      if (options.failIds && options.failIds.includes(id)) {
        throw new Error("simulated network failure");
      }
      const existing = remote.get(key(entity, id));
      const revision = op === "insert" ? 1 : (existing?.revision ?? 0) + 1;
      if (op === "delete") {
        remote.delete(key(entity, id));
      } else {
        remote.set(key(entity, id), { revision, payload });
      }
      return revision;
    },
    async recordConflict(conflict) {
      conflicts.push(conflict);
    },
    async getConflicts() {
      return conflicts;
    },
    async setLastSyncedAt(at) {
      lastSyncedAt = at;
    },
  };

  return {
    store,
    queue,
    conflicts,
    remote,
    get lastSyncedAt() {
      return lastSyncedAt;
    },
    get applyCount() {
      return applyCount;
    },
    /** Simulate a write that happened on another device. */
    seedRemote(entity: SyncEntity, id: string, revision: number) {
      remote.set(key(entity, id), { revision, payload: { from: "another device" } });
    },
  };
}

describe("generateId", () => {
  it("produces a v4-shaped uuid", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("produces unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});

describe("queueMutation", () => {
  it("enqueues a new insert", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "insert",
      payload: { id: "t1" },
      baseRevision: 0,
    });
    expect(fake.queue).toHaveLength(1);
    expect(fake.queue[0]?.op).toBe("insert");
  });

  it("collapses insert then update into a single insert with the newer payload", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "insert",
      payload: { v: 1 },
      baseRevision: 0,
    });
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "update",
      payload: { v: 2 },
      baseRevision: 0,
    });
    expect(fake.queue).toHaveLength(1);
    expect(fake.queue[0]?.op).toBe("insert");
    expect(JSON.parse(fake.queue[0]?.payload ?? "{}")).toEqual({ v: 2 });
  });

  it("drops an insert that is then deleted before syncing", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "insert",
      payload: {},
      baseRevision: 0,
    });
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "delete",
      payload: {},
      baseRevision: 0,
    });
    expect(fake.queue).toHaveLength(0);
  });

  it("collapses update then delete into a delete", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "update",
      payload: {},
      baseRevision: 1,
    });
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "delete",
      payload: {},
      baseRevision: 1,
    });
    expect(fake.queue).toHaveLength(1);
    expect(fake.queue[0]?.op).toBe("delete");
  });

  it("preserves the original base revision when collapsing", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "insert",
      payload: {},
      baseRevision: 0,
    });
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "update",
      payload: {},
      baseRevision: 5, // must not overwrite the original 0
    });
    expect(fake.queue[0]?.baseRevision).toBe(0);
  });

  it("keeps separate records separate", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, { entity: "trades", entityId: "t1", op: "insert", payload: {}, baseRevision: 0 });
    await queueMutation(fake.store, { entity: "trades", entityId: "t2", op: "insert", payload: {}, baseRevision: 0 });
    expect(fake.queue).toHaveLength(2);
  });
});

describe("pushQueue", () => {
  it("pushes a pending insert and clears the queue", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "insert",
      payload: { symbol: "EURUSD" },
      baseRevision: 0,
    });
    const result = await pushQueue(fake.store);
    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(0);
    expect(fake.queue).toHaveLength(0);
    expect(fake.remote.get("trades:t1")?.revision).toBe(1);
  });

  it("does not duplicate a record when the same insert is sent twice", async () => {
    const fake = createFakeStore();
    const params = {
      entity: "trades" as SyncEntity,
      entityId: "t1",
      op: "insert" as SyncOp,
      payload: { symbol: "EURUSD" },
      baseRevision: 0,
    };
    await queueMutation(fake.store, params);
    await pushQueue(fake.store);
    // Re-queue the same logical insert (as a retry would).
    await queueMutation(fake.store, params);
    await pushQueue(fake.store);
    expect(fake.remote.size).toBe(1);
    expect(fake.remote.get("trades:t1")?.revision).toBe(1);
  });

  it("detects a conflict instead of overwriting newer remote data", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "update",
      payload: { v: "local" },
      baseRevision: 1,
    });
    // Another device already pushed revision 2.
    fake.seedRemote("trades", "t1", 2);

    const result = await pushQueue(fake.store);
    expect(result.conflicts).toBe(1);
    expect(result.pushed).toBe(0);
    expect(fake.conflicts).toHaveLength(1);
    expect(fake.conflicts[0]?.localRevision).toBe(1);
    expect(fake.conflicts[0]?.remoteRevision).toBe(2);
    expect(fake.conflicts[0]?.resolution).toBe("unresolved");
    // The item stays queued until the user resolves it.
    expect(fake.queue).toHaveLength(1);
    // The remote payload is untouched.
    expect(fake.remote.get("trades:t1")?.payload).toEqual({ from: "another device" });
  });

  it("applies cleanly when the remote revision matches the base", async () => {
    const fake = createFakeStore();
    fake.seedRemote("trades", "t1", 1);
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "update",
      payload: { v: "local" },
      baseRevision: 1,
    });
    const result = await pushQueue(fake.store);
    expect(result.pushed).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(fake.remote.get("trades:t1")?.revision).toBe(2);
  });

  it("records a failure and increments attempts without aborting the run", async () => {
    const fake = createFakeStore({ failIds: ["t1"] });
    await queueMutation(fake.store, { entity: "trades", entityId: "t1", op: "insert", payload: {}, baseRevision: 0 });
    await queueMutation(fake.store, { entity: "trades", entityId: "t2", op: "insert", payload: {}, baseRevision: 0 });

    const result = await pushQueue(fake.store);
    expect(result.failed).toBe(1);
    expect(result.pushed).toBe(1); // t2 still succeeded
    expect(fake.queue).toHaveLength(1);
    expect(fake.queue[0]?.attempts).toBe(1);
    expect(fake.queue[0]?.lastError).toMatch(/simulated network failure/);
  });

  it("stops retrying after the maximum attempts", async () => {
    const fake = createFakeStore({ failIds: ["t1"] });
    await queueMutation(fake.store, { entity: "trades", entityId: "t1", op: "insert", payload: {}, baseRevision: 0 });

    for (let i = 0; i < 3; i += 1) {
      await pushQueue(fake.store, { maxAttempts: 3 });
    }
    const result = await pushQueue(fake.store, { maxAttempts: 3 });
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/Gave up/);
    // Crucially it was not applied.
    expect(fake.applyCount).toBe(3);
  });

  it("records the last synced time after a successful push", async () => {
    const fake = createFakeStore();
    await queueMutation(fake.store, { entity: "trades", entityId: "t1", op: "insert", payload: {}, baseRevision: 0 });
    await pushQueue(fake.store);
    expect(fake.lastSyncedAt).not.toBeNull();
  });

  it("does nothing when the queue is empty", async () => {
    const fake = createFakeStore();
    const result = await pushQueue(fake.store);
    expect(result).toEqual({ pushed: 0, conflicts: 0, failed: 0, errors: [] });
  });

  it("handles a delete operation", async () => {
    const fake = createFakeStore();
    fake.seedRemote("trades", "t1", 1);
    await queueMutation(fake.store, {
      entity: "trades",
      entityId: "t1",
      op: "delete",
      payload: {},
      baseRevision: 1,
    });
    const result = await pushQueue(fake.store);
    expect(result.pushed).toBe(1);
    expect(fake.remote.has("trades:t1")).toBe(false);
  });
});

describe("chooseWinner", () => {
  const local = { revision: 3, updatedAt: "2026-03-01T10:00:00.000Z" };
  const remote = { revision: 2, updatedAt: "2026-03-02T10:00:00.000Z" };

  it("honours keep_local", () => {
    expect(chooseWinner("keep_local", local, remote)).toBe("local");
  });

  it("honours keep_remote", () => {
    expect(chooseWinner("keep_remote", local, remote)).toBe("remote");
  });

  it("picks the newest by timestamp", () => {
    expect(chooseWinner("keep_newest", local, remote)).toBe("remote");
    expect(chooseWinner("keep_newest", remote, local)).toBe("local");
  });

  it("breaks timestamp ties with the higher revision", () => {
    const a = { revision: 5, updatedAt: "2026-03-01T10:00:00.000Z" };
    const b = { revision: 2, updatedAt: "2026-03-01T10:00:00.000Z" };
    expect(chooseWinner("keep_newest", a, b)).toBe("local");
    expect(chooseWinner("keep_newest", b, a)).toBe("remote");
  });

  it("falls back to remote when a timestamp is unparseable", () => {
    expect(chooseWinner("keep_newest", { revision: 1, updatedAt: "bad" }, remote)).toBe("remote");
  });
});

describe("buildStatus and describeStatus", () => {
  const item: SyncQueueItem = {
    id: "q1",
    entity: "trades",
    entityId: "t1",
    op: "insert",
    payload: "{}",
    baseRevision: 0,
    attempts: 0,
    lastError: null,
    createdAt: "2026-03-01T10:00:00.000Z",
  };

  it("reports offline when there is no connection", () => {
    const status = buildStatus([item], [], null, false);
    expect(status.state).toBe("offline");
    expect(describeStatus(status)).toMatch(/Offline/);
    expect(describeStatus(status)).toMatch(/1 change/);
  });

  it("reports conflict when unresolved conflicts exist", () => {
    const conflict: SyncConflict = {
      entity: "trades",
      entityId: "t1",
      localRevision: 1,
      remoteRevision: 2,
      detectedAt: "2026-03-01T10:00:00.000Z",
      resolution: "unresolved",
    };
    const status = buildStatus([], [conflict], null, true);
    expect(status.state).toBe("conflict");
    expect(status.conflicts).toHaveLength(1);
    expect(describeStatus(status)).toMatch(/need your review/);
  });

  it("ignores already-resolved conflicts", () => {
    const conflict: SyncConflict = {
      entity: "trades",
      entityId: "t1",
      localRevision: 1,
      remoteRevision: 2,
      detectedAt: "2026-03-01T10:00:00.000Z",
      resolution: "kept_local",
    };
    expect(buildStatus([], [conflict], null, true).conflicts).toHaveLength(0);
  });

  it("reports idle with a clean queue", () => {
    const status = buildStatus([], [], null, true);
    expect(status.state).toBe("idle");
    expect(describeStatus(status)).toBe("All changes saved");
  });

  it("pluralises the pending count correctly", () => {
    expect(describeStatus(buildStatus([item], [], null, true))).toBe("1 change pending");
    expect(describeStatus(buildStatus([item, item], [], null, true))).toBe("2 changes pending");
  });
});
