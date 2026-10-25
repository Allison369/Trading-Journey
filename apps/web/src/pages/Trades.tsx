/**
 * Trades.
 *
 * A sortable, filterable table of every trade. Every displayed P&L is computed
 * from that trade's exits by the shared engine — never read from a stored
 * column — so a partial close is priced correctly and an open trade shows only
 * what it has actually realised.
 *
 * The table is wrapped in an overflow container rather than collapsing into
 * cards on small screens: a trader comparing numbers wants the columns, and a
 * horizontally scrollable table keeps them aligned.
 */

import { useMemo, useState } from "react";
import {
  computeTrade,
  deriveStatus,
  validateExits,
  type Trade,
  type CurrencyCode,
} from "@tradevault/core";
import { useApp, useDerived, runSave } from "../lib/appContext";
import { capitalBase } from "../lib/store";
import {
  Banner,
  ConfirmDialog,
  DirectionBadge,
  EmptyState,
  Field,
  Icon,
  KeyValue,
  LoadingState,
  Modal,
  StatusBadge,
  icons,
} from "../components/ui";
import {
  AttachmentCountBadge,
  AttachmentGallery,
  AttachmentUploader,
} from "../components/attachments";
import {
  fmtDateTime,
  fmtDuration,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  fmtPrice,
  fmtR,
  humanise,
  NA,
  signClass,
} from "../components/format";
import type { PageId } from "../navigation";

type SortKey = "entryAt" | "symbol" | "netPnl" | "rMultiple" | "quantity";

interface Row {
  trade: Trade;
  accountName: string;
  currency: CurrencyCode;
  netPnl: number;
  grossPnl: number;
  rMultiple: number | null;
  holdingMs: number | null;
  costs: number;
  closedQuantity: number;
  openQuantity: number;
  realised: boolean;
}

