import {
  buildPreview,
  candidatesToTrades,
  detectAdapter,
  detectDelimiter,
  fingerprintOf,
  genericAdapter,
  parseCsv,
  parseDateTime,
  parseNumber,
  suggestMapping,
} from "../lib/csv";

describe("detectDelimiter", () => {
  it("detects a comma", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });
  it("detects a semicolon", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });
  it("detects a tab", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("defaults to comma for a single column", () => {
    expect(detectDelimiter("symbol\nEURUSD")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("parses a simple table", () => {
    const result = parseCsv("symbol,price\nEURUSD,1.10\nGBPUSD,1.25");
    expect(result.headers).toEqual(["symbol", "price"]);
    expect(result.rows).toEqual([
      ["EURUSD", "1.10"],
      ["GBPUSD", "1.25"],
    ]);
  });

  it("handles quoted fields containing the delimiter", () => {
    const result = parseCsv('symbol,note\nEURUSD,"entry, after news"');
    expect(result.rows[0]?.[1]).toBe("entry, after news");
  });

  it("handles escaped quotes inside quoted fields", () => {
    const result = parseCsv('symbol,note\nEURUSD,"he said ""go"""');
    expect(result.rows[0]?.[1]).toBe('he said "go"');
  });

  it("handles newlines inside quoted fields", () => {
    const result = parseCsv('symbol,note\nEURUSD,"line one\nline two"');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.[1]).toBe("line one\nline two");
  });

  it("handles CRLF line endings", () => {
    const result = parseCsv("symbol,price\r\nEURUSD,1.10\r\n");
    expect(result.rows).toEqual([["EURUSD", "1.10"]]);
  });

  it("strips a UTF-8 BOM", () => {
    const result = parseCsv("\uFEFFsymbol,price\nEURUSD,1.10");
    expect(result.headers[0]).toBe("symbol");
  });

  it("skips entirely blank lines", () => {
    const result = parseCsv("a,b\n1,2\n\n3,4");
    expect(result.rows).toHaveLength(2);
  });

  it("pads short rows and reports them as malformed", () => {
    const result = parseCsv("a,b,c\n1,2");
    expect(result.rows[0]).toEqual(["1", "2", ""]);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0]?.reason).toMatch(/Expected 3 columns/);
  });

  it("returns empty structures for empty input", () => {
    const result = parseCsv("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it("accepts an explicit delimiter override", () => {
    const result = parseCsv("a;b\n1;2", ",");
    // The header is one column because the override ignores the semicolons.
    expect(result.headers).toEqual(["a;b"]);
    expect(result.rows[0]).toEqual(["1;2"]);
  });
});

describe("parseNumber", () => {
  it("parses plain numbers", () => {
    expect(parseNumber("123.45")).toBe(123.45);
    expect(parseNumber("-50")).toBe(-50);
  });

  it("parses accounting-style negatives in parentheses", () => {
    expect(parseNumber("(123.45)")).toBe(-123.45);
  });

  it("parses thousands separators", () => {
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("1,234,567")).toBe(1234567);
  });

  it("parses European decimal commas", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1234,56")).toBe(1234.56);
  });

  it("treats a trailing one/two-digit comma group as decimals", () => {
    expect(parseNumber("1,10")).toBe(1.1);
    expect(parseNumber("1,5")).toBe(1.5);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseNumber("$1,234.56")).toBe(1234.56);
    expect(parseNumber("€ 1 234,56")).toBe(1234.56);
    expect(parseNumber("UGX 1,000")).toBe(1000);
  });

  it("returns null for empty or non-numeric text", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
  });

  it("rejects Infinity", () => {
    expect(parseNumber("Infinity")).toBeNull();
  });
});

