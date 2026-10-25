/**
 * Dashboard.
 *
 * The screen someone opens first. It answers three questions in order:
 * how am I doing, am I holding anything right now, and what have I written down
 * about it. Every figure comes from the core engine over the real records on
 * this device — there is no demo number anywhere on this screen.
 *
 * The composition follows the web dashboard exactly: four pastel headline
 * blocks, then a cool panel holding the equity curve and open positions beside
 * a warm panel of trade-quality readouts, then the four breakdown cards.
 *
 * Two honesty rules are enforced here:
 *   * A metric with no data shows N/A, not 0.
 *   * Open trades are excluded from realised figures and listed separately,
 *     because an open position has no result yet.
 */

import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { capitalBase, computeTrade, type CurrencyCode, type Trade, type TradeExit } from "@tradevault/core";
import { useApp } from "../../src/state/appContext";
import { useTheme } from "../../src/state/themeContext";
import {
  Banner,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  EmptyState,
  FooterBand,
  Hint,
  ListRow,
  PageHeader,
  Panel,
  Screen,
  SectionTitle,
  Stat,
  tabular,
} from "../../src/ui/components";
import { EquityChart, ResultMix } from "../../src/ui/charts";
import { NA, duration, money, pct, rMultiple, shortDate, signTone } from "../../src/ui/format";

