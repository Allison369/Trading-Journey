/**
 * Validation schemas (Zod).
 *
 * Shared by the web app, the mobile app and the sync layer, so an invalid
 * record can never be persisted regardless of which client created it.
 */

import { z } from "zod";
import {
  ASSET_CLASSES,
  EMOTIONS,
  SUPPORTED_CURRENCIES,
  TRADING_SESSIONS,
} from "../domain/types";

/** A decimal string that must parse to a finite number. */
const decimalString = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => Number.isFinite(Number(v)), "Must be a number");

/**
 * An optional decimal.
 *
 * Accepts an absent value, an empty string, or an explicit null (which is what
 * the forms send for "left blank"), and normalises all three to null.
 */
const optionalDecimal = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v.trim()))
  .refine((v) => v === null || Number.isFinite(Number(v)), "Must be a number");

const positiveDecimal = decimalString.refine(
  (v) => Number(v) > 0,
  "Must be greater than zero"
);

const nonNegativeDecimal = decimalString.refine(
  (v) => Number(v) >= 0,
  "Cannot be negative"
);

/** ISO date-time string that Date.parse can read. */
const isoDateTime = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => Number.isFinite(Date.parse(v)), "Enter a valid date and time");

/** Optional ISO date-time that normalises absent/empty/null to null. */
const optionalIsoDateTime = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v.trim()))
  .refine(
    (v) => v === null || Number.isFinite(Date.parse(v)),
    "Enter a valid date and time"
  );

export const currencySchema = z.enum(
  SUPPORTED_CURRENCIES as [string, ...string[]]
);

export const assetClassSchema = z.enum(
  ASSET_CLASSES as [string, ...string[]]
);

export const tradingSessionSchema = z.enum(
  TRADING_SESSIONS as [string, ...string[]]
);

export const emotionSchema = z.enum(EMOTIONS as [string, ...string[]]);

/* ------------------------------------------------------------------ */
/* Trading account                                                    */
/* ------------------------------------------------------------------ */

export const tradingAccountSchema = z.object({
  name: z.string().trim().min(1, "Account name is required").max(80),
  broker: z.string().trim().max(80).optional(),
  currency: currencySchema,
  startingBalance: nonNegativeDecimal,
  balanceAdjustments: optionalDecimal.default("0"),
});

export type TradingAccountInput = z.input<typeof tradingAccountSchema>;

/* ------------------------------------------------------------------ */
/* Trade                                                              */
/* ------------------------------------------------------------------ */

export const tradeSchema = z
  .object({
    accountId: z.string().min(1, "Select a trading account"),
    strategyId: z.string().nullish(),

    symbol: z
      .string()
      .trim()
      .min(1, "Symbol is required")
      .max(30)
      .transform((v) => v.toUpperCase()),

    assetClass: assetClassSchema,
    market: z.string().trim().max(60).optional(),
    direction: z.enum(["long", "short"]),
    status: z.enum(["open", "partial", "closed"]).default("open"),
    orderType: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),

    entryAt: isoDateTime,
    entryPrice: positiveDecimal,
    exitAt: optionalIsoDateTime,
    exitPrice: optionalDecimal,

    quantity: positiveDecimal,
    contractMultiplier: positiveDecimal.default("1"),

    stopLoss: optionalDecimal,
    takeProfit: optionalDecimal,

    entryFees: optionalDecimal.default("0"),
    exitFees: optionalDecimal.default("0"),
    fundingFees: optionalDecimal.default("0"),
    slippage: optionalDecimal.default("0"),

    strategy: z.string().trim().max(80).optional(),
    setupType: z.string().trim().max(80).optional(),
    session: tradingSessionSchema.default("outside"),

    entryReason: z.string().trim().max(2000).optional(),
    exitReason: z.string().trim().max(2000).optional(),

    emotionBefore: emotionSchema.optional(),
    emotionDuring: emotionSchema.optional(),
    emotionAfter: emotionSchema.optional(),

    mistakes: z.string().trim().max(4000).optional(),
    lessons: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(4000).optional(),

    manualNetPnl: optionalDecimal,
    importFingerprint: z.string().trim().max(300).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const entryPrice = Number(val.entryPrice);

    // A stop loss must sit on the correct side of entry for the direction.
    if (val.stopLoss !== null && val.stopLoss !== undefined) {
      const sl = Number(val.stopLoss);
      if (val.direction === "long" && sl >= entryPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stopLoss"],
          message: "For a long trade the stop loss must be below the entry price",
        });
      }
      if (val.direction === "short" && sl <= entryPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stopLoss"],
          message: "For a short trade the stop loss must be above the entry price",
        });
      }
    }

    // Take profit must be on the profitable side of entry.
    if (val.takeProfit !== null && val.takeProfit !== undefined) {
      const tp = Number(val.takeProfit);
      if (val.direction === "long" && tp <= entryPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["takeProfit"],
          message: "For a long trade the take profit must be above the entry price",
        });
      }
      if (val.direction === "short" && tp >= entryPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["takeProfit"],
          message: "For a short trade the take profit must be below the entry price",
        });
      }
    }

    // A closed trade needs an exit price; an open one must not have one.
    if (val.status === "closed") {
      if (val.exitPrice === null || val.exitPrice === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exitPrice"],
          message: "A closed trade requires an exit price",
        });
      }
      if (!val.exitAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["exitAt"],
          message: "A closed trade requires an exit date and time",
        });
      }
    }

    // An exit cannot precede the entry.
    if (val.exitAt && Date.parse(val.exitAt) < Date.parse(val.entryAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exitAt"],
        message: "Exit time cannot be before entry time",
      });
    }
  });

