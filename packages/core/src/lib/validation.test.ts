import {
  fieldErrors,
  journalEntrySchema,
  profileSchema,
  resetPasswordSchema,
  riskSettingsSchema,
  signInSchema,
  signUpSchema,
  tradeExitSchema,
  tradeSchema,
  tradingAccountSchema,
  tradingStrategySchema,
} from "../lib/validation";

/** A complete, valid trade input used as the baseline for other cases. */
function validTrade() {
  return {
    accountId: "acct-1",
    symbol: "eurusd",
    assetClass: "forex",
    direction: "long",
    status: "closed",
    orderType: "market",
    entryAt: "2026-03-04T09:00:00.000Z",
    entryPrice: "1.1000",
    exitAt: "2026-03-04T12:00:00.000Z",
    exitPrice: "1.1100",
    quantity: "1",
    contractMultiplier: "100000",
    stopLoss: "1.0950",
    takeProfit: "1.1150",
    entryFees: "5",
    exitFees: "5",
    fundingFees: "0",
    slippage: "0",
    session: "london",
  };
}

describe("tradeSchema", () => {
  it("accepts a valid trade", () => {
    const result = tradeSchema.safeParse(validTrade());
    expect(result.success).toBe(true);
  });

  it("uppercases the symbol", () => {
    const result = tradeSchema.parse(validTrade());
    expect(result.symbol).toBe("EURUSD");
  });

  it("requires a trading account", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), accountId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative entry price", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), entryPrice: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric entry price", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), entryPrice: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects a zero quantity", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), quantity: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a stop loss above entry on a long trade", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), stopLoss: "1.2000" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).stopLoss).toMatch(/below the entry/i);
    }
  });

  it("rejects a stop loss below entry on a short trade", () => {
    const result = tradeSchema.safeParse({
      ...validTrade(),
      direction: "short",
      stopLoss: "1.0500",
      takeProfit: "1.0800",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).stopLoss).toMatch(/above the entry/i);
    }
  });

  it("rejects a take profit below entry on a long trade", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), takeProfit: "1.0500" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).takeProfit).toMatch(/above the entry/i);
    }
  });

  it("requires an exit price for a closed trade", () => {
    const result = tradeSchema.safeParse({
      ...validTrade(),
      exitPrice: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).exitPrice).toMatch(/exit price/i);
    }
  });

  it("requires an exit time for a closed trade", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), exitAt: null });
    expect(result.success).toBe(false);
  });

  it("allows an open trade without an exit", () => {
    const result = tradeSchema.safeParse({
      ...validTrade(),
      status: "open",
      exitAt: null,
      exitPrice: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an exit time before the entry time", () => {
    const result = tradeSchema.safeParse({
      ...validTrade(),
      exitAt: "2026-03-04T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).exitAt).toMatch(/before entry/i);
    }
  });

  it("rejects an invalid date", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), entryAt: "not a date" });
    expect(result.success).toBe(false);
  });

  it("defaults optional costs to zero", () => {
    const input = validTrade();
    const result = tradeSchema.parse({
      ...input,
      entryFees: undefined,
      exitFees: undefined,
      fundingFees: undefined,
      slippage: undefined,
    });
    expect(result.entryFees).toBe("0");
    expect(result.exitFees).toBe("0");
  });

  it("treats an empty optional decimal as null", () => {
    const result = tradeSchema.parse({ ...validTrade(), stopLoss: "", takeProfit: "" });
    expect(result.stopLoss).toBeNull();
    expect(result.takeProfit).toBeNull();
  });

  it("accepts a valid emotion value and rejects an unknown one", () => {
    expect(tradeSchema.safeParse({ ...validTrade(), emotionBefore: "calm" }).success).toBe(true);
    expect(tradeSchema.safeParse({ ...validTrade(), emotionBefore: "elated" }).success).toBe(false);
  });
});

