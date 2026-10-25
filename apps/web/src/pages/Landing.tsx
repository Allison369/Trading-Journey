/**
 * The front page.
 *
 * This is the first thing anyone sees, and it has one job beyond looking
 * decent: to be honest about what the product is before someone signs up.
 *
 * Two choices are deliberate and worth defending:
 *
 *   1. The numbers in the preview panel are labelled SAMPLE, in the panel
 *      itself, not in a footnote. A landing page showing "+18.12%" over a live
 *      chart is making an implied promise about results. The label removes the
 *      implication without removing the illustration.
 *
 *   2. There is no "live" or "real-time" or "AI-powered" anywhere in the copy.
 *      The product reads a database and does arithmetic. Saying more than that
 *      to get a sign-up is how a journal becomes a thing that lied to someone
 *      on the way in.
 *
 * The page renders in both themes, and the hero shows the same figures the
 * dashboard computes — they come from `@tradevault/core`, not from a screenshot.
 */

import { useMemo } from "react";
import {
  buildEquityCurve,
  computeDrawdown,
  computeMetrics,
  returnPercent,
} from "@tradevault/core";
import { Icon, PastelStat, icons, type PastelTone } from "../components/ui";
import { BrandMark } from "../components/BrandMark";
import { fmtMoney, fmtPercent, fmtR } from "../components/format";
import { seedAccounts, seedExits, seedTrades } from "../lib/sampleData";
import { accountFromRow, exitFromRow, tradeFromRow } from "../lib/mappers";
import { capitalBase, exitsByTrade } from "../lib/store";