export type TradeInput = z.input<typeof tradeSchema>;

export const tradeExitSchema = z.object({
  tradeId: z.string().min(1),
  quantity: positiveDecimal,
  price: positiveDecimal,
  fees: optionalDecimal.default("0"),
  exitedAt: isoDateTime,
  notes: z.string().trim().max(1000).optional(),
});

export type TradeExitInput = z.input<typeof tradeExitSchema>;

/* ------------------------------------------------------------------ */
/* Strategy                                                           */
/* ------------------------------------------------------------------ */

export const tradingStrategySchema = z.object({
  name: z.string().trim().min(1, "Strategy name is required").max(80),
  description: z.string().trim().max(2000).optional(),
  markets: z.array(z.string().trim().max(60)).default([]),
  instruments: z.array(z.string().trim().max(30)).default([]),
  entryRules: z.string().trim().max(4000).optional(),
  exitRules: z.string().trim().max(4000).optional(),
  riskRules: z.string().trim().max(4000).optional(),
  session: tradingSessionSchema.nullish(),
  checklist: z.array(z.string().trim().max(200)).default([]),
  tags: z.array(z.string().trim().max(40)).default([]),
  improvementNotes: z.string().trim().max(4000).optional(),
  isArchived: z.boolean().default(false),
});

export type TradingStrategyInput = z.input<typeof tradingStrategySchema>;

/* ------------------------------------------------------------------ */
/* Journal                                                            */
/* ------------------------------------------------------------------ */

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");

export const journalEntrySchema = z.object({
  entryDate: dateOnly,
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  title: z.string().trim().max(120).optional(),
  goals: z.string().trim().max(4000).optional(),
  marketObservations: z.string().trim().max(4000).optional(),
  preMarketPlan: z.string().trim().max(4000).optional(),
  tradesSummary: z.string().trim().max(4000).optional(),
  emotionalState: z.string().trim().max(500).optional(),
  disciplineScore: z
    .number()
    .int()
    .min(1, "Score must be between 1 and 10")
    .max(10, "Score must be between 1 and 10")
    .nullable()
    .default(null),
  mistakes: z.string().trim().max(4000).optional(),
  lessons: z.string().trim().max(4000).optional(),
  improvements: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
  linkedTradeIds: z.array(z.string()).default([]),
  tags: z.array(z.string().trim().max(40)).default([]),
});

export type JournalEntryInput = z.input<typeof journalEntrySchema>;

/* ------------------------------------------------------------------ */
/* Risk                                                               */
/* ------------------------------------------------------------------ */

export const riskSettingsSchema = z.object({
  accountId: z.string().nullish(),
  defaultRiskPercent: z
    .string()
    .trim()
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Must be greater than zero")
    .refine((v) => Number(v) <= 100, "Cannot exceed 100%"),
  maxRiskPerTradePercent: z
    .string()
    .trim()
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Must be greater than zero")
    .refine((v) => Number(v) <= 100, "Cannot exceed 100%"),
  dailyLossLimitAmount: optionalDecimal,
  weeklyLossLimitAmount: optionalDecimal,
  maxConsecutiveLosses: z.number().int().min(1).max(50).default(3),
  cooldownAfterLosses: z.number().int().min(1).max(50).default(3),
  baseCurrency: currencySchema,
});

export type RiskSettingsInput = z.input<typeof riskSettingsSchema>;

/* ------------------------------------------------------------------ */
/* Profile                                                            */
/* ------------------------------------------------------------------ */

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(80),
  currency: currencySchema,
  timeZone: z.string().trim().min(1).max(64),
  defaultInstruments: z.array(z.string().trim().max(30)).default([]),
  defaultMarkets: z.array(z.string().trim().max(60)).default([]),
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  riskPercentDefault: z
    .string()
    .trim()
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "Must be greater than zero")
    .default("1"),
  onboardingComplete: z.boolean().default(false),
});

export type ProfileInput = z.input<typeof profileSchema>;

/* ------------------------------------------------------------------ */
/* Auth (used by the web app / future Supabase auth)                  */
/* ------------------------------------------------------------------ */

export const signUpSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .regex(/[a-zA-Z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

/** Flatten a ZodError into a { field: message } map for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
