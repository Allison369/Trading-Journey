/**
 * Risk and planning.
 *
 * Two calculators and a set of reminders, all of them arithmetic:
 *
 *   1. **Position size** — given the equity you are willing to lose on this
 *      trade and the distance from entry to stop, how much can you buy?
 *   2. **Reward-to-risk** — what does the target imply, and what win rate does
 *      that require just to break even before costs?
 *   3. **Your own limits** — daily and weekly loss limits, and a maximum run of
 *      losing trades, all configured by you.
 *
 * This page never places an order and never claims a trade is safe. It reports
 * what the numbers imply from the inputs and states its assumptions. Prices gap
 * past stops; the calculator says so every time for that reason.
 */

import { useMemo, useState } from "react";
import {
  calculatePositionSize,
  calculateRewardRisk,
  computeMetrics,
  evaluateRiskGuards,
  type CurrencyCode,
  type TradeDirection,
} from "@tradevault/core";
import { useDerived } from "../lib/appContext";
import { capitalBase } from "../lib/store";
import { Banner, EmptyState, Field, Stat, icons } from "../components/ui";
import { fmtMoney, fmtNumber, fmtPercent, NA, signClass } from "../components/format";

const RISK_PRESETS = [0.25, 0.5, 1, 2];

export function RiskPage() {
  const { accounts, trades, exitsMap } = useDerived();

  const primary = useMemo(
    () => [...accounts].sort((a, b) => capitalBase(b) - capitalBase(a))[0],
    [accounts]
  );
  const currency: CurrencyCode = primary?.currency ?? "USD";
  const equity = capitalBase(primary);

  /*
   * Limits are local to this page for now and are stored in the browser. The
   * database has a `risk_settings` table for them; wiring this form to it is a
   * deliberate next step rather than something to fake here, so the page says
   * plainly that the limits are remembered on this device.
   */
  const [dailyLossLimit, setDailyLossLimit] = useState("");
  const [weeklyLossLimit, setWeeklyLossLimit] = useState("");
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState("3");
  const [riskPercent, setRiskPercent] = useState("1");

  // Position-size inputs.
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLossPrice, setStopLossPrice] = useState("");
  const [takeProfitPrice, setTakeProfitPrice] = useState("");
  const [contractMultiplier, setContractMultiplier] = useState("1");
  const [direction, setDirection] = useState<TradeDirection>("long");
  const [fixedRisk, setFixedRisk] = useState("");

  const metrics = useMemo(() => computeMetrics(trades, exitsMap), [trades, exitsMap]);

  const position = useMemo(() => {
    const parsedRiskPercent = Number(riskPercent);
    const parsedFixed = fixedRisk.trim() === "" ? null : Number(fixedRisk);
    return calculatePositionSize({
      accountEquity: equity,
      riskPercent: Number.isFinite(parsedRiskPercent) && parsedRiskPercent > 0 ? parsedRiskPercent : null,
      fixedRiskAmount: parsedFixed !== null && Number.isFinite(parsedFixed) ? parsedFixed : null,
      entryPrice: Number(entryPrice),
      stopLossPrice: Number(stopLossPrice),
      contractMultiplier: Number(contractMultiplier) || 1,
      quantityStep: 0,
    });
  }, [equity, riskPercent, fixedRisk, entryPrice, stopLossPrice, contractMultiplier]);

  const reward = useMemo(() => {
    if (!takeProfitPrice.trim()) {
      return { riskAmount: null, rewardAmount: null, ratio: null, breakEvenWinRate: null, errors: [] };
    }
    return calculateRewardRisk({
      direction,
      entryPrice: Number(entryPrice),
      stopLossPrice: Number(stopLossPrice),
      takeProfitPrice: Number(takeProfitPrice),
      quantity: position.quantity ?? 0,
      contractMultiplier: Number(contractMultiplier) || 1,
    });
  }, [direction, entryPrice, stopLossPrice, takeProfitPrice, position.quantity, contractMultiplier]);

  // "Today" and "this week" are measured from the trade's close time, in UTC.
  const { dailyNet, weeklyNet } = useMemo(() => {
    const now = Date.now();
    const startOfDayUtc = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate()
    );
    const startOfWeekUtc = startOfDayUtc - ((new Date(now).getUTCDay() + 6) % 7) * 86400000;

    let daily = 0;
    let weekly = 0;
    for (const t of trades) {
      if (t.status === "open" || !t.exitAt) continue;
      const ms = Date.parse(t.exitAt);
      if (!Number.isFinite(ms)) continue;
      const group = computeMetrics([t], exitsMap).netPnl;
      if (ms >= startOfDayUtc) daily += group;
      if (ms >= startOfWeekUtc) weekly += group;
    }
    return { dailyNet: daily, weeklyNet: weekly };
  }, [trades, exitsMap]);

  const warnings = useMemo(
    () =>
      evaluateRiskGuards({
        dailyNetPnl: dailyNet,
        weeklyNetPnl: weeklyNet,
        dailyLossLimit: numOrNull(dailyLossLimit),
        weeklyLossLimit: numOrNull(weeklyLossLimit),
        consecutiveLosses: metrics.currentStreakType === "loss" ? metrics.currentStreak : 0,
        maxConsecutiveLosses: Number(maxConsecutiveLosses) || 0,
      }),
    [dailyNet, weeklyNet, dailyLossLimit, weeklyLossLimit, metrics, maxConsecutiveLosses]
  );

  if (accounts.length === 0) {
    return (
      <EmptyState icon={icons.risk} title="Add an account before planning a position">
        Position sizing is measured against account equity, so the calculator needs to know which
        account and which currency it is working in. Add an account in <strong>Data &amp; Settings</strong>{" "}
        first.
      </EmptyState>
    );
  }

  const quantity = position.quantity;
  const validInputs = position.errors.length === 0;

  return (
    <div className="stack">
      <Banner tone="info" title="This is arithmetic, not advice">
        TradeVault does not place orders and cannot tell you whether a trade will work. Everything
        below is a calculation from the numbers you type, in {currency}. Prices can gap past a stop
        loss, so the amount you actually lose can exceed the calculated risk.
      </Banner>

      {/* Account context ------------------------------------------- */}

      <section className="grid grid-4">
        <Stat
          label="Account equity"
          value={fmtMoney(equity, currency)}
          tone="plain"
          hint={primary ? `${primary.name} · starting balance plus adjustments` : undefined}
        />
        <Stat
          label="Net P&L today"
          value={fmtMoney(dailyNet, currency, { signed: true })}
          hint="Realised, from trades closed today (UTC)"
        />
        <Stat
          label="Net P&L this week"
          value={fmtMoney(weeklyNet, currency, { signed: true })}
          hint="Realised, since Monday (UTC)"
        />
        <Stat
          label="Current streak"
          value={
            metrics.currentStreak === 0
              ? NA
              : `${metrics.currentStreak} ${metrics.currentStreakType}${metrics.currentStreak === 1 ? "" : "s"}`
          }
          hint="Breakeven trades do not extend a streak"
        />
      </section>

      {/* Your limits ------------------------------------------------ */}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Your risk limits</div>
            <div className="card-desc">
              Rules you set for yourself. The app only reminds you they exist — it will not stop you
              trading, and it stores these on this device until the shared database is connected.
            </div>
          </div>
        </div>

        <div className="form-grid cols-4">
          <Field label={`Daily loss limit (${currency})`} htmlFor="risk-daily" hint="Blank means no limit set">
            <input
              id="risk-daily"
              className="input"
              inputMode="decimal"
              value={dailyLossLimit}
              onChange={(e) => setDailyLossLimit(e.target.value)}
              placeholder="e.g. 200"
            />
          </Field>
          <Field label={`Weekly loss limit (${currency})`} htmlFor="risk-weekly" hint="Blank means no limit set">
            <input
              id="risk-weekly"
              className="input"
              inputMode="decimal"
              value={weeklyLossLimit}
              onChange={(e) => setWeeklyLossLimit(e.target.value)}
              placeholder="e.g. 600"
            />
          </Field>
          <Field label="Max consecutive losses" htmlFor="risk-streak" hint="A reminder to step away and review">
            <input
              id="risk-streak"
              className="input"
              inputMode="numeric"
              value={maxConsecutiveLosses}
              onChange={(e) => setMaxConsecutiveLosses(e.target.value)}
            />
          </Field>
          <Field label="Default risk per trade (%)" htmlFor="risk-default" hint="Used to pre-fill the calculator">
            <input
              id="risk-default"
              className="input"
              inputMode="decimal"
              value={riskPercent}
              onChange={(e) => setRiskPercent(e.target.value)}
            />
          </Field>
        </div>

        <div className="stack-sm" style={{ marginTop: 14 }}>
          {warnings.map((w) => (
            <Banner
              key={w.code}
              tone={w.severity === "block" ? "danger" : w.severity === "warning" ? "warn" : "info"}
              title={w.severity === "block" ? "Limit reached" : w.severity === "warning" ? "Limit approaching" : "No limits hit"}
              icon={w.severity !== "info"}
            >
              {w.message}
              {w.severity === "block" ? (
                <>
                  {" "}
                  This is your own rule. Nothing here prevents you opening another trade, but the
                  records suggest the day is going the way the rule was written to catch.
                </>
              ) : null}
            </Banner>
          ))}
        </div>
      </section>

      {/* Position size ---------------------------------------------- */}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Position size calculator</div>
            <div className="card-desc">
              Sizes a position so that a stop-out loses the amount you chose. Quantity is rounded
              down, never up, so the risk never quietly exceeds your budget.
            </div>
          </div>
        </div>

        <div className="form-grid cols-3">
          <Field label="Direction" htmlFor="ps-direction">
            <div className="seg" role="group" aria-label="Direction">
              <button type="button" aria-pressed={direction === "long"} onClick={() => setDirection("long")}>
                Long
              </button>
              <button type="button" aria-pressed={direction === "short"} onClick={() => setDirection("short")}>
                Short
              </button>
            </div>
          </Field>
          <Field label="Entry price" required htmlFor="ps-entry">
            <input
              id="ps-entry"
              className="input"
              inputMode="decimal"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="1.08500"
            />
          </Field>
          <Field
            label="Stop-loss price"
            required
            htmlFor="ps-stop"
            hint={direction === "long" ? "Below the entry for a long" : "Above the entry for a short"}
          >
            <input
              id="ps-stop"
              className="input"
              inputMode="decimal"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(e.target.value)}
              placeholder="1.08200"
            />
          </Field>
        </div>

        <div className="form-grid cols-3" style={{ marginTop: 14 }}>
          <Field
            label="Risk per trade (%)"
            htmlFor="ps-pct"
            hint="Percentage of account equity"
          >
            <input
              id="ps-pct"
              className="input"
              inputMode="decimal"
              value={riskPercent}
              onChange={(e) => {
                setRiskPercent(e.target.value);
                // A percentage and a fixed amount are mutually exclusive; typing
                // one clears the other so the intent is never ambiguous.
                if (e.target.value !== "") setFixedRisk("");
              }}
            />
          </Field>
          <Field
            label={`Or fixed risk (${currency})`}
            htmlFor="ps-fixed"
            hint="Takes precedence over the percentage when set"
          >
            <input
              id="ps-fixed"
              className="input"
              inputMode="decimal"
              value={fixedRisk}
              onChange={(e) => {
                setFixedRisk(e.target.value);
                if (e.target.value !== "") setRiskPercent("");
              }}
              placeholder="Optional"
            />
          </Field>
          <Field label="Contract multiplier" required htmlFor="ps-mult" hint="1 for shares, 100000 for a standard FX lot">
            <input
              id="ps-mult"
              className="input"
              inputMode="decimal"
              value={contractMultiplier}
              onChange={(e) => setContractMultiplier(e.target.value)}
            />
          </Field>
        </div>

        <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
          <span className="hint">Quick risk:</span>
          {RISK_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setRiskPercent(String(p));
                setFixedRisk("");
              }}
            >
              {p}% of equity
            </button>
          ))}
        </div>

        {position.errors.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <Banner tone="warn" title="Nothing to calculate yet">
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {position.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Banner>
          </div>
        ) : (
          <div className="grid grid-4" style={{ marginTop: 16 }}>
            <Stat
              emphasis
              label="Position size"
              value={quantity === null ? NA : fmtNumber(quantity, { decimals: 4 })}
              tone="plain"
              hint="Units to open, rounded down"
            />
            <Stat
              label="Risk if stopped"
              value={position.actualRiskAmount === null ? NA : fmtMoney(position.actualRiskAmount, currency)}
              hint={
                equity > 0 && position.actualRiskAmount !== null
                  ? `${fmtPercent(position.actualRiskAmount / equity, { decimals: 2 })} of equity`
                  : undefined
              }
            />
            <Stat
              label="Stop distance"
              value={fmtNumber(position.stopDistance, { decimals: 5 })}
              tone="plain"
              hint={`Risk per unit ${fmtNumber(position.riskPerUnit, { decimals: 5 })}`}
            />
            <Stat
              label="Notional value"
              value={position.notionalValue === null ? NA : fmtMoney(position.notionalValue, currency)}
              tone="plain"
              hint="Position value at the entry price"
            />
          </div>
        )}

        {/* Reward-to-risk ------------------------------------------ */}

        <div className="form-grid cols-2" style={{ marginTop: 18 }}>
          <Field label="Take-profit price" htmlFor="ps-target" hint="Optional. Adds the reward-to-risk calculation.">
            <input
              id="ps-target"
              className="input"
              inputMode="decimal"
              value={takeProfitPrice}
              onChange={(e) => setTakeProfitPrice(e.target.value)}
              placeholder="1.09400"
            />
          </Field>
          <div />
        </div>

        {reward.errors.length > 0 && takeProfitPrice.trim() !== "" ? (
          <div style={{ marginTop: 12 }}>
            <Banner tone="warn" title="Cannot compute reward-to-risk">
              {reward.errors.join(" ")}
            </Banner>
          </div>
        ) : null}

        {reward.ratio !== null ? (
          <div className="grid grid-3" style={{ marginTop: 14 }}>
            <Stat
              label="Reward-to-risk"
              value={`${fmtNumber(reward.ratio, { decimals: 2 })} : 1`}
              tone="plain"
              hint={`Risking ${fmtMoney(reward.riskAmount ?? null, currency)} to make ${fmtMoney(reward.rewardAmount ?? null, currency)}`}
            />
            <Stat
              label="Break-even win rate"
              value={fmtPercent(reward.breakEvenWinRate, { decimals: 1 })}
              tone="plain"
              hint="Before costs. Win less than this and the pattern loses money."
            />
            <Stat
              label="Your actual win rate"
              value={fmtPercent(metrics.winRate, { decimals: 1 })}
              hint={
                metrics.closedTrades === 0
                  ? "No closed trades to compare against yet"
                  : `Across ${metrics.closedTrades} closed trade${metrics.closedTrades === 1 ? "" : "s"}`
              }
            />
          </div>
        ) : null}

        {validInputs && reward.ratio !== null && metrics.winRate !== null ? (
          <div className="hint" style={{ marginTop: 12 }}>
            Your recorded win rate is {fmtPercent(metrics.winRate, { decimals: 1 })}. At{" "}
            {fmtNumber(reward.ratio, { decimals: 2 })}:1 this pattern needs{" "}
            {fmtPercent(reward.breakEvenWinRate, { decimals: 1 })} to break even before costs, so the
            arithmetic is{" "}
            <strong className={signClass(metrics.winRate - (reward.breakEvenWinRate ?? 0))}>
              {metrics.winRate >= (reward.breakEvenWinRate ?? 0) ? "in your favour" : "against you"}
            </strong>{" "}
            on this sample. A small sample can flip that conclusion, so treat it as one input among
            several.
          </div>
        ) : null}
      </section>

      {/* Assumptions ----------------------------------------------- */}

      {validInputs ? (
        <section className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>
            How this was calculated
          </div>
          <ul style={{ margin: 0, paddingLeft: 20 }} className="hint">
            {position.assumptions.map((a) => (
              <li key={a} style={{ marginBottom: 6 }}>
                {a}
              </li>
            ))}
            <li style={{ marginBottom: 6 }}>
              P&amp;L figures are in {currency}, the currency of{" "}
              {primary?.name ?? "your reporting account"}. TradeVault will not convert currencies
              without a dated exchange rate.
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Parse an optional numeric input, treating blank as "not set". */
function numOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