describe("parseDateTime", () => {
  it("parses ISO strings", () => {
    expect(parseDateTime("2026-03-04T09:31:00.000Z")).toBe("2026-03-04T09:31:00.000Z");
  });

  it("parses day-first dates", () => {
    expect(parseDateTime("04/03/2026")).toBe("2026-03-04T00:00:00.000Z");
    expect(parseDateTime("04.03.2026 09:31")).toBe("2026-03-04T09:31:00.000Z");
  });

  it("parses month-first dates when the day is unambiguous", () => {
    expect(parseDateTime("03/25/2026")).toBe("2026-03-25T00:00:00.000Z");
  });

  it("parses Unix timestamps in seconds and milliseconds", () => {
    expect(parseDateTime("1772614260")).toBe("2026-03-04T08:51:00.000Z");
    expect(parseDateTime("1772614260000")).toBe("2026-03-04T08:51:00.000Z");
  });

  it("returns null for unparseable values", () => {
    expect(parseDateTime("")).toBeNull();
    expect(parseDateTime("not a date")).toBeNull();
  });

  it("keeps a full date-time with seconds", () => {
    expect(parseDateTime("2026-03-04 09:31:45")).toBe("2026-03-04T09:31:45.000Z");
  });
});

describe("detectAdapter and suggestMapping", () => {
  it("maps common broker headers onto fields", () => {
    const headers = ["Symbol", "Side", "Entry Price", "Exit Price", "Size", "Commission"];
    const mapping = suggestMapping(headers, genericAdapter);
    expect(mapping["Symbol"]).toBe("symbol");
    expect(mapping["Side"]).toBe("direction");
    expect(mapping["Entry Price"]).toBe("entryPrice");
    expect(mapping["Exit Price"]).toBe("exitPrice");
    expect(mapping["Size"]).toBe("quantity");
    expect(mapping["Commission"]).toBe("entryFees");
  });

  it("leaves unknown headers unmapped", () => {
    const mapping = suggestMapping(["Symbol", "Mystery Column"], genericAdapter);
    expect(mapping["Mystery Column"]).toBeNull();
  });

  it("falls back to the generic adapter", () => {
    expect(detectAdapter(["anything"], [genericAdapter]).id).toBe("generic");
  });

  it("is tolerant of case, spaces, underscores and dashes", () => {
    const mapping = suggestMapping(["ENTRY_PRICE", "entry-price", "Entry  Price"]);
    expect(mapping["ENTRY_PRICE"]).toBe("entryPrice");
    expect(mapping["entry-price"]).toBe("entryPrice");
    expect(mapping["Entry  Price"]).toBe("entryPrice");
  });
});

describe("fingerprintOf", () => {
  it("is stable for the same logical trade", () => {
    const a = fingerprintOf({
      symbol: "eurusd",
      direction: "long",
      entryPrice: "1.10",
      entryAt: "2026-03-04T09:31:00.000Z",
      quantity: "1",
    });
    const b = fingerprintOf({
      symbol: "EURUSD",
      direction: "LONG",
      entryPrice: "1.10",
      entryAt: "2026-03-04T09:31:00.000Z",
      quantity: "1",
    });
    expect(a).toBe(b);
  });

  it("differs when the entry price differs", () => {
    const a = fingerprintOf({ symbol: "EURUSD", entryPrice: "1.10", entryAt: "x", quantity: "1" });
    const b = fingerprintOf({ symbol: "EURUSD", entryPrice: "1.11", entryAt: "x", quantity: "1" });
    expect(a).not.toBe(b);
  });
});

