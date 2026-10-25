/**
 * Trade detail.
 *
 * Everything recorded about one trade, and the full breakdown of how its result
 * was arrived at: gross, each cost, net, and the R multiple where a stop loss
 * makes one meaningful. Also where a trade is removed.
 *
 * Deletion is a **soft delete** — the row is marked, not destroyed — because a
 * delete made offline has to be reconcilable with the server later. The copy
 * says so, so nobody believes the record has been shredded.
 */

import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { computeTrade, type CurrencyCode } from "@tradevault/core";
import { useApp } from "../../src/state/appContext";
import { useTheme } from "../../src/state/themeContext";
import { softDeleteTrade } from "../../src/db/store";
import { Banner, Button, Card, Chip, DetailRow, Hint, PageHeader, Screen, SectionTitle, Stat, tabular } from "../../src/ui/components";
import { NA, dateTime, duration, money, rMultiple, signTone } from "../../src/ui/format";

export default function TradeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, reload } = useApp();
  const theme = useTheme();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const trade = snapshot.trades.find((t) => t.id === id);
  const exits = useMemo(
    () => snapshot.exits.filter((e) => e.tradeId === id),
    [snapshot.exits, id]
  );
  const account = snapshot.accounts.find((a) => a.id === trade?.accountId);
  const currency: CurrencyCode | string = account?.currency ?? "USD";

  const computation = useMemo(
    () => (trade ? computeTrade(trade, exits) : null),
    [trade, exits]
  );

  if (!trade || !computation) {
    return (
      <Screen>
        <PageHeader back eyebrow="Trade" title="Not found" />
        <Banner tone="danger" title="Trade not found">
          This trade is no longer in your journal. It may have been removed on this device or, once
          sync is connected, on another.
        </Banner>
        <Button label="Back to trades" onPress={() => router.back()} />
      </Screen>
    );
  }

  function remove() {
    try {
      softDeleteTrade(String(id));
      reload();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this trade.");
    }
  }

  const isClosed = trade.status === "closed";

  return (
    <Screen>
      <PageHeader
        back
        eyebrow="Trade"
        title={trade.symbol}
        subtitle={`${trade.direction === "long" ? "Long" : "Short"} · ${trade.status} · ${currency}`}
      />

      <Card>
        <Text
          style={{
            color: theme.textFaint,
            fontSize: 10.5,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          Net P&amp;L
        </Text>
        <Text
          style={[
            tabular,
            {
              color: isClosed
                ? signTone(computation.effectiveNetPnl) === "profit"
                  ? theme.profit
                  : computation.effectiveNetPnl < 0
                    ? theme.loss
                    : theme.text
                : theme.textFaint,
              fontSize: 30,
              fontWeight: "700",
              letterSpacing: -1,
              lineHeight: 34,
            },
          ]}
        >
          {isClosed ? money(computation.effectiveNetPnl, currency, { signed: true }) : NA}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Chip label={trade.direction === "long" ? "Long" : "Short"} tone={trade.direction === "long" ? "long" : "short"} />
          <Chip
            label={trade.status}
            tone={trade.status === "closed" ? "closed" : trade.status === "partial" ? "partial" : "open"}
          />
          <Chip label={trade.assetClass} />
          <Chip label={currency} />
        </View>
        {!isClosed ? (
          <Hint>This trade is not fully closed, so it has no final result yet.</Hint>
        ) : null}
      </Card>

      <SectionTitle>Result</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat
            emphasis
            label="Net P&L"
            value={money(computation.effectiveNetPnl, currency, { signed: true })}
            tone={signTone(computation.effectiveNetPnl)}
          />
          <Stat label="Gross P&L" value={money(computation.grossPnl, currency, { signed: true })} />
          <Stat label="R multiple" value={rMultiple(computation.rMultiple)} />
          <Stat label="Holding time" value={duration(computation.holdingMs)} />
        </View>
        {computation.manualNetPnl !== null ? (
          <Banner tone="info" title="A manual net P&L was recorded">
            The computed figure is {money(computation.netPnl, currency)}; the manual override is{" "}
            {money(computation.manualNetPnl, currency)}. The override is what the figures above use.
          </Banner>
        ) : null}
      </Card>

      <SectionTitle>Costs</SectionTitle>
      <Card>
        <DetailRow label="Entry fees" value={money(computation.costs.entryFees, currency)} />
        <DetailRow label="Exit fees" value={money(computation.costs.exitFees, currency)} />
        <DetailRow label="Funding / swap" value={money(computation.costs.fundingFees, currency)} />
        <DetailRow label="Slippage" value={money(computation.costs.slippage, currency)} />
        <DetailRow label="Total" value={money(computation.costs.total, currency)} />
      </Card>

      <SectionTitle>Prices</SectionTitle>
      <Card>
        <DetailRow label="Entry price" value={trade.entryPrice} />
        <DetailRow label="Entry time" value={dateTime(trade.entryAt)} />
        <DetailRow label="Exit price" value={trade.exitPrice} />
        <DetailRow label="Exit time" value={dateTime(trade.exitAt)} />
        <DetailRow label="Average exit price" value={computation.averageExitPrice === null ? NA : String(computation.averageExitPrice)} />
        <DetailRow label="Quantity" value={trade.quantity} />
        <DetailRow label="Open quantity" value={String(computation.openQuantity)} />
        <DetailRow label="Contract multiplier" value={trade.contractMultiplier} />
      </Card>

      <SectionTitle>Risk</SectionTitle>
      <Card>
        <DetailRow label="Stop loss" value={trade.stopLoss} />
        <DetailRow label="Take profit" value={trade.takeProfit} />
        <DetailRow
          label="Initial risk"
          value={computation.initialRisk === null ? NA : money(computation.initialRisk, currency)}
        />
        <DetailRow
          label="Planned reward-to-risk"
          value={computation.plannedRewardRisk === null ? NA : `${computation.plannedRewardRisk.toFixed(2)} : 1`}
        />
        {trade.stopLoss === null ? (
          <Hint>No stop loss was recorded, so there is no R multiple to measure.</Hint>
        ) : null}
      </Card>

      {exits.length > 0 ? (
        <>
          <SectionTitle>Exits ({exits.length})</SectionTitle>
          <Card>
            {exits.map((exit, index) => (
              <View key={exit.id} style={{ gap: 2, marginBottom: index === exits.length - 1 ? 0 : 8 }}>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                  {exit.quantity} @ {exit.price}
                </Text>
                <Hint>
                  {dateTime(exit.exitedAt)} · fees {money(Number(exit.fees), currency)}
                </Hint>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Context</SectionTitle>
      <Card>
        <DetailRow label="Account" value={account?.name} />
        <DetailRow label="Strategy" value={trade.strategy} />
        <DetailRow label="Session" value={trade.session} />
        <DetailRow label="Order type" value={trade.orderType} />
        <DetailRow label="Market" value={trade.market} />
        <DetailRow label="Setup type" value={trade.setupType} />
        <DetailRow
          label="Emotion before"
          value={trade.emotionBefore}
        />
        <DetailRow label="Emotion during" value={trade.emotionDuring} />
        <DetailRow label="Emotion after" value={trade.emotionAfter} />
      </Card>

      {trade.entryReason || trade.exitReason || trade.mistakes || trade.lessons || trade.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            {trade.entryReason ? <Note label="Entry reason" value={trade.entryReason} /> : null}
            {trade.exitReason ? <Note label="Exit reason" value={trade.exitReason} /> : null}
            {trade.mistakes ? <Note label="Mistakes" value={trade.mistakes} /> : null}
            {trade.lessons ? <Note label="Lessons" value={trade.lessons} /> : null}
            {trade.notes ? <Note label="Notes" value={trade.notes} /> : null}
          </Card>
        </>
      ) : null}

      {error ? (
        <Banner tone="danger" title="That did not work">
          {error}
        </Banner>
      ) : null}

      <SectionTitle>Remove</SectionTitle>
      <Card>
        <Hint>
          Removing a trade marks it as deleted rather than destroying it, so the change can be
          reconciled with the server. It disappears from your lists and figures either way.
        </Hint>
        {confirming ? (
          <View style={{ gap: 10 }}>
            <Banner tone="warn" title="Remove this trade?">
              It will no longer appear in any list or figure. There is no undo in the app.
            </Banner>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
              <Button label="Remove trade" variant="danger" onPress={remove} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Button label="Remove this trade" variant="danger" onPress={() => setConfirming(true)} />
        )}
      </Card>
    </Screen>
  );
}

function Note({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2, marginBottom: 6 }}>
      <Text style={{ color: theme.textFaint, fontSize: 10, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{value}</Text>
    </View>
  );
}
