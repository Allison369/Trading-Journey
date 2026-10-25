import {
  buildEquityCurve,
  bucketByPeriod,
  calendarHeatmap,
  capitalBase,
  classifyTrades,
  computeDrawdown,
  computeMetrics,
  computeStreaks,
  groupPerformance,
  periodKey,
  returnPercent,
} from "../domain/metrics";
import type { CashFlow } from "../domain/metrics";
import type { Trade, TradeExit } from "../domain/types";
import { closedTrade, exitsMap, makeTrade } from "../testing/fixtures";

/**
 * Build a closed trade that nets exactly `netPnl` on a $1 multiplier.
 * The exit price is derived so the sign is always correct for the direction.
 */
function tradeWithNetPnl(
  netPnl: number,
  overrides: Partial<Trade> = {}
): { trade: Trade; exit: TradeExit } {
  const entryPrice = 100;
  const direction = overrides.direction ?? "long";
  // long profits when price rises; short profits when price falls.
  const exitPrice = direction === "long" ? entryPrice + netPnl : entryPrice - netPnl;
  return closedTrade(
    { entryPrice: String(entryPrice), quantity: "1", contractMultiplier: "1", ...overrides },
    { price: String(exitPrice) }
  );
}

function bundle(trades: Array<{ trade: Trade; exit: TradeExit }>) {
  return {
    trades: trades.map((t) => t.trade),
    exits: exitsMap(trades.map((t) => t.exit)),
  };
}

describe("computeMetrics — empty dataset", () => {
  it("returns zeroed counts and null statistics, never NaN", () => {
    const m = computeMetrics([], {});
    expect(m.totalTrades).toBe(0);
    expect(m.closedTrades).toBe(0);
    expect(m.winRate).toBeNull();
    expect(m.profitFactor).toBeNull();
    expect(m.averagePnl).toBeNull();
    expect(m.expectancy).toBeNull();
    expect(m.averageR).toBeNull();
    expect(m.largestWin).toBeNull();
    expect(m.largestLoss).toBeNull();
    expect(m.netPnl).toBe(0);
    expect(m.currentStreakType).toBe("none");
  });
});

describe("computeMetrics — wins, losses and breakeven", () => {
  it("counts winners, losers and breakeven separately and excludes breakeven from win rate", () => {
    const b = bundle([
      tradeWithNetPnl(100),
      tradeWithNetPnl(-50),
      tradeWithNetPnl(0), // breakeven
    ]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.closedTrades).toBe(3);
    expect(m.winningTrades).toBe(1);
    expect(m.losingTrades).toBe(1);
    expect(m.breakevenTrades).toBe(1);
    // 1 win of 3 trades
    expect(m.winRate).toBeCloseTo(1 / 3, 12);
  });

  it("computes profit factor as gross profit / gross loss", () => {
    const b = bundle([tradeWithNetPnl(300), tradeWithNetPnl(-100)]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.profitFactor).toBe(3);
  });

  it("returns null profit factor when there are no losing trades", () => {
    const b = bundle([tradeWithNetPnl(100), tradeWithNetPnl(200)]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.grossLoss).toBe(0);
    expect(m.profitFactor).toBeNull();
  });

  it("computes averages and extremes", () => {
    const b = bundle([
      tradeWithNetPnl(200),
      tradeWithNetPnl(100),
      tradeWithNetPnl(-50),
      tradeWithNetPnl(-150),
    ]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.grossProfit).toBe(300);
    expect(m.grossLoss).toBe(200);
    expect(m.netPnl).toBe(100);
    expect(m.averageWinner).toBe(150);
    expect(m.averageLoser).toBe(-100);
    expect(m.largestWin).toBe(200);
    expect(m.largestLoss).toBe(-150);
    expect(m.averagePnl).toBe(25);
  });

  it("computes expectancy as average net P&L per closed trade", () => {
    const b = bundle([tradeWithNetPnl(90), tradeWithNetPnl(-30)]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.expectancy).toBe(30);
  });
});

