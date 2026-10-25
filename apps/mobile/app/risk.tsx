/**
 * Risk and planning.
 *
 * Two calculators and a set of the user's own limits. Everything here is
 * arithmetic over numbers the user types — the screen never places an order,
 * never predicts a direction, and never calls a position safe.
 *
 * The calculators come from `@tradevault/core`, so the phone and the browser
 * size a position identically.
 */

import { useMemo, useState } from "react";
import { Text, TextInput, View, Pressable } from "react-native";
import {
  calculatePositionSize,
  calculateRewardRisk,
  capitalBase,
  computeMetrics,
  type CurrencyCode,
  type TradeDirection,
} from "@tradevault/core";
import { useApp } from "../src/state/appContext";
import { useTheme } from "../src/state/themeContext";
import { Banner, Button, Card, Chip, Hint, PageHeader, Screen, SectionTitle, Stat } from "../src/ui/components";
import { NA, money, num, pct } from "../src/ui/format";

const RISK_PRESETS = [0.25, 0.5, 1, 2];

export default function RiskScreen() {
  const { snapshot } = useApp();
  const theme = useTheme();

  const primary = useMemo(
    () => [...snapshot.accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0],
    [snapshot.accounts]
  );
  const currency: CurrencyCode | string = primary?.currency ?? "USD";
  const equity = capitalBase(primary);

  const [direction, setDirection] = useState<TradeDirection>("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [contractMultiplier, setContractMultiplier] = useState("1");
  const [riskPercent, setRiskPercent] = useState("1");
  const [fixedRisk, setFixedRisk] = useState("");

  const position = useMemo(() => {
    const parsedPercent = Number(riskPercent);
    const parsedFixed = fixedRisk.trim() === "" ? null : Number(fixedRisk);
    return calculatePositionSize({
      accountEquity: equity,
      riskPercent: Number.isFinite(parsedPercent) && parsedPercent > 0 ? parsedPercent : null,
      fixedRiskAmount: parsedFixed !== null && Number.isFinite(parsedFixed) ? parsedFixed : null,
      entryPrice: Number(entryPrice),
      stopLossPrice: Number(stopLossPrice),
      contractMultiplier: Number(contractMultiplier) || 1,
      quantityStep: 0,
    });
  }, [equity, riskPercent, fixedRisk, entryPrice, stopLossPrice, contractMultiplier]);

  const reward = useMemo(() => {
    if (takeProfitPrice.trim() === "") return null;
    return calculateRewardRisk({
      direction,
      entryPrice: Number(entryPrice),
      stopLossPrice: Number(stopLossPrice),
      takeProfitPrice: Number(takeProfitPrice),
      quantity: position.quantity ?? 0,
      contractMultiplier: Number(contractMultiplier) || 1,
    });
  }, [direction, entryPrice, stopLossPrice, takeProfitPrice, position.quantity, contractMultiplier]);

  const metrics = useMemo(() => {
    const exitsByTradeId: Record<string, typeof snapshot.exits> = {};
    for (const exit of snapshot.exits) {
      (exitsByTradeId[exit.tradeId] ??= []).push(exit);
    }
    return computeMetrics(snapshot.trades, exitsByTradeId);
  }, [snapshot]);

  if (snapshot.accounts.length === 0) {
    return (
      <Screen>
        <PageHeader
          back
          eyebrow="Risk"
          title="Risk & plan"
          subtitle="Position sizing from your own numbers."
        />
        <Banner tone="warn" title="Add an account first">
          Position sizing is measured against account equity, so the calculator needs to know which
          account and currency it is working in.
        </Banner>
      </Screen>
    );
  }

  const valid = position.errors.length === 0;

  return (
    <Screen>
      <PageHeader
        back
        eyebrow="Risk"
        title="Risk & plan"
        subtitle="Arithmetic from the numbers you type — never a prediction."
      />
      <Banner tone="info" title="This is arithmetic, not advice">
        TradeVault does not place orders and cannot tell you whether a trade will work. Everything
        below is a calculation from the numbers you type, in {currency}. Prices can gap past a stop
        loss, so the amount you actually lose can exceed the calculated risk.
      </Banner>

      <SectionTitle>Account</SectionTitle>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Stat
            label="Account equity"
            value={money(equity, currency)}
            hint={primary ? `${primary.name} · starting balance plus adjustments` : undefined}
          />
          <Stat
            label="Current streak"
            value={
              metrics.currentStreak === 0
                ? NA
                : `${metrics.currentStreak} ${metrics.currentStreakType}${
                    metrics.currentStreak === 1 ? "" : "s"
                  }`
            }
            hint="Breakeven trades do not extend a streak"
          />
        </View>
      </Card>

      <SectionTitle>Position size</SectionTitle>
      <Card>
        <Hint>
          Sizes a position so that a stop-out loses the amount you chose. Quantity is rounded down,
          never up, so the risk never quietly exceeds your budget.
        </Hint>

        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["long", "short"] as const).map((d) => (
            <Pressable key={d} onPress={() => setDirection(d)}>
              <Chip label={d === "long" ? "Long" : "Short"} tone={direction === d ? "accent" : "neutral"} />
            </Pressable>
          ))}
        </View>

        <Field label="Entry price" value={entryPrice} onChange={setEntryPrice} placeholder="1.08500" />
        <Field
          label="Stop-loss price"
          value={stopLossPrice}
          onChange={setStopLossPrice}
          placeholder="1.08200"
          hint={direction === "long" ? "Below the entry for a long" : "Above the entry for a short"}
        />
        <Field
          label="Risk per trade (%)"
          value={riskPercent}
          onChange={(v) => {
            setRiskPercent(v);
            if (v !== "") setFixedRisk("");
          }}
        />
        <Field
          label={`Or fixed risk (${currency})`}
          value={fixedRisk}
          onChange={(v) => {
            setFixedRisk(v);
            if (v !== "") setRiskPercent("");
          }}
          placeholder="Optional — takes precedence"
        />
        <Field
          label="Contract multiplier"
          value={contractMultiplier}
          onChange={setContractMultiplier}
          hint="1 for shares, 100000 for a standard FX lot"
        />

        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {RISK_PRESETS.map((preset) => (
            <Button
              key={preset}
              label={`${preset}% of equity`}
              onPress={() => {
                setRiskPercent(String(preset));
                setFixedRisk("");
              }}
            />
          ))}
        </View>

        {position.errors.length > 0 ? (
          <Banner tone="warn" title="Nothing to calculate yet">
            {position.errors.join(" ")}
          </Banner>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat
              emphasis
              label="Position size"
              value={position.quantity === null ? NA : num(position.quantity, { decimals: 4 })}
              hint="Units to open, rounded down"
            />
            <Stat
              label="Risk if stopped"
              value={position.actualRiskAmount === null ? NA : money(position.actualRiskAmount, currency)}
              hint={
                equity > 0 && position.actualRiskAmount !== null
                  ? `${pct(position.actualRiskAmount / equity, { decimals: 2 })} of equity`
                  : undefined
              }
            />
            <Stat label="Stop distance" value={num(position.stopDistance, { decimals: 5 })} />
            <Stat
              label="Notional value"
              value={position.notionalValue === null ? NA : money(position.notionalValue, currency)}
            />
          </View>
        )}
      </Card>

      <SectionTitle>Reward-to-risk</SectionTitle>
      <Card>
        <Field
          label="Take-profit price"
          value={takeProfitPrice}
          onChange={setTakeProfitPrice}
          placeholder="1.09400"
          hint="Optional. Adds the reward-to-risk calculation."
        />

        {reward && reward.errors.length > 0 ? (
          <Banner tone="warn" title="Cannot compute reward-to-risk">
            {reward.errors.join(" ")}
          </Banner>
        ) : null}

        {reward && reward.ratio !== null ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Stat
                label="Reward-to-risk"
                value={`${num(reward.ratio, { decimals: 2 })} : 1`}
                hint={`Risking ${money(reward.riskAmount, currency)} to make ${money(reward.rewardAmount, currency)}`}
              />
              <Stat
                label="Break-even win rate"
                value={pct(reward.breakEvenWinRate)}
                hint="Before costs. Win less than this and the pattern loses money."
              />
              <Stat
                label="Your actual win rate"
                value={pct(metrics.winRate)}
                hint={
                  metrics.closedTrades === 0
                    ? "No closed trades to compare against yet"
                    : `Across ${metrics.closedTrades} closed trade${metrics.closedTrades === 1 ? "" : "s"}`
                }
              />
            </View>

            {metrics.winRate !== null && reward.breakEvenWinRate !== null ? (
              <Banner tone={metrics.winRate >= reward.breakEvenWinRate ? "accent" : "warn"}>
                Your recorded win rate is {pct(metrics.winRate)}. At{" "}
                {num(reward.ratio, { decimals: 2 })}:1 this pattern needs {pct(reward.breakEvenWinRate)}{" "}
                to break even before costs, so the arithmetic is{" "}
                {metrics.winRate >= reward.breakEvenWinRate ? "in your favour" : "against you"} on this
                sample. A small sample can flip that conclusion.
              </Banner>
            ) : null}
          </>
        ) : null}
      </Card>

      {valid ? (
        <>
          <SectionTitle>How this was calculated</SectionTitle>
          <Card>
            {position.assumptions.map((assumption) => (
              <Hint key={assumption}>• {assumption}</Hint>
            ))}
            <Hint>
              P&amp;L figures are in {currency}, the currency of {primary?.name ?? "your reporting account"}.
              TradeVault will not convert currencies without a dated exchange rate.
            </Hint>
          </Card>
        </>
      ) : null}

      <Banner tone="warn" title="Set and forget">
        Limits such as a daily loss cap are yours to keep. Nothing in this app can enforce them, and
        it will not pretend otherwise.
      </Banner>

      <Text style={{ color: theme.textFaint, fontSize: 11, lineHeight: 16 }}>
        TradeVault is a journal and analysis tool. It cannot place trades and never asks for broker
        API keys.
      </Text>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType="decimal-pad"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.borderStrong,
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          color: theme.text,
          fontSize: 14,
        }}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}
