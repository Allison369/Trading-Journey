/**
 * Shared UI primitives.
 *
 * Small, dependency-free components used by every page. They exist so that
 * things with a correctness cost — the "N/A" rule, the sample-data badge, the
 * profit/loss colouring — are implemented once instead of re-derived per page.
 */

import type { ReactNode } from "react";
import { NA, signClass } from "./format";

/* ------------------------------------------------------------------ */
/* Icons                                                              */
/* ------------------------------------------------------------------ */

/** A 16px stroke icon. Inline SVG so there is no icon-font dependency. */
export function Icon({
  path,
  size = 16,
  className,
}: {
  path: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

export const icons = {
  dashboard: "M3 12h4l3 8 4-16 3 8h4",
  trades: "M3 6h18M3 12h18M3 18h12",
  add: "M12 5v14M5 12h14",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  journal: "M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM4 4v13",
  strategy: "M12 2v20M2 12h20M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4",
  risk: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  info: "M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  warning: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M20 6 9 17l-5-5",
  close: "M18 6 6 18M6 6l12 12",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  trash: "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5L22 3z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  wallet: "M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5M18 12h.01",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  image:
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  shield: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  spark: "M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4",
} as const;

/* ------------------------------------------------------------------ */
/* Statistic                                                          */
/* ------------------------------------------------------------------ */

export type StatTone = "auto" | "pos" | "neg" | "accent" | "plain";

export function Stat({
  label,
  value,
  hint,
  tone = "auto",
  emphasis = false,
  valueClass,
}: {
  label: string;
  /** Already-formatted text. Never compute a metric in here. */
  value: ReactNode;
  hint?: ReactNode;
  /** `auto` colours the value by its own sign. */
  tone?: StatTone;
  emphasis?: boolean;
  valueClass?: string;
}) {
  let toneClass = "";
  if (tone === "auto" && typeof value === "string") {
    // Only colour values that are actually numbers; "N/A" stays neutral.
    if (value !== NA) {
      const numeric = Number(value.replace(/[^0-9.\-]/g, ""));
      if (Number.isFinite(numeric) && /[-+]?\d/.test(value)) {
        toneClass = signClass(numeric);
      }
    }
  } else if (tone !== "auto") {
    toneClass = tone;
  }

  return (
    <div className={`stat${emphasis ? " emphasis" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${valueClass ?? toneClass}`.trim()} title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pastel block                                                      */
/* ------------------------------------------------------------------ */

/**
 * The four tints the design uses, each with a deep ink of the same hue.
 *
 * The ink is deliberately hue-matched rather than neutral: grey text on a
 * coral block looks dirty, and the deep hue is what makes the block read as
 * one object instead of a coloured rectangle with a label dropped into it.
 */
export type PastelTone = "coral" | "yellow" | "pink" | "blue";

/**
 * A headline figure on a tinted block.
 *
 * `sign` carries profit/loss for a money figure. It renders as a small chip
 * rather than by colouring the number, because the number already wears the
 * block's own ink — colouring it green on coral would be both ugly and
 * illegible. The chip keeps the app-wide rule intact: coloured text always
 * means money.
 */
export function PastelStat({
  tone,
  label,
  value,
  hint,
  sign,
}: {
  tone: PastelTone;
  label: string;
  /** Already-formatted text. Never compute a metric in here. */
  value: ReactNode;
  hint?: ReactNode;
  sign?: "pos" | "neg";
}) {
  return (
    <div className={`pastel pastel-${tone}`}>
      <div className="pastel-head">
        <div className="pastel-label">{label}</div>
        {sign ? (
          <span className={`pastel-chip ${sign}`}>{sign === "pos" ? "profit" : "loss"}</span>
        ) : null}
      </div>
      <div className="pastel-value" title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
      {hint ? <div className="pastel-hint">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Banners                                                            */
/* ------------------------------------------------------------------ */

export type BannerTone = "info" | "warn" | "danger" | "accent";

export function Banner({
  tone = "info",
  title,
  children,
  icon = true,
}: {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: boolean;
}) {
  const iconPath =
    tone === "danger" || tone === "warn" ? icons.warning : tone === "accent" ? icons.target : icons.info;

  return (
    <div className={`banner banner-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon ? <Icon path={iconPath} className="banner-icon" /> : null}
      <div>
        {title ? <div className="banner-title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                             */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  children,
  action,
  icon = icons.info,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="state">
      <div className="state-icon">
        <Icon path={icon} size={22} />
      </div>
      <div className="state-title">{title}</div>
      {children ? <div className="state-body">{children}</div> : null}
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state" aria-busy="true" aria-live="polite">
      <div className="state-title">{label}</div>
      <div className="state-body">Reading your journal.</div>
    </div>
  );
}

export function ErrorState({
  title = "Could not load your journal",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state">
      <div className="state-icon">
        <Icon path={icons.warning} size={22} />
      </div>
      <div className="state-title">{title}</div>
      <div className="state-body">{message}</div>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                             */
/* ------------------------------------------------------------------ */

export function DirectionBadge({ direction }: { direction: "long" | "short" }) {
  return (
    <span className={`badge badge-${direction}`}>
      {direction === "long" ? "Long" : "Short"}
    </span>
  );
}

export function StatusBadge({ status }: { status: "open" | "partial" | "closed" }) {
  const label = status === "open" ? "Open" : status === "partial" ? "Partial" : "Closed";
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export function SampleBadge({ children = "Sample data" }: { children?: ReactNode }) {
  return (
    <span className="badge badge-sample" title="This row is part of the app's sample set, not your own records.">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        // Click-outside closes; clicks inside the panel do not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon path={icons.close} />
          </button>
        </div>
        {children}
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmation dialog for destructive actions                        */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Delete",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="prose">{body}</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Form field wrapper                                                 */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="req" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? (
        <div className="error-text" role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="hint">{hint}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Key/value list                                                     */
/* ------------------------------------------------------------------ */

export function KeyValue({ rows }: { rows: Array<{ key: string; value: ReactNode }> }) {
  return (
    <dl className="kv">
      {rows.map((row) => (
        <div key={row.key} style={{ display: "contents" }}>
          <dt>{row.key}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