export default function DashboardScreen() {
  const { snapshot, derived, loadState, loadError, isOffline } = useApp();
  const theme = useTheme();
  const router = useRouter();

  const { metrics, equity, drawdown, groups } = derived;

  // The reporting account is the one with the largest capital base. Currencies
  // are never summed, so every figure below is stated in this account's unit.
  const primary = useMemo(
    () => [...snapshot.accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0],
    [snapshot.accounts]
  );
  const currency: CurrencyCode | string = primary?.currency ?? "USD";
  const capital = capitalBase(primary);

  const openTrades = useMemo(
    () => snapshot.trades.filter((t) => t.status !== "closed"),
    [snapshot.trades]
  );

  const exitsByTrade = useMemo(() => {
    const map = new Map<string, TradeExit[]>();
    for (const exit of snapshot.exits) {
      const list = map.get(exit.tradeId);
      if (list) list.push(exit);
      else map.set(exit.tradeId, [exit]);
    }
    return map;
  }, [snapshot.exits]);

  if (loadState === "error") {
    return (
      <Screen>
        <PageHeader eyebrow="Trading journal" title="Dashboard" />
        <Banner tone="danger" title="Could not read your journal">
          {loadError ?? "The device storage could not be read."}
        </Banner>
      </Screen>
    );
  }

  if (snapshot.accounts.length === 0) {
    return (
      <Screen>
        <PageHeader
          eyebrow="Trading journal"
          title="Dashboard"
          subtitle="An account is all it takes to start. Every figure on this screen is yours alone — nothing is demo data."
        />
        <EmptyState
          title="Your journal starts with an account"
          action={
            <Pressable onPress={() => router.push("/settings")}>
              <Text style={{ color: theme.accentText, fontWeight: "700" }}>Add your first account</Text>
            </Pressable>
          }
        >
          An account carries the currency every return figure is measured in. Once it exists, you can
          record trades and the numbers on this screen become yours.
        </EmptyState>
        {isOffline ? (
          <Banner tone="warn" title="Offline mode">
            Supabase is not configured, so this journal lives on this device only. Nothing syncs to
            another device yet.
          </Banner>
        ) : null}
        <FooterBand />
      </Screen>
    );
  }

  const cardTitle = { color: theme.text, fontSize: 15, fontWeight: "700" as const, letterSpacing: -0.2 };

  return (
    <Screen>
      <PageHeader
        eyebrow="Trading journal"
        title="Dashboard"
        subtitle={`${primary?.name ?? "Your account"} · all figures in ${currency}, closed trades only.`}
      />

      {isOffline ? (
        <Banner tone="warn" title="Offline mode — this device only">
          Supabase is not configured, so nothing here syncs to another device. Your records are real
          and saved locally; set the Supabase values in .env to turn on sync.
        </Banner>
      ) : null}

      {/* Headline figures ------------------------------------------ */}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat
          pastel="coral"
          label="Net realised P&L"
          value={money(metrics.netPnl, currency, { signed: true })}
          tone={signTone(metrics.netPnl)}
          hint={
            metrics.closedTrades === 0
              ? "No closed trades yet"
              : `Across ${metrics.closedTrades} closed trade${
                  metrics.closedTrades === 1 ? "" : "s"
                }, after ${money(metrics.totalFees, currency)} of costs`
          }
        />
        <Stat
          pastel="yellow"
          label="Win rate"
          value={pct(metrics.winRate)}
          hint={
            metrics.closedTrades === 0
              ? "Needs at least one closed trade"
              : `${metrics.winningTrades} won · ${metrics.losingTrades} lost`
          }
        />
        <Stat
          pastel="pink"
          label="Profit factor"
          value={metrics.profitFactor === null ? NA : metrics.profitFactor.toFixed(2)}
          hint={
            metrics.grossLoss === 0
              ? "No losing trades yet — undefined, not infinite"
              : `${money(metrics.grossProfit, currency)} won / ${money(metrics.grossLoss, currency)} lost`
          }
        />
        <Stat
          pastel="blue"
          label={capital > 0 ? `Return on ${money(capital, currency)}` : "Return"}
          value={capital > 0 ? pct(metrics.netPnl / capital, { signed: true }) : NA}
          hint={
            capital > 0
              ? "Net realised P&L over starting capital plus adjustments"
              : "Set a starting balance to see a return figure"
          }
        />
      </View>

      {/* Curve and open positions beside the quality readouts ----- */}

      <Panel tone="cool" style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={cardTitle}>Equity curve</Text>
          <Hint>
            {primary?.name ?? "Your account"} · {currency} · closed trades only, oldest first.
          </Hint>
        </View>

        <EquityChart points={equity} currency={currency} />

        <Divider />

        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={cardTitle}>Open positions</Text>
            <Hint>Unrealised. Excluded from every figure above.</Hint>
          </View>
          <Chip label={String(openTrades.length)} tone="open" />
        </View>

        {openTrades.length === 0 ? (
          <Hint>You have no open positions recorded.</Hint>
        ) : (
          openTrades.map((trade, index) => (
            <OpenPosition
              key={trade.id}
              trade={trade}
              exits={exitsByTrade.get(trade.id) ?? []}
              currency={currency}
              first={index === 0}
            />
          ))
        )}
      </Panel>

      <Panel tone="warm" style={{ gap: 4 }}>
        <View style={{ gap: 2, marginBottom: 6 }}>
          <Text style={cardTitle}>Trade quality</Text>
          <Hint>What the result was made of, not just how big it was.</Hint>
        </View>

        <ListRow
          first
          label="Average R"
          note={
            metrics.tradesWithR === 0
              ? "No trade has both a stop loss and an exit"
              : `${metrics.tradesWithR} trade${metrics.tradesWithR === 1 ? "" : "s"} had a stop loss`
          }
          value={rMultiple(metrics.averageR)}
        />
        <ListRow
          label="Expectancy per trade"
          note="Net P&L divided by closed trades"
          value={money(metrics.expectancy, currency, { signed: true })}
          tone={signTone(metrics.expectancy) === "profit" ? "profit" : signTone(metrics.expectancy) === "loss" ? "loss" : "neutral"}
        />
        <ListRow
          label="Largest win"
          note={
            metrics.largestLoss === null
              ? "No losing trade yet"
              : `Largest loss ${money(metrics.largestLoss, currency)}`
          }
          value={money(metrics.largestWin, currency, { signed: true })}
          tone="profit"
        />
        <ListRow
          label="Max drawdown"
          note={
            drawdown === null
              ? "Needs at least two closed trades"
              : `${money(drawdown.peakEquity, currency)} → ${money(drawdown.troughEquity, currency)}`
          }
          value={drawdown === null ? NA : pct(drawdown.maxDrawdownPercent)}
          tone="loss"
        />
      </Panel>

      {/* Breakdown ------------------------------------------------- */}

      <SectionTitle>Breakdown</SectionTitle>

      <Card>
        <Text style={cardTitle}>Result mix</Text>
        <ResultMix
          wins={metrics.winningTrades}
          losses={metrics.losingTrades}
          breakeven={metrics.breakevenTrades}
        />
      </Card>

      <Card>
        <Text style={cardTitle}>Streaks</Text>
        <DetailRow
          label="Current"
          value={
            metrics.currentStreak === 0
              ? NA
              : `${metrics.currentStreak} ${metrics.currentStreakType}${
                  metrics.currentStreak === 1 ? "" : "s"
                }`
          }
        />
        <DetailRow label="Longest win run" value={metrics.maxWinStreak === 0 ? NA : String(metrics.maxWinStreak)} />
        <DetailRow label="Longest loss run" value={metrics.maxLossStreak === 0 ? NA : String(metrics.maxLossStreak)} />
        <Hint>Breakeven trades neither extend nor break a streak — a scratch is not evidence of a run.</Hint>
      </Card>

      <Card>
        <Text style={cardTitle}>Holding time</Text>
        <DetailRow label="Average" value={duration(metrics.averageHoldingMs)} />
        <DetailRow label="Winners" value={duration(metrics.averageWinHoldingMs)} />
        <DetailRow label="Losers" value={duration(metrics.averageLossHoldingMs)} />
        <Hint>Measured from entry to the last recorded exit of each trade.</Hint>
      </Card>

      <Card>
        <Text style={cardTitle}>By strategy</Text>
        {groups.length === 0 ? (
          <Hint>No closed trades have a strategy assigned yet.</Hint>
        ) : (
          groups.map((group) => (
            <DetailRow
              key={group.key}
              label={`${group.key} (${group.trades})`}
              value={money(group.netPnl, currency, { signed: true })}
            />
          ))
        )}
      </Card>

      {/* Journal prompt -------------------------------------------- */}

      <Card style={{ gap: 10 }}>
        <View style={{ gap: 4 }}>
          <Text style={cardTitle}>Review your week</Text>
          <Hint>
            {snapshot.journal.length === 0
              ? "You have not written a journal entry yet."
              : `${snapshot.journal.length} entr${snapshot.journal.length === 1 ? "y" : "ies"} recorded.`}{" "}
            Writing down why a trade worked is what turns a result into a lesson.
          </Hint>
        </View>
        <Button label="Open journal" onPress={() => router.push("/journal")} />
      </Card>

      <Text style={{ color: theme.textFaint, fontSize: 11, textAlign: "center" }}>
        Last loaded {shortDate(new Date().toISOString())}
      </Text>

      <FooterBand />
    </Screen>
  );
}

