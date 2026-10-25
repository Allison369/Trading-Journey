/**
 * Portfolio-level metrics.
 *
 * Documented definitions (spec section 9). Each metric states how fees,
 * breakeven trades, open trades, deposits/withdrawals and missing stop losses
 * affect it.
 *
 * - Only trades with at least one exit are included in performance metrics.
 *   Open trades contribute to exposure, never to win rate or profit factor.
 * - All P&L figures are NET of fees unless the field name says "gross".
 * - A BREAKEVEN trade has net P&L within half a cent of zero. It is excluded
 *   from win and loss counts but included in the total trade count.
 * - Deposits and withdrawals affect the equity curve and return-on-capital,
 *   but never win rate, profit factor or expectancy.
 * - A missing stop loss makes R-multiple unavailable for that trade; such
 *   trades are excluded from average-R but counted elsewhere.
 * - Every division is guarded; an undefined statistic is null and renders as
 *   "N/A" in the UI, never as 0 or Infinity.
 */

import { round, safeDivide, sumExact, toNumberOrZero } from "./decimal";
import { computeTrade } from "./pnl";
import type { ISOTimestamp, Trade, TradeExit } from "./types";

export const BREAKEVEN_EPSILON = 0.005;

export interface ClassifiedTrade {
  trade: Trade;
  netPnl: number;
  grossPnl: number;
  rMultiple: number | null;
  holdingMs: number | null;
  closedAt: ISOTimestamp | null;
}

export interface PerformanceMetrics {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;

  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  totalFees: number;

  winRate: number | null;
  lossRate: number | null;
  profitFactor: number | null;

  averagePnl: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  largestWin: number | null;
  largestLoss: number | null;

  expectancy: number | null;
  averageR: number | null;
  tradesWithR: number;

  currentStreak: number;
  currentStreakType: "win" | "loss" | "none";
  maxWinStreak: number;
  maxLossStreak: number;

  averageHoldingMs: number | null;
  averageWinHoldingMs: number | null;
  averageLossHoldingMs: number | null;
}

export interface EquityPoint {
  at: ISOTimestamp;
  equity: number;
  tradeId?: string;
  label: string;
}

export interface DrawdownResult {
  maxDrawdownPercent: number;
  maxDrawdownAmount: number;
  peakEquity: number;
  troughEquity: number;
  peakAt: ISOTimestamp | null;
  troughAt: ISOTimestamp | null;
  series: Array<{ at: ISOTimestamp; drawdownPercent: number }>;
}

export interface GroupPerformance {
  key: string;
  trades: number;
  netPnl: number;
  winRate: number | null;
  profitFactor: number | null;
  averageR: number | null;
}

export interface CashFlow {
  id: string;
  at: ISOTimestamp;
  amount: number; // positive = deposit, negative = withdrawal
  label: string;
}

/** Classify trades into winners/losers/breakeven with their computed P&L. */
export function classifyTrades(
  trades: Trade[],
  exitsByTradeId: Record<string, TradeExit[]>
): ClassifiedTrade[] {
  return trades
    .filter((t) => !t.deletedAt)
    .map((trade) => {
      const comp = computeTrade(trade, exitsByTradeId[trade.id] ?? []);
      return {
        trade,
        netPnl: comp.effectiveNetPnl,
        grossPnl: comp.grossPnl,
        rMultiple: comp.rMultiple,
        holdingMs: comp.holdingMs,
        closedAt: trade.exitAt,
      };
    });
}

function hasExits(t: ClassifiedTrade): boolean {
  return t.trade.status === "closed" || t.trade.status === "partial";
}

