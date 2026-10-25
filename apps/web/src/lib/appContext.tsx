/**
 * The single source of truth for the running app.
 *
 * Holds the loaded snapshot, the active store, and the sign-in state. Pages
 * read from this context; nothing talks to Supabase or localStorage directly.
 *
 * One rule this file enforces: the UI must be able to tell the difference
 * between "no data yet", "no data because the account is empty" and "could not
 * reach the server". Those are three different messages, and collapsing them
 * into one is how apps end up showing a misleading zero.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSupabase, isCloudConfigured, isOfflineDemo, describeError } from "./supabase";
import { createCloudStore } from "./cloudStore";
import { createLocalStore } from "./localStore";
import {
  capitalBase,
  exitsByTrade,
  liveAccounts,
  liveAttachments,
  liveJournal,
  liveJournalAttachments,
  liveStrategies,
  liveTrades,
  type Snapshot,
  type TradeVaultStore,
} from "./store";
import type { User } from "@supabase/supabase-js";

export type LoadState = "loading" | "ready" | "error";

export interface AppContextValue {
  store: TradeVaultStore;
  snapshot: Snapshot;
  loadState: LoadState;
  loadError: string | null;
  reload: () => Promise<void>;

  user: User | null;
  authReady: boolean;
  signOut: () => Promise<void>;

  /** True when the app is running without a cloud connection. */
  isOffline: boolean;
  /** True when the visible rows are the labelled sample set. */
  isSampleData: boolean;

  /**
   * Whether the signed-in account is an admin, as reported by the database.
   *
   * `null` while the question is still being answered, which keeps the admin
   * entry point from flickering into view on every reload. Only the cloud store
   * can answer it; offline mode leaves it `false`.
   */
  isAdmin: boolean | null;
}

const EMPTY: Snapshot = {
  accounts: [],
  trades: [],
  exits: [],
  strategies: [],
  journal: [],
  attachments: [],
  journalAttachments: [],
};

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Choose a store.
 *
 * Priority:
 *   1. VITE_OFFLINE_DEMO=true        -> local, seeded, no sign-in
 *   2. Supabase configured           -> cloud
 *   3. otherwise                     -> local, seeded, no sign-in
 */
function selectStore(): { store: TradeVaultStore; needsAuth: boolean } {
  if (isOfflineDemo()) {
    return { store: createLocalStore({ seed: true }), needsAuth: false };
  }
  if (isCloudConfigured()) {
    const client = getSupabase();
    if (client) return { store: createCloudStore(client), needsAuth: true };
  }
  return { store: createLocalStore({ seed: true }), needsAuth: false };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [{ store, needsAuth }] = useState(selectStore);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!needsAuth);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(needsAuth ? null : false);

  const reload = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    const result = await store.loadSnapshot();
    if (result.error) {
      // Keep whatever we already have on screen; do not blank the dashboard
      // because a refresh failed.
      setLoadError(result.error);
      setLoadState("error");
      return;
    }
    setSnapshot(result.data ?? EMPTY);
    setLoadState("ready");
  }, [store]);

  // Watch the auth session when the cloud store is in use.
  useEffect(() => {
    if (!needsAuth) return;
    const client = getSupabase();
    if (!client) return;

    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [needsAuth]);

  // Load data whenever we have an identity to load it for.
  useEffect(() => {
    if (!authReady) return;
    if (needsAuth && !user) {
      setSnapshot(EMPTY);
      setLoadState("ready");
      return;
    }
    void reload();
  }, [authReady, needsAuth, user, reload]);

  // Ask the database whether this account is an admin.
  //
  // This runs separately from the snapshot load because it answers a different
  // question, and a failure to answer it must not blank the journal. It is
  // asked again on every sign-in, so a flag granted or revoked elsewhere takes
  // effect on the next session rather than being cached forever.
  useEffect(() => {
    if (!needsAuth) {
      setIsAdmin(false);
      return;
    }
    if (!authReady || !user) {
      setIsAdmin(needsAuth ? null : false);
      return;
    }

    let cancelled = false;
    setIsAdmin(null);

    store
      .checkIsAdmin?.()
      .then((result) => {
        if (!cancelled) setIsAdmin(result);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, [needsAuth, authReady, user, store]);

  const signOut = useCallback(async () => {
    const client = getSupabase();
    if (!client) return;
    await client.auth.signOut();
    setUser(null);
    setSnapshot(EMPTY);
    setIsAdmin(null);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      store,
      snapshot,
      loadState,
      loadError,
      reload,
      user,
      authReady,
      signOut,
      isOffline: store.capabilities.kind === "local",
      isSampleData: store.capabilities.kind === "local",
      isAdmin,
    }),
    [store, snapshot, loadState, loadError, reload, user, authReady, signOut, isAdmin]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>.");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Derived views                                                      */
/* ------------------------------------------------------------------ */

/** Everything a page needs, already filtered and grouped. */
export function useDerived() {
  const { snapshot } = useApp();

  return useMemo(() => {
    const accounts = liveAccounts(snapshot.accounts);
    const trades = liveTrades(snapshot.trades);
    const exits = snapshot.exits.filter((e) => !e.deletedAt);
    const journal = liveJournal(snapshot.journal);
    const strategies = liveStrategies(snapshot.strategies);
    const attachments = liveAttachments(snapshot.attachments);
    const journalAttachments = liveJournalAttachments(snapshot.journalAttachments);

    // Group attachments by trade once, so a trade table does not scan the full
    // list per row.
    const attachmentsByTrade: Record<string, typeof attachments> = {};
    for (const a of attachments) {
      const list = attachmentsByTrade[a.tradeId] ?? [];
      list.push(a);
      attachmentsByTrade[a.tradeId] = list;
    }

    // The same for journal images, grouped by the entry they belong to.
    const journalAttachmentsByEntry: Record<string, typeof journalAttachments> = {};
    for (const a of journalAttachments) {
      const list = journalAttachmentsByEntry[a.journalEntryId] ?? [];
      list.push(a);
      journalAttachmentsByEntry[a.journalEntryId] = list;
    }

    return {
      accounts,
      trades,
      exits,
      journal,
      strategies,
      attachments,
      attachmentsByTrade,
      journalAttachments,
      journalAttachmentsByEntry,
      exitsMap: exitsByTrade(exits),
      totalCapital: accounts.reduce((sum, a) => sum + capitalBase(a), 0),
      isEmpty:
        trades.length === 0 &&
        journal.length === 0 &&
        strategies.length === 0 &&
        accounts.length === 0,
    };
  }, [snapshot]);
}

/** Wrap a store save so pages can show a consistent error message. */
export async function runSave(
  fn: () => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const result = await fn();
    return { ok: result.ok, error: result.ok ? null : (result.error ?? "Could not save.") };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
