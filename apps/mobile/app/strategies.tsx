/**
 * Strategies.
 *
 * A playbook is a set of rules written down before the trade, so that after the
 * trade you can check whether you followed them. This screen lists them with the
 * performance of the trades actually tagged to each one, so a rule set can be
 * judged by results rather than memory.
 */

import { useMemo, useState } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import {
  capitalBase,
  groupPerformance,
  generateId,
  nowIso,
  tradingStrategySchema,
  TRADING_SESSIONS,
  type CurrencyCode,
  type TradingSession,
  type TradingStrategy,
} from "@tradevault/core";
import { useApp } from "../src/state/appContext";
import { useTheme } from "../src/state/themeContext";
import { insertStrategy } from "../src/db/store";
import { Banner, Button, Card, Chip, EmptyState, Hint, PageHeader, Screen, SectionTitle, Stat } from "../src/ui/components";
import { NA, money, pct } from "../src/ui/format";

export default function StrategiesScreen() {
  const { snapshot, reload } = useApp();
  const [composing, setComposing] = useState(false);

  const primary = useMemo(
    () => [...snapshot.accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0],
    [snapshot.accounts]
  );
  const currency: CurrencyCode | string = primary?.currency ?? "USD";

  const performance = useMemo(() => {
    const exitsByTradeId: Record<string, typeof snapshot.exits> = {};
    for (const exit of snapshot.exits) {
      (exitsByTradeId[exit.tradeId] ??= []).push(exit);
    }
    // Group by the strategy NAME, because that is what trades carry; the
    // strategy record itself is a template, not a foreign key on older trades.
    const byName = new Map(
      groupPerformance(snapshot.trades, exitsByTradeId, (t) => t.strategy ?? null).map((g) => [
        g.key,
        g,
      ])
    );
    return byName;
  }, [snapshot]);

  return (
    <Screen>
      <PageHeader
        back
        eyebrow="Playbooks"
        title="Strategies"
        subtitle="Rules written before the trade. Tag trades to one and their results group here."
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <SectionTitle>Playbooks ({snapshot.strategies.length})</SectionTitle>
        <Button label="New strategy" variant="primary" onPress={() => setComposing(true)} />
      </View>

      {snapshot.strategies.length === 0 ? (
        <EmptyState title="No playbooks written yet">
          A strategy is a set of entry, exit and risk rules written before the trade. Tag trades to it
          and this screen will show how the rules have actually performed.
        </EmptyState>
      ) : (
        snapshot.strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            performance={performance.get(strategy.name)}
            currency={currency}
          />
        ))
      )}

      {composing ? (
        <Composer
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

function StrategyCard({
  strategy,
  performance,
  currency,
}: {
  strategy: TradingStrategy;
  performance: { trades: number; netPnl: number; winRate: number | null } | undefined;
  currency: CurrencyCode | string;
}) {
  const theme = useTheme();

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700", flexShrink: 1 }}>
          {strategy.name}
        </Text>
        {strategy.session ? <Chip label={strategy.session} /> : null}
      </View>

      {strategy.description ? <Hint>{strategy.description}</Hint> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat
          label="Net P&L"
          value={performance ? money(performance.netPnl, currency, { signed: true }) : NA}
          tone={performance && performance.netPnl >= 0 ? "profit" : "loss"}
        />
        <Stat label="Trades" value={performance ? String(performance.trades) : "0"} />
        <Stat label="Win rate" value={pct(performance?.winRate ?? null)} />
      </View>

      {strategy.markets.length > 0 || strategy.instruments.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {[...strategy.markets, ...strategy.instruments].map((label) => (
            <Chip key={label} label={label} />
          ))}
        </View>
      ) : null}

      {strategy.entryRules ? <Rule label="Entry" value={strategy.entryRules} /> : null}
      {strategy.exitRules ? <Rule label="Exit" value={strategy.exitRules} /> : null}
      {strategy.riskRules ? <Rule label="Risk" value={strategy.riskRules} /> : null}

      {strategy.checklist.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.textFaint, fontSize: 10, letterSpacing: 0.8 }}>
            PRE-TRADE CHECKLIST
          </Text>
          {strategy.checklist.map((item) => (
            <Text key={item} style={{ color: theme.textMuted, fontSize: 13 }}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}

      {!performance ? (
        <Hint>No trades are tagged to this playbook yet, so there is nothing to score.</Hint>
      ) : null}
    </Card>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.textFaint, fontSize: 10, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{value}</Text>
    </View>
  );
}

function Composer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryRules, setEntryRules] = useState("");
  const [exitRules, setExitRules] = useState("");
  const [riskRules, setRiskRules] = useState("");
  const [session, setSession] = useState<TradingSession | "">("");
  const [checklist, setChecklist] = useState("");
  const [markets, setMarkets] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function save() {
    setError(null);

    const splitLines = (value: string) =>
      value
        .split("\n")
        .map((line) => line.trim().replace(/^[-•]\s*/, ""))
        .filter((line) => line !== "");

    const draft: TradingStrategy = {
      id: generateId(),
      userId: null,
      name: name.trim(),
      description: description.trim() || undefined,
      markets: markets
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m !== ""),
      instruments: [],
      entryRules: entryRules.trim() || undefined,
      exitRules: exitRules.trim() || undefined,
      riskRules: riskRules.trim() || undefined,
      session: session === "" ? null : session,
      checklist: splitLines(checklist),
      tags: [],
      improvementNotes: undefined,
      isArchived: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      revision: 1,
      deletedAt: null,
    };

    const result = tradingStrategySchema.safeParse(draft);
    if (!result.success) {
      const first = result.error.issues[0];
      setError(first ? `${first.path.join(".") || "Strategy"}: ${first.message}` : "Check the fields above.");
      return;
    }

    setBusy(true);
    try {
      insertStrategy(draft);
      setBusy(false);
      onSaved();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not save this strategy.");
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <Screen>
        <PageHeader
          eyebrow="Playbooks"
          title="New playbook"
          subtitle="Write the rules down now, so the trade is judged against them later."
        />

        <Field label="Name" value={name} onChange={setName} placeholder="London Breakout" />
        <Field label="Description" value={description} onChange={setDescription} multiline />
        <Field label="Entry rules" value={entryRules} onChange={setEntryRules} multiline />
        <Field label="Exit rules" value={exitRules} onChange={setExitRules} multiline />
        <Field label="Risk rules" value={riskRules} onChange={setRiskRules} multiline />
        <Field label="Markets (comma separated)" value={markets} onChange={setMarkets} placeholder="FX, Metals" />
        <Field
          label="Checklist (one item per line)"
          value={checklist}
          onChange={setChecklist}
          multiline
          placeholder={"Range marked\nNo imminent news\nPosition sized"}
        />

        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>Session</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {[["", "Any"], ...TRADING_SESSIONS.map((s) => [s, s] as const)].map(([value, label]) => (
              <Button
                key={value || "any"}
                label={label}
                variant={session === value ? "primary" : "secondary"}
                onPress={() => setSession(value as TradingSession | "")}
              />
            ))}
          </View>
        </View>

        {error ? (
          <Banner tone="danger" title="Check this">
            {error}
          </Banner>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label="Save" variant="primary" onPress={save} busy={busy} style={{ flex: 1 }} />
        </View>
      </Screen>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.borderStrong,
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          color: theme.text,
          fontSize: 14,
          minHeight: multiline ? 74 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
