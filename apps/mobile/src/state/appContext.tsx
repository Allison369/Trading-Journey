/**
 * App state.
 *
 * Holds the snapshot read from SQLite, the derived analytics, and the sync
 * status. Screens read from here and never touch the database directly, which
 * keeps the "what does the screen know" question answerable in one file.
 *
 * The rules this file exists to keep straight:
 *
 *   * A screen must be able to tell "no data yet" from "no data because the
 *     journal is empty" from "could not read the device storage". Those are
 *     three different messages.
 *   * Analytics are computed from the in-memory snapshot through the shared
 *     core engine. Nothing is cached across edits, so a figure can never be one
 *     trade stale.
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
import {
  buildStatus,
  computeMetrics,
  buildEquityCurve,
  computeDrawdown,
  groupPerformance,
  type EquityPoint,
  type DrawdownResult,
  type GroupPerformance,
  type PerformanceMetrics,
  type SyncStatus,
} from "@tradevault/core";

import { readSnapshot, getMeta, type MobileSnapshot } from "../db/store";
import { config } from "../config";

export type LoadState = "loading" | "ready" | "error";

export interface Derived {
  metrics: PerformanceMetrics;
  equity: EquityPoint[];
  drawdown: DrawdownResult | null;
  groups: GroupPerformance[];
}

export interface AppValue {
  snapshot: MobileSnapshot;
  derived: Derived;
  loadState: LoadState;
  loadError: string | null;
  reload: () => void;
  syncStatus: SyncStatus;
  /** True when Supabase is not configured: the journal is device-local. */
  isOffline: boolean;
  isOnline: boolean;
}

const EMPTY: MobileSnapshot = {
  accounts: [],
  trades: [],
  exits: [],
  strategies: [],
  journal: [],
  risk: [],
};

const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<MobileSnapshot>(EMPTY);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    try {
      setSnapshot(readSnapshot());
      setLoadState("ready");
      setLoadError(null);
    } catch (error) {
      // A read failure is reported, never masked as an empty journal.
      setLoadState("error");
      setLoadError(
        error instanceof Error ? error.message : "Could not read the journal on this device."
      );
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const derived = useMemo<Derived>(() => {
    // Core takes exits keyed by trade id. Built once per snapshot so every
    // figure on every screen is derived from the same immutable view.
    const exitsByTradeId: Record<string, typeof snapshot.exits> = {};
    for (const exit of snapshot.exits) {
      (exitsByTradeId[exit.tradeId] ??= []).push(exit);
    }

    const metrics = computeMetrics(snapshot.trades, exitsByTradeId);

    // The curve is drawn in the reporting account's currency: the account with
    // the largest capital base. Currencies are never added together.
    const primary = [...snapshot.accounts].sort(
      (a, b) =>
        Number(b.startingBalance) + Number(b.balanceAdjustments) -
        (Number(a.startingBalance) + Number(a.balanceAdjustments))
    )[0];
    const startingBalance = primary
      ? Number(primary.startingBalance) + Number(primary.balanceAdjustments)
      : 0;
    const primaryTrades = primary
      ? snapshot.trades.filter((t) => t.accountId === primary.id)
      : snapshot.trades;

    const equity = buildEquityCurve(startingBalance, primaryTrades, exitsByTradeId);
    const drawdown = equity.length > 1 ? computeDrawdown(equity) : null;

    const groups = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.strategy ?? "Unassigned");

    return { metrics, equity, drawdown, groups };
  }, [snapshot]);

  const syncStatus = useMemo<SyncStatus | null>(() => {
    // The queue is read lazily by the sync screen; here we only need the
    // last-synced marker and the conflict count so the header can be honest.
    const lastSyncedAt = getMeta("last_synced_at");
    return buildStatus([], [], lastSyncedAt, !config.isCloudConfigured);
  }, [snapshot]);

  const value = useMemo<AppValue>(
    () => ({
      snapshot,
      derived,
      loadState,
      loadError,
      reload,
      syncStatus: syncStatus ?? {
        state: "offline",
        pendingCount: 0,
        lastSyncedAt: null,
        lastError: null,
        conflicts: [],
      },
      isOffline: !config.isCloudConfigured,
      isOnline: config.isCloudConfigured,
    }),
    [snapshot, derived, loadState, loadError, reload, syncStatus]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useApp must be used inside an AppProvider.");
  }
  return value;
}
