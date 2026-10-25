/**
 * Colour tokens.
 *
 * Dark is the default — this is an app people open in the evening to write up
 * the day, and a bright screen for that is hostile. Light is available and uses
 * the same token names so no component needs to know which theme is active.
 *
 * Green means profit and red means loss. Those two are never used decoratively,
 * so the meaning is never ambiguous.
 */

export interface Theme {
  name: "dark" | "light";
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong?: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  /** Text-safe accent, for links and active labels. */
  accentText: string;
  /** Text/icon colour on a solid accent fill. */
  accentOn?: string;
  accentSoft?: string;
  /** Text/icon colour on the near-black (or, in dark, near-white) ink block. */
  onInk?: string;
  profit: string;
  profitText?: string;
  loss: string;
  lossText?: string;
  warn: string;
  info: string;
  /** Quiet fills for semantic pills, matching the web badges. */
  profitSoft?: string;
  lossSoft?: string;
  infoSoft?: string;
  warnSoft?: string;
  /** Neutral "scratch" colour, used for breakeven and closed states. */
  breakeven?: string;
  breakevenSoft?: string;
  /** Hairline colour inside charts, so a chart grid never out-shouts the data. */
  chartGrid?: string;
  /** The warm off-white rail, matching the web app. */
  rail?: string;
  /* Tinted panels, matching the web app */
  panelCool?: string;
  panelWarm?: string;
  panelCream?: string;
  /* Headline pastels with their deep inks */
  pastelCoral?: string;
  pastelCoralInk?: string;
  pastelYellow?: string;
  pastelYellowInk?: string;
  pastelPink?: string;
  pastelPinkInk?: string;
  pastelBlue?: string;
  pastelBlueInk?: string;
  /* Near-black blocks */
  inkBlock?: string;
  /* Footer */
  footerBg?: string;
  footerText?: string;
  footerMuted?: string;
  /* Buttons */
  btnPrimaryBg?: string;
  btnPrimaryBgHover?: string;
  btnPrimaryText?: string;
  /* Semantic chips that sit ON a pastel block, so they are darker than the
     body profit/loss colours to stay legible against a light tint. */
  chipPos?: string;
  chipNeg?: string;
}

export const darkTheme: Theme = {
  name: "dark",
  background: "#131313",
  surface: "#1b1b1a",
  surfaceRaised: "#222221",
  border: "#2e2e2c",
  borderStrong: "#3f3f3b",
  text: "#f2f1ec",
  textMuted: "#a3a29a",
  textFaint: "#77766f",
  accent: "#a78bfa",
  accentText: "#c4b5fd",
  accentOn: "#131313",
  accentSoft: "rgba(167, 139, 250, 0.16)",
  onInk: "#131313",
  profit: "#4ade80",
  profitText: "#4ade80",
  profitSoft: "rgba(34, 197, 94, 0.16)",
  loss: "#f87171",
  lossText: "#f87171",
  lossSoft: "rgba(239, 68, 68, 0.16)",
  warn: "#fbbf24",
  warnSoft: "rgba(251, 191, 36, 0.16)",
  info: "#60a5fa",
  infoSoft: "rgba(96, 165, 250, 0.16)",
  breakeven: "#8f8f88",
  breakevenSoft: "rgba(143, 143, 136, 0.16)",
  chartGrid: "#2e2e2c",
  rail: "#101010",
  panelCool: "#16202b",
  panelWarm: "#2a1f1c",
  panelCream: "#2d241f",
  pastelCoral: "#3d2a22",
  pastelCoralInk: "#f9b69f",
  pastelYellow: "#3a3220",
  pastelYellowInk: "#f7df8f",
  pastelPink: "#3a2530",
  pastelPinkInk: "#f6cee0",
  pastelBlue: "#1f2c3c",
  pastelBlueInk: "#b6d5f4",
  inkBlock: "#f2f1ec",
  footerBg: "#1c1c1b",
  footerText: "#ececea",
  footerMuted: "#8d8d86",
  btnPrimaryBg: "#f2f1ec",
  btnPrimaryBgHover: "#dcdbd4",
  btnPrimaryText: "#131313",
  chipPos: "#4ade80",
  chipNeg: "#f87171",
};

export const lightTheme: Theme = {
  name: "light",
  background: "#ffffff",
  surface: "#ffffff",
  surfaceRaised: "#fafbf8",
  border: "#e9e9e7",
  borderStrong: "#d9d9d4",
  text: "#2f2f2f",
  textMuted: "#64655e",
  textFaint: "#94958c",
  accent: "#6d28d9",
  accentText: "#5b21b6",
  accentOn: "#ffffff",
  accentSoft: "rgba(109, 40, 217, 0.10)",
  onInk: "#ffffff",
  profit: "#15803d",
  profitText: "#15803d",
  profitSoft: "rgba(22, 163, 74, 0.12)",
  loss: "#b91c1c",
  lossText: "#b91c1c",
  lossSoft: "rgba(220, 38, 38, 0.10)",
  warn: "#92400e",
  warnSoft: "rgba(180, 83, 9, 0.12)",
  info: "#2563eb",
  infoSoft: "rgba(37, 99, 235, 0.10)",
  breakeven: "#8a8b83",
  breakevenSoft: "rgba(138, 139, 131, 0.14)",
  chartGrid: "#eeeeea",
  rail: "#fafbf8",
  panelCool: "#f6fafd",
  panelWarm: "#fff0ec",
  panelCream: "#fff7f5",
  pastelCoral: "#f9b69f",
  pastelCoralInk: "#341109",
  pastelYellow: "#f7df8f",
  pastelYellowInk: "#2c1900",
  pastelPink: "#f6cee0",
  pastelPinkInk: "#320d1e",
  pastelBlue: "#b6d5f4",
  pastelBlueInk: "#081f38",
  inkBlock: "#141412",
  footerBg: "#2f2f2f",
  footerText: "#ececea",
  footerMuted: "#a5a59e",
  btnPrimaryBg: "#141412",
  btnPrimaryBgHover: "#2f2f2f",
  btnPrimaryText: "#ffffff",
  chipPos: "#0f5132",
  chipNeg: "#7f1d1d",
};