describe("computeMetrics — open trades", () => {
  it("excludes open trades from performance metrics", () => {
    const open = makeTrade({ status: "open", quantity: "1", contractMultiplier: "1", entryPrice: "100" });
    const closed = tradeWithNetPnl(100);
    const m = computeMetrics([open, closed.trade], exitsMap([closed.exit]));
    expect(m.totalTrades).toBe(2);
    expect(m.closedTrades).toBe(1);
    expect(m.openTrades).toBe(1);
    expect(m.winRate).toBe(1); // 1 of 1 closed, not 1 of 2
    expect(m.netPnl).toBe(100);
  });

  it("does not count an open trade's unrealised move as profit", () => {
    const open = makeTrade({
      status: "open",
      quantity: "10",
      contractMultiplier: "1",
      entryPrice: "100",
      exitPrice: "200",
      manualNetPnl: null,
    });
    const m = computeMetrics([open], {});
    expect(m.netPnl).toBe(0);
    expect(m.closedTrades).toBe(0);
  });
});

describe("computeMetrics — R-multiples", () => {
  it("averages R only across trades that have a valid risk", () => {
    const withRisk = closedTrade(
      { entryPrice: "100", stopLoss: "95", quantity: "10", contractMultiplier: "1" },
      { price: "110" } // risk 50, profit 100 -> R 2
    );
    const withoutRisk = closedTrade(
      { entryPrice: "100", stopLoss: null, quantity: "10", contractMultiplier: "1" },
      { price: "101" } // +10, no R
    );
    const b = bundle([withRisk, withoutRisk]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.tradesWithR).toBe(1);
    expect(m.averageR).toBe(2);
  });

  it("returns null average R when no trade has a risk figure", () => {
    const b = bundle([tradeWithNetPnl(100)]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.tradesWithR).toBe(0);
    expect(m.averageR).toBeNull();
  });
});

describe("computeMetrics — fees reduce net P&L", () => {
  it("includes fees in net P&L and reports the fee total", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", quantity: "10", contractMultiplier: "1", entryFees: "5", exitFees: "5" },
      { price: "110", fees: "2" }
    );
    const m = computeMetrics([trade], exitsMap([exit]));
    expect(m.totalFees).toBe(12);
    expect(m.netPnl).toBe(88);
  });
});

describe("computeStreaks", () => {
  it("tracks maximum win and loss runs", () => {
    const b = bundle([
      tradeWithNetPnl(10, { exitAt: "2026-01-01T10:00:00.000Z" }),
      tradeWithNetPnl(10, { exitAt: "2026-01-02T10:00:00.000Z" }),
      tradeWithNetPnl(10, { exitAt: "2026-01-03T10:00:00.000Z" }),
      tradeWithNetPnl(-5, { exitAt: "2026-01-04T10:00:00.000Z" }),
      tradeWithNetPnl(-5, { exitAt: "2026-01-05T10:00:00.000Z" }),
    ]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.maxWinStreak).toBe(3);
    expect(m.maxLossStreak).toBe(2);
    expect(m.currentStreak).toBe(2);
    expect(m.currentStreakType).toBe("loss");
  });

  it("does not let a breakeven break a streak", () => {
    const b = bundle([
      tradeWithNetPnl(10, { exitAt: "2026-01-01T10:00:00.000Z" }),
      tradeWithNetPnl(0, { exitAt: "2026-01-02T10:00:00.000Z" }),
      tradeWithNetPnl(10, { exitAt: "2026-01-03T10:00:00.000Z" }),
    ]);
    const m = computeMetrics(b.trades, b.exits);
    expect(m.currentStreak).toBe(2);
    expect(m.currentStreakType).toBe("win");
  });

  it("orders streaks by close time, not array order", () => {
    const b = bundle([
      tradeWithNetPnl(-5, { exitAt: "2026-03-01T10:00:00.000Z" }),
      tradeWithNetPnl(10, { exitAt: "2026-01-01T10:00:00.000Z" }),
      tradeWithNetPnl(10, { exitAt: "2026-02-01T10:00:00.000Z" }),
    ]);
    const m = computeMetrics(b.trades, b.exits);
    // Chronologically: win, win, loss -> current streak is a loss of 1
    expect(m.currentStreakType).toBe("loss");
    expect(m.currentStreak).toBe(1);
    expect(m.maxWinStreak).toBe(2);
  });
});

describe("computeStreaks (unit)", () => {
  it("returns none for an empty list", () => {
    expect(computeStreaks([])).toEqual({ current: 0, currentType: "none", maxWin: 0, maxLoss: 0 });
  });
});

