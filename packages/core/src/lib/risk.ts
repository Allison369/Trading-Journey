/**
 * Risk and position-size calculator.
 *
 * This module performs arithmetic only. It never places an order, never
 * predicts a market direction, and never asserts that a position is "safe".
 * It reports what the numbers imply given the inputs and states its
 * assumptions so the trader can judge them.
 */

import {
  multiplyExact,
  round,
  safeDivide,
  subtractExact,
  toNumber,
  toNumberOrZero,
} from "../domain/decimal";
import type { Trade } from "../domain/types";

export interface PositionSizeInput {
  /** Account equity in the account's currency. */
  accountEquity: number;
  /** Either a percentage of equity... */
  riskPercent?: number | null;
  /** ...or a fixed monetary amount. The fixed amount takes precedence. */
  fixedRiskAmount?: number | null;
  entryPrice: number;
  stopLossPrice: number;
  /** Multiplier applied to (price x quantity). */
  contractMultiplier: number;
  /** Round the result down to this increment. 0 disables rounding. */
  quantityStep?: number | null;
  /** Per-unit or flat round-trip cost to set aside, if known. */
  estimatedFees?: number | null;
}

export interface PositionSizeResult {
  /** Monetary amount the trader intends to lose if the stop is hit. */
  riskAmount: number;
  riskPercentOfEquity: number | null;
  /** Absolute price distance from entry to stop. */
  stopDistance: number;
  /** Loss per one unit of quantity, including the multiplier. */
  riskPerUnit: number;
  /** Raw size before any step rounding. Null when it cannot be computed. */
  rawQuantity: number | null;
  /** Size rounded down to the nearest quantity step. */
  quantity: number | null;
  /** Actual risk implied by the rounded quantity. */
  actualRiskAmount: number | null;
  /** Notional position value at the entry price. */
  notionalValue: number | null;
  /** Assumptions and caveats, always shown alongside the result. */
  assumptions: string[];
  errors: string[];
}

/**
 * Calculate a position size from a monetary risk budget and a stop distance.
 *
 * The core relationship is:
 *   riskAmount = |entry - stop| x quantity x multiplier
 * therefore:
 *   quantity   = riskAmount / (|entry - stop| x multiplier)
 */
export function calculatePositionSize(
  input: PositionSizeInput
): PositionSizeResult {
  const errors: string[] = [];
  const assumptions: string[] = [];

  const equity = toNumberOrZero(input.accountEquity);
  const entry = toNumber(input.entryPrice);
  const stop = toNumber(input.stopLossPrice);
  const multiplier = toNumber(input.contractMultiplier) ?? 1;
  const fees = toNumberOrZero(input.estimatedFees);

  if (equity <= 0) errors.push("Account equity must be greater than zero.");
  if (entry === null || entry <= 0) errors.push("Entry price must be greater than zero.");
  if (stop === null || stop <= 0) errors.push("Stop-loss price must be greater than zero.");
  if (multiplier <= 0) errors.push("Contract multiplier must be greater than zero.");
  if (entry !== null && stop !== null && entry === stop) {
    errors.push("Entry price and stop loss cannot be identical.");
  }

  // Resolve the risk amount: a fixed amount wins over a percentage.
  let riskAmount = 0;
  const fixed = toNumber(input.fixedRiskAmount);
  const percent = toNumber(input.riskPercent);

  if (fixed !== null && fixed > 0) {
    riskAmount = fixed;
    assumptions.push("Risk amount taken from the fixed monetary value you entered.");
  } else if (percent !== null && percent > 0) {
    riskAmount = multiplyExact(equity, percent / 100);
    assumptions.push(`Risk amount is ${percent}% of the account equity.`);
  } else {
    errors.push("Enter either a risk percentage or a fixed risk amount.");
  }

  if (fees > 0) {
    assumptions.push(
      `Estimated costs of ${round(fees, 2)} are set aside, so the true stop-out loss may be larger than the risk amount.`
    );
  }

  const stopDistance =
    entry !== null && stop !== null ? Math.abs(subtractExact(entry, stop)) : 0;
  const riskPerUnit = multiplyExact(stopDistance, multiplier);

  let rawQuantity: number | null = null;
  if (riskPerUnit > 0 && riskAmount > 0) {
    rawQuantity = safeDivide(riskAmount, riskPerUnit);
  }

  let quantity: number | null = rawQuantity;
  const step = toNumber(input.quantityStep);
  if (quantity !== null && step !== null && step > 0) {
    // Always round DOWN so we never risk more than intended.
    quantity = Math.floor(quantity / step) * step;
    assumptions.push(
      `Quantity rounded down to the nearest ${step} step so the risk does not exceed the intended amount.`
    );
  }

  const actualRiskAmount =
    quantity !== null ? multiplyExact(multiplyExact(quantity, stopDistance), multiplier) : null;

  const notionalValue =
    quantity !== null && entry !== null ? multiplyExact(quantity, multiplyExact(entry, multiplier)) : null;

  if (equity > 0 && actualRiskAmount !== null) {
    const pct = safeDivide(actualRiskAmount, equity);
    if (pct !== null) {
      assumptions.push(
        `This position risks ${round(pct * 100, 2)}% of the account if the stop loss is hit.`
      );
    }
  }

  assumptions.push(
    "Prices can gap past a stop loss, so the realised loss may exceed the calculated risk."
  );

  return {
    riskAmount,
    riskPercentOfEquity: equity > 0 ? safeDivide(riskAmount, equity) : null,
    stopDistance,
    riskPerUnit,
    rawQuantity,
    quantity,
    actualRiskAmount,
    notionalValue,
    assumptions,
    errors,
  };
}

