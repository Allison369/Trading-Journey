/**
 * Sample data for the local (offline) store.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE CHANGING ANY NUMBERS
 * ---------------------------------------------------------------------------
 * These rows are SAMPLE data. They exist so the interface has something to
 * draw when the app runs without a Supabase project.
 *
 * They are NOT the user's results, and the app never presents them as such:
 *   * the store reports `kind: "local"` and the shell shows an "Offline" banner
 *   * every screen that renders them shows a "Sample data" badge
 *   * switching to Supabase replaces them entirely with real records
 *
 * Never add a fabricated statistic here. Every figure below is derived from
 * these rows by the same `@tradevault/core` engine the real app uses — nothing
 * is hardcoded as a headline number. If you want to show a different win rate,
 * change a trade, not a label.
 * ---------------------------------------------------------------------------
 *
 * The numbers themselves are deliberately unremarkable: a small account, a mix
 * of winners and losers, one open position and one partial exit. A sample that
 * looks like a lottery win teaches a new user nothing.
 */

import type {
  JournalAttachmentRow,
  JournalEntryRow,
  TradeAttachmentRow,
  TradeExitRow,
  TradeRow,
  TradingAccountRow,
  TradingStrategyRow,
} from "./database.types";
import sampleImageSizes from "./sampleImageSizes.json";

export const SAMPLE_ACCOUNT_ID = "sample-acct-0000-0000-0000-000000000001";
export const SAMPLE_PRACTICE_ACCOUNT_ID = "sample-acct-0000-0000-0000-000000000002";

export const SAMPLE_STRATEGY_BREAKOUT = "sample-strat-0000-0000-0000-000000000001";
export const SAMPLE_STRATEGY_REVERSION = "sample-strat-0000-0000-0000-000000000002";

const T1 = "sample-trade-0000-0000-0000-000000000001";
const T2 = "sample-trade-0000-0000-0000-000000000002";
const T3 = "sample-trade-0000-0000-0000-000000000003";
const T4 = "sample-trade-0000-0000-0000-000000000004";
const T5 = "sample-trade-0000-0000-0000-000000000005";
const T6 = "sample-trade-0000-0000-0000-000000000006";

/** The sample journal entries. Referenced by the attachment seed below. */
const J1 = "sample-journal-0000-0000-0000-000000000001";
const J2 = "sample-journal-0000-0000-0000-000000000002";
const J3 = "sample-journal-0000-0000-0000-000000000003";

export function seedAccounts(userId: string): TradingAccountRow[] {
  const at = "2026-01-15T08:00:00.000Z";
  return [
    {
      id: SAMPLE_ACCOUNT_ID,
      user_id: userId,
      name: "Sample Main Account",
      broker: "Example Broker",
      currency: "USD",
      starting_balance: "10000",
      balance_adjustments: "0",
      is_archived: false,
      created_at: at,
      updated_at: at,
      revision: 1,
      deleted_at: null,
    },
    {
      id: SAMPLE_PRACTICE_ACCOUNT_ID,
      user_id: userId,
      name: "Sample Practice Account",
      broker: "Example Broker",
      currency: "USD",
      starting_balance: "2000",
      balance_adjustments: "0",
      is_archived: false,
      created_at: at,
      updated_at: at,
      revision: 1,
      deleted_at: null,
    },
  ];
}

export function seedStrategies(userId: string): TradingStrategyRow[] {
  const at = "2026-01-15T08:05:00.000Z";
  return [
    {
      id: SAMPLE_STRATEGY_BREAKOUT,
      user_id: userId,
      name: "London Breakout",
      description: "Trade the first decisive break of the Asian range at the London open.",
      markets: ["FX"],
      instruments: ["EURUSD", "GBPUSD"],
      entry_rules: "Wait for the Asian range to form. Enter on a close beyond the range with momentum.",
      exit_rules: "Take half at 1R, then trail the remainder behind the session extreme.",
      risk_rules: "Risk 1% of equity. No entry within 15 minutes of a major release.",
      session: "london",
      checklist: ["Asian range marked", "No imminent news", "Position sized", "Stop placed"],
      tags: ["breakout", "london"],
      improvement_notes: null,
      is_archived: false,
      created_at: at,
      updated_at: at,
      revision: 1,
      deleted_at: null,
    },
    {
      id: SAMPLE_STRATEGY_REVERSION,
      user_id: userId,
      name: "Daily Mean Reversion",
      description: "Fade an extended move into a daily level, with confirmation.",
      markets: ["FX", "Metals"],
      instruments: ["EURUSD", "XAUUSD"],
      entry_rules: "Price reaches a daily level and prints a rejection candle.",
      exit_rules: "Target the mid-range. Exit on a close back through the level.",
      risk_rules: "Risk 0.5%. Skip when the daily trend is strongly directional.",
      session: "new_york",
      checklist: ["Level marked", "Rejection candle", "Position sized"],
      tags: ["mean-reversion", "daily"],
      improvement_notes: null,
      is_archived: false,
      created_at: at,
      updated_at: at,
      revision: 1,
      deleted_at: null,
    },
  ];
}

