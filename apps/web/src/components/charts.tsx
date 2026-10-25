/**
 * Charts.
 *
 * Hand-drawn SVG rather than a charting library. Three reasons:
 *
 *   1. The y-axis of a P&L chart must be honest. A library that "auto-scales
 *      nicely" will happily draw a flat line as a dramatic drop by zooming the
 *      axis. Everything here states its own scale.
 *   2. No peer-dependency fights in the Expo/React Native toolchain, and the
 *      same drawing logic can be ported to the mobile app.
 *   3. Full control over accessibility: every chart carries a text summary, and
 *      no chart is the only way to reach a number.
 *
 * All charts render from already-computed values. No chart computes a metric.
 */

import { useId, useState } from "react";
import type { EquityPoint } from "@tradevault/core";
import { fmtMoney, fmtNumber, fmtPercent, NA, signClass } from "./format";
import type { CurrencyCode } from "@tradevault/core";

/* ------------------------------------------------------------------ */
/* Equity curve                                                       */
/* ------------------------------------------------------------------ */

export function EquityChart({
  points,
  currency,
  height = 240,
}: {
  points: EquityPoint[];
  currency: CurrencyCode;
  height?: number;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<{ x: number; y: number; point: EquityPoint } | null>(null);

  // A curve needs at least two points to be a curve. One point is a value, not
  // a trend, and drawing a "curve" through it would imply movement.
  if (points.length < 2) {
    return (
      <div className="state" style={{ padding: "36px 18px" }}>
        <div className="state-title">Not enough history yet</div>
        <div className="state-body">
          The equity curve appears once at least one trade has closed. Open trades are
          excluded — their profit is unrealised and could still disappear.
        </div>
      </div>
    );
  }

  const width = 800;
  const padLeft = 68;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 28;

  const equities = points.map((p) => p.equity);
  const min = Math.min(...equities);
  const max = Math.max(...equities);
  // A flat curve has zero range; widen it so the line sits mid-panel instead of
  // dividing by zero.
  const range = max - min || Math.max(Math.abs(max), 1) * 0.02;
  const lo = min - range * 0.08;
  const hi = max + range * 0.08;

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const xAt = (i: number) => padLeft + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (v: number) => padTop + innerH - ((v - lo) / (hi - lo)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p.equity).toFixed(1)}`).join(" ");
  const area = `${line} L${xAt(points.length - 1).toFixed(1)},${(padTop + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;

  // Four gridlines, labelled with real values so the reader can check the scale.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo));
  const zeroY = lo < 0 && hi > 0 ? yAt(0) : null;
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const strokeVar = last.equity >= first.equity ? "var(--profit)" : "var(--loss)";

  return (
    <div style={{ position: "relative" }}>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Equity curve from ${fmtMoney(first.equity, currency)} to ${fmtMoney(last.equity, currency)} over ${points.length} points.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeVar} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeVar} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--chart-grid)"
              strokeWidth="1"
            />
            <text
              x={padLeft - 10}
              y={yAt(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-faint)"
            >
              {fmtNumber(t, { decimals: 0 })}
            </text>
          </g>
        ))}

        {zeroY !== null ? (
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--border-strong)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        ) : null}

        <path d={area} fill={`url(#${clipId})`} />
        <path d={line} fill="none" stroke={strokeVar} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(p.equity)}
            r={hover?.point === p ? 5 : 3}
            fill="var(--surface)"
            stroke={strokeVar}
            strokeWidth="2"
            onMouseEnter={() => setHover({ x: xAt(i), y: yAt(p.equity), point: p })}
          />
        ))}
      </svg>

      {hover ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${(hover.y / height) * 100}%`,
            transform: "translate(-50%, -140%)",
          }}
        >
          <div style={{ fontWeight: 650 }}>{fmtMoney(hover.point.equity, currency)}</div>
          <div style={{ color: "var(--text-muted)" }}>{hover.point.label}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar list                                                */
/* ------------------------------------------------------------------ */

export interface BarDatum {
  key: string;
  value: number;
  /** Optional secondary text shown to the right, e.g. "12 trades". */
  note?: string;
}

export function BarList({
  data,
  currency,
  emptyLabel = "No closed trades to group yet.",
}: {
  data: BarDatum[];
  currency: CurrencyCode;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <div className="hint">{emptyLabel}</div>;
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 0);
  if (maxAbs === 0) {
    return <div className="hint">Every group in this set is exactly breakeven.</div>;
  }

  return (
    <div>
      {data.map((d) => {
        const pct = (Math.abs(d.value) / maxAbs) * 100;
        const positive = d.value >= 0;
        return (
          <div className="bar-row" key={d.key}>
            <div className="bar-label" title={d.key}>
              {d.key}
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill ${positive ? "pos" : "neg"}`}
                style={{ width: `${Math.max(pct, 1.5)}%`, [positive ? "left" : "right"]: 0 }}
              />
            </div>
            <div className={`bar-value ${signClass(d.value)}`}>
              {fmtMoney(d.value, currency, { signed: true })}
              {d.note ? <div className="hint">{d.note}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar heatmap                                                   */
/* ------------------------------------------------------------------ */

export function CalendarHeatmap({
  data,
  currency,
  weeks = 18,
}: {
  data: Record<string, { netPnl: number; trades: number }>;
  currency: CurrencyCode;
  weeks?: number;
}) {
  // Build the grid from today backwards so the most recent activity is on the
  // right, like a calendar. Cells with no data are empty, not zero-P&L days.
  const cells: Array<{ key: string; entry: { netPnl: number; trades: number } | undefined }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - weeks * 7 + 1);
  // Align the start to a Monday so rows read as weeks.
  const dayOfWeek = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOfWeek);

  const total = weeks * 7;
  for (let i = 0; i < total; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cells.push({ key, entry: data[key] });
  }

  const values = Object.values(data).map((d) => d.netPnl);
  const maxAbs = values.length > 0 ? Math.max(...values.map(Math.abs), 0) : 0;

  /** Bucket a value into -4..4 so colour intensity is comparable across days. */
  const levelOf = (v: number): number => {
    if (maxAbs === 0) return 0;
    const ratio = Math.abs(v) / maxAbs;
    const bucket = Math.min(4, Math.max(1, Math.ceil(ratio * 4)));
    return v >= 0 ? bucket : -bucket;
  };

  const activeDays = Object.keys(data).length;

  if (activeDays === 0) {
    return (
      <div className="hint">
        No closed trades in the last {weeks} weeks, so there is nothing to plot. The grid fills in as
        trades close.
      </div>
    );
  }

  return (
    <div>
      <div className="heatmap" role="img" aria-label={`Daily net result for the last ${weeks} weeks.`}>
        {cells.map((cell) => {
          const entry = cell.entry;
          const level = entry ? levelOf(entry.netPnl) : 0;
          const label = entry
            ? `${cell.key}: ${fmtMoney(entry.netPnl, currency, { signed: true })} from ${entry.trades} trade${entry.trades === 1 ? "" : "s"}`
            : `${cell.key}: no closed trades`;
          return (
            <div
              key={cell.key}
              className="heat-cell"
              data-level={level}
              title={label}
              aria-label={label}
            />
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <span className="hint">Loss</span>
        {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((l) => (
          <div key={l} className="heat-cell" data-level={l} style={{ width: 12, height: 12 }} />
        ))}
        <span className="hint">Profit</span>
        <span className="spacer" />
        <span className="hint">{activeDays} day{activeDays === 1 ? "" : "s"} with closed trades</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Win/loss donut                                                     */
/* ------------------------------------------------------------------ */

export function ResultDonut({
  wins,
  losses,
  breakeven,
}: {
  wins: number;
  losses: number;
  breakeven: number;
}) {
  const total = wins + losses + breakeven;
  if (total === 0) {
    return <div className="hint">No closed trades yet, so there is no win/loss split to show.</div>;
  }

  const size = 132;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const segments = [
    { count: wins, color: "var(--profit)", label: "Wins" },
    { count: losses, color: "var(--loss)", label: "Losses" },
    { count: breakeven, color: "var(--breakeven)", label: "Breakeven" },
  ].filter((s) => s.count > 0);

  let offset = 0;

  return (
    <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${wins} wins, ${losses} losses, ${breakeven} breakeven out of ${total} closed trades.`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((seg) => {
            const length = (seg.count / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const el = (
              <circle
                key={seg.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return el;
          })}
        </g>
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text)">
          {total}
        </text>
        <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="10" fill="var(--text-faint)">
          CLOSED
        </text>
      </svg>

      <div className="stack-sm">
        {segments.map((seg) => (
          <div className="row" key={seg.label} style={{ gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: seg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ minWidth: 74 }}>{seg.label}</span>
            <strong className="num">{seg.count}</strong>
            <span className="hint">({fmtPercent(seg.count / total, { decimals: 1 })})</span>
          </div>
        ))}
        {breakeven > 0 ? (
          <div className="hint" style={{ maxWidth: 220 }}>
            Breakeven trades are counted here and in the total, but are excluded from the win
            rate — a scratch is not a win.
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawdown strip                                                     */
/* ------------------------------------------------------------------ */

export function DrawdownStrip({
  series,
  height = 84,
}: {
  series: Array<{ at: string; drawdownPercent: number }>;
  height?: number;
}) {
  if (series.length < 2) {
    return <div className="hint">The drawdown chart appears once there is an equity path to measure.</div>;
  }

  const width = 800;
  const max = Math.max(...series.map((s) => s.drawdownPercent), 0);

  if (max === 0) {
    return (
      <div className="hint">
        Equity has not fallen below a previous peak in this period, so there is no drawdown to show.
      </div>
    );
  }

  const points = series.map((s, i) => {
    const x = (i / (series.length - 1)) * width;
    // Larger drawdown = lower on the chart.
    const y = (s.drawdownPercent / max) * (height - 6);
    return `${x.toFixed(1)},${(6 + y).toFixed(1)}`;
  });

  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},6 L0,6 Z`;

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Drawdown from peak equity, worst ${fmtPercent(max / 100)}.`}
    >
      <path d={area} fill="var(--loss-soft)" />
      <path d={line} fill="none" stroke="var(--loss)" strokeWidth="1.8" />
      <line x1="0" x2={width} y1="6" y2="6" stroke="var(--border-strong)" strokeDasharray="4 4" />
      <text x="6" y="18" fontSize="10" fill="var(--text-faint)">
        Peak
      </text>
    </svg>
  );
}

/** A single labelled number with a caption, used in compact summaries. */
export function MiniStat({
  label,
  value,
  tone = "auto",
}: {
  label: string;
  value: string;
  tone?: "auto" | "pos" | "neg" | "plain";
}) {
  const cls = tone === "auto" ? (value === NA ? "flat" : signClass(Number(value.replace(/[^0-9.\-]/g, "")))) : tone;
  return (
    <div className="stat" style={{ padding: "11px 13px" }}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value sm ${cls}`}>{value}</div>
    </div>
  );
}
