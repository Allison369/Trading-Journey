/**
 * Dashboard.
 *
 * The screen that answers "how am I actually doing?" without flattering the
 * answer. Three deliberate choices:
 *
 *   1. **Open trades are excluded from every realised statistic.** They appear
 *      in their own card, clearly marked unrealised, because a paper profit can
 *      still evaporate and counting it is how journals lie to their owners.
 *   2. **Undefined metrics read "N/A".** With no closed trades there is no win
 *      rate; showing 0% would say "you lose every trade" when the truth is
 *      "nothing has finished yet".
 *   3. **The currency is always named.** The capital base is stated in the
 *      account currency, and a multi-currency account mix refuses to be summed
 *      silently.
 *
 * The layout follows the house style: a row of four tinted headline blocks, a
 * wide cool panel beside a narrower warm one, then the detail cards.
 */

import { useMemo, type ReactNode } from "react";
import {
  buildEquityCurve,
  computeDrawdown,
  computeMetrics,
  computeTrade,
  groupPerformance,
  type CurrencyCode,
  type EquityPoint,
  type PerformanceMetrics,
} from "@tradevault/core";
import { useApp, useDerived } from "../lib/appContext";
import { capitalBase } from "../lib/store";
import { EquityChart, ResultDonut, MiniStat } from "../components/charts";
import { Banner, EmptyState, LoadingState, PastelStat, SampleBadge, icons } from "../components/ui";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent, fmtR, NA, signClass } from "../components/format";
import type { PageId } from "../navigation";

