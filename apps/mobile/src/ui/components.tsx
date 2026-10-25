/**
 * Shared UI primitives.
 *
 * These are the mobile translation of the web design system in
 * `apps/web/src/styles/app.css`: the same warm off-white / off-black surfaces,
 * the same four pastel blocks with their deep inks, the same near-black slab
 * for the primary action, and the same editorial page header.
 *
 * Little deliberate differences remain, and they are all about the size of the
 * screen: type is a step smaller, horizontal padding is 18 instead of 40, and
 * grids collapse to two columns instead of four.
 *
 * Nothing here invents a number: a stat with no value renders the N/A string it
 * is given.
 */

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../state/themeContext";
import { NA } from "./format";

/** Radii, matching `--radius-*` on the web. */
export const radius = { sm: 10, md: 14, lg: 18, xl: 26 } as const;

/** Numbers line up in columns, exactly as `.num` does on the web. */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

/* ------------------------------------------------------------------ */
/* Layout                                                             */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const content: StyleProp<ViewStyle> = [
    {
      paddingHorizontal: 18,
      paddingTop: insets.top + 12,
      paddingBottom: insets.bottom + 44,
      gap: 16,
    },
    style,
  ];

  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.background }, content]}>{children}</View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/**
 * The page head, borrowed from the web `.topbar`: a small uppercase eyebrow,
 * a large display title and one line explaining the screen. It scrolls away
 * with the page, which is what a phone wants it to do.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  back = false,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  back?: boolean;
  actions?: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={{ gap: 4, paddingTop: 2, paddingBottom: 4 }}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingVertical: 6,
            paddingRight: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ color: theme.textMuted, fontSize: 15, marginTop: -1 }}>‹</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: "600" }}>Back</Text>
        </Pressable>
      ) : null}

      {eyebrow ? (
        <Text
          style={{
            color: theme.textFaint,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <Text
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 30,
            fontWeight: "700",
            letterSpacing: -1,
            lineHeight: 34,
          }}
        >
          {title}
        </Text>
        {actions ? <View style={{ paddingBottom: 3 }}>{actions}</View> : null}
      </View>

      {subtitle ? (
        <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
          padding: 18,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A tinted panel. On the web these carry no border — the tint is the
 * separation — which is what keeps a dense page calm.
 */