export function seedTrades(userId: string): TradeRow[] {
  const base = {
    user_id: userId,
    asset_class: "forex" as const,
    order_type: "market" as const,
    funding_fees: "0",
    slippage: "0",
    manual_net_pnl: null,
    import_fingerprint: null,
    strategy: null as string | null,
    strategy_id: null as string | null,
    setup_type: null as string | null,
    entry_reason: null as string | null,
    exit_reason: null as string | null,
    emotion_before: null as TradeRow["emotion_before"],
    emotion_during: null as TradeRow["emotion_during"],
    emotion_after: null as TradeRow["emotion_after"],
    mistakes: null as string | null,
    lessons: null as string | null,
    notes: null as string | null,
    market: null as string | null,
    revision: 1,
    deleted_at: null,
  };

  return [
    // 1 — a full winner. Closed 1 lot EURUSD from 1.0850 to 1.0912.
    //     gross = (1.0912 - 1.0850) * 1 * 100000 = 620
    //     costs = 3.50 + 3.50 = 7          net = 613
    {
      ...base,
      id: T1,
      account_id: SAMPLE_ACCOUNT_ID,
      strategy_id: SAMPLE_STRATEGY_BREAKOUT,
      symbol: "EURUSD",
      market: "FX",
      direction: "long",
      status: "closed",
      entry_at: "2026-02-02T08:05:00.000Z",
      entry_price: "1.08500",
      exit_at: "2026-02-02T14:20:00.000Z",
      exit_price: "1.09120",
      quantity: "1",
      contract_multiplier: "100000",
      stop_loss: "1.08200",
      take_profit: "1.09400",
      entry_fees: "3.50",
      exit_fees: "3.50",
      strategy: "London Breakout",
      session: "london",
      entry_reason: "Clean break of the Asian range with a strong close.",
      exit_reason: "Trailed out behind the session high as momentum faded.",
      emotion_before: "calm",
      emotion_during: "confident",
      emotion_after: "calm",
      lessons: "Waiting for the retest gave a better fill than chasing would have.",
      created_at: "2026-02-02T08:05:00.000Z",
      updated_at: "2026-02-02T14:20:00.000Z",
    },

    // 2 — a loser, stopped out. gross = (1.2605 - 1.2640) * 100000 = -350
    //     costs = 3.50 + 3.50 + 5 slippage = 12    net = -362
    {
      ...base,
      id: T2,
      account_id: SAMPLE_ACCOUNT_ID,
      strategy_id: SAMPLE_STRATEGY_BREAKOUT,
      symbol: "GBPUSD",
      market: "FX",
      direction: "long",
      status: "closed",
      entry_at: "2026-02-03T08:10:00.000Z",
      entry_price: "1.26400",
      exit_at: "2026-02-03T09:05:00.000Z",
      exit_price: "1.26050",
      quantity: "1",
      contract_multiplier: "100000",
      stop_loss: "1.26100",
      take_profit: "1.27200",
      entry_fees: "3.50",
      exit_fees: "3.50",
      slippage: "5",
      strategy: "London Breakout",
      session: "london",
      entry_reason: "Break of the range high.",
      exit_reason: "Stopped out on a sharp reversal.",
      emotion_before: "confident",
      emotion_during: "impatient",
      emotion_after: "frustrated",
      mistakes: "Entered before the candle closed.",
      lessons: "Wait for the confirmed close; the setup is defined by it.",
      created_at: "2026-02-03T08:10:00.000Z",
      updated_at: "2026-02-03T09:05:00.000Z",
    },

    // 3 — short gold, two partial exits.
    //     leg 1: (2035.50 - 2030.00) * 1 * 100 = 550
    //     leg 2: (2035.50 - 2026.00) * 1 * 100 = 950
    //     gross = 1500, costs = 4 + 2 + 2 + 1.20 funding = 9.20   net = 1490.80
    {
      ...base,
      id: T3,
      account_id: SAMPLE_ACCOUNT_ID,
      strategy_id: SAMPLE_STRATEGY_REVERSION,
      symbol: "XAUUSD",
      asset_class: "commodity",
      market: "Metals",
      direction: "short",
      status: "closed",
      order_type: "limit",
      entry_at: "2026-02-05T14:00:00.000Z",
      entry_price: "2035.50",
      exit_at: "2026-02-05T18:30:00.000Z",
      exit_price: "2026.00",
      quantity: "2",
      contract_multiplier: "100",
      stop_loss: "2042.00",
      take_profit: "2022.00",
      entry_fees: "4",
      exit_fees: "4",
      funding_fees: "1.20",
      strategy: "Daily Mean Reversion",
      session: "new_york",
      entry_reason: "Rejection wick at daily resistance.",
      exit_reason: "Scaled out into the mid-range.",
      emotion_before: "neutral",
      emotion_during: "calm",
      emotion_after: "confident",
      notes: "Two-leg exit: half at the first target, half at the mid-range.",
      created_at: "2026-02-05T14:00:00.000Z",
      updated_at: "2026-02-05T18:30:00.000Z",
    },

    // 4 — a scratch. gross = (1.0790 - 1.0788) * 100000 = 20
    //     costs = 3.50 + 3.50 = 7    net = 13 (a small win, honestly labelled)
    {
      ...base,
      id: T4,
      account_id: SAMPLE_ACCOUNT_ID,
      symbol: "EURUSD",
      market: "FX",
      direction: "short",
      status: "closed",
      entry_at: "2026-02-09T10:00:00.000Z",
      entry_price: "1.07900",
      exit_at: "2026-02-09T11:15:00.000Z",
      exit_price: "1.07880",
      quantity: "1",
      contract_multiplier: "100000",
      stop_loss: "1.08300",
      take_profit: "1.07000",
      entry_fees: "3.50",
      exit_fees: "3.50",
      session: "london",
      entry_reason: "Faded an extended push.",
      exit_reason: "Closed early when the market stalled.",
      emotion_before: "anxious",
      emotion_during: "anxious",
      emotion_after: "neutral",
      mistakes: "Cut it before the plan said to.",
      notes: "Moved the stop to breakeven far too early.",
      created_at: "2026-02-09T10:00:00.000Z",
      updated_at: "2026-02-09T11:15:00.000Z",
    },

    // 5 — STILL OPEN. Must never contribute to realised performance.
    {
      ...base,
      id: T5,
      account_id: SAMPLE_ACCOUNT_ID,
      strategy_id: SAMPLE_STRATEGY_BREAKOUT,
      symbol: "EURUSD",
      market: "FX",
      direction: "long",
      status: "open",
      entry_at: "2026-02-12T08:05:00.000Z",
      entry_price: "1.09200",
      exit_at: null,
      exit_price: null,
      quantity: "1",
      contract_multiplier: "100000",
      stop_loss: "1.08900",
      take_profit: "1.09800",
      entry_fees: "3.50",
      exit_fees: "0",
      strategy: "London Breakout",
      session: "london",
      entry_reason: "Range break with momentum.",
      emotion_before: "calm",
      emotion_during: "calm",
      notes: "Open position carried from the London session.",
      created_at: "2026-02-12T08:05:00.000Z",
      updated_at: "2026-02-12T08:05:00.000Z",
    },

    // 6 — partially closed on the practice account.
    //     opened 0.5 lots; 0.25 closed at 1.2580 from 1.2550 -> +75 gross
    {
      ...base,
      id: T6,
      account_id: SAMPLE_PRACTICE_ACCOUNT_ID,
      strategy_id: SAMPLE_STRATEGY_REVERSION,
      symbol: "GBPUSD",
      market: "FX",
      direction: "long",
      status: "partial",
      entry_at: "2026-02-11T12:00:00.000Z",
      entry_price: "1.25500",
      exit_at: "2026-02-11T16:00:00.000Z",
      exit_price: "1.25800",
      quantity: "0.5",
      contract_multiplier: "100000",
      stop_loss: "1.25200",
      take_profit: "1.26200",
      entry_fees: "1",
      exit_fees: "1",
      strategy: "Daily Mean Reversion",
      session: "new_york",
      entry_reason: "Bounce from daily support.",
      exit_reason: "Banked half at the first target.",
      emotion_before: "confident",
      emotion_during: "calm",
      emotion_after: "calm",
      notes: "Half closed; the remainder runs toward the daily mid-range.",
      created_at: "2026-02-11T12:00:00.000Z",
      updated_at: "2026-02-11T16:00:00.000Z",
    },
  ];
}

