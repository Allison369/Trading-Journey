import {
  computeCosts,
  computeTrade,
  grossPnlForLeg,
  priceDelta,
  validateExits,
} from "../domain/pnl";
import {
  closedTrade,
  exitsMap,
  makeExit,
  makeTrade,
} from "../testing/fixtures";

describe("priceDelta", () => {
  it("is positive for a favourable long move", () => {
    expect(priceDelta("long", 100, 110)).toBe(10);
  });

  it("is negative for an adverse long move", () => {
    expect(priceDelta("long", 100, 90)).toBe(-10);
  });

  it("is positive for a favourable short move", () => {
    expect(priceDelta("short", 100, 90)).toBe(10);
  });

  it("is negative for an adverse short move", () => {
    expect(priceDelta("short", 100, 110)).toBe(-10);
  });
});

describe("grossPnlForLeg", () => {
  it("computes a long winner", () => {
    // (110 - 100) x 10 x 1 = 100
    expect(grossPnlForLeg("long", 100, 110, 10, 1)).toBe(100);
  });

  it("computes a short winner", () => {
    // (100 - 90) x 10 x 1 = 100
    expect(grossPnlForLeg("short", 100, 90, 10, 1)).toBe(100);
  });

  it("computes a long loser", () => {
    expect(grossPnlForLeg("long", 100, 95, 10, 1)).toBe(-50);
  });

  it("computes a short loser", () => {
    expect(grossPnlForLeg("short", 100, 105, 10, 1)).toBe(-50);
  });

  it("applies a contract multiplier for futures-style instruments", () => {
    // E-mini style: 1 point x $50 multiplier
    expect(grossPnlForLeg("long", 5000, 5010, 1, 50)).toBe(500);
  });

  it("applies a forex-style multiplier", () => {
    // 1 standard lot EURUSD: 0.0100 move x 100000
    expect(grossPnlForLeg("long", 1.1, 1.11, 1, 100000)).toBeCloseTo(1000, 6);
  });

  it("handles fractional quantities without drift", () => {
    expect(grossPnlForLeg("long", 1.1, 1.1001, 0.3, 100000)).toBeCloseTo(3, 9);
  });
});

describe("computeTrade — basic long and short", () => {
  it("computes a simple long winner before costs", () => {
    const { trade, exit } = closedTrade(
      { symbol: "AAPL", assetClass: "stock", direction: "long", entryPrice: "100", quantity: "10", contractMultiplier: "1" },
      { price: "110" }
    );
    const c = computeTrade(trade, [exit]);
    expect(c.grossPnl).toBe(100);
    expect(c.netPnl).toBe(100);
    expect(c.isFullyClosed).toBe(true);
    expect(c.openQuantity).toBe(0);
  });

  it("computes a simple short winner", () => {
    const { trade, exit } = closedTrade(
      { direction: "short", entryPrice: "100", quantity: "10", contractMultiplier: "1" },
      { price: "90" }
    );
    expect(computeTrade(trade, [exit]).netPnl).toBe(100);
  });

  it("computes a short loser", () => {
    const { trade, exit } = closedTrade(
      { direction: "short", entryPrice: "100", quantity: "10", contractMultiplier: "1" },
      { price: "104" }
    );
    expect(computeTrade(trade, [exit]).netPnl).toBe(-40);
  });
});

describe("computeTrade — fees and commissions", () => {
  it("subtracts entry and exit fees from net but leaves gross intact", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", quantity: "10", contractMultiplier: "1", entryFees: "5", exitFees: "5" },
      { price: "110", fees: "2" }
    );
    const c = computeTrade(trade, [exit]);
    expect(c.grossPnl).toBe(100);
    expect(c.costs.total).toBe(12); // 5 + 5 + 2
    expect(c.netPnl).toBe(88);
  });

  it("includes funding fees and slippage", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", quantity: "10", contractMultiplier: "1", fundingFees: "3", slippage: "1.5" },
      { price: "110" }
    );
    const c = computeTrade(trade, [exit]);
    expect(c.costs.fundingFees).toBe(3);
    expect(c.costs.slippage).toBe(1.5);
    expect(c.netPnl).toBe(95.5);
  });

  it("turns a small winner into a loser once fees are applied", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", quantity: "1", contractMultiplier: "1", entryFees: "10", exitFees: "10" },
      { price: "105" }
    );
    const c = computeTrade(trade, [exit]);
    expect(c.grossPnl).toBe(5);
    expect(c.netPnl).toBe(-15);
  });

  it("aggregates per-exit fees into the exit fee bucket", () => {
    const trade = makeTrade({ quantity: "10", contractMultiplier: "1", entryPrice: "100" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "5", price: "110", fees: "1" }),
      makeExit({ tradeId: trade.id, quantity: "5", price: "120", fees: "1" }),
    ];
    expect(computeCosts(trade, exits).exitFees).toBe(2);
  });
});

