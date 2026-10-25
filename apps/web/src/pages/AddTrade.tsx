/**
 * Add / edit a trade.
 *
 * The form computes nothing itself: as you type, it builds a temporary `Trade`
 * and runs the same `computeTrade` the rest of the app uses, then shows the
 * result. That way the preview you see while entering a trade cannot disagree
 * with the number that appears on the dashboard afterwards.
 *
 * An open trade is saved with no exit, and the form says plainly that it will
 * not count towards realised performance until it closes.
 */

import { useMemo, useState } from "react";
import {
  ASSET_CLASSES,
  EMOTIONS,
  TRADING_SESSIONS,
  computeTrade,
  deriveStatus,
  generateId,
  type AssetClass,
  type Emotion,
  type Trade,
  type TradeDirection,
  type TradingSession,
} from "@tradevault/core";
import { useApp, useDerived, runSave } from "../lib/appContext";
import { Banner, Field, Icon, icons } from "../components/ui";
import { fmtMoney, fmtNumber, fmtPercent, fmtPrice, fmtR, humanise, NA, signClass } from "../components/format";
import type { PageId } from "../navigation";

type Mode = "open" | "closed";

export function AddTradePage({ onDone }: { onDone: () => void }) {
  const { store, reload, isSampleData } = useApp();
  const { accounts, strategies } = useDerived();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("closed");

  const [symbol, setSymbol] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("forex");
  const [market, setMarket] = useState("");
  const [direction, setDirection] = useState<TradeDirection>("long");
  const [orderType, setOrderType] = useState<Trade["orderType"]>("market");
  const [session, setSession] = useState<TradingSession>("london");
  const [strategyId, setStrategyId] = useState("");

  const [entryAt, setEntryAt] = useState(() => toLocalInputValue(new Date()));
  const [entryPrice, setEntryPrice] = useState("");
  const [exitAt, setExitAt] = useState(() => toLocalInputValue(new Date()));
  const [exitPrice, setExitPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [contractMultiplier, setContractMultiplier] = useState("1");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const [entryFees, setEntryFees] = useState("0");
  const [exitFees, setExitFees] = useState("0");
  const [fundingFees, setFundingFees] = useState("0");
  const [slippage, setSlippage] = useState("0");

  const [entryReason, setEntryReason] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [emotionBefore, setEmotionBefore] = useState<Emotion | "">("");
  const [emotionDuring, setEmotionDuring] = useState<Emotion | "">("");
  const [emotionAfter, setEmotionAfter] = useState<Emotion | "">("");
  const [mistakes, setMistakes] = useState("");
  const [lessons, setLessons] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "USD";

  /**
   * A throwaway trade built from the current form values, so the live preview
   * uses the real engine rather than a second implementation that can drift.
   */
  const preview = useMemo(() => {
    const draft: Trade = {
      id: "preview",
      userId: null,
      accountId,
      strategyId: strategyId || null,
      symbol: symbol.toUpperCase() || "—",
      assetClass,
      market: market || undefined,
      direction,
      status: mode === "closed" ? "closed" : "open",
      orderType,
      entryAt: fromLocalInputValue(entryAt),
      entryPrice: entryPrice || "0",
      exitAt: mode === "closed" ? fromLocalInputValue(exitAt) : null,
      exitPrice: mode === "closed" && exitPrice ? exitPrice : null,
      quantity: quantity || "0",
      contractMultiplier: contractMultiplier || "1",
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      entryFees: entryFees || "0",
      exitFees: exitFees || "0",
      fundingFees: fundingFees || "0",
      slippage: slippage || "0",
      session,
      manualNetPnl: null,
      importFingerprint: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 0,
      deletedAt: null,
    };

    // The preview models the trade as a single exit at the exit price, which is
    // exactly what will be written when the form is submitted.
    const exits =
      mode === "closed" && exitPrice
        ? [
            {
              id: "preview-exit",
              userId: null,
              tradeId: "preview",
              quantity: quantity || "0",
              price: exitPrice,
              fees: "0",
              exitedAt: fromLocalInputValue(exitAt),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              revision: 0,
              deletedAt: null,
            },
          ]
        : [];

    return { trade: draft, exits, comp: computeTrade(draft, exits) };
  }, [
    accountId, strategyId, symbol, assetClass, market, direction, mode, orderType,
    entryAt, entryPrice, exitAt, exitPrice, quantity, contractMultiplier,
    stopLoss, takeProfit, entryFees, exitFees, fundingFees, slippage, session,
  ]);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!accountId) next.accountId = "Choose an account.";
    if (!symbol.trim()) next.symbol = "A symbol is required, e.g. EURUSD.";
    if (symbol.trim() && !/^[A-Za-z0-9./:_-]{1,24}$/.test(symbol.trim())) {
      next.symbol = "Use letters, digits and . / : _ - only.";
    }

    const entry = Number(entryPrice);
    if (!entryPrice.trim()) next.entryPrice = "Entry price is required.";
    else if (!Number.isFinite(entry) || entry <= 0) next.entryPrice = "Entry price must be greater than zero.";

    const qty = Number(quantity);
    if (!quantity.trim()) next.quantity = "Quantity is required.";
    else if (!Number.isFinite(qty) || qty <= 0) next.quantity = "Quantity must be greater than zero.";

    const mult = Number(contractMultiplier);
    if (!contractMultiplier.trim()) next.contractMultiplier = "A multiplier is required. Use 1 if unsure.";
    else if (!Number.isFinite(mult) || mult <= 0) next.contractMultiplier = "Multiplier must be greater than zero.";

    if (mode === "closed") {
      const exit = Number(exitPrice);
      if (!exitPrice.trim()) next.exitPrice = "An exit price is required to close a trade.";
      else if (!Number.isFinite(exit) || exit <= 0) next.exitPrice = "Exit price must be greater than zero.";

      const entryMs = Date.parse(fromLocalInputValue(entryAt));
      const exitMs = Date.parse(fromLocalInputValue(exitAt));
      if (Number.isFinite(entryMs) && Number.isFinite(exitMs) && exitMs < entryMs) {
        next.exitAt = "The exit cannot be before the entry.";
      }
    }

    if (!Number.isFinite(Date.parse(fromLocalInputValue(entryAt)))) {
      next.entryAt = "Entry time is not a valid date and time.";
    }

    for (const [key, value] of Object.entries({ stopLoss, takeProfit, entryFees, exitFees, fundingFees, slippage })) {
      if (!value.trim()) continue;
      const n = Number(value);
      if (!Number.isFinite(n)) {
        next[key] = "Not a valid number.";
      } else if (key !== "stopLoss" && key !== "takeProfit" && n < 0) {
        next[key] = "Fees and slippage cannot be negative. Use a negative P&L adjustment instead.";
      } else if ((key === "stopLoss" || key === "takeProfit") && n <= 0) {
        next[key] = "Prices must be greater than zero.";
      }
    }

    if (stopLoss && entry && Number(stopLoss) === entry) {
      next.stopLoss = "A stop loss equal to the entry price would risk nothing (and R would be undefined).";
    }

    // A stop on the wrong side is almost always a typo worth catching.
    if (stopLoss && entry) {
      const stop = Number(stopLoss);
      if (direction === "long" && stop > entry) {
        next.stopLoss = "For a long trade the stop loss should be below the entry price.";
      } else if (direction === "short" && stop < entry) {
        next.stopLoss = "For a short trade the stop loss should be above the entry price.";
      }
    }
    if (takeProfit && entry) {
      const target = Number(takeProfit);
      if (direction === "long" && target < entry) {
        next.takeProfit = "For a long trade the take profit should be above the entry price.";
      } else if (direction === "short" && target > entry) {
        next.takeProfit = "For a short trade the take profit should be below the entry price.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save(andAnother: boolean) {
    setFormError(null);
    setSavedMessage(null);
    if (!validate()) {
      setFormError("Some fields need attention. Anything flagged below is marked in the form.");
      return;
    }

    setBusy(true);

    const id = generateId();
    const exitAtIso = fromLocalInputValue(exitAt);

    // 1. The trade itself.
    const tradeResult = await runSave(() =>
      store.createTrade({
        id,
        accountId,
        strategyId: strategyId || null,
        symbol: symbol.trim().toUpperCase(),
        assetClass,
        market: market.trim() || undefined,
        direction,
        status: mode === "closed" ? "closed" : "open",
        orderType,
        entryAt: fromLocalInputValue(entryAt),
        entryPrice,
        exitAt: mode === "closed" ? exitAtIso : null,
        exitPrice: mode === "closed" ? exitPrice : null,
        quantity,
        contractMultiplier,
        stopLoss: stopLoss.trim() || null,
        takeProfit: takeProfit.trim() || null,
        entryFees: entryFees || "0",
        exitFees: exitFees || "0",
        fundingFees: fundingFees || "0",
        slippage: slippage || "0",
        strategy: strategies.find((s) => s.id === strategyId)?.name,
        session,
        entryReason: entryReason.trim() || undefined,
        exitReason: mode === "closed" ? exitReason.trim() || undefined : undefined,
        emotionBefore: emotionBefore || undefined,
        emotionDuring: emotionDuring || undefined,
        emotionAfter: mode === "closed" ? emotionAfter || undefined : undefined,
        mistakes: mistakes.trim() || undefined,
        lessons: lessons.trim() || undefined,
        notes: notes.trim() || undefined,
        manualNetPnl: null,
        importFingerprint: null,
      })
    );

    if (!tradeResult.ok) {
      setBusy(false);
      setFormError(tradeResult.error);
      return;
    }

    // 2. The closing exit, if this is a closed trade. Recorded as a real exit
    //    row so the trade's P&L is computed the same way as any other.
    if (mode === "closed") {
      const exitResult = await runSave(() =>
        store.createExit({
          tradeId: id,
          quantity,
          price: exitPrice,
          fees: exitFees || "0",
          exitedAt: exitAtIso,
          notes: exitReason.trim() || undefined,
        })
      );
      if (!exitResult.ok) {
        setBusy(false);
        setFormError(
          `The trade was saved, but its closing exit could not be recorded: ${exitResult.error} ` +
            `Open the trade in the Trades list and add the exit there.`
        );
        await reload();
        return;
      }
    }

    setBusy(false);
    await reload();

    if (andAnother) {
      setSavedMessage(`${symbol.toUpperCase()} saved. The form has been cleared for the next trade.`);
      clearTradeFields();
    } else {
      onDone();
    }
  }

  function clearTradeFields() {
    setSymbol("");
    setEntryPrice("");
    setExitPrice("");
    setQuantity("");
    setStopLoss("");
    setTakeProfit("");
    setEntryFees("0");
    setExitFees("0");
    setFundingFees("0");
    setSlippage("0");
    setEntryReason("");
    setExitReason("");
    setMistakes("");
    setLessons("");
    setNotes("");
    setEmotionBefore("");
    setEmotionDuring("");
    setEmotionAfter("");
    setErrors({});
  }

  if (accounts.length === 0) {
    return (
      <Banner tone="warn" title="Add an account before recording a trade">
        A trade must belong to an account, because the account's currency and starting balance are
        what its return is measured against. Open <strong>Data &amp; Settings</strong> to add one.
      </Banner>
    );
  }

  const { comp } = preview;
  const realised = mode === "closed";

  return (
    <div className="stack">
      {isSampleData ? (
        <Banner tone="warn" title="Offline mode">
          Anything you save here stays in this browser. It is real data you entered — but it will not
          reach another device until the shared database is configured.
        </Banner>
      ) : null}

      {savedMessage ? (
        <Banner tone="accent" title="Saved">
          {savedMessage}
        </Banner>
      ) : null}

      {formError ? (
        <Banner tone="danger" title="Could not save this trade">
          {formError}
        </Banner>
      ) : null}

      {/* Live preview ---------------------------------------------- */}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Live calculation</div>
            <div className="card-desc">
              Computed from the values below by the same engine that powers your dashboard. Nothing
              is saved until you press Save.
            </div>
          </div>
        </div>
        <div className="grid grid-4">
          <div className="stat">
            <div className="stat-label">Net P&amp;L</div>
            <div className={`stat-value ${realised ? signClass(comp.netPnl) : ""}`}>
              {realised ? fmtMoney(comp.netPnl, currency, { signed: true }) : "Unrealised"}
            </div>
            <div className="stat-hint">
              {realised
                ? `Gross ${fmtMoney(comp.grossPnl, currency, { signed: true })} less ${fmtMoney(comp.costs.total, currency)} costs`
                : "Open trades never count towards realised performance"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">R multiple</div>
            <div className="stat-value sm">{fmtR(comp.rMultiple)}</div>
            <div className="stat-hint">
              {comp.initialRisk === null
                ? "Add a stop loss to measure risk"
                : comp.initialRisk === 0
                  ? "Stop loss equals entry, so risk is zero"
                  : `Risking ${fmtMoney(comp.initialRisk, currency)} if the stop is hit`}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Price movement</div>
            <div className="stat-value sm">
              {entryPrice && (realised ? exitPrice : "") ? (
                <span className={signClass(direction === "long" ? Number(exitPrice) - Number(entryPrice) : Number(entryPrice) - Number(exitPrice))}>
                  {fmtNumber(direction === "long" ? Number(exitPrice) - Number(entryPrice) : Number(entryPrice) - Number(exitPrice), { decimals: 5, signed: true })}
                </span>
              ) : (
                <span className="na">{NA}</span>
              )}
            </div>
            <div className="stat-hint">
              {entryPrice ? `Entry ${fmtPrice(entryPrice)}` : "Enter a price"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Total costs</div>
            <div className="stat-value sm">{fmtMoney(comp.costs.total, currency)}</div>
            <div className="stat-hint">
              Entry {fmtMoney(comp.costs.entryFees, currency)} · exit {fmtMoney(comp.costs.exitFees, currency)} · other{" "}
              {fmtMoney(comp.costs.fundingFees + comp.costs.slippage, currency)}
            </div>
          </div>
        </div>

        {comp.plannedRewardRisk !== null ? (
          <div className="hint" style={{ marginTop: 12 }}>
            The target implies a planned reward-to-risk of{" "}
            <strong>{fmtNumber(comp.plannedRewardRisk, { decimals: 2 })}:1</strong>, which needs a win
            rate above <strong>{fmtPercent(1 / (1 + comp.plannedRewardRisk), { decimals: 1 })}</strong> to
            break even before costs. That is arithmetic, not a prediction.
          </div>
        ) : null}
      </section>

      {/* Form ------------------------------------------------------- */}

      <section className="card">
        <div className="form-section-title">Trade</div>
        <div className="form-grid cols-3">
          <Field label="Account" required error={errors.accountId} htmlFor="f-account">
            <select id="f-account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Symbol" required error={errors.symbol} htmlFor="f-symbol" hint="EURUSD, AAPL, BTCUSDT…">
            <input
              id="f-symbol"
              className={`input${errors.symbol ? "" : ""}`}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="EURUSD"
              aria-invalid={Boolean(errors.symbol)}
            />
          </Field>

          <Field label="Asset class" htmlFor="f-asset">
            <select id="f-asset" className="select" value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {ASSET_CLASSES.map((a) => (
                <option key={a} value={a}>
                  {humanise(a)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="form-grid cols-3" style={{ marginTop: 14 }}>
          <Field label="Direction" htmlFor="f-direction">
            <div className="seg" role="group" aria-label="Direction">
              <button type="button" aria-pressed={direction === "long"} onClick={() => setDirection("long")}>
                Long
              </button>
              <button type="button" aria-pressed={direction === "short"} onClick={() => setDirection("short")}>
                Short
              </button>
            </div>
          </Field>

          <Field label="Order type" htmlFor="f-order">
            <select id="f-order" className="select" value={orderType} onChange={(e) => setOrderType(e.target.value as Trade["orderType"])}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
              <option value="stop_limit">Stop limit</option>
            </select>
          </Field>

          <Field label="Session" htmlFor="f-session">
            <select id="f-session" className="select" value={session} onChange={(e) => setSession(e.target.value as TradingSession)}>
              {TRADING_SESSIONS.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="form-grid cols-2" style={{ marginTop: 14 }}>
          <Field label="Strategy" htmlFor="f-strategy" hint="Optional. Strategies let you compare playbooks.">
            <select id="f-strategy" className="select" value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
              <option value="">Not assigned</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Market" htmlFor="f-market" hint="Optional. FX, Metals, Equities…">
            <input id="f-market" className="input" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="FX" />
          </Field>
        </div>

        {/* Status --------------------------------------------------- */}

        <div className="form-section" style={{ marginTop: 18 }}>
          <div className="form-section-title">Outcome</div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
            <div className="seg" role="group" aria-label="Trade outcome">
              <button type="button" aria-pressed={mode === "closed"} onClick={() => setMode("closed")}>
                Closed — I have an exit
              </button>
              <button type="button" aria-pressed={mode === "open"} onClick={() => setMode("open")}>
                Open — still running
              </button>
            </div>
            {mode === "open" ? (
              <span className="hint">
                Saved without an exit. It appears in your open positions and is excluded from win
                rate, profit factor and the equity curve.
              </span>
            ) : null}
          </div>

          <div className="form-grid cols-3">
            <Field label="Entry time" required error={errors.entryAt} htmlFor="f-entryat">
              <input id="f-entryat" className="input" type="datetime-local" value={entryAt} onChange={(e) => setEntryAt(e.target.value)} />
            </Field>
            <Field label="Entry price" required error={errors.entryPrice} htmlFor="f-entryprice">
              <input
                id="f-entryprice"
                className="input"
                inputMode="decimal"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="1.08500"
                aria-invalid={Boolean(errors.entryPrice)}
              />
            </Field>
            <Field label="Quantity" required error={errors.quantity} htmlFor="f-quantity" hint="Lots, shares or contracts">
              <input
                id="f-quantity"
                className="input"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                aria-invalid={Boolean(errors.quantity)}
              />
            </Field>
          </div>

          <div className="form-grid cols-3" style={{ marginTop: 14 }}>
            <Field
              label="Exit time"
              required={mode === "closed"}
              error={errors.exitAt}
              htmlFor="f-exitat"
              hint={mode === "open" ? "Not needed for an open trade" : undefined}
            >
              <input
                id="f-exitat"
                className="input"
                type="datetime-local"
                value={exitAt}
                onChange={(e) => setExitAt(e.target.value)}
                disabled={mode === "open"}
              />
            </Field>
            <Field label="Exit price" required={mode === "closed"} error={errors.exitPrice} htmlFor="f-exitprice">
              <input
                id="f-exitprice"
                className="input"
                inputMode="decimal"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="1.09120"
                disabled={mode === "open"}
                aria-invalid={Boolean(errors.exitPrice)}
              />
            </Field>
            <Field label="Contract multiplier" required error={errors.contractMultiplier} htmlFor="f-mult" hint="1 for shares, 100000 for a standard FX lot">
              <input
                id="f-mult"
                className="input"
                inputMode="decimal"
                value={contractMultiplier}
                onChange={(e) => setContractMultiplier(e.target.value)}
                aria-invalid={Boolean(errors.contractMultiplier)}
              />
            </Field>
          </div>

          <div className="form-grid cols-2" style={{ marginTop: 14 }}>
            <Field label="Stop loss" error={errors.stopLoss} htmlFor="f-stop" hint="Needed to measure R. Leave blank if you did not use one.">
              <input id="f-stop" className="input" inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="1.08200" />
            </Field>
            <Field label="Take profit" error={errors.takeProfit} htmlFor="f-target">
              <input id="f-target" className="input" inputMode="decimal" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="1.09400" />
            </Field>
          </div>
        </div>

        {/* Costs ---------------------------------------------------- */}

        <div className="form-section">
          <div className="form-section-title">Costs</div>
          <div className="hint" style={{ marginBottom: 12 }}>
            Everything here is subtracted from gross P&amp;L in {currency}. Leave a field at 0 if the
            cost did not apply — recording costs is what makes the net figure trustworthy.
          </div>
          <div className="form-grid cols-4">
            <Field label={`Entry fees (${currency})`} error={errors.entryFees} htmlFor="f-entryfees">
              <input id="f-entryfees" className="input" inputMode="decimal" value={entryFees} onChange={(e) => setEntryFees(e.target.value)} />
            </Field>
            <Field label={`Exit fees (${currency})`} error={errors.exitFees} htmlFor="f-exitfees" hint="Commission on the closing leg">
              <input id="f-exitfees" className="input" inputMode="decimal" value={exitFees} onChange={(e) => setExitFees(e.target.value)} />
            </Field>
            <Field label={`Funding / swap (${currency})`} error={errors.fundingFees} htmlFor="f-funding" hint="Overnight financing">
              <input id="f-funding" className="input" inputMode="decimal" value={fundingFees} onChange={(e) => setFundingFees(e.target.value)} />
            </Field>
            <Field label={`Slippage (${currency})`} error={errors.slippage} htmlFor="f-slippage" hint="Cost of a worse-than-intended fill">
              <input id="f-slippage" className="input" inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Review --------------------------------------------------- */}

        <div className="form-section">
          <div className="form-section-title">Review</div>

          <div className="form-grid cols-4">
            <Field label="Emotion before" htmlFor="f-emo-before">
              <select id="f-emo-before" className="select" value={emotionBefore} onChange={(e) => setEmotionBefore(e.target.value as Emotion | "")}>
                <option value="">Not recorded</option>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>{humanise(e)}</option>
                ))}
              </select>
            </Field>
            <Field label="Emotion during" htmlFor="f-emo-during">
              <select id="f-emo-during" className="select" value={emotionDuring} onChange={(e) => setEmotionDuring(e.target.value as Emotion | "")}>
                <option value="">Not recorded</option>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>{humanise(e)}</option>
                ))}
              </select>
            </Field>
            <Field label="Emotion after" htmlFor="f-emo-after">
              <select id="f-emo-after" className="select" value={emotionAfter} onChange={(e) => setEmotionAfter(e.target.value as Emotion | "")} disabled={mode === "open"}>
                <option value="">Not recorded</option>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>{humanise(e)}</option>
                ))}
              </select>
            </Field>
            <div />
          </div>

          <div className="form-grid cols-2" style={{ marginTop: 14 }}>
            <Field label="Why I entered" htmlFor="f-entryreason" hint="The reason that was true at the time, not the one you know now.">
              <textarea id="f-entryreason" className="textarea" value={entryReason} onChange={(e) => setEntryReason(e.target.value)} />
            </Field>
            <Field label="Why I exited" htmlFor="f-exitreason">
              <textarea id="f-exitreason" className="textarea" value={exitReason} onChange={(e) => setExitReason(e.target.value)} disabled={mode === "open"} />
            </Field>
          </div>

          <div className="form-grid cols-2" style={{ marginTop: 14 }}>
            <Field label="Mistakes" htmlFor="f-mistakes">
              <textarea id="f-mistakes" className="textarea" value={mistakes} onChange={(e) => setMistakes(e.target.value)} />
            </Field>
            <Field label="Lessons" htmlFor="f-lessons">
              <textarea id="f-lessons" className="textarea" value={lessons} onChange={(e) => setLessons(e.target.value)} />
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <Field label="Notes" htmlFor="f-notes">
              <textarea id="f-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onDone} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void save(true)} disabled={busy}>
            {busy ? "Saving…" : "Save & add another"}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save(false)} disabled={busy}>
            <Icon path={icons.check} />
            {busy ? "Saving…" : "Save trade"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Format a Date for a datetime-local input, in the browser's own zone. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convert a datetime-local value to an absolute UTC timestamp.
 *
 * The browser's `new Date("2026-02-02T14:20")` already interprets the string in
 * the local zone, which is what the user typed, and `.toISOString()` makes it
 * absolute. Storing local wall-clock time as if it were UTC would silently shift
 * every trade by the user's offset.
 */
function fromLocalInputValue(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export { deriveStatus };
export type { PageId };
