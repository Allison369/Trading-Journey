/**
 * Analytics.
 *
 * Breakdowns across the dimensions a trader actually learns from: strategy,
 * session, market, direction, day of week and month. Every group is computed by
 * `groupPerformance` / `bucketByPeriod` from the user's own closed trades.
 *
 * Two things this page deliberately does NOT do:
 *   * It does not show a "projected" or "annualised" figure. Extrapolating a
 *     three-week sample into a yearly return is the most confident-sounding
 *     lie in retail trading.
 *   * It does not hide small samples. A group with two trades is shown as a
 *     group with two trades, with the count visible next to it, because a 100%
 *     win rate over two trades is not a finding.
 */

import { useMemo, useState } from "react";
import {
  bucketByPeriod,
  calendarHeatmap,
  computeDrawdown,
  computeMetrics,
  groupPerformance,
  returnPercent,
  type CurrencyCode,
} from "@tradevault/core";
import { useDerived } from "../lib/appContext";
import { capitalBase } from "../lib/store";
import { BarList, CalendarHeatmap, DrawdownStrip, ResultDonut } from "../components/charts";
import { Banner, EmptyState, Stat, icons } from "../components/ui";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent, fmtR, humanise, NA, signClass } from "../components/format";

type GroupBy = "strategy" | "session" | "market" | "assetClass" | "direction" | "orderType";