describe("computeTrade — partial exits", () => {
  it("prices each leg at its own exit price", () => {
    const trade = makeTrade({ entryPrice: "100", quantity: "10", contractMultiplier: "1" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "5", price: "110" }), // +50
      makeExit({ tradeId: trade.id, quantity: "5", price: "120" }), // +100
    ];
    const c = computeTrade(trade, exits);
    expect(c.grossPnl).toBe(150);
    expect(c.closedQuantity).toBe(10);
    expect(c.isFullyClosed).toBe(true);
  });

  it("reports open quantity while partially closed", () => {
    const trade = makeTrade({ entryPrice: "100", quantity: "10", contractMultiplier: "1" });
    const exits = [makeExit({ tradeId: trade.id, quantity: "4", price: "110" })];
    const c = computeTrade(trade, exits);
    expect(c.closedQuantity).toBe(4);
    expect(c.openQuantity).toBe(6);
    expect(c.isFullyClosed).toBe(false);
    expect(c.grossPnl).toBe(40); // only the realised leg
  });

  it("computes a weighted average exit price", () => {
    const trade = makeTrade({ entryPrice: "100", quantity: "10", contractMultiplier: "1" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "2", price: "200" }),
      makeExit({ tradeId: trade.id, quantity: "8", price: "100" }),
    ];
    // (2*200 + 8*100) / 10 = 120
    expect(computeTrade(trade, exits).averageExitPrice).toBeCloseTo(120, 9);
  });

  it("does not treat unrealised profit as realised", () => {
    const trade = makeTrade({
      entryPrice: "100",
      quantity: "10",
      contractMultiplier: "1",
      exitPrice: "200", // a careless field: must be ignored
      status: "partial",
    });
    const exits = [makeExit({ tradeId: trade.id, quantity: "1", price: "110" })];
    // Only the 1 closed unit counts: +10, not +1000.
    expect(computeTrade(trade, exits).grossPnl).toBe(10);
  });

  it("ignores soft-deleted exits", () => {
    const trade = makeTrade({ entryPrice: "100", quantity: "10", contractMultiplier: "1" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "5", price: "110" }),
      makeExit({ tradeId: trade.id, quantity: "5", price: "999", deletedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    const c = computeTrade(trade, exits);
    expect(c.closedQuantity).toBe(5);
    expect(c.grossPnl).toBe(50);
  });
});

describe("computeTrade — R-multiple", () => {
  it("computes R from net P&L and initial risk", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", stopLoss: "95", quantity: "10", contractMultiplier: "1" },
      { price: "110" }
    );
    // risk = 5 x 10 x 1 = 50; profit = 100; R = 2
    const c = computeTrade(trade, [exit]);
    expect(c.initialRisk).toBe(50);
    expect(c.rMultiple).toBe(2);
  });

  it("returns a negative R for a loss", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", stopLoss: "95", quantity: "10", contractMultiplier: "1" },
      { price: "97.5" }
    );
    // risk 50, loss -25 -> R = -0.5
    expect(computeTrade(trade, [exit]).rMultiple).toBe(-0.5);
  });

  it("handles a short trade risk correctly", () => {
    const { trade, exit } = closedTrade(
      { direction: "short", entryPrice: "100", stopLoss: "105", quantity: "10", contractMultiplier: "1" },
      { price: "90" }
    );
    // risk 5 x 10 = 50; profit 100 -> R = 2
    expect(computeTrade(trade, [exit]).rMultiple).toBe(2);
  });

  it("returns null R when the stop loss is missing", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", stopLoss: null, quantity: "10", contractMultiplier: "1" },
      { price: "110" }
    );
    expect(computeTrade(trade, [exit]).initialRisk).toBeNull();
    expect(computeTrade(trade, [exit]).rMultiple).toBeNull();
  });

  it("returns null R when the stop loss equals the entry price", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", stopLoss: "100", quantity: "10", contractMultiplier: "1" },
      { price: "110" }
    );
    expect(computeTrade(trade, [exit]).initialRisk).toBe(0);
    expect(computeTrade(trade, [exit]).rMultiple).toBeNull();
  });

  it("withholds R until the trade is fully closed", () => {
    const trade = makeTrade({ entryPrice: "100", stopLoss: "95", quantity: "10", contractMultiplier: "1", status: "partial" });
    const exits = [makeExit({ tradeId: trade.id, quantity: "5", price: "110" })];
    expect(computeTrade(trade, exits).rMultiple).toBeNull();
  });
});

