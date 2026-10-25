/**
 * Add trade.
 *
 * Recording a trade is the app's most important job, so this form does three
 * things deliberately:
 *
 *   1. It **validates through the shared core schema** — the same rules the
 *      server enforces — before anything is written.
 *   2. It shows a **live calculation** from the values on screen, computed by
 *      the same engine that powers the dashboard. Nothing is saved until Save.
 *   3. It refuses to save a figure it cannot stand behind. An invalid stop
 *      loss is an error, not a silently-dropped field.
 */

import { useMemo, useState } from "react";
import { Text, TextInput, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  ASSET_CLASSES,
  TRADING_SESSIONS,
  computeTrade,
  generateId,
  nowIso,
  tradeSchema,
  type AssetClass,
  type CurrencyCode,
  type OrderType,
  type Trade,
  type TradeDirection,
  type TradeExit,
  type TradingSession,
} from "@tradevault/core";
import { useApp } from "../../src/state/appContext";
import { useTheme } from "../../src/state/themeContext";
import { insertTrade } from "../../src/db/store";
import { Banner, Button, Card, Hint, PageHeader, Screen, SectionTitle, Stat } from "../../src/ui/components";
import { NA, money, rMultiple, signTone } from "../../src/ui/format";

const DIRECTIONS: TradeDirection[] = ["long", "short"];
const ORDER_TYPES: OrderType[] = ["market", "limit", "stop", "stop_limit"];