describe("buildPreview", () => {
  const csv = [
    "Symbol,Side,Entry Price,Exit Price,Size,Entry Time",
    "EURUSD,buy,1.1000,1.1100,1,2026-03-04T09:31:00.000Z",
    "GBPUSD,sell,1.2500,1.2400,1,2026-03-04T10:00:00.000Z",
    "BADPAIR,buy,notanumber,1.1,1,2026-03-04T11:00:00.000Z",
  ].join("\n");

  it("flags rows with invalid numbers", () => {
    const parsed = parseCsv(csv);
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(2);
    expect(preview.errorRows).toBe(1);
    expect(preview.candidates[2]?.errors.some((e) => /not a valid number/.test(e))).toBe(true);
  });

  it("normalises buy/sell into long/short", () => {
    const parsed = parseCsv(csv);
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(preview.candidates[0]?.values.direction).toBe("long");
    expect(preview.candidates[1]?.values.direction).toBe("short");
  });

  it("detects duplicates within the file", () => {
    const dupes = [
      "Symbol,Side,Entry Price,Size,Entry Time",
      "EURUSD,buy,1.1000,1,2026-03-04T09:31:00.000Z",
      "EURUSD,buy,1.1000,1,2026-03-04T09:31:00.000Z",
    ].join("\n");
    const parsed = parseCsv(dupes);
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(preview.duplicateRows).toBe(1);
    expect(preview.candidates[1]?.warnings.some((w) => /duplicate/i.test(w))).toBe(true);
  });

  it("detects duplicates against existing journal records", () => {
    const parsed = parseCsv(csv);
    const existing = new Set([
      fingerprintOf({
        symbol: "EURUSD",
        direction: "long",
        entryPrice: "1.1000",
        entryAt: "2026-03-04T09:31:00.000Z",
        quantity: "1",
      }),
    ]);
    const preview = buildPreview(parsed, suggestMapping(parsed.headers), existing);
    expect(preview.duplicateRows).toBe(1);
  });

  it("reports missing required fields", () => {
    const missing = ["Symbol,Side,Entry Price", "EURUSD,buy,1.1"].join("\n");
    const parsed = parseCsv(missing);
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(preview.candidates[0]?.errors.some((e) => /entryAt/.test(e))).toBe(true);
    expect(preview.candidates[0]?.errors.some((e) => /quantity/.test(e))).toBe(true);
  });

  it("assumes long and warns when no direction column is mapped", () => {
    const noDir = ["Symbol,Entry Price,Size,Entry Time", "EURUSD,1.1,1,2026-03-04T09:31:00.000Z"].join("\n");
    const parsed = parseCsv(noDir);
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(preview.candidates[0]?.values.direction).toBe("long");
    expect(preview.candidates[0]?.warnings.some((w) => /assuming long/i.test(w))).toBe(true);
  });
});

describe("candidatesToTrades", () => {
  it("converts valid rows into trade inputs with parsed numbers and dates", () => {
    const parsed = parseCsv(
      [
        "Symbol,Side,Entry Price,Exit Price,Size,Entry Time,Exit Time",
        "EURUSD,buy,1.1000,1.1100,1,2026-03-04T09:31:00.000Z,2026-03-04T12:00:00.000Z",
      ].join("\n")
    );
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    const trades = candidatesToTrades(preview, "acct-1");
    expect(trades).toHaveLength(1);
    expect(trades[0]?.symbol).toBe("EURUSD");
    expect(trades[0]?.entryPrice).toBe("1.1000");
    expect(trades[0]?.exitPrice).toBe("1.11");
    expect(trades[0]?.status).toBe("closed");
    expect(trades[0]?.accountId).toBe("acct-1");
  });

  it("marks a row without an exit price as open", () => {
    const parsed = parseCsv(
      ["Symbol,Side,Entry Price,Size,Entry Time", "EURUSD,buy,1.1,1,2026-03-04T09:31:00.000Z"].join("\n")
    );
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(candidatesToTrades(preview, "a")[0]?.status).toBe("open");
  });

  it("excludes rows with errors", () => {
    const parsed = parseCsv(
      ["Symbol,Entry Price,Size,Entry Time", "EURUSD,bad,1,2026-03-04T09:31:00.000Z"].join("\n")
    );
    const preview = buildPreview(parsed, suggestMapping(parsed.headers));
    expect(candidatesToTrades(preview, "a")).toHaveLength(0);
  });
});