const GROUP_LABELS: Record<GroupBy, string> = {
  strategy: "Strategy",
  session: "Session",
  market: "Market",
  assetClass: "Asset class",
  direction: "Direction",
  orderType: "Order type",
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function AnalyticsPage() {
  const { accounts, trades, exitsMap } = useDerived();
  const [groupBy, setGroupBy] = useState<GroupBy>("strategy");
  const [bucket, setBucket] = useState<"day" | "week" | "month">("month");

  const currency: CurrencyCode = useMemo(() => {
    const sorted = [...accounts].sort((a, b) => capitalBase(b) - capitalBase(a));
    return sorted[0]?.currency ?? "USD";
  }, [accounts]);

  const view = useMemo(() => {
    const metrics = computeMetrics(trades, exitsMap);

    const keyFn = (t: (typeof trades)[number]): string | null => {
      switch (groupBy) {
        case "strategy":
          return t.strategy ?? null;
        case "session":
          return humanise(t.session);
        case "market":
          return t.market ?? null;
        case "assetClass":
          return humanise(t.assetClass);
        case "direction":
          return t.direction === "long" ? "Long" : "Short";
        case "orderType":
          return humanise(t.orderType);
        default:
          return null;
      }
    };

    const groups = groupPerformance(trades, exitsMap, keyFn);

    // By weekday, computed from each closed trade's close time.
    const byWeekday = WEEKDAYS.map((name) => ({ key: name, value: 0, trades: 0 }));
    const periods = bucketByPeriod(trades, exitsMap, bucket, "UTC");
    const heat = calendarHeatmap(trades, exitsMap, "UTC");

    for (const t of trades) {
      if (t.status === "open" || !t.exitAt) continue;
      const ms = Date.parse(t.exitAt);
      if (!Number.isFinite(ms)) continue;
      // getUTCDay: 0 = Sunday. Shift so the array starts on Monday.
      const idx = (new Date(ms).getUTCDay() + 6) % 7;
      const entry = byWeekday[idx]!;
      const realisedForTrade = groupPerformance([t], exitsMap, () => "single")[0];
      if (realisedForTrade) {
        entry.value += realisedForTrade.netPnl;
        entry.trades += 1;
      }
    }

    // Equity drawdown context for the period.
    const primaryAccount = [...accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0];
    const drawdown = primaryAccount
      ? computeDrawdown(
          // Rebuild the curve in the analytics module so this page never depends
          // on the dashboard having been visited.
          (() => {
            const points = [{ at: primaryAccount.createdAt, equity: capitalBase(primaryAccount), label: "Start" }];
            const closed = trades
              .filter((t) => t.accountId === primaryAccount.id && t.status !== "open" && t.exitAt)
              .sort((a, b) => Date.parse(a.exitAt!) - Date.parse(b.exitAt!));
            let running = capitalBase(primaryAccount);
            for (const t of closed) {
              const g = groupPerformance([t], exitsMap, () => "single")[0];
              if (!g) continue;
              running += g.netPnl;
              points.push({ at: t.exitAt!, equity: Math.round(running * 100) / 100, label: t.symbol });
            }
            return points;
          })()
        )
      : null;

    const longestHold = (() => {
      let best: { symbol: string; ms: number } | null = null;
      for (const t of trades) {
        if (!t.exitAt) continue;
        const ms = Date.parse(t.exitAt) - Date.parse(t.entryAt);
        if (!Number.isFinite(ms)) continue;
        if (!best || ms > best.ms) best = { symbol: t.symbol, ms };
      }
      return best;
    })();

    return { metrics, groups, byWeekday, periods, heat, drawdown, longestHold, capital: capitalBase(primaryAccount) };
  }, [accounts, trades, exitsMap, groupBy, bucket]);

  const { metrics, groups, byWeekday, periods, heat, drawdown } = view;

  if (trades.length === 0) {
    return (
      <EmptyState icon={icons.analytics} title="Nothing to analyse yet">
        Analytics are computed from your closed trades. Once a trade has an exit, its result appears
        here grouped by strategy, session, market and time.
      </EmptyState>
    );
  }

  if (metrics.closedTrades === 0) {
    return (
      <div className="stack">
        <Banner tone="info" title="You have open trades but none closed">
          Every statistic on this page is realised. Until at least one trade has an exit there is
          nothing to measure — an open position's paper profit is not a result yet, and counting it
          here would make this page misleading rather than merely empty.
        </Banner>
        <div className="grid grid-3">
          <Stat label="Open trades" value={fmtNumber(metrics.openTrades, { decimals: 0 })} tone="plain" />
          <Stat label="Win rate" value={NA} hint="No closed trades" />
          <Stat label="Net P&L" value={NA} hint="Nothing has realised yet" />
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Summary --------------------------------------------------- */}

      <section className="grid grid-4">
        <Stat label="Closed trades" value={fmtNumber(metrics.closedTrades, { decimals: 0 })} tone="plain" hint={`${metrics.openTrades} still open`} />
        <Stat label="Average R" value={fmtR(metrics.averageR)} hint={`From ${metrics.tradesWithR} trade${metrics.tradesWithR === 1 ? "" : "s"} with a stop loss`} />
        <Stat label="Average win" value={fmtMoney(metrics.averageWinner, currency, { signed: true })} hint={metrics.averageLoser === null ? "No losing trade yet" : `Average loss ${fmtMoney(metrics.averageLoser, currency)}`} />
        <Stat
          label="Expectancy"
          value={fmtMoney(metrics.expectancy, currency, { signed: true })}
          hint="What one more trade of this type has been worth on average"
        />
      </section>

      {/* Grouped performance --------------------------------------- */}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Performance by {GROUP_LABELS[groupBy].toLowerCase()}</div>
            <div className="card-desc">
              Net P&amp;L of closed trades. The trade count is shown for each group so you can judge
              how much weight it deserves.
            </div>
          </div>
          <div className="seg" role="group" aria-label="Group by">
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map((g) => (
              <button key={g} type="button" aria-pressed={groupBy === g} onClick={() => setGroupBy(g)}>
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="hint">
            No closed trade has a value recorded for {GROUP_LABELS[groupBy].toLowerCase()}. Assign
            strategies to your trades, or record the session, to unlock this breakdown.
          </div>
        ) : (
          <>
            <BarList
              currency={currency}
              data={groups.map((g) => ({
                key: g.key,
                value: g.netPnl,
                note: `${g.trades} trade${g.trades === 1 ? "" : "s"} · ${fmtPercent(g.winRate, { decimals: 0 })} win`,
              }))}
            />

            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>{GROUP_LABELS[groupBy]}</th>
                    <th className="num">Trades</th>
                    <th className="num">Net P&amp;L</th>
                    <th className="num">Win rate</th>
                    <th className="num">Profit factor</th>
                    <th className="num">Average R</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key}>
                      <td>{g.key}</td>
                      <td className="num">{g.trades}</td>
                      <td className={`num ${signClass(g.netPnl)}`}>{fmtMoney(g.netPnl, currency, { signed: true })}</td>
                      <td className="num">{fmtPercent(g.winRate, { decimals: 1 })}</td>
                      <td className="num">{fmtNumber(g.profitFactor, { decimals: 2 })}</td>
                      <td className="num">{fmtR(g.averageR)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Time buckets ---------------------------------------------- */}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Results over time</div>
            <div className="card-desc">Net P&amp;L per calendar period, in UTC.</div>
          </div>
          <div className="seg" role="group" aria-label="Period">
            <button type="button" aria-pressed={bucket === "day"} onClick={() => setBucket("day")}>Day</button>
            <button type="button" aria-pressed={bucket === "week"} onClick={() => setBucket("week")}>Week</button>
            <button type="button" aria-pressed={bucket === "month"} onClick={() => setBucket("month")}>Month</button>
          </div>
        </div>

        {periods.length === 0 ? (
          <div className="hint">No closed trades to bucket yet.</div>
        ) : (
          <>
            <BarList
              currency={currency}
              data={periods.slice(-14).map((p) => ({
                key: p.key,
                value: p.netPnl,
                note: `${p.trades} trade${p.trades === 1 ? "" : "s"}`,
              }))}
            />
            {periods.length > 14 ? (
              <div className="hint" style={{ marginTop: 8 }}>
                Showing the most recent 14 periods of {periods.length}.
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Weekday and heatmap --------------------------------------- */}

      <section className="grid grid-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>By weekday</div>
          <div className="card-desc" style={{ marginBottom: 14 }}>
            Grouped by the day the trade closed, in UTC.
          </div>
          {byWeekday.every((d) => d.trades === 0) ? (
            <div className="hint">No closed trades recorded yet.</div>
          ) : (
            <BarList
              currency={currency}
              data={byWeekday
                .filter((d) => d.trades > 0)
                .map((d) => ({ key: d.key, value: d.value, note: `${d.trades} trade${d.trades === 1 ? "" : "s"}` }))}
            />
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Daily result calendar</div>
          <div className="card-desc" style={{ marginBottom: 14 }}>
            Each square is one UTC day. Empty squares had no closed trades — they are not zero-P&amp;L
            days, they are days you did not trade.
          </div>
          <CalendarHeatmap data={heat} currency={currency} />
        </div>
      </section>

      {/* Risk context ---------------------------------------------- */}

      <section className="grid grid-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Drawdown from peak</div>
          <div className="card-desc" style={{ marginBottom: 12 }}>
            How far equity fell below its highest point, in {currency}.
          </div>
          {drawdown && drawdown.series.length > 1 ? (
            <>
              <DrawdownStrip series={drawdown.series} />
              <div className="grid grid-3" style={{ marginTop: 14 }}>
                <Stat label="Worst fall" value={fmtPercent(drawdown.maxDrawdownPercent / 100, { decimals: 2 })} />
                <Stat label="From" value={fmtMoney(drawdown.peakEquity, currency)} tone="plain" />
                <Stat label="To" value={fmtMoney(drawdown.troughEquity, currency)} tone="plain" />
              </div>
            </>
          ) : (
            <div className="hint">
              {drawdown && drawdown.maxDrawdownPercent === 0
                ? "Equity has never fallen below a previous peak in your recorded history."
                : "Not enough closed history to measure a drawdown."}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Result mix and extremes</div>
          <ResultDonut wins={metrics.winningTrades} losses={metrics.losingTrades} breakeven={metrics.breakevenTrades} />
          <div className="divider" />
          <div className="grid grid-2">
            <Stat label="Largest win" value={fmtMoney(metrics.largestWin, currency, { signed: true })} />
            <Stat label="Largest loss" value={fmtMoney(metrics.largestLoss, currency, { signed: true })} hint="A single trade, not the total" />
            <Stat label="Average hold" value={fmtDuration(metrics.averageHoldingMs)} tone="plain" />
            <Stat
              label="Longest hold"
              value={view.longestHold ? fmtDuration(view.longestHold.ms) : NA}
              hint={view.longestHold?.symbol ?? undefined}
              tone="plain"
            />
          </div>
        </div>
      </section>

      {/* Honest caveats --------------------------------------------- */}

      <Banner tone="info" title="How to read these numbers">
        Groups with only a handful of trades are noise, not evidence — the trade count is beside
        every figure for that reason. Costs are already deducted from every net figure. Open trades
        are excluded everywhere on this page, and no figure here is annualised or projected: what you
        see is what has actually happened in your journal.
      </Banner>
    </div>
  );
}

export { returnPercent };