export interface RewardRiskInput {
  direction: Trade["direction"];
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  quantity: number;
  contractMultiplier: number;
}

export interface RewardRiskResult {
  riskAmount: number | null;
  rewardAmount: number | null;
  ratio: number | null;
  breakEvenWinRate: number | null;
  errors: string[];
}

/** Reward-to-risk and the break-even win rate implied by that ratio. */
export function calculateRewardRisk(input: RewardRiskInput): RewardRiskResult {
  const errors: string[] = [];
  const entry = toNumber(input.entryPrice);
  const stop = toNumber(input.stopLossPrice);
  const target = toNumber(input.takeProfitPrice);
  const qty = toNumberOrZero(input.quantity);
  const multiplier = toNumber(input.contractMultiplier) ?? 1;

  if (entry === null) errors.push("Entry price is required.");
  if (stop === null) errors.push("Stop loss is required.");
  if (target === null) errors.push("Take profit is required.");
  if (qty <= 0) errors.push("Quantity must be greater than zero.");

  if (errors.length > 0 || entry === null || stop === null || target === null) {
    return { riskAmount: null, rewardAmount: null, ratio: null, breakEvenWinRate: null, errors };
  }

  const riskPerUnit = Math.abs(
    input.direction === "long" ? entry - stop : stop - entry
  );
  const rewardPerUnit = Math.abs(
    input.direction === "long" ? target - entry : entry - target
  );

  const riskAmount = multiplyExact(multiplyExact(riskPerUnit, qty), multiplier);
  const rewardAmount = multiplyExact(multiplyExact(rewardPerUnit, qty), multiplier);
  const ratio = safeDivide(rewardAmount, riskAmount);
  // With a ratio of R, you need to win 1/(1+R) of the time to break even.
  const breakEvenWinRate = ratio !== null && ratio > 0 ? safeDivide(1, 1 + ratio) : null;

  return { riskAmount, rewardAmount, ratio, breakEvenWinRate, errors };
}

/** Loss limits and rule warnings for the current period. */
export interface RiskGuardInput {
  dailyNetPnl: number;
  weeklyNetPnl: number;
  dailyLossLimit: number | null;
  weeklyLossLimit: number | null;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
}

export interface RiskWarning {
  code: string;
  severity: "info" | "warning" | "block";
  message: string;
}

/**
 * Evaluate the trader's own configured limits.
 *
 * These are reminders of rules the trader set, not trading advice. The app
 * never claims a trade is safe or profitable.
 */
export function evaluateRiskGuards(input: RiskGuardInput): RiskWarning[] {
  const warnings: RiskWarning[] = [];

  if (input.dailyLossLimit !== null && input.dailyLossLimit > 0) {
    if (input.dailyNetPnl <= -input.dailyLossLimit) {
      warnings.push({
        code: "daily_loss_limit",
        severity: "block",
        message: `Your daily loss limit of ${round(input.dailyLossLimit, 2)} has been reached.`,
      });
    } else if (input.dailyNetPnl <= -input.dailyLossLimit * 0.8) {
      warnings.push({
        code: "daily_loss_limit_approaching",
        severity: "warning",
        message: "You are within 20% of your daily loss limit.",
      });
    }
  }

  if (input.weeklyLossLimit !== null && input.weeklyLossLimit > 0) {
    if (input.weeklyNetPnl <= -input.weeklyLossLimit) {
      warnings.push({
        code: "weekly_loss_limit",
        severity: "block",
        message: `Your weekly loss limit of ${round(input.weeklyLossLimit, 2)} has been reached.`,
      });
    } else if (input.weeklyNetPnl <= -input.weeklyLossLimit * 0.8) {
      warnings.push({
        code: "weekly_loss_limit_approaching",
        severity: "warning",
        message: "You are within 20% of your weekly loss limit.",
      });
    }
  }

  if (input.maxConsecutiveLosses > 0 && input.consecutiveLosses >= input.maxConsecutiveLosses) {
    warnings.push({
      code: "consecutive_losses",
      severity: "warning",
      message: `You have taken ${input.consecutiveLosses} losing trades in a row, which meets your configured limit of ${input.maxConsecutiveLosses}.`,
    });
  }

  if (warnings.length === 0) {
    warnings.push({
      code: "no_limits_hit",
      severity: "info",
      message: "None of your configured risk limits have been reached.",
    });
  }

  return warnings;
}