export function TradesPage({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const { loadState, isSampleData, reload, store } = useApp();
  const { accounts, trades, exitsMap, strategies, attachmentsByTrade } = useDerived();

  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | "long" | "short">("all");
  const [status, setStatus] = useState<"all" | "open" | "partial" | "closed">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("entryAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Trade | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addingExitFor, setAddingExitFor] = useState<Trade | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const rows: Row[] = useMemo(() => {
    return trades.map((trade) => {
      const account = accountById.get(trade.accountId);
      const comp = computeTrade(trade, exitsMap[trade.id] ?? []);
      const realised = trade.status !== "open";
      return {
        trade,
        accountName: account?.name ?? "Unknown account",
        currency: account?.currency ?? "USD",
        netPnl: comp.netPnl,
        grossPnl: comp.grossPnl,
        rMultiple: comp.rMultiple,
        holdingMs: comp.holdingMs,
        costs: comp.costs.total,
        closedQuantity: comp.closedQuantity,
        openQuantity: comp.openQuantity,
        realised,
      };
    });
  }, [trades, exitsMap, accountById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (direction !== "all" && r.trade.direction !== direction) return false;
      if (status !== "all" && r.trade.status !== status) return false;
      if (accountFilter !== "all" && r.trade.accountId !== accountFilter) return false;
      if (q) {
        const haystack = [r.trade.symbol, r.trade.strategy ?? "", r.trade.market ?? "", r.trade.notes ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    out = [...out].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = a.trade.symbol.localeCompare(b.trade.symbol);
          break;
        case "netPnl":
          cmp = a.netPnl - b.netPnl;
          break;
        case "rMultiple":
          // R is undefined for an open trade. Undefined sorts last, not first.
          cmp = (a.rMultiple ?? Number.NEGATIVE_INFINITY) - (b.rMultiple ?? Number.NEGATIVE_INFINITY);
          break;
        case "quantity":
          cmp = Number(a.trade.quantity) - Number(b.trade.quantity);
          break;
        case "entryAt":
        default:
          cmp = Date.parse(a.trade.entryAt) - Date.parse(b.trade.entryAt);
          break;
      }
      // Stable tiebreak so equal values do not jump around between renders.
      if (cmp === 0) cmp = a.trade.id.localeCompare(b.trade.id);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return out;
  }, [rows, query, direction, status, accountFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Money reads best largest-first by default; dates newest-first.
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setActionError(null);
    const result = await runSave(() => store.deleteTrade(pendingDelete.id));
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setPendingDelete(null);
    await reload();
  }

  if (loadState === "loading" && trades.length === 0) {
    return <LoadingState label="Loading your trades…" />;
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        icon={icons.trades}
        title="No trades recorded yet"
        action={
          accounts.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("settings")}>
              Add an account first
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("add-trade")}>
              Record your first trade
            </button>
          )
        }
      >
        {accounts.length === 0
          ? "A trade needs an account. Add one in Data & Settings, then come back here."
          : "Once you record a trade it appears here with its P&L computed from the prices you entered."}
      </EmptyState>
    );
  }

  const expandedRow = filtered.find((r) => r.trade.id === expanded);

  return (
    <div className="stack">
      {isSampleData ? (
        <Banner tone="warn" title="Sample data">
          These are the app's labelled example trades, not your records.
        </Banner>
      ) : null}

      {actionError ? (
        <Banner tone="danger" title="That did not work">
          {actionError}
        </Banner>
      ) : null}

      {/* Filters ---------------------------------------------------- */}

      <section className="card" style={{ padding: 14 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label className="label" htmlFor="trade-search">
              Search
            </label>
            <input
              id="trade-search"
              className="input"
              type="search"
              placeholder="Symbol, strategy, market or notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="field" style={{ flex: "0 1 130px" }}>
            <label className="label" htmlFor="filter-direction">
              Direction
            </label>
            <select
              id="filter-direction"
              className="select"
              value={direction}
              onChange={(e) => setDirection(e.target.value as typeof direction)}
            >
              <option value="all">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>

          <div className="field" style={{ flex: "0 1 130px" }}>
            <label className="label" htmlFor="filter-status">
              Status
            </label>
            <select
              id="filter-status"
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="partial">Partly closed</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="field" style={{ flex: "0 1 180px" }}>
            <label className="label" htmlFor="filter-account">
              Account
            </label>
            <select
              id="filter-account"
              className="select"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
            >
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="spacer" />

          <button type="button" className="btn btn-primary" onClick={() => onNavigate("add-trade")}>
            <Icon path={icons.add} />
            Add trade
          </button>
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          Showing {filtered.length} of {trades.length} trade{trades.length === 1 ? "" : "s"}
          {filtered.length !== trades.length ? " after filtering" : ""}.
        </div>
      </section>

      {/* Table ------------------------------------------------------ */}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort("entryAt")} aria-sort={ariaSort(sortKey, sortDir, "entryAt")}>
                Entry {sortMark(sortKey, sortDir, "entryAt")}
              </th>
              <th className="sortable" onClick={() => toggleSort("symbol")} aria-sort={ariaSort(sortKey, sortDir, "symbol")}>
                Instrument {sortMark(sortKey, sortDir, "symbol")}
              </th>
              <th>Direction</th>
              <th>Status</th>
              <th>Account</th>
              <th className="sortable num" onClick={() => toggleSort("quantity")} aria-sort={ariaSort(sortKey, sortDir, "quantity")}>
                Size {sortMark(sortKey, sortDir, "quantity")}
              </th>
              <th className="num">Entry</th>
              <th className="num">Exit</th>
              <th className="num sortable" onClick={() => toggleSort("netPnl")} aria-sort={ariaSort(sortKey, sortDir, "netPnl")}>
                Net P&amp;L {sortMark(sortKey, sortDir, "netPnl")}
              </th>
              <th className="num sortable" onClick={() => toggleSort("rMultiple")} aria-sort={ariaSort(sortKey, sortDir, "rMultiple")}>
                R {sortMark(sortKey, sortDir, "rMultiple")}
              </th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="hint" style={{ padding: "18px 4px" }}>
                    No trade matches these filters.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.trade.id}>
                  <td>
                    <div>{fmtDateTime(row.trade.entryAt)}</div>
                    <div className="hint">Held {fmtDuration(row.holdingMs)}</div>
                  </td>
                  <td>
                    <strong>{row.trade.symbol}</strong>
                    {(attachmentsByTrade[row.trade.id]?.length ?? 0) > 0 ? (
                      <span style={{ marginLeft: 6 }}>
                        <AttachmentCountBadge count={attachmentsByTrade[row.trade.id]?.length ?? 0} />
                      </span>
                    ) : null}
                    <div className="hint">
                      {humanise(row.trade.assetClass)}
                      {row.trade.strategy ? ` · ${row.trade.strategy}` : ""}
                    </div>
                  </td>
                  <td>
                    <DirectionBadge direction={row.trade.direction} />
                  </td>
                  <td>
                    <StatusBadge status={row.trade.status} />
                  </td>
                  <td>
                    <div>{row.accountName}</div>
                    <div className="hint">{row.currency}</div>
                  </td>
                  <td className="num">
                    {fmtNumber(Number(row.trade.quantity), { decimals: 4 })}
                    {row.openQuantity > 0 && row.closedQuantity > 0 ? (
                      <div className="hint">
                        {fmtNumber(row.openQuantity, { decimals: 4 })} open
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{fmtPrice(row.trade.entryPrice)}</td>
                  <td className="num">
                    {row.trade.exitPrice === null ? <span className="na">{NA}</span> : fmtPrice(row.trade.exitPrice)}
                  </td>
                  <td className={`num ${row.realised ? signClass(row.netPnl) : ""}`}>
                    {row.realised ? (
                      <>
                        {fmtMoney(row.netPnl, row.currency, { signed: true })}
                        <div className="hint">{fmtMoney(row.costs, row.currency)} costs</div>
                      </>
                    ) : (
                      <>
                        <span className="na">{NA}</span>
                        <div className="hint">still open</div>
                      </>
                    )}
                  </td>
                  <td className="num">
                    {row.rMultiple === null ? (
                      <span className="na" title={row.realised ? "No stop loss, so R is undefined" : "Realised R needs a closed trade"}>
                        {NA}
                      </span>
                    ) : (
                      fmtR(row.rMultiple)
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setExpanded(expanded === row.trade.id ? null : row.trade.id)}
                        aria-label={`Details for ${row.trade.symbol}`}
                      >
                        <Icon path={icons.search} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAddingExitFor(row.trade)}
                        aria-label={`Record an exit for ${row.trade.symbol}`}
                        title="Record an exit"
                      >
                        <Icon path={icons.target} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setPendingDelete(row.trade)}
                        aria-label={`Delete ${row.trade.symbol}`}
                        title="Delete trade"
                      >
                        <Icon path={icons.trash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail ----------------------------------------------------- */}

      {expandedRow ? (
        <TradeDetail
          row={expandedRow}
          onClose={() => setExpanded(null)}
          onChanged={reload}
          strategyName={strategies.find((s) => s.id === expandedRow.trade.strategyId)?.name}
        />
      ) : null}

      {addingExitFor ? (
        <AddExitModal
          trade={addingExitFor}
          currency={accountById.get(addingExitFor.accountId)?.currency ?? "USD"}
          existing={exitsMap[addingExitFor.id] ?? []}
          onClose={() => setAddingExitFor(null)}
          onSaved={async () => {
            setAddingExitFor(null);
            await reload();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete ${pendingDelete.symbol}?`}
          busy={busy}
          confirmLabel="Delete trade"
          body={
            <>
              <p>
                This removes the trade and all of its exits from your journal. It is a soft delete,
                so the record is hidden rather than destroyed and can be recovered by support if you
                ask quickly.
              </p>
              <p>
                If you only want to correct a mistake, consider editing the trade instead — deleting
                it removes the lesson too.
              </p>
            </>
          }
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail panel                                                       */
/* ------------------------------------------------------------------ */

function TradeDetail({
  row,
  onClose,
  onChanged,
  strategyName,
}: {
  row: Row;
  onClose: () => void;
  /** Called when an attachment is added or removed, so the list refreshes. */
  onChanged: () => void | Promise<void>;
  strategyName?: string;
}) {
  const { exitsMap, attachmentsByTrade } = useDerived();
  const exits = exitsMap[row.trade.id] ?? [];
  const attachments = attachmentsByTrade[row.trade.id] ?? [];
  const t = row.trade;

  const exitErrors = validateExits(t, exits);
  const derived = deriveStatus(t, exits);

  return (
    <Modal
      title={`${t.symbol} — ${t.direction === "long" ? "long" : "short"} ${fmtNumber(Number(t.quantity), { decimals: 4 })}`}
      onClose={onClose}
    >
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <DirectionBadge direction={t.direction} />
          <StatusBadge status={t.status} />
          {derived !== t.status ? (
            <span className="badge badge-accent" title="The stored status disagrees with the exits on record.">
              Exits imply “{derived}”
            </span>
          ) : null}
          <span className="chip">{humanise(t.assetClass)}</span>
          <span className="chip">{humanise(t.session)} session</span>
          {t.market ? <span className="chip">{t.market}</span> : null}
        </div>

        {derived !== t.status ? (
          <Banner tone="warn" title="The recorded exits do not match this trade's status">
            The exits on file close {fmtNumber(Number(t.quantity) - row.openQuantity, { decimals: 4 })} of{" "}
            {fmtNumber(Number(t.quantity), { decimals: 4 })}, which reads as “{derived}”. Statuses are
            shown as recorded so you can see the discrepancy rather than have it silently corrected.
          </Banner>
        ) : null}

        <div className="grid grid-2">
          <div>
            <div className="form-section-title">Result</div>
            <KeyValue
              rows={[
                { key: "Gross P&L", value: row.realised ? fmtMoney(row.grossPnl, row.currency, { signed: true }) : NA },
                { key: "Costs", value: row.realised ? fmtMoney(row.costs, row.currency) : NA },
                { key: "Net P&L", value: row.realised ? fmtMoney(row.netPnl, row.currency, { signed: true }) : NA },
                { key: "Manual override", value: t.manualNetPnl ? fmtMoney(Number(t.manualNetPnl), row.currency) : "Not set" },
                { key: "R multiple", value: fmtR(row.rMultiple) },
                { key: "Holding time", value: fmtDuration(row.holdingMs) },
                {
                  key: "Return on risk",
                  value: row.rMultiple === null ? NA : fmtPercent(row.rMultiple, { decimals: 2, signed: true }),
                },
              ]}
            />
          </div>

          <div>
            <div className="form-section-title">Prices</div>
            <KeyValue
              rows={[
                { key: "Entry", value: `${fmtPrice(t.entryPrice)} · ${fmtDateTime(t.entryAt)}` },
                { key: "Exit", value: t.exitPrice === null ? NA : `${fmtPrice(t.exitPrice)} · ${fmtDateTime(t.exitAt)}` },
                { key: "Stop loss", value: t.stopLoss === null ? NA : fmtPrice(t.stopLoss) },
                { key: "Take profit", value: t.takeProfit === null ? NA : fmtPrice(t.takeProfit) },
                { key: "Quantity", value: `${fmtNumber(Number(t.quantity), { decimals: 4 })} (${fmtNumber(row.closedQuantity, { decimals: 4 })} closed)` },
                { key: "Multiplier", value: fmtNumber(Number(t.contractMultiplier), { decimals: 0 }) },
                { key: "Account", value: `${row.accountName} (${row.currency})` },
                { key: "Strategy", value: strategyName ?? t.strategy ?? "Not assigned" },
              ]}
            />
          </div>
        </div>

        {exitErrors.length > 0 ? (
          <Banner tone="danger" title="Problem with the recorded exits">
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {exitErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Banner>
        ) : null}

        <div>
          <div className="form-section-title">Exits ({exits.length})</div>
          {exits.length === 0 ? (
            <div className="hint">
              No exit recorded. This trade is open, so it contributes nothing to your realised
              statistics yet.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data" style={{ minWidth: 460 }}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="num">Quantity</th>
                    <th className="num">Price</th>
                    <th className="num">Fees</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {exits.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDateTime(e.exitedAt)}</td>
                      <td className="num">{fmtNumber(Number(e.quantity), { decimals: 4 })}</td>
                      <td className="num">{fmtPrice(e.price)}</td>
                      <td className="num">{fmtMoney(Number(e.fees), row.currency)}</td>
                      <td>{e.notes ?? <span className="na">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {t.entryReason || t.exitReason || t.mistakes || t.lessons || t.notes ? (
          <div className="form-section-title">Notes and review</div>
        ) : null}
        {t.entryReason ? <NoteLine label="Why I entered" text={t.entryReason} /> : null}
        {t.exitReason ? <NoteLine label="Why I exited" text={t.exitReason} /> : null}
        {t.mistakes ? <NoteLine label="Mistakes" text={t.mistakes} tone="neg" /> : null}
        {t.lessons ? <NoteLine label="Lessons" text={t.lessons} tone="pos" /> : null}
        {t.notes ? <NoteLine label="Notes" text={t.notes} /> : null}

        <div>
          <div className="form-section-title">
            Screenshots ({attachments.length})
          </div>
          <AttachmentGallery attachments={attachments} onDeleted={onChanged} />
        </div>

        <div>
          <AttachmentUploader tradeId={t.id} onUploaded={onChanged} />
        </div>
      </div>
    </Modal>
  );
}

function NoteLine({ label, text, tone }: { label: string; text: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div className="stat-label" style={tone ? { color: `var(--${tone === "pos" ? "profit" : "loss"}-text)` } : undefined}>
        {label}
      </div>
      <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add exit                                                           */
/* ------------------------------------------------------------------ */

function AddExitModal({
  trade,
  currency,
  existing,
  onClose,
  onSaved,
}: {
  trade: Trade;
  currency: CurrencyCode;
  existing: import("@tradevault/core").TradeExit[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { store } = useApp();
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState(trade.entryPrice);
  const [fees, setFees] = useState("0");
  const [exitedAt, setExitedAt] = useState(() => toLocalInputValue(new Date()));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const opened = Number(trade.quantity);
  const alreadyClosed = existing.filter((e) => !e.deletedAt).reduce((s, e) => s + Number(e.quantity), 0);
  const remaining = Math.max(0, opened - alreadyClosed);

  async function save() {
    setError(null);

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a number greater than zero.");
      return;
    }
    if (qty > remaining + 1e-9) {
      setError(
        `That closes more than the position. ${remaining} of ${opened} is still open on this trade.`
      );
      return;
    }
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      setError("Exit price must be a number greater than zero.");
      return;
    }
    const f = Number(fees);
    if (!Number.isFinite(f) || f < 0) {
      setError("Fees must be zero or a positive number.");
      return;
    }
    const when = new Date(exitedAt);
    if (Number.isNaN(when.getTime())) {
      setError("Exit time is not a valid date and time.");
      return;
    }

    setBusy(true);
    const result = await runSave(() =>
      store.createExit({
        tradeId: trade.id,
        quantity: String(qty),
        price: String(p),
        fees: String(f),
        exitedAt: when.toISOString(),
        notes: notes.trim() || undefined,
      })
    );

    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }

    // Keep the parent trade's status and headline exit fields consistent.
    const newTotal = alreadyClosed + qty;
    await store.updateTrade(trade.id, {
      status: newTotal >= opened - 1e-9 ? "closed" : "partial",
      exitAt: when.toISOString(),
      exitPrice: String(p),
    });

    setBusy(false);
    await onSaved();
  }

  return (
    <Modal
      title={`Record an exit for ${trade.symbol}`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save exit"}
          </button>
        </>
      }
    >
      <div className="stack">
        <Banner tone="info">
          {fmtNumber(alreadyClosed, { decimals: 4 })} of {fmtNumber(opened, { decimals: 4 })} already closed.{" "}
          <strong>{fmtNumber(remaining, { decimals: 4 })} remains open.</strong> Recording a partial exit
          keeps the trade in your statistics and prices each leg at its own exit price.
        </Banner>

        <div className="form-grid cols-3">
          <Field label="Quantity to close" required htmlFor="exit-qty" hint={`At most ${fmtNumber(remaining, { decimals: 4 })}`}>
            <input
              id="exit-qty"
              className="input"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={String(remaining)}
            />
          </Field>
          <Field label="Exit price" required htmlFor="exit-price">
            <input
              id="exit-price"
              className="input"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label={`Fees (${currency})`} htmlFor="exit-fees">
            <input
              id="exit-fees"
              className="input"
              inputMode="decimal"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Exit time" required htmlFor="exit-at">
          <input
            id="exit-at"
            className="input"
            type="datetime-local"
            value={exitedAt}
            onChange={(e) => setExitedAt(e.target.value)}
          />
        </Field>

        <Field label="Note" htmlFor="exit-notes" hint="What made you close this part of the position?">
          <textarea
            id="exit-notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error ? (
          <Banner tone="danger" title="Check these values">
            {error}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function ariaSort(
  active: SortKey,
  dir: "asc" | "desc",
  key: SortKey
): "ascending" | "descending" | "none" {
  if (active !== key) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

function sortMark(active: SortKey, dir: "asc" | "desc", key: SortKey): string {
  if (active !== key) return "";
  return dir === "asc" ? "▲" : "▼";
}

/** Format a Date for a datetime-local input, in the browser's own zone. */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export { capitalBase };
