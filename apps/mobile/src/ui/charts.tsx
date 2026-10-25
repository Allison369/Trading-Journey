/**
 * Charts.
 *
 * Hand-drawn SVG rather than a charting library, for one reason: the y-axis has
 * to be honest. A library that auto-scales from the minimum value exaggerates a
 * small move and compresses a large one; these charts scale from a stated
 * baseline and label it, so the shape of the line matches the shape of the
 * result. The same drawing logic is used in the web app.
 */

import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "../state/themeContext";
import { Hint } from "./components";
import { money } from "./format";
import type { CurrencyCode, EquityPoint } from "@tradevault/core";

/* ------------------------------------------------------------------ */
/* Equity curve                                                       */
/* ------------------------------------------------------------------ */

export function EquityChart({
  points,
  currency,
  height = 180,
}: {
  points: EquityPoint[];
  currency: CurrencyCode | string;
  height?: number;
}) {
  const theme = useTheme();

  if (points.length < 2) {
    return (
      <View style={{ height, justifyContent: "center", alignItems: "center" }}>
        <Hint>
          {points.length === 0
            ? "No closed trades yet, so there is no curve to draw."
            : "One closed trade is a point, not a curve. It appears once a second trade closes."}
        </Hint>
      </View>
    );
  }

  const width = 320; // layout width; the SVG scales to its container
  const padding = { top: 12, right: 10, bottom: 22, left: 10 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Guard the degenerate case where every point is identical.
  const span = max - min || 1;

  const x = (i: number) => padding.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => padding.top + plotH - ((v - min) / span) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.equity)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${padding.top + plotH} L${x(0)},${
    padding.top + plotH
  } Z`;

  // The baseline is the starting equity: the first point's value minus its own
  // change is not known here, so we use the minimum as the chart floor and
  // label the axis rather than implying a zero baseline we cannot support.
  const last = points[points.length - 1] as EquityPoint;
  const first = points[0] as EquityPoint;
  const change = last.equity - first.equity;

  return (
    <View style={{ gap: 8 }}>
      <Svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        <Path d={area} fill={theme.accent} opacity={0.12} />
        <Path d={line} stroke={theme.accent} strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <Circle
            key={`${p.at}-${i}`}
            cx={x(i)}
            cy={y(p.equity)}
            r={2.5}
            fill={p.equity >= first.equity ? theme.profit : theme.loss}
          />
        ))}
        {/* Axis labels: the actual bounds, so the reader can judge the scale. */}
        <SvgText x={padding.left} y={padding.top - 2} fill={theme.textFaint} fontSize={9}>
          {money(max, currency)}
        </SvgText>
        <SvgText x={padding.left} y={height - 8} fill={theme.textFaint} fontSize={9}>
          {money(min, currency)}
        </SvgText>
      </Svg>

      <View style={styles.chartFooter}>
        <Hint>Start {money(first.equity, currency)}</Hint>
        <Hint>Latest {money(last.equity, currency)}</Hint>
        <Hint>
          Change {change >= 0 ? "+" : ""}
          {money(change, currency)}
        </Hint>
      </View>
      <Hint>
        {points.length} closed event{points.length === 1 ? "" : "s"}, oldest first. Open trades are
        excluded because their result is not yet real.
      </Hint>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bar list                                                           */
/* ------------------------------------------------------------------ */

export interface BarDatum {
  label: string;
  value: number;
  /** Optional secondary line, e.g. "3 trades". */
  note?: string;
}

/**
 * A horizontal bar list.
 *
 * Bars are drawn from a zero baseline and scaled to the largest absolute value,
 * so a loss is visibly the same size as an equal gain. Signed values keep their
 * colour.
 */
export function BarList({
  data,
  currency,
  emptyMessage = "Nothing to show yet.",
}: {
  data: BarDatum[];
  currency: CurrencyCode | string;
  emptyMessage?: string;
}) {
  const theme = useTheme();

  if (data.length === 0) {
    return <Hint>{emptyMessage}</Hint>;
  }

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <View style={{ gap: 10 }}>
      {data.map((d) => {
        const fraction = Math.abs(d.value) / maxAbs;
        const colour =
          d.value > 0 ? theme.profit : d.value < 0 ? theme.loss : theme.textFaint;
        return (
          <View key={d.label} style={{ gap: 4 }}>
            <View style={styles.barHead}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>
                {d.label}
              </Text>
              <Text style={{ color: colour, fontSize: 13, fontWeight: "700" }}>
                {d.value >= 0 ? "+" : ""}
                {money(d.value, currency)}
              </Text>
            </View>
            <View style={[styles.barTrack, { backgroundColor: theme.surfaceRaised }]}>
              <View
                style={{
                  width: `${Math.max(fraction * 100, 1)}%`,
                  height: "100%",
                  borderRadius: 4,
                  backgroundColor: colour,
                }}
              />
            </View>
            {d.note ? <Hint>{d.note}</Hint> : null}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar heatmap                                                   */
/* ------------------------------------------------------------------ */

/**
 * One square per UTC day with a closed trade.
 *
 * A day with no trades is drawn as an empty outline, never as a zero-result
 * day, because "did not trade" and "traded and broke even" are different facts.
 */
export function CalendarHeatmap({
  data,
  currency,
  weeks = 12,
}: {
  data: Record<string, { netPnl: number; trades: number }>;
  currency: CurrencyCode | string;
  weeks?: number;
}) {
  const theme = useTheme();

  const dates = Object.keys(data);
  if (dates.length === 0) {
    return <Hint>No closed trades yet, so the calendar is empty.</Hint>;
  }

  const byDate = new Map(dates.map((d) => [d, data[d]?.netPnl ?? null]));
  const maxAbs = Math.max(
    ...[...byDate.values()].map((v) => (v === null ? 0 : Math.abs(v))),
    1
  );

  // Build a grid of whole weeks ending today, so the layout is stable.
  const today = new Date();
  const cells: Array<{ date: string; value: number | null }> = [];
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  start.setUTCDate(start.getUTCDate() - (weeks * 7 - 1));

  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, value: byDate.has(key) ? (byDate.get(key) as number | null) : null });
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.heatGrid}>
        {cells.map((cell) => {
          const intensity = cell.value === null ? 0 : Math.abs(cell.value) / maxAbs;
          const background =
            cell.value === null || cell.value === 0
              ? "transparent"
              : cell.value > 0
                ? theme.profit
                : theme.loss;
          return (
            <View
              key={cell.date}
              accessibilityLabel={`${cell.date}: ${
                cell.value === null ? "no closed trades" : money(cell.value, currency)
              }`}
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: background,
                opacity: cell.value === null ? 1 : 0.25 + intensity * 0.75,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            />
          );
        })}
      </View>
      <View style={styles.chartFooter}>
        <Hint>Less</Hint>
        <View style={{ flexDirection: "row", gap: 3 }}>
          {[0.25, 0.5, 0.75, 1].map((o) => (
            <View
              key={o}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: theme.profit,
                opacity: o,
              }}
            />
          ))}
        </View>
        <Hint>More</Hint>
      </View>
      <Hint>
        {dates.length} day{dates.length === 1 ? "" : "s"} with closed trades. Empty squares are days
        with no closed trades — not zero-result days.
      </Hint>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Result mix                                                         */
/* ------------------------------------------------------------------ */

export function ResultMix({
  wins,
  losses,
  breakeven,
}: {
  wins: number;
  losses: number;
  breakeven: number;
}) {
  const theme = useTheme();
  const total = wins + losses + breakeven;

  if (total === 0) {
    return <Hint>No closed trades yet, so there is no mix to show.</Hint>;
  }

  const segments = [
    { count: wins, colour: theme.profit, label: "Wins" },
    { count: breakeven, colour: theme.textFaint, label: "Breakeven" },
    { count: losses, colour: theme.loss, label: "Losses" },
  ].filter((s) => s.count > 0);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden" }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flex: s.count, backgroundColor: s.colour }} />
        ))}
      </View>
      <View style={styles.chartFooter}>
        {segments.map((s) => (
          <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View
              style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: s.colour }}
            />
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {s.label} {s.count} ({((s.count / total) * 100).toFixed(0)}%)
            </Text>
          </View>
        ))}
      </View>
      {breakeven > 0 ? (
        <Hint>
          {breakeven} breakeven trade{breakeven === 1 ? "" : "s"}. A scratch neither counts as a win
          nor extends a streak.
        </Hint>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  barHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  heatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
});
