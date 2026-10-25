/**
 * Trade-level P&L calculation.
 *
 * Documented decisions (spec section 9):
 *
 * 1. Gross P&L is computed per closing leg, so partial exits are priced
 *    independently at the price each leg actually closed at.
 * 2. Costs (entry fees, exit fees, funding, slippage) are subtracted to give
 *    net P&L. The gross figure always excludes costs.
 * 3. P&L is signed in the instrument's profit currency. Currency conversion is
 *    an explicit separate step (src/lib/fx.ts) and is never applied implicitly.
 * 4. An OPEN trade has realised P&L equal to the legs closed so far. Remaining
 *    quantity is unrealised and is never counted as realised.
 * 5. `manualNetPnl`, when set, wins for display, but the computed value is
 *    always retained so the UI can surface the discrepancy.
 */

import {
  isFiniteNumber,
  multiplyExact,
  safeDivide,
  subtractExact,
  sumExact,
  toNumber,
  toNumberOrZero,
} from "./decimal";
import type { Trade, TradeExit } from "./types";

export interface TradeCosts {
  entryFees: number;
  exitFees: number;
  fundingFees: number;
  slippage: number;
  total: number;
}

export interface TradeComputation {
  quantity: number;
  closedQuantity: number;
  openQuantity: number;
  isFullyClosed: boolean;

  grossPnl: number;
  costs: TradeCosts;
  netPnl: number;
  manualNetPnl: number | null;
  effectiveNetPnl: number;

  averageExitPrice: number | null;

  initialRisk: number | null;
  rMultiple: number | null;
  plannedRewardRisk: number | null;

  holdingMs: number | null;
}

export const QUANTITY_TOLERANCE = 1e-9;

/** Signed price movement in the trade's favour. */
export function priceDelta(
  direction: Trade["direction"],
  entryPrice: number,
  exitPrice: number
): number {
  return direction === "long"
    ? subtractExact(exitPrice, entryPrice)
    : subtractExact(entryPrice, exitPrice);
}

/**
 * Gross P&L for a single closing leg.
 * long:  (exit - entry) x qty x multiplier
 * short: (entry - exit) x qty x multiplier
 */
export function grossPnlForLeg(
  direction: Trade["direction"],
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  multiplier: number
): number {
  return multiplyExact(
    multiplyExact(priceDelta(direction, entryPrice, exitPrice), quantity),
    multiplier
  );
}

/** Sum all costs attached to a trade (trade-level plus per-exit). */
export function computeCosts(trade: Trade, exits: TradeExit[]): TradeCosts {
  const entryFees = toNumberOrZero(trade.entryFees);
  const tradeExitFees = toNumberOrZero(trade.exitFees);
  const fundingFees = toNumberOrZero(trade.fundingFees);
  const slippage = toNumberOrZero(trade.slippage);
  const legFees = sumExact(
    exits.filter((e) => !e.deletedAt).map((e) => toNumberOrZero(e.fees))
  );

  return {
    entryFees,
    exitFees: sumExact([tradeExitFees, legFees]),
    fundingFees,
    slippage,
    total: sumExact([entryFees, tradeExitFees, legFees, fundingFees, slippage]),
  };
}