export function LandingPage({
  onSignIn,
  onSignUp,
  onContinueOffline,
  isCloudConfigured,
  onToggleTheme,
  theme,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
  /** Enter the app without an account — the local, clearly-labelled store. */
  onContinueOffline: () => void;
  isCloudConfigured: boolean;
  onToggleTheme: () => void;
  theme: "dark" | "light";
}) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand">
          <div className="brand-mark">
            <BrandMark />
          </div>
          <div>
            <div className="brand-name">TradeVault</div>
            <div className="brand-sub">Trading journal</div>
          </div>
        </div>

        <div className="landing-nav-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <Icon path={theme === "dark" ? icons.sun : icons.moon} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSignIn}>
            Sign in
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSignUp}>
            Create account
          </button>
        </div>
      </nav>

      <header className="landing-hero">
        <div>
          <span className="landing-eyebrow">
            <Icon path={icons.spark} size={13} />
            Journal and analytics
          </span>

          <h1 className="landing-title">
            Every trade recorded.
            <br />
            <span className="grad">Every number earned.</span>
          </h1>

          <p className="landing-lede">
            TradeVault keeps your trades, your reasoning and your screenshots in one place, and
            computes your results from what you actually did. No broker connection, no order
            buttons, no projections — just your own record, measured honestly.
          </p>

          <div className="landing-cta">
            <button type="button" className="btn btn-primary" onClick={onSignUp}>
              <Icon path={icons.add} />
              Create your free account
            </button>
            <button type="button" className="btn" onClick={onSignIn}>
              I already have one
            </button>
          </div>

          <p className="landing-disclaimer">
            <strong>Not financial advice, and not a broker.</strong> TradeVault cannot place a
            trade, does not hold funds, and never asks for broker API keys or card details. It
            records outcomes; it does not predict them. Trading involves substantial risk of loss.
          </p>
        </div>

        <HeroPreview />
      </header>

      <section className="landing-sections" aria-labelledby="sections-heading">
        <h2 className="landing-sections-title" id="sections-heading">
          What is inside
        </h2>
        <div className="landing-grid">
          <FeatureCard
            icon={icons.dashboard}
            tone="coral"
            title="Dashboard"
            body="Net realised P&L, win rate, profit factor, expectancy and max drawdown — computed from your closed trades, in the currency of the account you are looking at."
          />
          <FeatureCard
            icon={icons.trades}
            tone="yellow"
            title="Trades"
            body="Full records with partial closes, a quantity-weighted average exit price, per-leg fees, and the resulting R multiple when a stop loss makes one meaningful."
          />
          <FeatureCard
            icon={icons.image}
            tone="pink"
            title="Chart screenshots"
            body="Attach the chart you actually traded. Stored privately, readable only by you, and kept with the trade rather than in a folder you have to reconcile later."
          />
          <FeatureCard
            icon={icons.analytics}
            tone="blue"
            title="Analytics"
            body="Break down results by strategy, session, market and direction. Groups that are too small to mean anything say so instead of showing a confident-looking average."
          />
          <FeatureCard
            icon={icons.journal}
            tone="coral"
            title="Journal"
            body="Daily and weekly reviews, goals, mistakes and lessons — linked to the trades they are about, so a lesson is never an orphaned note."
          />
          <FeatureCard
            icon={icons.shield}
            tone="yellow"
            title="Private by construction"
            body="Row Level Security on every table. Your records are scoped to your account in the database itself, not by a filter in the interface."
          />
        </div>
      </section>

      <footer className="landing-foot">
        {isCloudConfigured ? (
          <span>
            This deployment is connected to a shared database. Signing up creates an account that
            syncs between the website and the TradeVault mobile app.
          </span>
        ) : (
          <span>
            This deployment has no database configured yet. You can still{" "}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 6px", verticalAlign: "baseline" }}
              onClick={onContinueOffline}
            >
              look around offline
            </button>{" "}
            — it runs against a labelled sample set stored in this browser, and says so on every
            screen.
          </span>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero preview — real figures, labelled as sample                    */
/* ------------------------------------------------------------------ */

/**
 * The panel on the right of the hero.
 *
 * Every number is computed here, at render, by the same core functions the
 * dashboard uses. If the arithmetic were wrong, this panel would be wrong in
 * exactly the same way — which is the point: a marketing panel that is drawn
 * separately from the product is a panel that can drift away from it.
 *
 * The figures come from the labelled sample set and are captioned as such.
 */
function HeroPreview() {
  const data = useMemo(() => {
    const uid = "local-user-0000-0000-0000-000000000000";
    // The seed data is database rows, so it goes through the same mappers the
    // real store uses. Converting it any other way would let this panel and the
    // dashboard disagree about the same numbers.
    const accounts = seedAccounts(uid).map(accountFromRow);
    const trades = seedTrades(uid).map(tradeFromRow);
    const exits = seedExits(uid).map(exitFromRow);

    const exitsMap = exitsByTrade(exits);
    const metrics = computeMetrics(trades, exitsMap);
    const account = accounts[0];
    const base = account ? capitalBase(account) : 0;

    const closed = trades.filter((t) => t.status === "closed" && !t.deletedAt);
    const closedExits: Record<string, typeof exits> = {};
    for (const t of closed) closedExits[t.id] = exitsMap[t.id] ?? [];

    const curve = buildEquityCurve(base, closed, closedExits);
    const drawdown = computeDrawdown(curve);

    return {
      currency: account?.currency ?? "USD",
      base,
      netPnl: metrics.netPnl,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      expectancy: metrics.expectancy,
      averageR: metrics.averageR,
      returnFraction: returnPercent(metrics.netPnl, base),
      // computeDrawdown returns a percentage (3.4), but fmtPercent expects a
      // fraction (0.034). The Dashboard divides by 100 for the same reason; do
      // it here rather than let a 3.4% drawdown render as 344%.
      maxDrawdownFraction: drawdown.maxDrawdownPercent / 100,
      closedCount: metrics.closedTrades,
      curve,
    };
  }, []);

  return (
    <div className="landing-preview" aria-label="Example dashboard, sample data">
      <div className="landing-preview-head">
        <div className="landing-preview-title">Dashboard</div>
        <span className="badge badge-sample">Sample data</span>
      </div>

      <div className="landing-pastels">
        <PastelStat
          tone="coral"
          label="Net realised P&L"
          value={fmtMoney(data.netPnl, data.currency, { signed: true })}
          sign={data.netPnl > 0 ? "pos" : data.netPnl < 0 ? "neg" : undefined}
        />
        <PastelStat
          tone="yellow"
          label="Win rate"
          value={fmtPercent(data.winRate, { decimals: 1 })}
        />
        <PastelStat
          tone="pink"
          label="Profit factor"
          value={
            data.profitFactor === null ? (
              <span className="na">N/A</span>
            ) : (
              data.profitFactor.toFixed(2)
            )
          }
        />
        <PastelStat
          tone="blue"
          label="Expectancy"
          value={fmtMoney(data.expectancy, data.currency, { signed: true })}
        />
      </div>

      <div className="landing-stats">
        <div className="landing-stat">
          <div className="landing-stat-label">Average R</div>
          <div className="landing-stat-value">{fmtR(data.averageR)}</div>
        </div>

        <div className="landing-stat">
          <div className="landing-stat-label">Max drawdown</div>
          <div className="landing-stat-value">{fmtPercent(data.maxDrawdownFraction, { decimals: 1 })}</div>
        </div>
      </div>

      <MiniEquityCurve
        points={data.curve.map((p) => p.equity)}
        base={data.base}
        currency={data.currency}
      />

      <div className="hint">
        An illustration, computed from a labelled sample set — not results, not a projection, and
        not yours. Your own dashboard shows only what you have recorded, and reads N/A where there
        is not yet enough data to measure something. {data.closedCount} closed trades shown.
      </div>
    </div>
  );
}

/**
 * A small equity sparkline.
 *
 * Drawn inline from the real curve, with the baseline marked, so the shape is
 * the actual shape of the data rather than a decorative zig-zag. The y-axis is
 * not labelled here because this is an illustration at thumbnail size — but it
 * is drawn to the true scale, so it does not flatter the result either.
 */
function MiniEquityCurve({
  points,
  base,
  currency,
}: {
  points: number[];
  base: number;
  currency: string;
}) {
  if (points.length < 2) {
    return (
      <div className="state" style={{ padding: "18px 12px" }}>
        <div className="state-body">Not enough closed trades to draw a curve yet.</div>
      </div>
    );
  }

  const width = 520;
  const height = 132;
  const pad = { top: 10, right: 8, bottom: 10, left: 8 };

  const min = Math.min(...points, base);
  const max = Math.max(...points, base);
  const span = max - min || 1;

  const x = (i: number) => pad.left + (i / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (v - min) / span) * (height - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(height - pad.bottom).toFixed(1)} L${x(0).toFixed(1)},${(height - pad.bottom).toFixed(1)} Z`;

  const last = points[points.length - 1] as number;
  const up = last >= base;
  const stroke = up ? "var(--profit)" : "var(--loss)";

  return (
    <div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ height: 132 }}
        role="img"
        aria-label={`Equity curve illustration, from ${fmtMoney(base, currency as never)} to ${fmtMoney(last, currency as never)}`}
      >
        <defs>
          <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The starting balance. Without this line the curve's movement has no
            reference point, which is exactly how a flat month looks exciting. */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={y(base)}
          y2={y(base)}
          stroke="var(--chart-grid)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        <path d={area} fill="url(#hero-fill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>

      <div className="row-between" style={{ marginTop: 6 }}>
        <span className="hint">Started {fmtMoney(base, currency as never)}</span>
        <span className={`hint ${up ? "pos" : "neg"}`}>Now {fmtMoney(last, currency as never)}</span>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: string;
  tone: PastelTone;
  title: string;
  body: string;
}) {
  return (
    <article className="landing-card">
      <div className={`landing-card-icon tone-${tone}`}>
        <Icon path={icon} size={17} />
      </div>
      <h3 className="landing-card-title">{title}</h3>
      <p className="landing-card-body">{body}</p>
    </article>
  );
}