describe("buildEquityCurve", () => {
  it("starts at the starting balance and accumulates net P&L chronologically", () => {
    const a = tradeWithNetPnl(100, { exitAt: "2026-01-02T10:00:00.000Z" });
    const b = tradeWithNetPnl(-40, { exitAt: "2026-01-03T10:00:00.000Z" });
    const bundleA = bundle([a, b]);
    const curve = buildEquityCurve(10000, bundleA.trades, bundleA.exits);
    expect(curve[0]?.equity).toBe(10000);
    expect(curve[1]?.equity).toBe(10100);
    expect(curve[2]?.equity).toBe(10060);
  });

  it("sorts trades by close time regardless of input order", () => {
    const late = tradeWithNetPnl(100, { exitAt: "2026-02-01T10:00:00.000Z" });
    const early = tradeWithNetPnl(-50, { exitAt: "2026-01-01T10:00:00.000Z" });
    const bun = bundle([late, early]);
    const curve = buildEquityCurve(1000, bun.trades, bun.exits);
    expect(curve[1]?.equity).toBe(950);
    expect(curve[2]?.equity).toBe(1050);
  });

  it("applies deposits and withdrawals to the curve", () => {
    const a = tradeWithNetPnl(100, { exitAt: "2026-01-15T10:00:00.000Z" });
    const bun = bundle([a]);
    const flows: CashFlow[] = [
      { id: "f1", at: "2026-01-01T00:00:00.000Z", amount: 5000, label: "Deposit" },
      { id: "f2", at: "2026-01-20T00:00:00.000Z", amount: -2000, label: "Withdrawal" },
    ];
    const curve = buildEquityCurve(10000, bun.trades, bun.exits, flows);
    // 10000 -> +5000 = 15000 -> +100 = 15100 -> -2000 = 13100
    expect(curve[curve.length - 1]?.equity).toBe(13100);
  });

  it("excludes open trades from the curve", () => {
    const open = makeTrade({ status: "open", entryPrice: "100", quantity: "1", contractMultiplier: "1" });
    const curve = buildEquityCurve(500, [open], {});
    expect(curve).toHaveLength(1);
    expect(curve[0]?.equity).toBe(500);
  });

  it("handles an empty trade list", () => {
    const curve = buildEquityCurve(2500, [], {});
    expect(curve).toHaveLength(1);
    expect(curve[0]?.equity).toBe(2500);
  });
});

describe("computeDrawdown", () => {
  it("measures the largest peak-to-trough decline as a positive percentage", () => {
    const curve = [
      { at: "2026-01-01T00:00:00.000Z", equity: 10000, label: "start" },
      { at: "2026-01-02T00:00:00.000Z", equity: 12000, label: "peak" },
      { at: "2026-01-03T00:00:00.000Z", equity: 9000, label: "trough" },
      { at: "2026-01-04T00:00:00.000Z", equity: 11000, label: "recover" },
    ];
    const dd = computeDrawdown(curve);
    // (12000 - 9000) / 12000 = 25%
    expect(dd.maxDrawdownPercent).toBeCloseTo(25, 6);
    expect(dd.maxDrawdownAmount).toBe(3000);
    expect(dd.peakEquity).toBe(12000);
    expect(dd.troughEquity).toBe(9000);
  });

  it("returns zero drawdown for a monotonically rising curve", () => {
    const curve = [
      { at: "2026-01-01T00:00:00.000Z", equity: 100, label: "a" },
      { at: "2026-01-02T00:00:00.000Z", equity: 200, label: "b" },
      { at: "2026-01-03T00:00:00.000Z", equity: 300, label: "c" },
    ];
    expect(computeDrawdown(curve).maxDrawdownPercent).toBe(0);
  });

  it("returns zeroes for an empty curve", () => {
    const dd = computeDrawdown([]);
    expect(dd.maxDrawdownPercent).toBe(0);
    expect(dd.peakAt).toBeNull();
    expect(dd.series).toEqual([]);
  });

  it("never divides by a zero peak", () => {
    const curve = [
      { at: "2026-01-01T00:00:00.000Z", equity: 0, label: "start" },
      { at: "2026-01-02T00:00:00.000Z", equity: -500, label: "blown" },
    ];
    const dd = computeDrawdown(curve);
    expect(Number.isFinite(dd.maxDrawdownPercent)).toBe(true);
    expect(dd.maxDrawdownPercent).toBe(0);
  });

  it("produces a per-point drawdown series", () => {
    const curve = [
      { at: "2026-01-01T00:00:00.000Z", equity: 1000, label: "a" },
      { at: "2026-01-02T00:00:00.000Z", equity: 800, label: "b" },
    ];
    const dd = computeDrawdown(curve);
    expect(dd.series).toHaveLength(2);
    expect(dd.series[1]?.drawdownPercent).toBeCloseTo(20, 6);
  });
});

