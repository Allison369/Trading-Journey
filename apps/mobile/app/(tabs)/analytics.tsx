/**
 * Analytics.
 *
 * Breakdowns by strategy, session, market, weekday and period, plus the
 * drawdown and the calendar. Every group shows its trade count beside its
 * figures, because a group with two trades is noise and the screen should not
 * let you forget that.
 */

import { useMemo } from "react";
import { Text, View } from "react-native";
import {
  bucketByPeriod,
  buildEquityCurve,
  calendarHeatmap,
  capitalBase,
  computeDrawdown,
  computeMetrics,
  groupPerformance,
  type CurrencyCode,
  type GroupPerformance,
} from "@tradevault/core";
import { useApp } from "../../src/state/appContext";
import { useTheme } from "../../src/state/themeContext";
import { Card, Hint, PageHeader, Screen, SectionTitle, Stat, EmptyState } from "../../src/ui/components";
import { BarList, CalendarHeatmap, ResultMix } from "../../src/ui/charts";
import { NA, duration, money, pct, signTone, rMultiple } from "../../src/ui/format";

export default function AnalyticsScreen() {
  const { snapshot } = useApp();
  const theme = useTheme();

  const primary = useMemo(
    () => [...snapshot.accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0],
    [snapshot.accounts]
  );
  const currency: CurrencyCode | string = primary?.currency ?? "USD";

  const analysis = useMemo(() => {
    const exitsByTradeId: Record<string, typeof snapshot.exits> = {};
    for (const exit of snapshot.exits) {
      (exitsByTradeId[exit.tradeId] ??= []).push(exit);
    }

    const metrics = computeMetrics(snapshot.trades, exitsByTradeId);

    const byStrategy = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.strategy ?? null);
    const bySession = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.session ?? null);
    const byMarket = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.market ?? null);
    const byAssetClass = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.assetClass ?? null);
    const byDirection = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.direction ?? null);
    const byOrderType = groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.orderType ?? null);

    const periods = bucketByPeriod(snapshot.trades, exitsByTradeId, "month");
    const heat = calendarHeatmap(snapshot.trades, exitsByTradeId);

    // The curve and its drawdown are measured on the reporting account, so a
    // second account in another currency cannot distort the shape.
    const startingBalance = primary
      ? Number(primary.startingBalance) + Number(primary.balanceAdjustments)
      : 0;
    const primaryTrades = primary
      ? snapshot.trades.filter((t) => t.accountId === primary.id)
      : snapshot.trades;
    const curve = buildEquityCurve(startingBalance, primaryTrades, exitsByTradeId);
    const drawdown = curve.length > 1 ? computeDrawdown(curve) : null;

    return {
      metrics,
      byStrategy,
      bySession,
      byMarket,
      byAssetClass,
      byDirection,
      byOrderType,
      periods,
      heat,
      drawdown,
    };
  }, [snapshot, primary]);

  if (snapshot.trades.length === 0) {
    return (
      <Screen>
        <PageHeader
          eyebrow="Analytics"
          title="Statistics"
          subtitle="Every figure carries the trade count it came from, so you can judge how much weight it deserves."
        />
        <EmptyState title="Nothing to analyse yet">
          Analytics are computed from your recorded trades. Once you have closed a few, this screen
          fills in — with the trade count shown against every figure so you can judge how much
          weight it deserves.
        </EmptyState>
      </Screen>
    );
  }

  const { metrics } = analysis;

  const strategyBars = analysis.byStrategy.map((g) => ({
    label: g.key,
    value: g.netPnl,
    note: `${g.trades} trade${g.trades === 1 ? "" : "s"} · ${pct(g.winRate)} win`,
  }));

  const periodBars = analysis.periods.map((p) => ({
    label: p.key,
    value: p.netPnl,
    note: `${p.trades} trade${p.trades === 1 ? "" : "s"}`,
  }));

  return (
    <Screen>
      <PageHeader
        eyebrow="Analytics"
        title="Statistics"
        subtitle={`${metrics.closedTrades} closed trade${metrics.closedTrades === 1 ? "" : "s"} · every figure states its own sample size.`}
      />
      <SectionTitle>Closed trades</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat
          label="Closed trades"
          value={String(metrics.closedTrades)}
          hint={metrics.openTrades > 0 ? `${metrics.openTrades} still open` : "None open"}
        />
        <Stat
          label="Average R"
          value={rMultiple(metrics.averageR)}
          hint={
            metrics.tradesWithR === 0
              ? "No trades with a stop loss"
              : `From ${metrics.tradesWithR} trades with a stop loss`
          }
        />
        <Stat
          label="Average win"
          value={money(metrics.averageWinner, currency, { signed: true })}
          tone="profit"
          hint={
            metrics.averageLoser === null
              ? "No losing trade yet"
              : `Average loss ${money(metrics.averageLoser, currency, { signed: true })}`
          }
        />
        <Stat
          label="Expectancy"
          value={money(metrics.expectancy, currency, { signed: true })}
          tone={signTone(metrics.expectancy)}
          hint="What one more trade of this type has been worth on average"
        />
      </View>

      <SectionTitle>By strategy</SectionTitle>
      <Card>
        <BarList
          data={strategyBars}
          currency={currency}
          emptyMessage="Assign a strategy to a trade to see this breakdown."
        />
      </Card>

      <SectionTitle>Over time</SectionTitle>
      <Card>
        <BarList data={periodBars} currency={currency} emptyMessage="No closed trades yet." />
      </Card>

      <SectionTitle>Daily result calendar</SectionTitle>
      <Card>
        <CalendarHeatmap data={analysis.heat} currency={currency} />
      </Card>

      <SectionTitle>Drawdown</SectionTitle>
      <Card>
        <Stat
          label="Worst fall from peak"
          value={analysis.drawdown === null ? NA : pct(analysis.drawdown.maxDrawdownPercent)}
          tone="loss"
          hint={
            analysis.drawdown === null
              ? "Needs at least two closed trades in the reporting account"
              : `${money(analysis.drawdown.peakEquity, currency)} → ${money(
                  analysis.drawdown.troughEquity,
                  currency
                )}`
          }
        />
      </Card>

      <SectionTitle>Result mix</SectionTitle>
      <Card>
        <ResultMix
          wins={metrics.winningTrades}
          losses={metrics.losingTrades}
          breakeven={metrics.breakevenTrades}
        />
      </Card>

      <SectionTitle>Group breakdowns</SectionTitle>
      <Card>
        <GroupBlock title="Session" groups={analysis.bySession} currency={currency} />
        <GroupBlock title="Market" groups={analysis.byMarket} currency={currency} />
        <GroupBlock title="Asset class" groups={analysis.byAssetClass} currency={currency} />
        <GroupBlock title="Direction" groups={analysis.byDirection} currency={currency} />
        <GroupBlock title="Order type" groups={analysis.byOrderType} currency={currency} />
      </Card>

      <SectionTitle>Holding time</SectionTitle>
      <Card>
        <Hint>Average {duration(metrics.averageHoldingMs)} across closed trades.</Hint>
      </Card>

      <Card>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
          How to read these numbers
        </Text>
        <Hint>
          Groups with only a handful of trades are noise, not evidence — the trade count is beside
          every figure for that reason. Costs are already deducted from every net figure. Open trades
          are excluded everywhere on this screen, and no figure here is annualised or projected.
        </Hint>
      </Card>
    </Screen>
  );
}

function GroupBlock({
  title,
  groups,
  currency,
}: {
  title: string;
  groups: GroupPerformance[];
  currency: CurrencyCode | string;
}) {
  const theme = useTheme();

  if (groups.length === 0) return null;

  return (
    <View style={{ gap: 6, marginBottom: 8 }}>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>{title}</Text>
      {groups.map((group) => (
        <View key={group.key} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            {group.key} ({group.trades})
          </Text>
          <Text
            style={{
              color: group.netPnl >= 0 ? theme.profit : theme.loss,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {money(group.netPnl, currency, { signed: true })} · {pct(group.winRate)}
          </Text>
        </View>
      ))}
    </View>
  );
}
