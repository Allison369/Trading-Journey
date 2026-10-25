/**
 * Strategies.
 *
 * A strategy here is a written plan: when to enter, when to exit, how much to
 * risk, and a checklist to run through before committing. Its purpose is to
 * make the analytics meaningful — "this playbook has made X over 40 trades" is
 * only answerable if trades are tagged with the playbook they came from.
 *
 * Strategy performance is shown next to each strategy, computed from closed
 * trades assigned to it, with the trade count always visible.
 */

import { useMemo, useState } from "react";
import {
  TRADING_SESSIONS,
  groupPerformance,
  type TradingSession,
  type TradingStrategy,
} from "@tradevault/core";
import { useApp, useDerived, runSave } from "../lib/appContext";
import { capitalBase } from "../lib/store";
import {
  Banner,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  Modal,
  icons,
} from "../components/ui";
import { fmtMoney, fmtNumber, fmtPercent, fmtR, humanise, NA, signClass } from "../components/format";
import type { PageId } from "../navigation";
import type { CurrencyCode } from "@tradevault/core";

export function StrategiesPage({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const { store, reload, isSampleData } = useApp();
  const { strategies, trades, exitsMap, accounts } = useDerived();

  const [editing, setEditing] = useState<TradingStrategy | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TradingStrategy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const currency: CurrencyCode = useMemo(() => {
    const sorted = [...accounts].sort((a, b) => capitalBase(b) - capitalBase(a));
    return sorted[0]?.currency ?? "USD";
  }, [accounts]);

  /** Performance for each strategy, keyed by name (trades carry the name too). */
  const performanceByName = useMemo(() => {
    const groups = groupPerformance(trades, exitsMap, (t) => t.strategy ?? t.strategyId ?? null);
    const map = new Map<string, (typeof groups)[number]>();
    for (const g of groups) map.set(g.key, g);
    return map;
  }, [trades, exitsMap]);

  const visible = useMemo(
    () => strategies.filter((s) => (showArchived ? true : !s.isArchived)),
    [strategies, showArchived]
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    const result = await runSave(() => store.deleteStrategy(pendingDelete.id));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPendingDelete(null);
    await reload();
  }

  return (
    <div className="stack">
      {isSampleData ? (
        <Banner tone="warn" title="Sample data">
          These example strategies are not yours.
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="danger" title="That did not work">
          {error}
        </Banner>
      ) : null}

      <section className="card" style={{ padding: 14 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>Show archived</span>
          </label>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon path={icons.add} />
            New strategy
          </button>
        </div>
      </section>

      {visible.length === 0 ? (
        <EmptyState
          icon={icons.strategy}
          title={strategies.length === 0 ? "No strategies yet" : "No strategies to show"}
          action={
            strategies.length === 0 ? (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                Write your first playbook
              </button>
            ) : undefined
          }
        >
          {strategies.length === 0
            ? "A strategy is a written plan you can hold yourself to. Assign trades to it and the analytics will tell you which of your playbooks actually works."
            : "All your strategies are archived. Tick “Show archived” to see them."}
        </EmptyState>
      ) : (
        <div className="grid grid-2">
          {visible.map((strategy) => {
            const perf = performanceByName.get(strategy.name);
            return (
              <article className="card" key={strategy.id}>
                <div className="card-head">
                  <div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 16 }}>{strategy.name}</strong>
                      {strategy.isArchived ? <span className="badge badge-closed">Archived</span> : null}
                      {strategy.session ? <span className="chip">{humanise(strategy.session)}</span> : null}
                    </div>
                    {strategy.description ? <div className="card-desc">{strategy.description}</div> : null}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(strategy)} aria-label={`Edit ${strategy.name}`}>
                      <Icon path={icons.edit} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(strategy)} aria-label={`Delete ${strategy.name}`}>
                      <Icon path={icons.trash} />
                    </button>
                  </div>
                </div>

                {/* Performance */}
                <div className="grid grid-3" style={{ marginBottom: 14 }}>
                  <div className="stat" style={{ padding: "10px 12px" }}>
                    <div className="stat-label">Net P&amp;L</div>
                    <div className={`stat-value sm ${perf ? signClass(perf.netPnl) : ""}`}>
                      {perf ? fmtMoney(perf.netPnl, currency, { signed: true }) : NA}
                    </div>
                  </div>
                  <div className="stat" style={{ padding: "10px 12px" }}>
                    <div className="stat-label">Trades</div>
                    <div className="stat-value sm">{perf ? fmtNumber(perf.trades, { decimals: 0 }) : "0"}</div>
                  </div>
                  <div className="stat" style={{ padding: "10px 12px" }}>
                    <div className="stat-label">Win rate</div>
                    <div className="stat-value sm">{perf ? fmtPercent(perf.winRate, { decimals: 0 }) : NA}</div>
                  </div>
                </div>

                {perf && perf.averageR !== null ? (
                  <div className="hint" style={{ marginBottom: 12 }}>
                    Average {fmtR(perf.averageR)} across trades with a stop loss.
                  </div>
                ) : null}

                {/* Markets and instruments */}
                {strategy.markets.length > 0 || strategy.instruments.length > 0 ? (
                  <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
                    {strategy.markets.map((m) => (
                      <span className="chip" key={`m-${m}`}>{m}</span>
                    ))}
                    {strategy.instruments.map((i) => (
                      <span className="chip" key={`i-${i}`}>{i}</span>
                    ))}
                  </div>
                ) : null}

                {strategy.entryRules ? (
                  <RuleBlock label="Entry" text={strategy.entryRules} />
                ) : null}
                {strategy.exitRules ? (
                  <RuleBlock label="Exit" text={strategy.exitRules} />
                ) : null}
                {strategy.riskRules ? (
                  <RuleBlock label="Risk" text={strategy.riskRules} />
                ) : null}

                {strategy.checklist.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="stat-label">Pre-trade checklist</div>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 14 }}>
                      {strategy.checklist.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {strategy.improvementNotes ? (
                  <div style={{ marginTop: 12 }}>
                    <RuleBlock label="Improvements" text={strategy.improvementNotes} />
                  </div>
                ) : null}

                <div className="divider" />
                <button type="button" className="btn btn-sm" onClick={() => onNavigate("trades")}>
                  View trades
                </button>
              </article>
            );
          })}
        </div>
      )}

      {creating ? (
        <StrategyEditor
          strategy={null}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reload();
          }}
        />
      ) : null}

      {editing ? (
        <StrategyEditor
          strategy={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete “${pendingDelete.name}”?`}
          busy={busy}
          confirmLabel="Delete strategy"
          body={
            <>
              <p>
                The playbook is removed. Trades that were assigned to it keep their own record and
                their P&amp;L is unchanged — only the label goes away, so those trades will drop out of
                the per-strategy breakdown.
              </p>
              <p>
                If you have stopped using a strategy, <strong>archive</strong> it instead: it stays
                available for historical comparison without cluttering the list.
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

function RuleBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="stat-label">{label}</div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                             */
/* ------------------------------------------------------------------ */

function StrategyEditor({
  strategy,
  onClose,
  onSaved,
}: {
  strategy: TradingStrategy | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { store } = useApp();

  const [name, setName] = useState(strategy?.name ?? "");
  const [description, setDescription] = useState(strategy?.description ?? "");
  const [markets, setMarkets] = useState((strategy?.markets ?? []).join(", "));
  const [instruments, setInstruments] = useState((strategy?.instruments ?? []).join(", "));
  const [entryRules, setEntryRules] = useState(strategy?.entryRules ?? "");
  const [exitRules, setExitRules] = useState(strategy?.exitRules ?? "");
  const [riskRules, setRiskRules] = useState(strategy?.riskRules ?? "");
  const [session, setSession] = useState<TradingSession | "">(strategy?.session ?? "");
  const [checklist, setChecklist] = useState((strategy?.checklist ?? []).join("\n"));
  const [tags, setTags] = useState((strategy?.tags ?? []).join(", "));
  const [improvementNotes, setImprovementNotes] = useState(strategy?.improvementNotes ?? "");
  const [isArchived, setIsArchived] = useState(strategy?.isArchived ?? false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);

    if (!name.trim()) {
      setError("Give the strategy a name — it is the label trades are grouped by.");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      markets: splitList(markets),
      instruments: splitList(instruments).map((i) => i.toUpperCase()),
      entryRules: entryRules.trim() || undefined,
      exitRules: exitRules.trim() || undefined,
      riskRules: riskRules.trim() || undefined,
      session: session || undefined,
      checklist: checklist.split("\n").map((c) => c.trim()).filter(Boolean),
      tags: splitList(tags),
      improvementNotes: improvementNotes.trim() || undefined,
      isArchived,
    };

    setBusy(true);
    const result = await runSave(() =>
      strategy ? store.updateStrategy(strategy.id, payload) : store.createStrategy(payload)
    );
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    await onSaved();
  }

  return (
    <Modal
      title={strategy ? `Edit ${strategy.name}` : "New strategy"}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : strategy ? "Save changes" : "Create strategy"}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name" required htmlFor="s-name">
          <input id="s-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="London Breakout" />
        </Field>

        <Field label="Description" htmlFor="s-desc" hint="One or two sentences describing the edge you are trying to capture.">
          <textarea id="s-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="form-grid cols-3">
          <Field label="Markets" htmlFor="s-markets" hint="Comma separated: FX, Metals, Indices">
            <input id="s-markets" className="input" value={markets} onChange={(e) => setMarkets(e.target.value)} />
          </Field>
          <Field label="Instruments" htmlFor="s-instruments" hint="Comma separated: EURUSD, GBPUSD">
            <input id="s-instruments" className="input" value={instruments} onChange={(e) => setInstruments(e.target.value)} />
          </Field>
          <Field label="Session" htmlFor="s-session">
            <select id="s-session" className="select" value={session} onChange={(e) => setSession(e.target.value as TradingSession | "")}>
              <option value="">Not specified</option>
              {TRADING_SESSIONS.map((s) => (
                <option key={s} value={s}>{humanise(s)}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="form-grid cols-3">
          <Field label="Entry rules" htmlFor="s-entry">
            <textarea id="s-entry" className="textarea" value={entryRules} onChange={(e) => setEntryRules(e.target.value)} />
          </Field>
          <Field label="Exit rules" htmlFor="s-exit">
            <textarea id="s-exit" className="textarea" value={exitRules} onChange={(e) => setExitRules(e.target.value)} />
          </Field>
          <Field label="Risk rules" htmlFor="s-risk">
            <textarea id="s-risk" className="textarea" value={riskRules} onChange={(e) => setRiskRules(e.target.value)} />
          </Field>
        </div>

        <Field label="Pre-trade checklist" htmlFor="s-checklist" hint="One item per line. These appear on the strategy card.">
          <textarea id="s-checklist" className="textarea" value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={"Setup marked\nRisk sized\nStop placed"} />
        </Field>

        <div className="form-grid cols-2">
          <Field label="Tags" htmlFor="s-tags" hint="Comma separated">
            <input id="s-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field label="Improvement notes" htmlFor="s-improve" hint="What you have changed after reviewing its results.">
            <textarea id="s-improve" className="textarea" value={improvementNotes} onChange={(e) => setImprovementNotes(e.target.value)} />
          </Field>
        </div>

        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />
          <span>Archived — kept for historical comparison but hidden from the main list</span>
        </label>

        {error ? (
          <Banner tone="danger" title="Check this">
            {error}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}

function splitList(value: string): string[] {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}