/**
 * One open or partly-closed position.
 *
 * The realised figure for a partly-closed trade is stated as "so far", never as
 * a final result, so the number is never mistaken for a closed profit. The
 * arithmetic comes from the shared core engine, so it matches the Trades list.
 */
function OpenPosition({
  trade,
  exits,
  currency,
  first,
}: {
  trade: Trade;
  exits: TradeExit[];
  currency: CurrencyCode | string;
  first?: boolean;
}) {
  const theme = useTheme();

  const computation = computeTrade(trade, exits);
  const isPartial = !computation.isFullyClosed && computation.closedQuantity > 0;
  const remaining = computation.openQuantity;
  const totalQty = computation.quantity;

  // A trade that is entirely open has no realised result at all.
  const realised = isPartial ? computation.effectiveNetPnl : null;

  return (
    <View
      style={{
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.border,
        paddingTop: first ? 0 : 11,
        marginTop: first ? 0 : 1,
        gap: 5,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Text style={{ color: theme.text, fontSize: 14.5, fontWeight: "700" }}>{trade.symbol}</Text>
          <Chip label={trade.direction === "long" ? "Long" : "Short"} tone={trade.direction === "long" ? "long" : "short"} />
          {isPartial ? <Chip label="Partly closed" tone="partial" /> : null}
        </View>
        <Text
          style={[
            tabular,
            {
              color: realised === null ? theme.textFaint : realised >= 0 ? theme.profit : theme.loss,
              fontSize: 14.5,
              fontWeight: "700",
            },
          ]}
        >
          {realised === null ? NA : money(realised, currency, { signed: true })}
        </Text>
      </View>
      <Hint>
        {totalQty.toFixed(4)} {isPartial ? `· ${remaining.toFixed(4)} still open` : "open"} ·{" "}
        {isPartial ? "realised so far" : "nothing realised yet"}
      </Hint>
    </View>
  );
}