/** Compute the full metric suite for a set of trades. */
export function computeMetrics(
  trades: Trade[],
  exitsByTradeId: Record<string, TradeExit[]>
): PerformanceMetrics {
  const all = classifyTrades(trades, exitsByTradeId);
  const closed = all.filter(hasExits);
  const open = all.filter((t) => t.trade.status === "open");

  const winners = closed.filter((t) => t.netPnl > BREAKEVEN_EPSILON);
  const losers = closed.filter((t) => t.netPnl < -BREAKEVEN_EPSILON);
  const breakeven = closed.filter((t) => Math.abs(t.netPnl) <= BREAKEVEN_EPSILON);

  const grossProfit = sumExact(winners.map((t) => t.netPnl));
  const grossLoss = Math.abs(sumExact(losers.map((t) => t.netPnl)));
  const netPnl = sumExact(closed.map((t) => t.netPnl));

  const totalFees = sumExact(
    closed.map((t) =>
      computeTrade(t.trade, exitsByTradeId[t.trade.id] ?? []).costs.total
    )
  );

  const rTrades = closed.filter((t) => t.rMultiple !== null);
  const ordered = orderedClosed(closed);
  const streak = computeStreaks(ordered);

  const metrics: PerformanceMetrics = {
    totalTrades: all.length,
    closedTrades: closed.length,
    openTrades: open.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    breakevenTrades: breakeven.length,

    grossProfit,
    grossLoss,
    netPnl,
    totalFees,

    winRate: safeDivide(winners.length, closed.length),
    lossRate: safeDivide(losers.length, closed.length),
    // Undefined (not 1, not 0) when there are no losses at all.
    profitFactor: grossLoss > 0 ? safeDivide(grossProfit, grossLoss) : null,

    averagePnl: safeDivide(netPnl, closed.length),
    averageWinner: winners.length > 0 ? safeDivide(grossProfit, winners.length) : null,
    averageLoser: losers.length > 0 ? safeDivide(-grossLoss, losers.length) : null,
    largestWin: winners.length > 0 ? Math.max(...winners.map((t) => t.netPnl)) : null,
    largestLoss: losers.length > 0 ? Math.min(...losers.map((t) => t.netPnl)) : null,

    expectancy: safeDivide(netPnl, closed.length),
    averageR:
      rTrades.length > 0
        ? safeDivide(
            sumExact(rTrades.map((t) => t.rMultiple as number)),
            rTrades.length
          )
        : null,
    tradesWithR: rTrades.length,

    currentStreak: streak.current,
    currentStreakType: streak.currentType,
    maxWinStreak: streak.maxWin,
    maxLossStreak: streak.maxLoss,

    averageHoldingMs: null,
    averageWinHoldingMs: null,
    averageLossHoldingMs: null,
  };

  const durations = ordered.filter((t) => t.holdingMs !== null);
  if (durations.length > 0) {
    metrics.averageHoldingMs = safeDivide(
      sumExact(durations.map((t) => t.holdingMs as number)),
      durations.length
    );
  }
  const winDurations = winners.filter((t) => t.holdingMs !== null);
  if (winDurations.length > 0) {
    metrics.averageWinHoldingMs = safeDivide(
      sumExact(winDurations.map((t) => t.holdingMs as number)),
      winDurations.length
    );
  }
  const lossDurations = losers.filter((t) => t.holdingMs !== null);
  if (lossDurations.length > 0) {
    metrics.averageLossHoldingMs = safeDivide(
      sumExact(lossDurations.map((t) => t.holdingMs as number)),
      lossDurations.length
    );
  }

  return metrics;
}

/** Sort closed trades by close timestamp, oldest first, with a stable tiebreak. */
export function orderedClosed(closed: ClassifiedTrade[]): ClassifiedTrade[] {
  return [...closed].sort((a, b) => {
    const at = a.closedAt ? Date.parse(a.closedAt) : 0;
    const bt = b.closedAt ? Date.parse(b.closedAt) : 0;
    if (at !== bt) return at - bt;
    return a.trade.id.localeCompare(b.trade.id);
  });
}

/**
 * Streaks. Breakeven trades neither extend nor break a streak — a scratch is
 * not evidence of a winning or losing run.
 */