export function seedExits(userId: string): TradeExitRow[] {
  const make = (
    id: string,
    tradeId: string,
    quantity: string,
    price: string,
    fees: string,
    exitedAt: string,
    notes: string | null
  ): TradeExitRow => ({
    id,
    user_id: userId,
    trade_id: tradeId,
    quantity,
    price,
    fees,
    exited_at: exitedAt,
    notes,
    created_at: exitedAt,
    updated_at: exitedAt,
    revision: 1,
    deleted_at: null,
  });

  return [
    make("sample-exit-0000-0000-0000-000000000001", T1, "1", "1.09120", "3.50", "2026-02-02T14:20:00.000Z", null),
    make("sample-exit-0000-0000-0000-000000000002", T2, "1", "1.26050", "3.50", "2026-02-03T09:05:00.000Z", "Stopped out."),
    make("sample-exit-0000-0000-0000-000000000003", T3, "1", "2030.00", "2.00", "2026-02-05T16:00:00.000Z", "First target."),
    make("sample-exit-0000-0000-0000-000000000004", T3, "1", "2026.00", "2.00", "2026-02-05T18:30:00.000Z", "Runner closed at the mid-range."),
    make("sample-exit-0000-0000-0000-000000000005", T4, "1", "1.07880", "3.50", "2026-02-09T11:15:00.000Z", null),
    make("sample-exit-0000-0000-0000-000000000006", T6, "0.25", "1.25800", "1.00", "2026-02-11T16:00:00.000Z", "Half of the position."),
  ];
}

