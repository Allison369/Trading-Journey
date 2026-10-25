import {
  calculatePositionSize,
  calculateRewardRisk,
  evaluateRiskGuards,
} from "../lib/risk";

describe("calculatePositionSize", () => {
  it("sizes a position from a risk percentage", () => {
    // $10,000 account, 1% risk = $100. Entry 100, stop 95 -> $5/unit.
    // quantity = 100 / 5 = 20
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 1,
    });
    expect(r.riskAmount).toBe(100);
    expect(r.stopDistance).toBe(5);
    expect(r.riskPerUnit).toBe(5);
    expect(r.quantity).toBe(20);
    expect(r.actualRiskAmount).toBe(100);
    expect(r.errors).toEqual([]);
  });

  it("prefers a fixed monetary risk over a percentage", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 5,
      fixedRiskAmount: 50,
      entryPrice: 100,
      stopLossPrice: 90,
      contractMultiplier: 1,
    });
    expect(r.riskAmount).toBe(50);
    expect(r.quantity).toBe(5); // 50 / 10
  });

  it("applies the contract multiplier", () => {
    // Futures: 1 point x $50. Risk $500, stop distance 5 points -> 100/unit... 
    // riskPerUnit = 5 * 50 = 250; quantity = 500 / 250 = 2
    const r = calculatePositionSize({
      accountEquity: 50000,
      fixedRiskAmount: 500,
      entryPrice: 5000,
      stopLossPrice: 4995,
      contractMultiplier: 50,
    });
    expect(r.riskPerUnit).toBe(250);
    expect(r.quantity).toBe(2);
    expect(r.actualRiskAmount).toBe(500);
  });

  it("handles a short setup (stop above entry)", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 110,
      contractMultiplier: 1,
    });
    expect(r.stopDistance).toBe(10);
    expect(r.quantity).toBe(10); // 100 / 10
  });

  it("rounds quantity down to the step so risk is never exceeded", () => {
    // risk 100, riskPerUnit 3 -> 33.333; step 1 -> 33
    const r = calculatePositionSize({
      accountEquity: 10000,
      fixedRiskAmount: 100,
      entryPrice: 100,
      stopLossPrice: 97,
      contractMultiplier: 1,
      quantityStep: 1,
    });
    expect(r.rawQuantity).toBeCloseTo(33.3333, 3);
    expect(r.quantity).toBe(33);
    expect(r.actualRiskAmount).toBe(99); // 33 * 3, under the 100 budget
  });

  it("rounds to a fractional lot step", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      fixedRiskAmount: 100,
      entryPrice: 1.1,
      stopLossPrice: 1.095,
      contractMultiplier: 100000,
      quantityStep: 0.01,
    });
    // riskPerUnit = 0.005 * 100000 = 500; raw = 0.2 lots
    expect(r.quantity).toBe(0.2);
  });

  it("warns that costs increase the true loss", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 1,
      estimatedFees: 8,
    });
    expect(r.assumptions.some((a) => /costs/i.test(a))).toBe(true);
  });

  it("always includes the gap-risk caveat", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 1,
    });
    expect(r.assumptions.some((a) => /gap past a stop loss/i.test(a))).toBe(true);
  });

  it("reports an error when no risk budget is given", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 1,
    });
    expect(r.errors.some((e) => /risk percentage or a fixed risk amount/i.test(e))).toBe(true);
  });

  it("rejects a zero or negative equity", () => {
    const r = calculatePositionSize({
      accountEquity: 0,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 1,
    });
    expect(r.errors.some((e) => /equity/i.test(e))).toBe(true);
  });

  it("rejects identical entry and stop prices", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 100,
      contractMultiplier: 1,
    });
    expect(r.errors.some((e) => /identical/i.test(e))).toBe(true);
    expect(r.quantity).toBeNull();
  });

  it("rejects a non-positive multiplier", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      riskPercent: 1,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 0,
    });
    expect(r.errors.some((e) => /multiplier/i.test(e))).toBe(true);
  });

  it("computes notional value", () => {
    const r = calculatePositionSize({
      accountEquity: 10000,
      fixedRiskAmount: 100,
      entryPrice: 100,
      stopLossPrice: 95,
      contractMultiplier: 1,
    });
    expect(r.notionalValue).toBe(2000); // 20 units at 100
  });
});