export function computeStreaks(ordered: ClassifiedTrade[]): {
  current: number;
  currentType: "win" | "loss" | "none";
  maxWin: number;
  maxLoss: number;
} {
  let maxWin = 0;
  let maxLoss = 0;
  let winRun = 0;
  let lossRun = 0;

  for (const t of ordered) {
    if (t.netPnl > BREAKEVEN_EPSILON) {
      winRun += 1;
      lossRun = 0;
      if (winRun > maxWin) maxWin = winRun;
    } else if (t.netPnl < -BREAKEVEN_EPSILON) {
      lossRun += 1;
      winRun = 0;
      if (lossRun > maxLoss) maxLoss = lossRun;
    }
  }

  let current = 0;
  let currentType: "win" | "loss" | "none" = "none";
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const t = ordered[i] as ClassifiedTrade;
    if (Math.abs(t.netPnl) <= BREAKEVEN_EPSILON) continue;
    const isWin = t.netPnl > 0;
    if (currentType === "none") {
      currentType = isWin ? "win" : "loss";
      current = 1;
    } else if ((currentType === "win") === isWin) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, currentType, maxWin, maxLoss };
}

/**
 * Build the equity curve from starting balance, cash flows and closed-trade
 * results in chronological order.
 *
 * Open trades are deliberately excluded: their P&L is unrealised and must
 * never appear on the equity curve.
 */
export function buildEquityCurve(
  startingBalance: number,
  trades: Trade[],
  exitsByTradeId: Record<string, TradeExit[]>,
  cashFlows: CashFlow[] = []
): EquityPoint[] {
  const classified = classifyTrades(trades, exitsByTradeId).filter(hasExits);

  type Event = { at: number; point: EquityPoint; delta: number };
  const events: Event[] = [];

  for (const c of classified) {
    if (!c.closedAt) continue;
    const at = Date.parse(c.closedAt);
    if (!Number.isFinite(at)) continue;
    events.push({
      at,
      delta: c.netPnl,
      point: {
        at: c.closedAt,
        equity: 0,
        tradeId: c.trade.id,
        label: `${c.trade.symbol} ${c.netPnl >= 0 ? "+" : ""}${round(c.netPnl, 2)}`,
      },
    });
  }

  for (const flow of cashFlows) {
    const at = Date.parse(flow.at);
    if (!Number.isFinite(at)) continue;
    events.push({
      at,
      delta: flow.amount,
      point: { at: flow.at, equity: 0, label: flow.label },
    });
  }

  events.sort((a, b) => a.at - b.at);

  let running = startingBalance;
  const points: EquityPoint[] = [
    {
      at: events.length > 0 ? events[0]!.point.at : new Date().toISOString(),
      equity: round(startingBalance, 2),
      label: "Starting balance",
    },
  ];

  for (const ev of events) {
    running += ev.delta;
    points.push({ ...ev.point, equity: round(running, 2) });
  }

  return points;
}

/**
 * Maximum drawdown from a properly ordered equity curve.
 * Returned as a positive number (a 12% decline is 12, not -12).
 */
export function computeDrawdown(curve: EquityPoint[]): DrawdownResult {
  const empty: DrawdownResult = {
    maxDrawdownPercent: 0,
    maxDrawdownAmount: 0,
    peakEquity: 0,
    troughEquity: 0,
    peakAt: null,
    troughAt: null,
    series: [],
  };

  if (curve.length === 0) return empty;

  const first = curve[0] as EquityPoint;
  let peak = first.equity;
  let peakAt = first.at;
  let maxPct = 0;
  let maxAbs = 0;
  let worstPeak = peak;
  let worstPeakAt: ISOTimestamp | null = peakAt;
  let worstTrough = peak;
  let worstTroughAt: ISOTimestamp | null = peakAt;
  const series: Array<{ at: ISOTimestamp; drawdownPercent: number }> = [];

  for (const point of curve) {
    if (point.equity > peak) {
      peak = point.equity;
      peakAt = point.at;
    }
    // Guard a zero/negative peak so we never emit Infinity.
    const pct = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    series.push({ at: point.at, drawdownPercent: round(pct, 4) });

    if (pct > maxPct) {
      maxPct = pct;
      maxAbs = peak - point.equity;
      worstPeak = peak;
      worstPeakAt = peakAt;
      worstTrough = point.equity;
      worstTroughAt = point.at;
    }
  }

  return {
    maxDrawdownPercent: round(maxPct, 4),
    maxDrawdownAmount: round(maxAbs, 2),
    peakEquity: round(worstPeak, 2),
    troughEquity: round(worstTrough, 2),
    peakAt: worstPeakAt,
    troughAt: worstTroughAt,
    series,
  };
}