describe("tradeExitSchema", () => {
  it("accepts a valid exit", () => {
    const result = tradeExitSchema.safeParse({
      tradeId: "t1",
      quantity: "0.5",
      price: "1.1050",
      exitedAt: "2026-03-04T11:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero quantity", () => {
    const result = tradeExitSchema.safeParse({
      tradeId: "t1",
      quantity: "0",
      price: "1.1050",
      exitedAt: "2026-03-04T11:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("defaults fees to zero", () => {
    const result = tradeExitSchema.parse({
      tradeId: "t1",
      quantity: "1",
      price: "1.1050",
      exitedAt: "2026-03-04T11:00:00.000Z",
    });
    expect(result.fees).toBe("0");
  });
});

describe("tradingAccountSchema", () => {
  it("accepts a valid account", () => {
    const result = tradingAccountSchema.safeParse({
      name: "Main",
      currency: "USD",
      startingBalance: "10000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative starting balance", () => {
    const result = tradingAccountSchema.safeParse({
      name: "Main",
      currency: "USD",
      startingBalance: "-1",
    });
    expect(result.success).toBe(false);
  });

  it("allows a zero starting balance", () => {
    const result = tradingAccountSchema.safeParse({
      name: "Demo",
      currency: "USD",
      startingBalance: "0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unsupported currency", () => {
    const result = tradingAccountSchema.safeParse({
      name: "Main",
      currency: "XYZ",
      startingBalance: "1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every supported currency", () => {
    for (const currency of ["USD", "EUR", "GBP", "UGX", "JPY", "AUD", "CAD", "CHF"]) {
      expect(
        tradingAccountSchema.safeParse({ name: "a", currency, startingBalance: "1" }).success
      ).toBe(true);
    }
  });

  it("requires a name", () => {
    const result = tradingAccountSchema.safeParse({
      name: "",
      currency: "USD",
      startingBalance: "1",
    });
    expect(result.success).toBe(false);
  });
});

describe("journalEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = journalEntrySchema.safeParse({
      entryDate: "2026-03-04",
      period: "daily",
      disciplineScore: 8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(journalEntrySchema.safeParse({ entryDate: "04/03/2026" }).success).toBe(false);
  });

  it("rejects a discipline score outside 1 to 10", () => {
    expect(journalEntrySchema.safeParse({ entryDate: "2026-03-04", disciplineScore: 0 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ entryDate: "2026-03-04", disciplineScore: 11 }).success).toBe(false);
    expect(journalEntrySchema.safeParse({ entryDate: "2026-03-04", disciplineScore: 11 }).success).toBe(false);
  });

  it("allows a null discipline score", () => {
    expect(journalEntrySchema.safeParse({ entryDate: "2026-03-04", disciplineScore: null }).success).toBe(true);
  });

  it("defaults the period to daily", () => {
    const result = journalEntrySchema.parse({ entryDate: "2026-03-04" });
    expect(result.period).toBe("daily");
  });
});

describe("tradingStrategySchema", () => {
  it("accepts a minimal strategy", () => {
    const result = tradingStrategySchema.safeParse({ name: "Breakout" });
    expect(result.success).toBe(true);
  });

  it("requires a name", () => {
    expect(tradingStrategySchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("defaults array fields to empty", () => {
    const result = tradingStrategySchema.parse({ name: "Breakout" });
    expect(result.markets).toEqual([]);
    expect(result.checklist).toEqual([]);
    expect(result.tags).toEqual([]);
  });
});

describe("riskSettingsSchema", () => {
  const valid = {
    defaultRiskPercent: "1",
    maxRiskPerTradePercent: "2",
    baseCurrency: "USD",
  };

  it("accepts valid settings", () => {
    expect(riskSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a zero risk percent", () => {
    expect(riskSettingsSchema.safeParse({ ...valid, defaultRiskPercent: "0" }).success).toBe(false);
  });

  it("rejects a risk percent above 100", () => {
    expect(riskSettingsSchema.safeParse({ ...valid, defaultRiskPercent: "150" }).success).toBe(false);
  });

  it("accepts a null daily loss limit", () => {
    expect(riskSettingsSchema.safeParse({ ...valid, dailyLossLimitAmount: null }).success).toBe(true);
  });
});

describe("profileSchema", () => {
  it("accepts a valid profile", () => {
    const result = profileSchema.safeParse({
      displayName: "Steve",
      currency: "UGX",
      timeZone: "Africa/Kampala",
    });
    expect(result.success).toBe(true);
  });

  it("defaults the theme to dark", () => {
    const result = profileSchema.parse({
      displayName: "Steve",
      currency: "USD",
      timeZone: "UTC",
    });
    expect(result.theme).toBe("dark");
  });

  it("rejects an empty display name", () => {
    expect(
      profileSchema.safeParse({ displayName: "", currency: "USD", timeZone: "UTC" }).success
    ).toBe(false);
  });
});

describe("auth schemas", () => {
  it("accepts a valid sign-up", () => {
    const result = signUpSchema.safeParse({
      email: "trader@example.com",
      password: "hunter2pass",
      confirmPassword: "hunter2pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      email: "a@b.com",
      password: "abc1",
      confirmPassword: "abc1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password without a number", () => {
    const result = signUpSchema.safeParse({
      email: "a@b.com",
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords and points at the confirmation field", () => {
    const result = signUpSchema.safeParse({
      email: "a@b.com",
      password: "hunter2pass",
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).confirmPassword).toMatch(/do not match/i);
    }
  });

  it("rejects an invalid email on sign in", () => {
    expect(signInSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("accepts a valid reset request", () => {
    expect(resetPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
});

describe("fieldErrors", () => {
  it("flattens a Zod error into a field map", () => {
    const result = tradeSchema.safeParse({ ...validTrade(), accountId: "", symbol: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(Object.keys(errors)).toContain("accountId");
      expect(Object.keys(errors)).toContain("symbol");
    }
  });

  it("keeps only the first message per field", () => {
    const result = tradeSchema.safeParse({});
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(typeof errors.accountId).toBe("string");
    }
  });
});
