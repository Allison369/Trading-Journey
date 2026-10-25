/**
 * Trades.
 *
 * Every recorded trade, newest first, with the numbers computed from its exits.
 * The figures come from the shared core engine, so the same trade reads
 * identically here and in the web app.
 *
 * A row states the realised result only when the trade has one. An open trade
 * shows N/A in the P&L column rather than a zero that would read as "broke
 * even".
 */

import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { computeTrade, type CurrencyCode, type Trade } from "@tradevault/core";
import { useApp } from "../../src/state/appContext";
import { useTheme } from "../../src/state/themeContext";
import {
  Banner,
  Chip,
  Divider,
  EmptyState,
  Hint,
  PageHeader,
  Screen,
  Segmented,
  tabular,
} from "../../src/ui/components";
import { NA, duration, money, rMultiple, shortDate } from "../../src/ui/format";

type Filter = "all" | "open" | "closed";

export default function TradesScreen() {
  const { snapshot, loadState, loadError } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const router = useRouter();

  const exitsByTrade = useMemo(() => {
    const map = new Map<string, typeof snapshot.exits>();
    for (const exit of snapshot.exits) {
      const list = map.get(exit.tradeId);
      if (list) list.push(exit);
      else map.set(exit.tradeId, [exit]);
    }
    return map;
  }, [snapshot.exits]);

  const accountsById = useMemo(
    () => new Map(snapshot.accounts.map((a) => [a.id, a])),
    [snapshot.accounts]
  );

  const visible = useMemo(() => {
    if (filter === "open") return snapshot.trades.filter((t) => t.status !== "closed");
    if (filter === "closed") return snapshot.trades.filter((t) => t.status === "closed");
    return snapshot.trades;
  }, [snapshot.trades, filter]);

  const openCount = snapshot.trades.filter((t) => t.status !== "closed").length;

  if (loadState === "error") {
    return (
      <Screen>
        <PageHeader eyebrow="Journal" title="Trades" />
        <Banner tone="danger" title="Could not read your trades">
          {loadError ?? "The device storage could not be read."}
        </Banner>
      </Screen>
    );
  }

  if (snapshot.trades.length === 0) {
    return (
      <Screen>
        <PageHeader
          eyebrow="Journal"
          title="Trades"
          subtitle="Everything you record lands here, newest first."
        />
        <EmptyState title="No trades recorded yet">
          Add your first trade from the Add tab. Open trades never count toward your realised figures
          until they close.
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Journal"
        title="Trades"
        subtitle={`${snapshot.trades.length} recorded · ${openCount} still open · realised figures only count closed trades.`}
      />

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "open", label: "Open" },
          { value: "closed", label: "Closed" },
        ]}
      />

      <Hint>
        Showing {visible.length} of {snapshot.trades.length} trade
        {snapshot.trades.length === 1 ? "" : "s"}.
      </Hint>

      {visible.length === 0 ? (
        <EmptyState title={filter === "open" ? "Nothing open right now" : "Nothing closed yet"}>
          {filter === "open"
            ? "A trade appears here from the moment you record it until its last exit closes it."
            : "Close a trade and its result moves into the realised figures on the dashboard."}
        </EmptyState>
      ) : (
        visible.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            exits={exitsByTrade.get(trade.id) ?? []}
            currency={accountsById.get(trade.accountId)?.currency ?? "USD"}
            onPress={() => router.push(`/trade/${trade.id}`)}
          />
        ))
      )}
    </Screen>
  );
}

function TradeRow({
  trade,
  exits,
  currency,
  onPress,
}: {
  trade: Trade;
  exits: Array<{ quantity: string; price: string; fees: string; exitedAt: string }>;
  currency: CurrencyCode | string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const computation = computeTrade(trade, exits as never);
  const isOpen = trade.status !== "closed";

  // An open trade has no realised result, so the P&L column says so rather than
  // showing a zero that would read as "broke even".
  const pnl = isOpen ? null : computation.effectiveNetPnl;
  const colour = pnl === null ? theme.textFaint : pnl >= 0 ? theme.profit : theme.loss;

  const statusLabel =
    trade.status === "closed" ? "Closed" : trade.status === "partial" ? "Partial" : "Open";
  const statusTone =
    trade.status === "closed" ? "closed" : trade.status === "partial" ? "partial" : "open";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 18,
        padding: 16,
        gap: 9,
        opacity: pressed ? 0.86 : 1,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 16.5, fontWeight: "700", letterSpacing: -0.3 }}>
          {trade.symbol}
        </Text>
        <Text style={[tabular, { color: colour, fontSize: 16.5, fontWeight: "700", letterSpacing: -0.4 }]}>
          {pnl === null ? NA : money(pnl, currency, { signed: true })}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Chip label={trade.direction === "long" ? "Long" : "Short"} tone={trade.direction === "long" ? "long" : "short"} />
        <Chip label={statusLabel} tone={statusTone} />
        <Chip label={currency} />
        {trade.strategy ? <Chip label={trade.strategy} tone="accent" /> : null}
      </View>

      <Divider />

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Hint>
          {shortDate(trade.entryAt)} · held {duration(computation.holdingMs)}
        </Hint>
        <Hint>{rMultiple(computation.rMultiple)}</Hint>
      </View>

      <Hint>
        Entry {trade.entryPrice}
        {trade.exitPrice ? ` → Exit ${trade.exitPrice}` : " → still open"}
      </Hint>
    </Pressable>
  );
}