describe("groupPerformance", () => {
  it("groups by instrument and ranks by net P&L", () => {
    const a = tradeWithNetPnl(100, { symbol: "AAPL" });
    const b = tradeWithNetPnl(50, { symbol: "AAPL" });
    const c = tradeWithNetPnl(-20, { symbol: "TSLA" });
    const bun = bundle([a, b, c]);
    const groups = groupPerformance(bun.trades, bun.exits, (t) => t.symbol);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.key).toBe("AAPL");
    expect(groups[0]?.netPnl).toBe(150);
    expect(groups[0]?.trades).toBe(2);
    expect(groups[0]?.winRate).toBe(1);
    expect(groups[1]?.key).toBe("TSLA");
    expect(groups[1]?.winRate).toBe(0);
  });

  it("groups by direction", () => {
    const long = tradeWithNetPnl(100, { direction: "long" });
    const short = tradeWithNetPnl(-30, { direction: "short" });
    const bun = bundle([long, short]);
    const groups = groupPerformance(bun.trades, bun.exits, (t) => t.direction);
    const longGroup = groups.find((g) => g.key === "long");
    const shortGroup = groups.find((g) => g.key === "short");
    expect(longGroup?.netPnl).toBe(100);
    expect(shortGroup?.netPnl).toBe(-30);
  });

  it("skips trades whose group key is null", () => {
    const a = tradeWithNetPnl(100, { strategy: undefined });
    const bun = bundle([a]);
    expect(groupPerformance(bun.trades, bun.exits, (t) => t.strategy ?? null)).toEqual([]);
  });
});

describe("bucketByPeriod", () => {
  it("buckets by day", () => {
    const a = tradeWithNetPnl(100, { exitAt: "2026-01-01T10:00:00.000Z" });
    const b = tradeWithNetPnl(-40, { exitAt: "2026-01-01T14:00:00.000Z" });
    const c = tradeWithNetPnl(10, { exitAt: "2026-01-02T10:00:00.000Z" });
    const bun = bundle([a, b, c]);
    const buckets = bucketByPeriod(bun.trades, bun.exits, "day");
    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.key).toBe("2026-01-01");
    expect(buckets[0]?.netPnl).toBe(60);
    expect(buckets[0]?.trades).toBe(2);
    expect(buckets[1]?.netPnl).toBe(10);
  });

  it("buckets by month", () => {
    const a = tradeWithNetPnl(100, { exitAt: "2026-01-15T10:00:00.000Z" });
    const b = tradeWithNetPnl(50, { exitAt: "2026-02-15T10:00:00.000Z" });
    const bun = bundle([a, b]);
    const buckets = bucketByPeriod(bun.trades, bun.exits, "month");
    expect(buckets.map((x) => x.key)).toEqual(["2026-01", "2026-02"]);
  });

  it("honours the time zone when bucketing", () => {
    // 23:30 UTC on the 1st is already the 2nd in Tokyo.
    const a = tradeWithNetPnl(100, { exitAt: "2026-01-01T23:30:00.000Z" });
    const bun = bundle([a]);
    expect(bucketByPeriod(bun.trades, bun.exits, "day", "UTC")[0]?.key).toBe("2026-01-01");
    expect(bucketByPeriod(bun.trades, bun.exits, "day", "Asia/Tokyo")[0]?.key).toBe("2026-01-02");
  });
});