export function DashboardPage({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const { loadState, isSampleData } = useApp();
  const { accounts, trades, exitsMap, journal } = useDerived();

  // Everything the dashboard shows is derived here, in one pass, from the
  // user's own rows. No headline figure is hardcoded.
  const view = useMemo(() => {
    const metrics = computeMetrics(trades, exitsMap);

    // The reporting currency is the currency of the largest account by capital.
    // Mixing currencies without a rate and a date would be a silent lie, so if
    // more than one currency is present we say so rather than summing.
    const currencies = [...new Set(accounts.map((a) => a.currency))];
    const primaryAccount =
      [...accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0] ?? undefined;
    const reportingCurrency: CurrencyCode = primaryAccount?.currency ?? "USD";

    const curve = primaryAccount
      ? buildEquityCurve(
          capitalBase(primaryAccount),
          trades.filter((t) => t.accountId === primaryAccount.id),
          exitsMap
        )
      : [];
    const drawdown = computeDrawdown(curve);

    const openPositions = trades
      .filter((t) => t.status !== "closed")
      .map((t) => ({ trade: t, comp: computeTrade(t, exitsMap[t.id] ?? []) }));

    const byStrategy = groupPerformance(trades, exitsMap, (t) => t.strategy ?? null);

    return {
      metrics,
      reportingCurrency,
      currencies,
      curve,
      drawdown,
      openPositions,
      byStrategy,
      capital: capitalBase(primaryAccount),
      primaryAccount,
    };
  }, [accounts, trades, exitsMap]);

  if (loadState === "loading" && trades.length === 0 && accounts.length === 0) {
    return <LoadingState label="Loading your dashboard…" />;
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={icons.wallet}
        title="No trading account yet"
        action={
          <button type="button" className="btn btn-primary" onClick={() => onNavigate("settings")}>
            Add an account
          </button>
        }
      >
        A trade belongs to an account. Add one — its currency and starting balance are what every
        return figure on this dashboard is measured against — then record your first trade.
      </EmptyState>
    );
  }

  const { metrics, reportingCurrency, currencies, curve, drawdown, openPositions, byStrategy, capital } =
    view;

  const multiCurrency = currencies.length > 1;

  // Profit/loss for the headline block. It is a chip rather than a coloured
  // number, because the number wears the block's own ink.
  const pnlSign = metrics.netPnl > 0 ? "pos" : metrics.netPnl < 0 ? "neg" : undefined;

  return (
    <div className="stack">
      {isSampleData ? (
        <Banner tone="warn" title="You are looking at sample data">
          These trades are a labelled example set used to demonstrate the interface. They are not
          your results. Add your own account and trades in <strong>Data &amp; Settings</strong> and
          this banner disappears. <SampleBadge />
        </Banner>
      ) : null}

      {multiCurrency ? (
        <Banner tone="warn" title="Your accounts use more than one currency">
          You have accounts in {currencies.join(", ")}. Figures below are shown in{" "}
          <strong>{reportingCurrency}</strong> and cover only the{" "}
          {view.primaryAccount?.name ?? "reporting account"}. TradeVault will not add different
          currencies together without a dated exchange rate — converting them silently is how a
          journal reports a profit that does not exist.
        </Banner>
      ) : null}

      {/* ---------------------------------------------------------- */}
      {/* Headline figures — four tinted blocks                      */}
      {/* ---------------------------------------------------------- */}

      <section className="grid grid-4" aria-label="Performance summary">
        <PastelStat
          tone="coral"
          label="Net realised P&L"
          value={fmtMoney(metrics.netPnl, reportingCurrency, { signed: true })}
          sign={pnlSign}
          hint={
            metrics.closedTrades > 0
              ? `Across ${metrics.closedTrades} closed trade${metrics.closedTrades === 1 ? "" : "s"}, after ${fmtMoney(metrics.totalFees, reportingCurrency)} of costs`
              : "No closed trades yet"
          }
        />
        <PastelStat
          tone="yellow"
          label="Win rate"
          value={fmtPercent(metrics.winRate, { decimals: 1 })}
          hint={
            metrics.closedTrades > 0
              ? `${metrics.winningTrades} won · ${metrics.losingTrades} lost${metrics.breakevenTrades > 0 ? ` · ${metrics.breakevenTrades} breakeven` : ""}`
              : "Needs at least one closed trade"
          }
        />
        <PastelStat
          tone="pink"
          label="Profit factor"
          value={fmtNumber(metrics.profitFactor, { decimals: 2 })}
          hint={
            metrics.profitFactor === null
              ? metrics.grossProfit > 0
                ? "No losing trades yet — undefined, not infinite"
                : "Needs at least one win and one loss"
              : `${fmtMoney(metrics.grossProfit, reportingCurrency)} won / ${fmtMoney(metrics.grossLoss, reportingCurrency)} lost`
          }
        />
        <PastelStat
          tone="blue"
          label={`Return on ${fmtMoney(capital, reportingCurrency)}`}
          value={fmtPercent(capital > 0 ? metrics.netPnl / capital : null, { decimals: 2, signed: true })}
          hint={
            multiCurrency
              ? "Measured against the reporting account only"
              : "Net realised P&L over starting capital plus adjustments"
          }
        />
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Curve and open positions beside the quality readouts      */}
      {/* ---------------------------------------------------------- */}

      <section className="dash-split">
        <div className="panel panel-cool">
          <div className="panel-title">Equity curve</div>
          <div className="panel-desc">
            {view.primaryAccount?.name} · {reportingCurrency} · closed trades only, oldest first.
            Open trades are excluded because their result is not yet real.
          </div>

          <div style={{ marginTop: 16 }}>
            <EquityChart points={curve} currency={reportingCurrency} />
            <EquityFootnote curve={curve} currency={reportingCurrency} />
          </div>

          <div className="divider" />

          <div className="row-between" style={{ marginBottom: 6 }}>
            <div>
              <div className="panel-title">Open positions</div>
              <div className="panel-desc">
                Unrealised. These are excluded from every figure above.
              </div>
            </div>
            <span className="badge badge-open">{openPositions.length}</span>
          </div>

          {openPositions.length === 0 ? (
            <div className="hint">You have no open positions recorded.</div>
          ) : (
            <div className="stack-sm">
              {openPositions.map(({ trade, comp }) => (
                <div className="row-between" key={trade.id} style={{ gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <strong>{trade.symbol}</strong>
                      <span className={`badge badge-${trade.direction}`}>
                        {trade.direction === "long" ? "Long" : "Short"}
                      </span>
                      {trade.status === "partial" ? (
                        <span className="badge badge-partial">Partly closed</span>
                      ) : null}
                    </div>
                    <div className="hint">
                      {fmtNumber(comp.openQuantity, { decimals: 4 })} of{" "}
                      {fmtNumber(comp.quantity, { decimals: 4 })} still open · held{" "}
                      {fmtDuration(comp.holdingMs)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className={signClass(comp.netPnl)}>
                      {fmtMoney(comp.netPnl, reportingCurrency, { signed: true })}
                    </div>
                    <div className="hint">
                      {comp.closedQuantity > 0 ? "realised so far" : "nothing realised yet"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel panel-warm">
          <div className="panel-title">Trade quality</div>
          <div className="panel-desc">
            What the result was made of, not just how big it was.
          </div>

          <div className="panel-list" style={{ marginTop: 10 }}>
            <PanelRow
              label="Average R"
              note={
                metrics.tradesWithR > 0
                  ? `${metrics.tradesWithR} trade${metrics.tradesWithR === 1 ? "" : "s"} had a stop loss`
                  : "No trade has both a stop loss and an exit"
              }
              value={fmtR(metrics.averageR)}
            />
            <PanelRow
              label="Expectancy per trade"
              note="Net P&L divided by closed trades"
              value={fmtMoney(metrics.expectancy, reportingCurrency, { signed: true })}
              tone={
                metrics.expectancy !== null && metrics.expectancy > 0
                  ? "pos"
                  : metrics.expectancy !== null && metrics.expectancy < 0
                    ? "neg"
                    : undefined
              }
            />
            <PanelRow
              label="Largest win"
              note={
                metrics.largestLoss !== null
                  ? `Largest loss ${fmtMoney(metrics.largestLoss, reportingCurrency)}`
                  : "No losing trade yet"
              }
              value={fmtMoney(metrics.largestWin, reportingCurrency, { signed: true })}
              tone={metrics.largestWin !== null && metrics.largestWin > 0 ? "pos" : undefined}
            />
            <PanelRow
              label="Max drawdown"
              note={
                drawdown.maxDrawdownPercent > 0
                  ? `${fmtMoney(drawdown.peakEquity, reportingCurrency)} → ${fmtMoney(drawdown.troughEquity, reportingCurrency)}`
                  : "Equity has not fallen below a previous peak"
              }
              value={fmtPercent(drawdown.maxDrawdownPercent / 100, { decimals: 2 })}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Result mix, streaks, timing and strategy mix              */}
      {/* ---------------------------------------------------------- */}

      <section className="grid grid-4">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Result mix
          </div>
          <div className="card-desc" style={{ marginBottom: 10 }}>
            Closed trades only.
          </div>
          <ResultDonut
            wins={metrics.winningTrades}
            losses={metrics.losingTrades}
            breakeven={metrics.breakevenTrades}
          />
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Streaks
          </div>
          <div className="stack-sm">
            <MiniStat
              label="Current"
              tone={metrics.currentStreakType === "loss" ? "neg" : metrics.currentStreakType === "win" ? "pos" : "plain"}
              value={
                metrics.currentStreak === 0
                  ? NA
                  : `${metrics.currentStreak} ${metrics.currentStreakType}${metrics.currentStreak === 1 ? "" : "s"}`
              }
            />
            <MiniStat label="Longest win run" tone="pos" value={fmtNumber(metrics.maxWinStreak, { decimals: 0 })} />
            <MiniStat label="Longest loss run" tone="neg" value={fmtNumber(metrics.maxLossStreak, { decimals: 0 })} />
            <div className="hint">
              Breakeven trades neither extend nor break a streak — a scratch is not evidence of a run.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Holding time
          </div>
          <div className="stack-sm">
            <MiniStat label="Average" tone="plain" value={fmtDuration(metrics.averageHoldingMs)} />
            <MiniStat label="Winners" tone="pos" value={fmtDuration(metrics.averageWinHoldingMs)} />
            <MiniStat label="Losers" tone="neg" value={fmtDuration(metrics.averageLossHoldingMs)} />
            <div className="hint">
              Measured from entry to the last recorded exit of each trade.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            By strategy
          </div>
          {byStrategy.length === 0 ? (
            <div className="hint">No closed trades have a strategy assigned yet.</div>
          ) : (
            <div className="stack-sm">
              {byStrategy.slice(0, 5).map((g) => (
                <div className="row-between" key={g.key}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.key}
                  </span>
                  <span className={signClass(g.netPnl)}>{fmtMoney(g.netPnl, reportingCurrency, { signed: true })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Journal prompt                                              */}
      {/* ---------------------------------------------------------- */}

      <section className="card">
        <div className="row-between">
          <div>
            <div className="card-title">Review your week</div>
            <div className="card-desc">
              {journal.length === 0
                ? "You have not written a journal entry yet."
                : `${journal.length} entr${journal.length === 1 ? "y" : "ies"} recorded.`}{" "}
              Writing down why a trade worked is what turns a result into a lesson.
            </div>
          </div>
          <button type="button" className="btn" onClick={() => onNavigate("journal")}>
            Open journal
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * One labelled readout inside a tinted panel.
 *
 * The note sits under the label rather than beside the value, so a long
 * explanation never squeezes the number out of its column.
 */
function PanelRow({
  label,
  note,
  value,
  tone,
}: {
  label: string;
  note?: ReactNode;
  value: ReactNode;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="panel-row">
      <div style={{ minWidth: 0 }}>
        <div className="panel-row-label">{label}</div>
        {note ? <div className="panel-row-note">{note}</div> : null}
      </div>
      <div className={`panel-row-value ${tone ?? ""}`.trim()}>{value}</div>
    </div>
  );
}

/** A short, honest caption describing what the curve does and does not show. */
function EquityFootnote({ curve, currency }: { curve: EquityPoint[]; currency: CurrencyCode }) {
  if (curve.length < 2) return null;
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  const change = last.equity - first.equity;

  return (
    <div className="row wrap" style={{ marginTop: 12, gap: 14 }}>
      <span className="hint">
        Start <strong>{fmtMoney(first.equity, currency)}</strong>
      </span>
      <span className="hint">
        Latest <strong>{fmtMoney(last.equity, currency)}</strong>
      </span>
      <span className={`hint ${signClass(change)}`}>
        Change <strong>{fmtMoney(change, currency, { signed: true })}</strong>
      </span>
      <span className="spacer" />
      <span className="hint">{curve.length - 1} closed event{curve.length - 1 === 1 ? "" : "s"}</span>
    </div>
  );
}

export type { PerformanceMetrics };