export function seedJournal(userId: string): JournalEntryRow[] {
  const make = (
    id: string,
    entryDate: string,
    period: JournalEntryRow["period"],
    fields: Partial<JournalEntryRow>
  ): JournalEntryRow => ({
    id,
    user_id: userId,
    entry_date: entryDate,
    period,
    title: null,
    goals: null,
    market_observations: null,
    pre_market_plan: null,
    trades_summary: null,
    emotional_state: null,
    discipline_score: null,
    mistakes: null,
    lessons: null,
    improvements: null,
    notes: null,
    linked_trade_ids: [],
    tags: [],
    created_at: `${entryDate}T20:00:00.000Z`,
    updated_at: `${entryDate}T20:00:00.000Z`,
    revision: 1,
    deleted_at: null,
    ...fields,
  });

  return [
    make(J1, "2026-02-02", "daily", {
      title: "Range break, clean execution",
      goals: "Only take the London break if the Asian range is at least 20 pips.",
      market_observations: "USD soft into the London open; EURUSD holding above the Asian high.",
      pre_market_plan: "Mark the Asian range at 07:30. One setup only, 1% risk.",
      trades_summary: "One trade, one win. Followed the plan exactly.",
      emotional_state: "Calm and patient.",
      discipline_score: 9,
      lessons: "Waiting for the retest produced a materially better entry.",
      improvements: "Keep writing the range levels down before the open.",
      tags: ["london", "discipline"],
    }),
    make(J2, "2026-02-03", "daily", {
      title: "Chased an entry",
      goals: "No entries before the candle closes.",
      market_observations: "Sharp reversal after the initial push; the range high failed.",
      pre_market_plan: "Wait for confirmation.",
      trades_summary: "One trade, one loss. Entered too early and was stopped out.",
      emotional_state: "Confident, then impatient.",
      discipline_score: 5,
      mistakes: "Entered before the candle closed and without the retest.",
      lessons: "Confirmation is not optional; the setup is defined by it.",
      improvements: "Add a hard rule: no entry until the 15-minute candle closes.",
      tags: ["mistake", "discipline"],
    }),
    make(J3, "2026-02-05", "weekly", {
      title: "Week 6 review",
      goals: "Two clean setups, zero rule breaks.",
      market_observations: "Gold rejected daily resistance twice; the dollar index stayed firm.",
      pre_market_plan: "Focus on the mean-reversion setup at the daily level.",
      trades_summary: "Two trades closed and one still open. Costs are tracked separately from gross.",
      emotional_state: "Neutral.",
      discipline_score: 7,
      mistakes: "Closed the EURUSD short too early out of impatience.",
      lessons: "Small losses are cheap; cutting winners short is expensive.",
      improvements: "Test a fixed second target instead of a discretionary exit.",
      tags: ["review"],
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Sample screenshots                                                  */
/* ------------------------------------------------------------------ */

/**
 * The sample trades come with sample screenshots, so the gallery, the uploader
 * and the storage path are all visible without the user having to part with a
 * chart of their own first.
 *
 * Two things make these different from a photo someone uploads:
 *
 *   * The bytes live in `apps/web/public/samples/` as ordinary files instead of
 *     in IndexedDB. The rows therefore keep a plain `/samples/...` URL in
 *     `remote_path`, which `attachmentUrl` hands straight to the <img>. Only
 *     user uploads go through the blob store.
 *   * They are drawn with "SAMPLE SCREENSHOT" burnt into the image, not just
 *     labelled in the surrounding interface, so a screenshot of the app cannot
 *     lose the label on its way into a conversation.
 *
 * Every sample trade with a screenshot references one of these ids. Nothing
 * here is user data, and nothing here is uploaded anywhere.
 */
export const SAMPLE_ATTACHMENT_IDS = [
  "sample-attach-0000-0000-0000-000000000001",
  "sample-attach-0000-0000-0000-000000000002",
  "sample-attach-0000-0000-0000-000000000003",
] as const;

/**
 * The sample journal images. A journal entry outlives any single trade, so
 * these are stored in their own table and their own ids.
 */
export const SAMPLE_JOURNAL_ATTACHMENT_IDS = [
  "sample-journal-attach-0000-0000-0000-000000000001",
  "sample-journal-attach-0000-0000-0000-000000000002",
] as const;

const SAMPLE_REMOTE_PATH_PREFIX = "/samples/";

export function isSampleRemotePath(remotePath: string | null): boolean {
  return typeof remotePath === "string" && remotePath.startsWith(SAMPLE_REMOTE_PATH_PREFIX);
}

/**
 * The real size of each sample image, in bytes.
 *
 * Generated by `scripts/generate-sample-screenshots.ps1` alongside the images
 * themselves. Hand-maintained numbers would drift the moment a chart was
 * redrawn, and a gallery that quotes the wrong file size is a small lie in a
 * place the app is otherwise careful about.
 */
function sampleImageBytes(slug: string): number {
  const bytes = sampleImageSizes[slug as keyof typeof sampleImageSizes];
  if (typeof bytes !== "number") {
    // A missing entry means the image was regenerated without the manifest
    // being refreshed. Report zero rather than a number that is not true.
    return 0;
  }
  return bytes;
}

export function seedAttachments(userId: string): TradeAttachmentRow[] {
  const at = "2026-02-02T08:04:00.000Z";

  const make = (
    id: string,
    tradeId: string,
    slug: string,
    caption: string
  ): TradeAttachmentRow => ({
    id,
    user_id: userId,
    trade_id: tradeId,
    remote_path: `${SAMPLE_REMOTE_PATH_PREFIX}${slug}`,
    file_name: slug,
    mime_type: "image/png",
    byte_size: sampleImageBytes(slug),
    caption,
    created_at: at,
    updated_at: at,
    revision: 1,
    deleted_at: null,
  });

  return [
    make(
      SAMPLE_ATTACHMENT_IDS[0],
      T1,
      "eurusd-5m.png",
      "Entry on the retest of the London high."
    ),
    make(
      SAMPLE_ATTACHMENT_IDS[1],
      T2,
      "gbpusd-15m.png",
      "Stopped out when the level was lost."
    ),
    make(
      SAMPLE_ATTACHMENT_IDS[2],
      T3,
      "xauusd-1h.png",
      "Session high rejected; trailed the stop down."
    ),
  ];
}

/**
 * The sample journal entries come with sample images too.
 *
 * These are review charts rather than trade screenshots: they mark the levels
 * the entry talks about (the Asian range, the range high that failed) instead
 * of a single entry and exit. Same rules as the trade images - ordinary files
 * in the app bundle, a plain `/samples/...` path, and "SAMPLE SCREENSHOT"
 * burnt into the picture itself.
 */
export function seedJournalAttachments(userId: string): JournalAttachmentRow[] {
  const at = "2026-02-05T20:00:00.000Z";

  const make = (
    id: string,
    journalEntryId: string,
    slug: string,
    caption: string
  ): JournalAttachmentRow => ({
    id,
    user_id: userId,
    journal_entry_id: journalEntryId,
    remote_path: `${SAMPLE_REMOTE_PATH_PREFIX}${slug}`,
    file_name: slug,
    mime_type: "image/png",
    byte_size: sampleImageBytes(slug),
    caption,
    created_at: at,
    updated_at: at,
    revision: 1,
    deleted_at: null,
  });

  return [
    make(
      SAMPLE_JOURNAL_ATTACHMENT_IDS[0],
      J1,
      "eurusd-daily-review.png",
      "Asian range marked at 07:30, break held above the London high."
    ),
    make(
      SAMPLE_JOURNAL_ATTACHMENT_IDS[1],
      J2,
      "gbpusd-rule-break.png",
      "Entered before the candle closed; the range high failed to hold."
    ),
  ];
}