describe("periodKey", () => {
  it("formats day, month, year and ISO week", () => {
    expect(periodKey("2026-03-04T12:00:00.000Z", "day")).toBe("2026-03-04");
    expect(periodKey("2026-03-04T12:00:00.000Z", "month")).toBe("2026-03");
    expect(periodKey("2026-03-04T12:00:00.000Z", "year")).toBe("2026");
    expect(periodKey("2026-03-04T12:00:00.000Z", "week")).toMatch(/^2026-W\d{2}$/);
  });

  it("returns 'invalid' for an unparseable date", () => {
    expect(periodKey("not-a-date", "day")).toBe("invalid");
  });
});

describe("calendarHeatmap", () => {
  it("maps each day to its net P&L and trade count", () => {
    const a = tradeWithNetPnl(100, { exitAt: "2026-01-01T10:00:00.000Z" });
    const b = tradeWithNetPnl(-25, { exitAt: "2026-01-01T11:00:00.000Z" });
    const bun = bundle([a, b]);
    const heat = calendarHeatmap(bun.trades, bun.exits);
    expect(heat["2026-01-01"]).toEqual({ netPnl: 75, trades: 2 });
  });
});

describe("returnPercent", () => {
  it("returns a fraction of the capital base", () => {
    expect(returnPercent(500, 10000)).toBe(0.05);
  });

  it("returns null for a non-positive capital base", () => {
    expect(returnPercent(500, 0)).toBeNull();
    expect(returnPercent(500, -100)).toBeNull();
  });
});

describe("capitalBase", () => {
  const account = (startingBalance: unknown, balanceAdjustments: unknown) => ({
    startingBalance,
    balanceAdjustments,
  });

  it("is the starting balance plus manual adjustments", () => {
    expect(capitalBase(account("10000", "500"))).toBe(10500);
  });

  it("treats a withdrawal (negative adjustment) as reducing the base", () => {
    expect(capitalBase(account("10000", "-2500"))).toBe(7500);
  });

  it("handles a missing account as zero rather than throwing", () => {
    expect(capitalBase(undefined)).toBe(0);
    expect(capitalBase(null)).toBe(0);
  });

  it("ignores unparseable values instead of producing NaN", () => {
    // NaN would propagate silently into every return figure on the dashboard.
    expect(capitalBase(account("abc", "100"))).toBe(100);
    expect(capitalBase(account("100", "abc"))).toBe(100);
    expect(capitalBase(account("", ""))).toBe(0);
  });

  it("accepts numeric values as well as the strings the database returns", () => {
    expect(capitalBase(account(10000, 500))).toBe(10500);
  });

  it("preserves decimal precision of the components", () => {
    expect(capitalBase(account("0.1", "0.2"))).toBeCloseTo(0.3, 10);
  });

  /**
   * The critical property: depositing money is not profit. A deposit changes
   * the denominator of a return figure, and it must not change the numerator
   * or the quality metrics, because the trader did not earn it.
   */
  it("changes the return figure but not win rate, profit factor or expectancy", () => {
    const { trade, exit } = tradeWithNetPnl(1000);
    const exits = exitsMap([exit]);

    const before = computeMetrics([trade], exits);
    const smallBase = capitalBase(account("10000", "0"));
    const afterDeposit = capitalBase(account("10000", "90000"));

    // Same trades, same quality metrics...
    expect(afterDeposit).toBe(100000);
    expect(computeMetrics([trade], exits).winRate).toBe(before.winRate);
    expect(computeMetrics([trade], exits).profitFactor).toBe(before.profitFactor);
    expect(computeMetrics([trade], exits).expectancy).toBe(before.expectancy);

    // ...but a smaller return, because the same profit is now spread over a
    // larger base. The deposit is not a win.
    const beforeReturn = returnPercent(before.netPnl, smallBase);
    const afterReturn = returnPercent(before.netPnl, afterDeposit);
    expect(beforeReturn).toBeCloseTo(0.1, 10);
    expect(afterReturn).toBeCloseTo(0.01, 10);
    expect(afterReturn).toBeLessThan(beforeReturn as number);
  });
});

describe("classifyTrades", () => {
  it("excludes soft-deleted trades", () => {
    const live = tradeWithNetPnl(100);
    const deleted = tradeWithNetPnl(999, { deletedAt: "2026-02-01T00:00:00.000Z" });
    const bun = bundle([live, deleted]);
    const classified = classifyTrades(bun.trades, bun.exits);
    expect(classified).toHaveLength(1);
    expect(classified[0]?.netPnl).toBe(100);
  });
});
