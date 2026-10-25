import {
  aggregateMultiCurrency,
  convert,
  createRateTable,
  formatCurrency,
  sharePercent,
  type ExchangeRate,
} from "../lib/fx";

const rates: ExchangeRate[] = [
  { base: "USD", quote: "EUR", rate: 0.92, asOf: "2026-03-04T00:00:00.000Z", source: "test" },
  { base: "USD", quote: "UGX", rate: 3800, asOf: "2026-03-04T00:00:00.000Z", source: "test" },
  { base: "GBP", quote: "USD", rate: 1.27, asOf: "2026-03-04T00:00:00.000Z", source: "test" },
];

describe("createRateTable", () => {
  it("looks up an explicit rate", () => {
    const table = createRateTable(rates);
    expect(table.get("USD", "EUR")?.rate).toBe(0.92);
  });

  it("returns an identity rate for the same currency", () => {
    const table = createRateTable(rates);
    expect(table.get("USD", "USD")?.rate).toBe(1);
  });

  it("derives the inverse rate", () => {
    const table = createRateTable(rates);
    const inverse = table.get("EUR", "USD");
    expect(inverse?.rate).toBeCloseTo(1 / 0.92, 12);
    expect(inverse?.source).toMatch(/derived inverse/);
  });

  it("prefers an explicit inverse over a derived one", () => {
    const table = createRateTable([
      { base: "USD", quote: "EUR", rate: 0.92, asOf: "2026-03-04T00:00:00.000Z", source: "a" },
      { base: "EUR", quote: "USD", rate: 1.1, asOf: "2026-03-04T00:00:00.000Z", source: "explicit" },
    ]);
    expect(table.get("EUR", "USD")?.rate).toBe(1.1);
    expect(table.get("EUR", "USD")?.source).toBe("explicit");
  });

  it("returns null for an unavailable pair", () => {
    const table = createRateTable(rates);
    expect(table.get("EUR", "UGX")).toBeNull();
  });
});

describe("convert", () => {
  const table = createRateTable(rates);

  it("converts using an explicit rate", () => {
    const result = convert(100, "USD", "EUR", table);
    expect(result.value).toBeCloseTo(92, 8);
    expect(result.rate).toBe(0.92);
    expect(result.error).toBeNull();
  });

  it("returns the same amount for identical currencies", () => {
    const result = convert(100, "USD", "USD", table);
    expect(result.value).toBe(100);
    expect(result.source).toBe("identity");
  });

  it("refuses to convert without a rate rather than guessing", () => {
    const result = convert(100, "EUR", "UGX", table);
    expect(result.value).toBeNull();
    expect(result.rate).toBeNull();
    expect(result.error).toMatch(/No exchange rate available/);
  });

  it("flags a stale rate", () => {
    const staleTable = createRateTable([
      { base: "USD", quote: "EUR", rate: 0.92, asOf: "2026-01-01T00:00:00.000Z", source: "old" },
    ]);
    const result = convert(100, "USD", "EUR", staleTable, {
      now: new Date("2026-03-04T00:00:00.000Z"),
    });
    expect(result.stale).toBe(true);
  });

  it("does not flag a fresh rate", () => {
    const result = convert(100, "USD", "EUR", table, {
      now: new Date("2026-03-04T06:00:00.000Z"),
    });
    expect(result.stale).toBe(false);
  });

  it("discloses the rate source and date", () => {
    const result = convert(100, "USD", "EUR", table);
    expect(result.source).toBe("test");
    expect(result.asOf).toBe("2026-03-04T00:00:00.000Z");
  });

  it("handles large amounts without drift", () => {
    const result = convert(1_000_000, "USD", "UGX", table);
    expect(result.value).toBe(3_800_000_000);
  });

  it("converts negative amounts (a loss)", () => {
    const result = convert(-100, "USD", "EUR", table);
    expect(result.value).toBeCloseTo(-92, 8);
  });
});

describe("aggregateMultiCurrency", () => {
  const table = createRateTable(rates);

  it("sums amounts already in the reporting currency", () => {
    const result = aggregateMultiCurrency(
      [
        { currency: "USD", amount: 100 },
        { currency: "USD", amount: 50 },
      ],
      "USD",
      table
    );
    expect(result.total).toBe(150);
    expect(result.incomplete).toBe(false);
  });

  it("converts and sums across currencies", () => {
    const result = aggregateMultiCurrency(
      [
        { currency: "USD", amount: 100 },
        { currency: "EUR", amount: 92 }, // -> 100 USD
      ],
      "USD",
      table
    );
    expect(result.total).toBeCloseTo(200, 6);
    expect(result.incomplete).toBe(false);
  });

  it("refuses a total when a rate is missing and names the currency", () => {
    const result = aggregateMultiCurrency(
      [
        { currency: "USD", amount: 100 },
        { currency: "UGX", amount: 380000 },
      ],
      "EUR",
      table
    );
    expect(result.total).toBeNull();
    expect(result.incomplete).toBe(true);
    expect(result.unconverted[0]?.currency).toBe("UGX");
    expect(result.notes.some((n) => /UGX/.test(n))).toBe(true);
  });

  it("notes a stale rate in the summary", () => {
    const staleTable = createRateTable([
      { base: "USD", quote: "EUR", rate: 0.92, asOf: "2026-01-01T00:00:00.000Z", source: "old" },
    ]);
    const result = aggregateMultiCurrency(
      [{ currency: "EUR", amount: 92 }],
      "USD",
      staleTable
    );
    expect(result.notes.some((n) => /out of date/.test(n))).toBe(true);
  });

  it("ignores zero amounts", () => {
    const result = aggregateMultiCurrency(
      [
        { currency: "USD", amount: 0 },
        { currency: "UGX", amount: 0 },
      ],
      "USD",
      table
    );
    expect(result.total).toBe(0);
    expect(result.unconverted).toHaveLength(0);
  });
});

describe("formatCurrency", () => {
  it("formats with the currency symbol", () => {
    expect(formatCurrency(1234.5, "USD")).toContain("1,234.50");
  });

  it("handles a currency without a common symbol", () => {
    const formatted = formatCurrency(1000, "UGX");
    expect(formatted).toMatch(/1,000/);
  });

  it("falls back to a plain format for a bad locale", () => {
    expect(formatCurrency(10, "USD", "not-a-locale!!")).toMatch(/10\.00/);
  });
});

describe("sharePercent", () => {
  it("returns a fraction", () => {
    expect(sharePercent(25, 100)).toBe(0.25);
  });

  it("returns null for a zero whole", () => {
    expect(sharePercent(1, 0)).toBeNull();
  });
});