export default function AddTradeScreen() {
  const { snapshot, reload } = useApp();
  const theme = useTheme();
  const router = useRouter();

  const accounts = snapshot.accounts.filter((a) => !a.isArchived);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const currency: CurrencyCode | string = account?.currency ?? "USD";

  const [symbol, setSymbol] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("forex");
  const [direction, setDirection] = useState<TradeDirection>("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [session, setSession] = useState<TradingSession>("london");
  const [strategyId, setStrategyId] = useState<string>("");
  const [market, setMarket] = useState("");

  const [isOpen, setIsOpen] = useState(false);
  const [entryAt, setEntryAt] = useState(localNow());
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const [exitAt, setExitAt] = useState(localNow());
  const [exitPrice, setExitPrice] = useState("");

  const [entryFees, setEntryFees] = useState("0");
  const [exitFees, setExitFees] = useState("0");
  const [fundingFees, setFundingFees] = useState("0");
  const [slippage, setSlippage] = useState("0");

  const [entryReason, setEntryReason] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The exact trade that would be saved. Building it once and feeding the same
   * object to both the validator and the live calculation means the preview can
   * never disagree with what gets stored.
   */
  const draft = useMemo<Trade>(
    () => ({
      id: "preview",
      userId: null,
      accountId: accountId || "preview-account",
      strategyId: strategyId || null,
      symbol: symbol.trim().toUpperCase(),
      assetClass,
      market: market.trim() || undefined,
      direction,
      status: isOpen ? "open" : "closed",
      orderType,
      entryAt,
      entryPrice,
      exitAt: isOpen ? null : exitAt,
      exitPrice: isOpen ? null : exitPrice,
      quantity,
      contractMultiplier: multiplier,
      stopLoss: stopLoss.trim() || null,
      takeProfit: takeProfit.trim() || null,
      entryFees: entryFees || "0",
      exitFees: isOpen ? "0" : exitFees || "0",
      fundingFees: fundingFees || "0",
      slippage: slippage || "0",
      session,
      entryReason: entryReason.trim() || undefined,
      exitReason: isOpen ? undefined : exitReason.trim() || undefined,
      manualNetPnl: null,
      importFingerprint: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      revision: 1,
      deletedAt: null,
    }),
    [
      accountId,
      strategyId,
      symbol,
      assetClass,
      market,
      direction,
      isOpen,
      orderType,
      entryAt,
      entryPrice,
      exitAt,
      exitPrice,
      quantity,
      multiplier,
      stopLoss,
      takeProfit,
      entryFees,
      exitFees,
      fundingFees,
      slippage,
      session,
      entryReason,
      exitReason,
    ]
  );

  const previewExits = useMemo<TradeExit[]>(() => {
    if (isOpen) return [];
    return [
      {
        id: "preview-exit",
        userId: null,
        tradeId: "preview",
        quantity,
        price: exitPrice,
        fees: exitFees || "0",
        exitedAt: exitAt,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        revision: 1,
        deletedAt: null,
      },
    ];
  }, [isOpen, quantity, exitPrice, exitFees, exitAt]);

  // Only attempt a computation once the minimum inputs are present, so the
  // preview shows N/A rather than a number derived from empty strings.
  const hasEnoughForPreview =
    entryPrice.trim() !== "" && quantity.trim() !== "" && (isOpen || exitPrice.trim() !== "");
  const computation = useMemo(
    () => (hasEnoughForPreview ? computeTrade(draft, previewExits) : null),
    [draft, previewExits, hasEnoughForPreview]
  );

  function save() {
    setError(null);

    if (!accountId) {
      setError("Add a trading account first — every trade belongs to one, and it sets the currency.");
      return;
    }

    // The schema is the single source of truth for what a valid trade is.
    const result = tradeSchema.safeParse({
      ...draft,
      accountId,
      symbol: draft.symbol,
    });

    if (!result.success) {
      const first = result.error.issues[0];
      setError(
        first
          ? `${first.path.join(".") || "Trade"}: ${first.message}`
          : "That trade did not pass validation."
      );
      return;
    }

    const now = nowIso();
    const trade: Trade = {
      ...draft,
      id: generateId(),
      accountId,
      createdAt: now,
      updatedAt: now,
    };

    const exits: TradeExit[] = previewExits.map((exit) => ({
      ...exit,
      id: generateId(),
      tradeId: trade.id,
      createdAt: now,
      updatedAt: now,
    }));

    setBusy(true);
    try {
      insertTrade(trade, exits);
      setBusy(false);
      reload();
      router.replace("/(tabs)/trades");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not save this trade.");
    }
  }

  if (accounts.length === 0) {
    return (
      <Screen>
        <PageHeader
          eyebrow="Record"
          title="Add trade"
          subtitle="One trade, recorded once. Nothing is sent anywhere until you press Save."
        />
        <Banner tone="warn" title="No account to record against">
          Every trade belongs to an account, and the account's currency is what your figures are
          measured in. Add one in Data &amp; Settings first.
        </Banner>
        <Button label="Go to Data & Settings" variant="primary" onPress={() => router.push("/settings")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Record"
        title="Add trade"
        subtitle="The calculation below updates as you type and uses the same engine as your dashboard."
      />
      {/* Live calculation ------------------------------------------ */}

      <Card>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>Live calculation</Text>
        <Hint>
          Computed from the values below by the same engine that powers your dashboard. Nothing is
          saved until you press Save.
        </Hint>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat
            emphasis
            label="Net P&L"
            value={computation === null ? NA : money(computation.effectiveNetPnl, currency, { signed: true })}
            tone={computation === null ? "neutral" : signTone(computation.effectiveNetPnl)}
            hint={
              computation === null
                ? "Enter a price and quantity"
                : `Gross ${money(computation.grossPnl, currency)} less ${money(computation.costs.total, currency)} costs`
            }
          />
          <Stat
            label="R multiple"
            value={computation === null ? NA : rMultiple(computation.rMultiple)}
            hint={stopLoss.trim() === "" ? "Add a stop loss to measure risk" : undefined}
          />
          <Stat
            label="Total costs"
            value={computation === null ? NA : money(computation.costs.total, currency)}
            hint={
              computation === null
                ? undefined
                : `Entry ${money(computation.costs.entryFees, currency)} · exit ${money(
                    computation.costs.exitFees,
                    currency
                  )}`
            }
          />
        </View>
      </Card>

      {/* Trade ----------------------------------------------------- */}

      <SectionTitle>Trade</SectionTitle>
      <Card>
        <Choice
          label="Account"
          options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          value={accountId}
          onChange={setAccountId}
        />
        <TextField label="Symbol" required value={symbol} onChange={setSymbol} placeholder="EURUSD, AAPL, BTCUSDT…" />
        <Choice
          label="Asset class"
          options={ASSET_CLASSES.map((a) => ({ value: a, label: titleCase(a) }))}
          value={assetClass}
          onChange={(v) => setAssetClass(v as AssetClass)}
        />
        <Choice
          label="Direction"
          options={DIRECTIONS.map((d) => ({ value: d, label: titleCase(d) }))}
          value={direction}
          onChange={(v) => setDirection(v as TradeDirection)}
        />
        <Choice
          label="Order type"
          options={ORDER_TYPES.map((o) => ({ value: o, label: titleCase(o) }))}
          value={orderType}
          onChange={(v) => setOrderType(v as OrderType)}
        />
        <Choice
          label="Session"
          options={TRADING_SESSIONS.map((s) => ({ value: s, label: titleCase(s) }))}
          value={session}
          onChange={(v) => setSession(v as TradingSession)}
        />
        <Choice
          label="Strategy"
          options={[
            { value: "", label: "Not assigned" },
            ...snapshot.strategies.map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={strategyId}
          onChange={setStrategyId}
        />
        <TextField label="Market" value={market} onChange={setMarket} placeholder="Optional. FX, Metals, Equities…" />
      </Card>

      {/* Outcome --------------------------------------------------- */}

      <SectionTitle>Outcome</SectionTitle>
      <Card>
        <Choice
          label="Is this trade still open?"
          options={[
            { value: "closed", label: "Closed — I have an exit" },
            { value: "open", label: "Open — still running" },
          ]}
          value={isOpen ? "open" : "closed"}
          onChange={(v) => setIsOpen(v === "open")}
        />
        <Banner tone="info">
          Open trades never count toward your realised figures. They appear on the dashboard as
          positions with no result yet.
        </Banner>
      </Card>

      {/* Entry ----------------------------------------------------- */}

      <SectionTitle>Entry</SectionTitle>
      <Card>
        <TextField label="Entry time" required value={entryAt} onChange={setEntryAt} hint="ISO format, e.g. 2026-02-12T08:05" />
        <TextField label="Entry price" required value={entryPrice} onChange={setEntryPrice} numeric />
        <TextField label="Quantity" required value={quantity} onChange={setQuantity} numeric hint="Lots, shares or contracts" />
        <TextField label="Contract multiplier" value={multiplier} onChange={setMultiplier} numeric hint="1 for shares, 100000 for a standard FX lot" />
      </Card>

      {!isOpen ? (
        <>
          <SectionTitle>Exit</SectionTitle>
          <Card>
            <TextField label="Exit time" required value={exitAt} onChange={setExitAt} />
            <TextField label="Exit price" required value={exitPrice} onChange={setExitPrice} numeric />
          </Card>
        </>
      ) : null}

      {/* Risk and costs -------------------------------------------- */}

      <SectionTitle>Risk and costs</SectionTitle>
      <Card>
        <TextField
          label="Stop loss"
          value={stopLoss}
          onChange={setStopLoss}
          numeric
          hint={direction === "long" ? "Below the entry for a long" : "Above the entry for a short"}
        />
        <TextField label="Take profit" value={takeProfit} onChange={setTakeProfit} numeric />
        <TextField label="Entry fees" value={entryFees} onChange={setEntryFees} numeric />
        {!isOpen ? <TextField label="Exit fees" value={exitFees} onChange={setExitFees} numeric /> : null}
        <TextField label="Funding / swap" value={fundingFees} onChange={setFundingFees} numeric />
        <TextField label="Slippage cost" value={slippage} onChange={setSlippage} numeric />
      </Card>

      {/* Notes ----------------------------------------------------- */}

      <SectionTitle>Notes</SectionTitle>
      <Card>
        <TextField label="Why did you enter?" value={entryReason} onChange={setEntryReason} multiline />
        {!isOpen ? (
          <TextField label="Why did you exit?" value={exitReason} onChange={setExitReason} multiline />
        ) : null}
        <TextField label="Anything else" value={notes} onChange={setNotes} multiline />
      </Card>

      {error ? (
        <Banner tone="danger" title="Check this">
          {error}
        </Banner>
      ) : null}

      <Button label="Save trade" variant="primary" onPress={save} busy={busy} />

      <Hint>Saved trades are written to this device immediately and queued for sync when configured.</Hint>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

function TextField({
  label,
  value,
  onChange,
  required = false,
  numeric = false,
  multiline = false,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  numeric?: boolean;
  multiline?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
        {label}
        {required ? <Text style={{ color: theme.loss }}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType={numeric ? "decimal-pad" : "default"}
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
          minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable key={option.value} onPress={() => onChange(option.value)}>
              <View
                style={{
                  backgroundColor: active ? theme.accent : theme.surfaceRaised,
                  borderRadius: 999,
                  paddingHorizontal: 13,
                  paddingVertical: 7,
                  borderWidth: 1,
                  borderColor: active ? theme.accent : theme.borderStrong,
                }}
              >
                <Text
                  style={{
                    color: active ? (theme.accentOn ?? "#fff") : theme.textMuted,
                    fontSize: 12.5,
                    fontWeight: "600",
                  }}
                >
                  {option.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function localNow(): string {
  // Local wall-clock time with no timezone suffix, which is what the entry
  // field expects and what a trader reads off their own clock.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export { NA };