/** The single source of truth for a trade's numbers. Pure and deterministic. */
export function computeTrade(trade: Trade, exits: TradeExit[] = []): TradeComputation {
  const quantity = toNumberOrZero(trade.quantity);
  const entryPrice = toNumber(trade.entryPrice);
  const multiplier = toNumber(trade.contractMultiplier) ?? 1;

  const liveExits = exits.filter((e) => !e.deletedAt);
  const closedQuantity = sumExact(liveExits.map((e) => toNumberOrZero(e.quantity)));
  const openQuantity = Math.max(0, subtractExact(quantity, closedQuantity));
  const isFullyClosed = quantity > 0 && closedQuantity >= quantity - QUANTITY_TOLERANCE;

  let grossPnl = 0;
  if (entryPrice !== null) {
    grossPnl = sumExact(
      liveExits.map((e) => {
        const p = toNumber(e.price);
        if (p === null) return 0;
        return grossPnlForLeg(
          trade.direction,
          entryPrice,
          p,
          toNumberOrZero(e.quantity),
          multiplier
        );
      })
    );
  }

  const costs = computeCosts(trade, liveExits);
  const netPnl = subtractExact(grossPnl, costs.total);
  const manualNetPnl = toNumber(trade.manualNetPnl);

  let averageExitPrice: number | null = null;
  if (closedQuantity > QUANTITY_TOLERANCE) {
    const weighted = sumExact(
      liveExits.map((e) => multiplyExact(toNumberOrZero(e.quantity), toNumber(e.price) ?? 0))
    );
    averageExitPrice = safeDivide(weighted, closedQuantity);
  }

  let initialRisk: number | null = null;
  const stopLoss = toNumber(trade.stopLoss);
  if (entryPrice !== null && stopLoss !== null && quantity > 0) {
    const riskPerUnit = Math.abs(priceDelta(trade.direction, entryPrice, stopLoss));
    initialRisk = multiplyExact(multiplyExact(riskPerUnit, quantity), multiplier);
  }

  // R-multiple is only meaningful for a fully closed trade with real risk.
  let rMultiple: number | null = null;
  if (isFullyClosed && isFiniteNumber(initialRisk) && initialRisk > QUANTITY_TOLERANCE) {
    rMultiple = safeDivide(netPnl, initialRisk);
  }

  let plannedRewardRisk: number | null = null;
  const takeProfit = toNumber(trade.takeProfit);
  if (entryPrice !== null && stopLoss !== null && takeProfit !== null) {
    const risk = Math.abs(priceDelta(trade.direction, entryPrice, stopLoss));
    const reward = Math.abs(priceDelta(trade.direction, entryPrice, takeProfit));
    plannedRewardRisk = safeDivide(multiplyExact(reward, multiplier), multiplyExact(risk, multiplier));
  }

  // Holding duration runs from entry to the last realised exit. We prefer the
  // latest exit's own timestamp because that is the ground truth of when the
  // position actually closed; trade.exitAt is only a fallback for trades with
  // no recorded exits.
  let holdingMs: number | null = null;
  const entryMs = Date.parse(trade.entryAt);
  if (Number.isFinite(entryMs)) {
    let closeMs = NaN;
    if (trade.exitAt) closeMs = Date.parse(trade.exitAt);
    for (const e of liveExits) {
      const ms = Date.parse(e.exitedAt);
      if (Number.isFinite(ms) && (!Number.isFinite(closeMs) || ms > closeMs)) {
        closeMs = ms;
      }
    }
    if (Number.isFinite(closeMs)) {
      holdingMs = Math.max(0, closeMs - entryMs);
    }
  }

  return {
    quantity,
    closedQuantity,
    openQuantity,
    isFullyClosed,
    grossPnl,
    costs,
    netPnl,
    manualNetPnl,
    effectiveNetPnl: manualNetPnl ?? netPnl,
    averageExitPrice,
    initialRisk,
    rMultiple,
    plannedRewardRisk,
    holdingMs,
  };
}

/** Validate that exits never close more than the opened quantity. */
export function validateExits(trade: Trade, exits: TradeExit[]): string[] {
  const errors: string[] = [];
  const quantity = toNumberOrZero(trade.quantity);
  const liveExits = exits.filter((e) => !e.deletedAt);
  const closed = sumExact(liveExits.map((e) => toNumberOrZero(e.quantity)));

  if (closed > quantity + QUANTITY_TOLERANCE) {
    errors.push(
      `Total closed quantity (${closed}) exceeds opened quantity (${quantity}).`
    );
  }

  liveExits.forEach((e, i) => {
    const q = toNumber(e.quantity);
    if (q === null || q <= 0) {
      errors.push(`Exit ${i + 1}: quantity must be greater than zero.`);
    }
    if (toNumber(e.price) === null) {
      errors.push(`Exit ${i + 1}: price is required.`);
    }
  });

  return errors;
}

/**
 * Derive a trade's status from its exits and lifecycle fields.
 * Keeps status consistent with reality instead of trusting stale input.
 */
export function deriveStatus(trade: Pick<Trade, "quantity">, exits: TradeExit[]): Trade["status"] {
  const comp = computeTrade({ ...(trade as Trade) }, exits);
  if (comp.closedQuantity <= QUANTITY_TOLERANCE) return "open";
  return comp.isFullyClosed ? "closed" : "partial";
}