describe("computeTrade — planned reward/risk", () => {
  it("computes planned R:R from take profit and stop loss", () => {
    const trade = makeTrade({
      entryPrice: "100",
      stopLoss: "95",
      takeProfit: "115",
      contractMultiplier: "1",
    });
    expect(computeTrade(trade, []).plannedRewardRisk).toBe(3);
  });

  it("returns null when either level is missing", () => {
    expect(computeTrade(makeTrade({ entryPrice: "100", stopLoss: "95" }), []).plannedRewardRisk).toBeNull();
    expect(computeTrade(makeTrade({ entryPrice: "100", takeProfit: "110" }), []).plannedRewardRisk).toBeNull();
  });
});

describe("computeTrade — holding duration", () => {
  it("measures duration in milliseconds", () => {
    const { trade, exit } = closedTrade(
      { entryAt: "2026-01-01T10:00:00.000Z" },
      { exitedAt: "2026-01-01T12:30:00.000Z" }
    );
    expect(computeTrade(trade, [exit]).holdingMs).toBe(2.5 * 60 * 60 * 1000);
  });

  it("returns null for an open trade", () => {
    const trade = makeTrade({ exitAt: null });
    expect(computeTrade(trade, []).holdingMs).toBeNull();
  });
});

describe("computeTrade — manual override", () => {
  it("honours manualNetPnl for effective value while keeping the computed one", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", quantity: "10", contractMultiplier: "1", manualNetPnl: "999" },
      { price: "110" }
    );
    const c = computeTrade(trade, [exit]);
    expect(c.netPnl).toBe(100);
    expect(c.manualNetPnl).toBe(999);
    expect(c.effectiveNetPnl).toBe(999);
  });
});

describe("computeTrade — edge cases", () => {
  it("handles a zero-quantity trade without NaN", () => {
    const trade = makeTrade({ quantity: "0", entryPrice: "100" });
    const c = computeTrade(trade, []);
    expect(c.grossPnl).toBe(0);
    expect(Number.isNaN(c.netPnl)).toBe(false);
    expect(c.isFullyClosed).toBe(false);
  });

  it("handles a missing exit price without NaN", () => {
    const trade = makeTrade({ entryPrice: "100", quantity: "10", contractMultiplier: "1" });
    const exits = [makeExit({ tradeId: trade.id, quantity: "10", price: "" })];
    expect(Number.isNaN(computeTrade(trade, exits).grossPnl)).toBe(false);
  });

  it("handles a missing entry price", () => {
    const trade = makeTrade({ entryPrice: "" });
    expect(Number.isNaN(computeTrade(trade, []).grossPnl)).toBe(false);
  });

  it("treats a missing contract multiplier as 1", () => {
    const { trade, exit } = closedTrade(
      { entryPrice: "100", quantity: "10", contractMultiplier: "" },
      { price: "110" }
    );
    expect(computeTrade(trade, [exit]).netPnl).toBe(100);
  });
});

describe("validateExits", () => {
  it("accepts exits that sum to the opened quantity", () => {
    const trade = makeTrade({ quantity: "10" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "5", price: "110" }),
      makeExit({ tradeId: trade.id, quantity: "5", price: "120" }),
    ];
    expect(validateExits(trade, exits)).toEqual([]);
  });

  it("rejects over-closing the position", () => {
    const trade = makeTrade({ quantity: "10" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "6", price: "110" }),
      makeExit({ tradeId: trade.id, quantity: "6", price: "120" }),
    ];
    const errors = validateExits(trade, exits);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/exceeds opened quantity/);
  });

  it("rejects a non-positive exit quantity", () => {
    const trade = makeTrade({ quantity: "10" });
    const exits = [makeExit({ tradeId: trade.id, quantity: "0", price: "110" })];
    expect(validateExits(trade, exits).some((e) => /greater than zero/.test(e))).toBe(true);
  });

  it("requires an exit price", () => {
    const trade = makeTrade({ quantity: "10" });
    const exits = [makeExit({ tradeId: trade.id, quantity: "1", price: "" })];
    expect(validateExits(trade, exits).some((e) => /price is required/.test(e))).toBe(true);
  });

  it("ignores soft-deleted exits when checking totals", () => {
    const trade = makeTrade({ quantity: "10" });
    const exits = [
      makeExit({ tradeId: trade.id, quantity: "5", price: "110" }),
      makeExit({ tradeId: trade.id, quantity: "99", price: "110", deletedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(validateExits(trade, exits)).toEqual([]);
  });
});

describe("exitsMap helper", () => {
  it("groups exits by their trade id", () => {
    const exits = [
      makeExit({ tradeId: "a", quantity: "1" }),
      makeExit({ tradeId: "b", quantity: "1" }),
      makeExit({ tradeId: "a", quantity: "1" }),
    ];
    const map = exitsMap(exits);
    expect(map['a']).toHaveLength(2);
    expect(map['b']).toHaveLength(1);
  });
});