describe("calculateRewardRisk", () => {
  it("computes the ratio for a long trade", () => {
    // risk 5, reward 15 -> 3R
    const r = calculateRewardRisk({
      direction: "long",
      entryPrice: 100,
      stopLossPrice: 95,
      takeProfitPrice: 115,
      quantity: 1,
      contractMultiplier: 1,
    });
    expect(r.riskAmount).toBe(5);
    expect(r.rewardAmount).toBe(15);
    expect(r.ratio).toBe(3);
  });

  it("computes the ratio for a short trade", () => {
    const r = calculateRewardRisk({
      direction: "short",
      entryPrice: 100,
      stopLossPrice: 105,
      takeProfitPrice: 90,
      quantity: 1,
      contractMultiplier: 1,
    });
    expect(r.ratio).toBe(2);
  });

  it("derives the break-even win rate from the ratio", () => {
    // 2R -> need 1/3 = 33.3% to break even
    const r = calculateRewardRisk({
      direction: "long",
      entryPrice: 100,
      stopLossPrice: 95,
      takeProfitPrice: 110,
      quantity: 1,
      contractMultiplier: 1,
    });
    expect(r.breakEvenWinRate).toBeCloseTo(1 / 3, 9);
  });

  it("reports errors for missing inputs", () => {
    const r = calculateRewardRisk({
      direction: "long",
      entryPrice: 100,
      stopLossPrice: NaN,
      takeProfitPrice: NaN,
      quantity: 0,
      contractMultiplier: 1,
    });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.ratio).toBeNull();
  });
});

describe("evaluateRiskGuards", () => {
  const base = {
    dailyNetPnl: 0,
    weeklyNetPnl: 0,
    dailyLossLimit: 500,
    weeklyLossLimit: 1500,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 3,
  };

  it("reports no limits hit when within bounds", () => {
    const w = evaluateRiskGuards(base);
    expect(w).toHaveLength(1);
    expect(w[0]?.code).toBe("no_limits_hit");
  });

  it("blocks when the daily loss limit is reached", () => {
    const w = evaluateRiskGuards({ ...base, dailyNetPnl: -500 });
    expect(w.some((x) => x.code === "daily_loss_limit" && x.severity === "block")).toBe(true);
  });

  it("warns when approaching the daily loss limit", () => {
    const w = evaluateRiskGuards({ ...base, dailyNetPnl: -420 });
    expect(w.some((x) => x.code === "daily_loss_limit_approaching")).toBe(true);
  });

  it("blocks when the weekly loss limit is reached", () => {
    const w = evaluateRiskGuards({ ...base, weeklyNetPnl: -1500 });
    expect(w.some((x) => x.code === "weekly_loss_limit" && x.severity === "block")).toBe(true);
  });

  it("warns on the configured consecutive-loss count", () => {
    const w = evaluateRiskGuards({ ...base, consecutiveLosses: 3 });
    expect(w.some((x) => x.code === "consecutive_losses")).toBe(true);
  });

  it("never claims a trade is safe or profitable", () => {
    const w = evaluateRiskGuards(base);
    for (const warning of w) {
      expect(warning.message.toLowerCase()).not.toContain("safe");
      expect(warning.message.toLowerCase()).not.toContain("guaranteed");
    }
  });

  it("handles null limits without error", () => {
    const w = evaluateRiskGuards({
      ...base,
      dailyLossLimit: null,
      weeklyLossLimit: null,
    });
    expect(w.some((x) => x.code === "no_limits_hit")).toBe(true);
  });
});