/** Group closed trades by any key and summarise each group. */
export function groupPerformance(
  trades: Trade[],
  exitsByTradeId: Record<string, TradeExit[]>,
  keyFn: (t: Trade) => string | null
): GroupPerformance[] {
  const closed = classifyTrades(trades, exitsByTradeId).filter(hasExits);
  const buckets = new Map<string, ClassifiedTrade[]>();

  for (const c of closed) {
    const key = keyFn(c.trade);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  const results: GroupPerformance[] = [];
  for (const [key, list] of buckets) {
    const wins = list.filter((t) => t.netPnl > BREAKEVEN_EPSILON);
    const losses = list.filter((t) => t.netPnl < -BREAKEVEN_EPSILON);
    const gp = sumExact(wins.map((t) => t.netPnl));
    const gl = Math.abs(sumExact(losses.map((t) => t.netPnl)));
    const rTrades = list.filter((t) => t.rMultiple !== null);

    results.push({
      key,
      trades: list.length,
      netPnl: sumExact(list.map((t) => t.netPnl)),
      winRate: safeDivide(wins.length, list.length),
      profitFactor: gl > 0 ? safeDivide(gp, gl) : null,
      averageR:
        rTrades.length > 0
          ? safeDivide(sumExact(rTrades.map((t) => t.rMultiple as number)), rTrades.length)
          : null,
    });
  }

  return results.sort((a, b) => b.netPnl - a.netPnl);
}

/** Format a timestamp into a period key using Intl so time zones are honoured. */
export function periodKey(
  iso: string,
  granularity: "day" | "week" | "month" | "year",
  timeZone = "UTC"
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "invalid";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = get("year");
  const m = get("month");
  const d = get("day");

  if (granularity === "day") return `${y}-${m}-${d}`;
  if (granularity === "month") return `${y}-${m}`;
  if (granularity === "year") return y;

  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** P&L bucketed by calendar period in a given time zone. */
export function bucketByPeriod(
  trades: Trade[],
  exitsByTradeId: Record<string, TradeExit[]>,
  granularity: "day" | "week" | "month" | "year",
  timeZone = "UTC"
): Array<{ key: string; netPnl: number; trades: number }> {
  const closed = classifyTrades(trades, exitsByTradeId).filter(hasExits);
  const buckets = new Map<string, { netPnl: number; trades: number }>();

  for (const c of closed) {
    if (!c.closedAt) continue;
    const key = periodKey(c.closedAt, granularity, timeZone);
    const b = buckets.get(key) ?? { netPnl: 0, trades: 0 };
    b.netPnl += c.netPnl;
    b.trades += 1;
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .map(([key, v]) => ({ key, netPnl: round(v.netPnl, 2), trades: v.trades }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Calendar heatmap data keyed by YYYY-MM-DD. */
export function calendarHeatmap(
  trades: Trade[],
  exitsByTradeId: Record<string, TradeExit[]>,
  timeZone = "UTC"
): Record<string, { netPnl: number; trades: number }> {
  const out: Record<string, { netPnl: number; trades: number }> = {};
  for (const b of bucketByPeriod(trades, exitsByTradeId, "day", timeZone)) {
    out[b.key] = { netPnl: b.netPnl, trades: b.trades };
  }
  return out;
}

/** Return as a fraction (0.12 = 12%) against a clearly-stated capital base. */
export function returnPercent(netPnl: number, capitalBase: number): number | null {
  if (!(capitalBase > 0)) return null;
  return safeDivide(netPnl, capitalBase);
}

/**
 * The equity curve base for an account: starting balance plus manual
 * adjustments (deposits positive, withdrawals negative).
 *
 * Deposits change the capital base and therefore the return figure, but they
 * must never be treated as profit — paying money in is not a winning trade.
 * Shared by both apps so the two can never disagree about the denominator of a
 * return figure.
 */
export function capitalBase(account: { startingBalance: unknown; balanceAdjustments: unknown } | undefined | null): number {
  if (!account) return 0;
  const start = Number(account.startingBalance);
  const adjust = Number(account.balanceAdjustments);
  return (Number.isFinite(start) ? start : 0) + (Number.isFinite(adjust) ? adjust : 0);
}

export { toNumberOrZero };