export function Panel({
  children,
  tone = "cool",
  style,
}: {
  children: ReactNode;
  tone?: "cool" | "warm" | "cream";
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const background =
    tone === "warm" ? theme.panelWarm : tone === "cream" ? theme.panelCream : theme.panelCool;
  return (
    <View style={[{ backgroundColor: background, borderRadius: radius.lg, padding: 18 }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.textFaint,
        fontSize: 10.5,
        letterSpacing: 1.3,
        textTransform: "uppercase",
        fontWeight: "700",
        marginTop: 4,
      }}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Text                                                               */
/* ------------------------------------------------------------------ */

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 }}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const theme = useTheme();
  return (
    <Text style={{ color: muted ? theme.textMuted : theme.text, fontSize: 14, lineHeight: 21 }}>
      {children}
    </Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={{ color: theme.textFaint, fontSize: 12, lineHeight: 17 }}>{children}</Text>;
}

/* ------------------------------------------------------------------ */
/* Stat                                                               */
/* ------------------------------------------------------------------ */

export type PastelTone = "coral" | "yellow" | "pink" | "blue";

/**
 * One figure.
 *
 * `value` is pre-formatted by the caller through `ui/format`, which is what
 * guarantees an absent figure arrives here already reading "N/A".
 *
 * `pastel` paints the block in one of the four design tints and switches the
 * text to that tint's deep ink. Because the value then wears the block's own
 * colour, profit and loss are carried by the sign on the number and by a small
 * chip rather than by colouring the number — the same rule the web app uses.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  emphasis = false,
  pastel,
  wide = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "profit" | "loss" | "accent";
  emphasis?: boolean;
  pastel?: PastelTone;
  /** Take the full width of the row instead of half. */
  wide?: boolean;
}) {
  const theme = useTheme();

  const tint =
    pastel === "coral"
      ? { bg: theme.pastelCoral, ink: theme.pastelCoralInk }
      : pastel === "yellow"
        ? { bg: theme.pastelYellow, ink: theme.pastelYellowInk }
        : pastel === "pink"
          ? { bg: theme.pastelPink, ink: theme.pastelPinkInk }
          : pastel === "blue"
            ? { bg: theme.pastelBlue, ink: theme.pastelBlueInk }
            : undefined;

  const colour = tint
    ? (tint.ink ?? theme.text)
    : tone === "profit"
      ? theme.profit
      : tone === "loss"
        ? theme.loss
        : tone === "accent"
          ? theme.accentText
          : theme.text;

  const labelColour = tint ? (tint.ink ?? theme.text) : theme.textFaint;
  const chipColour = tone === "profit" ? theme.chipPos : theme.chipNeg;
  const showChip = tint !== undefined && (tone === "profit" || tone === "loss");

  return (
    <View
      style={[
        styles.stat,
        wide ? { flexBasis: "100%" } : null,
        {
          backgroundColor: tint ? tint.bg : emphasis ? theme.surfaceRaised : theme.surface,
          borderColor: tint ? "transparent" : theme.border,
          borderWidth: tint ? 0 : 1,
          padding: tint ? 16 : 15,
          gap: tint ? 5 : 4,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Text
          style={{
            color: labelColour,
            opacity: tint ? 0.66 : 1,
            fontSize: tint ? 10 : 10.5,
            fontWeight: "700",
            letterSpacing: tint ? 0.9 : 0.7,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
        {showChip ? (
          <Text
            style={{
              color: chipColour,
              fontSize: 9,
              fontWeight: "700",
              letterSpacing: 0.7,
              borderWidth: 1,
              borderColor: chipColour,
              borderRadius: 999,
              paddingHorizontal: 6,
              paddingVertical: 1,
              overflow: "hidden",
            }}
          >
            {tone === "profit" ? "PROFIT" : "LOSS"}
          </Text>
        ) : null}
      </View>

      <Text
        style={[
          tabular,
          {
            color: colour,
            fontSize: tint ? 26 : emphasis ? 21 : 19,
            fontWeight: "700",
            letterSpacing: tint ? -0.9 : -0.4,
            lineHeight: tint ? 29 : 24,
          },
        ]}
      >
        {value}
      </Text>

      {hint ? (
        <Text
          style={{
            color: labelColour,
            opacity: tint ? 0.68 : 1,
            fontSize: 11.5,
            lineHeight: 16,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Banner                                                             */
/* ------------------------------------------------------------------ */

export type BannerTone = "info" | "warn" | "danger" | "accent";

export function Banner({
  tone,
  title,
  children,
}: {
  tone: BannerTone;
  title?: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const border =
    tone === "danger"
      ? theme.loss
      : tone === "warn"
        ? theme.warn
        : tone === "accent"
          ? theme.accent
          : theme.info;

  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: border,
        backgroundColor: theme.surface,
        borderRadius: radius.md,
        padding: 13,
        gap: 5,
      }}
    >
      {title ? (
        <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>{title}</Text>
      ) : null}
      {typeof children === "string" ? <Hint>{children}</Hint> : children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */

export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled = false,
  busy = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  const background =
    variant === "primary"
      ? theme.inkBlock
      : variant === "danger"
        ? theme.lossSoft
        : variant === "ghost"
          ? "transparent"
          : theme.surfaceRaised;
  const colour =
    variant === "primary"
      ? (theme.onInk ?? theme.background)
      : variant === "danger"
        ? theme.lossText
        : variant === "ghost"
          ? theme.textMuted
          : theme.text;
  const borderColour =
    variant === "primary"
      ? theme.inkBlock
      : variant === "danger"
        ? theme.loss
        : variant === "ghost"
          ? "transparent"
          : theme.borderStrong;

  const inert = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: borderColour,
          borderWidth: 1,
          opacity: inert ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={colour} /> : null}
      <Text style={{ color: colour, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                  */
/* ------------------------------------------------------------------ */

/** The web `.seg`: a quiet trough with the active item as a filled slab. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.borderStrong,
        borderRadius: radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderRadius: radius.sm,
              backgroundColor: active ? theme.accent : "transparent",
              opacity: pressed && !active ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: active ? (theme.accentOn ?? "#fff") : theme.textMuted,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 34, paddingHorizontal: 22, gap: 9 }}>
      <Text
        style={{
          color: theme.text,
          fontSize: 17,
          fontWeight: "700",
          letterSpacing: -0.3,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {typeof children === "string" ? (
        <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20 }}>
          {children}
        </Text>
      ) : (
        children
      )}
      {action}
    </Card>
  );
}

/** A key/value row, used inside cards for compact detail blocks. */
export function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  const theme = useTheme();
  const shown = value === null || value === undefined || value === "" ? NA : value;
  return (
    <View style={styles.detailRow}>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>{label}</Text>
      <Text
        style={[
          tabular,
          {
            color: shown === NA ? theme.textFaint : theme.text,
            fontSize: 13.5,
            fontWeight: "600",
            flexShrink: 1,
            textAlign: "right",
          },
        ]}
      >
        {shown}
      </Text>
    </View>
  );
}

/**
 * A readout inside a tinted panel: the web `.panel-row`, with an optional note
 * and a hairline that separates it from the row above.
 */
export function ListRow({
  label,
  value,
  note,
  tone,
  first = false,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "profit" | "loss" | "neutral";
  first?: boolean;
}) {
  const theme = useTheme();
  const colour =
    tone === "profit" ? theme.profit : tone === "loss" ? theme.loss : theme.text;

  return (
    <View
      style={{
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.border,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{label}</Text>
        {note ? <Text style={{ color: theme.textFaint, fontSize: 11.5, lineHeight: 16, marginTop: 3 }}>{note}</Text> : null}
      </View>
      <Text
        style={[
          tabular,
          {
            color: value === NA ? theme.textFaint : colour,
            fontSize: 16,
            fontWeight: "700",
            letterSpacing: -0.3,
            textAlign: "right",
            flexShrink: 0,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** A labelled chip, used for tags, directions and statuses. */
export function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?:
    | "neutral"
    | "accent"
    | "long"
    | "short"
    | "open"
    | "partial"
    | "closed"
    | "profit"
    | "loss";
}) {
  const theme = useTheme();

  const palette =
    tone === "accent"
      ? { bg: theme.accentSoft, fg: theme.accentText }
      : tone === "long" || tone === "profit"
        ? { bg: theme.profitSoft, fg: theme.profitText ?? theme.profit }
        : tone === "short" || tone === "loss"
          ? { bg: theme.lossSoft, fg: theme.lossText ?? theme.loss }
          : tone === "open"
            ? { bg: theme.infoSoft, fg: theme.info }
            : tone === "partial"
              ? { bg: theme.warnSoft, fg: theme.warn }
              : tone === "closed"
                ? { bg: theme.breakevenSoft, fg: theme.breakeven ?? theme.textMuted }
                : { bg: theme.surfaceRaised, fg: theme.textMuted };

  return (
    <View
      style={{
        backgroundColor: palette.bg,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: palette.fg, fontSize: 11, fontWeight: "600", letterSpacing: 0.1 }}>
        {label}
      </Text>
    </View>
  );
}

/** A horizontal separator that respects the theme. */
export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 2 }} />;
}

/**
 * The foot of a page: the web app closes every page with a dark band, and this
 * is that band in miniature. It carries the product's own disclaimer rather
 * than navigation, because a phone has the tab bar for that.
 */
export function FooterBand() {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.footerBg, borderRadius: radius.lg, padding: 18, gap: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ color: theme.footerText, fontSize: 13.5, fontWeight: "700" }}>TradeVault</Text>
        <Text
          style={{
            color: theme.footerMuted,
            fontSize: 9.5,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          Trading journal
        </Text>
      </View>
      <Text style={{ color: theme.footerMuted, fontSize: 11.5, lineHeight: 17 }}>
        A journal and analysis tool. It does not place trades, connect to a broker, or tell you
        what will happen next.
      </Text>
    </View>
  );
}

/**
 * An inline confirmation.
 *
 * Used for destructive actions. It is deliberately not a system alert: the body
 * text explaining what is about to happen is the important part, and an alert
 * that gets dismissed by reflex does not give it room.
 */
export function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Banner tone="warn" title={title}>
        {body}
      </Banner>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button label="Cancel" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button label={confirmLabel} variant="danger" onPress={onConfirm} busy={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 0,
    borderRadius: radius.lg,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
  },
});
