/**
 * Journal.
 *
 * Daily and weekly reviews. The point of a trading journal is not to record
 * what happened — the trade table already does that — but to record what you
 * were thinking and what you will do differently.
 *
 * Entries are therefore built around goals, mistakes, lessons and improvements,
 * with a discipline score the user sets themselves. The app never scores the
 * user's discipline for them; it has no way to know whether a rule was followed
 * and inventing a number would be worse than leaving it blank.
 */

import { useMemo, useState } from "react";
import type { JournalEntry } from "@tradevault/core";
import { useApp, useDerived, runSave } from "../lib/appContext";
import {
  Banner,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  Modal,
  icons,
} from "../components/ui";
import { JournalAttachmentGallery, JournalAttachmentUploader } from "../components/attachments";
import { fmtDate, fmtNumber, NA, todayKey } from "../components/format";

export function JournalPage() {
  const { store, reload, isSampleData } = useApp();
  const { journal, journalAttachmentsByEntry } = useDerived();

  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<"all" | "daily" | "weekly" | "monthly">("all");

  const sorted = useMemo(
    () =>
      [...journal]
        .filter((j) => periodFilter === "all" || j.period === periodFilter)
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate)),
    [journal, periodFilter]
  );

  // A simple run of consecutive days with an entry. Reported as a streak of
  // journaling, which is behavioural, never as a performance claim.
  const streak = useMemo(() => {
    const dates = new Set(journal.filter((j) => j.period === "daily").map((j) => j.entryDate));
    let count = 0;
    const cursor = new Date();
    for (let i = 0; i < 400; i += 1) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (dates.has(key)) {
        count += 1;
      } else if (i > 0) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [journal]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    const result = await runSave(() => store.deleteJournalEntry(pendingDelete.id));
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
          These example entries are not yours. Anything you write now is real and stays in this
          browser until the shared database is configured.
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="danger" title="That did not work">
          {error}
        </Banner>
      ) : null}

      <section className="card" style={{ padding: 14 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="field" style={{ flex: "0 1 170px" }}>
            <label className="label" htmlFor="journal-period">Show</label>
            <select
              id="journal-period"
              className="select"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}
            >
              <option value="all">All entries</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="spacer" />

          <div className="row" style={{ gap: 14 }}>
            <div>
              <div className="stat-label">Entries</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 650 }}>{journal.length}</div>
            </div>
            <div>
              <div className="stat-label">Daily streak</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 650 }}>
                {streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : NA}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon path={icons.add} />
              New entry
            </button>
          </div>
        </div>
      </section>

      {sorted.length === 0 ? (
        <EmptyState
          icon={icons.journal}
          title={journal.length === 0 ? "No journal entries yet" : "No entries match this filter"}
          action={
            journal.length === 0 ? (
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                Write your first entry
              </button>
            ) : undefined
          }
        >
          {journal.length === 0
            ? "A short note after each session — what you planned, what you did and what you will change — is the highest-return habit in this app."
            : "Try a different filter."}
        </EmptyState>
      ) : (
        <div className="stack">
          {sorted.map((entry) => (
            <article className="card" key={entry.id}>
              <div className="card-head">
                <div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="badge badge-accent">{entry.period}</span>
                    <strong>{entry.title || fmtDate(`${entry.entryDate}T00:00:00Z`)}</strong>
                  </div>
                  <div className="card-desc">
                    {fmtDate(`${entry.entryDate}T00:00:00Z`)}
                    {entry.disciplineScore !== null ? ` · discipline ${entry.disciplineScore}/10 (self-rated)` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(entry)} aria-label="Edit entry">
                    <Icon path={icons.edit} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDelete(entry)} aria-label="Delete entry">
                    <Icon path={icons.trash} />
                  </button>
                </div>
              </div>

              {entry.tags.length > 0 ? (
                <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
                  {entry.tags.map((tag) => (
                    <span className="chip" key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-2">
                {entry.goals ? <JournalField label="Goals" text={entry.goals} /> : null}
                {entry.marketObservations ? <JournalField label="Market observations" text={entry.marketObservations} /> : null}
                {entry.preMarketPlan ? <JournalField label="Plan" text={entry.preMarketPlan} /> : null}
                {entry.tradesSummary ? <JournalField label="What happened" text={entry.tradesSummary} /> : null}
                {entry.emotionalState ? <JournalField label="Emotional state" text={entry.emotionalState} /> : null}
                {entry.mistakes ? <JournalField label="Mistakes" text={entry.mistakes} tone="neg" /> : null}
                {entry.lessons ? <JournalField label="Lessons" text={entry.lessons} tone="pos" /> : null}
                {entry.improvements ? <JournalField label="What I will change" text={entry.improvements} /> : null}
              </div>

              {entry.notes ? (
                <div style={{ marginTop: 12 }}>
                  <JournalField label="Notes" text={entry.notes} />
                </div>
              ) : null}

              {(() => {
                const images = journalAttachmentsByEntry[entry.id] ?? [];
                if (images.length === 0) return null;
                return (
                  <div style={{ marginTop: 16 }}>
                    <div className="form-section-title" style={{ marginBottom: 8 }}>
                      Images ({images.length})
                    </div>
                    <JournalAttachmentGallery attachments={images} onDeleted={reload} />
                  </div>
                );
              })()}
            </article>
          ))}
        </div>
      )}

      {creating ? (
        <JournalEditor
          entry={null}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await reload();
          }}
        />
      ) : null}

      {editing ? (
        <JournalEditor
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete this journal entry?"
          busy={busy}
          confirmLabel="Delete entry"
          body={
            <p>
              The entry for {fmtDate(`${pendingDelete.entryDate}T00:00:00Z`)} will be removed. Your
              trades are not affected. This is a soft delete, so it can be recovered by support if you
              change your mind soon.
            </p>
          }
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

function JournalField({ label, text, tone }: { label: string; text: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div
        className="stat-label"
        style={tone ? { color: `var(--${tone === "pos" ? "profit" : "loss"}-text)` } : undefined}
      >
        {label}
      </div>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                             */
/* ------------------------------------------------------------------ */

function JournalEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { store, reload } = useApp();
  const { journalAttachmentsByEntry } = useDerived();

  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? todayKey());
  const [period, setPeriod] = useState<JournalEntry["period"]>(entry?.period ?? "daily");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [goals, setGoals] = useState(entry?.goals ?? "");
  const [marketObservations, setMarketObservations] = useState(entry?.marketObservations ?? "");
  const [preMarketPlan, setPreMarketPlan] = useState(entry?.preMarketPlan ?? "");
  const [tradesSummary, setTradesSummary] = useState(entry?.tradesSummary ?? "");
  const [emotionalState, setEmotionalState] = useState(entry?.emotionalState ?? "");
  const [disciplineScore, setDisciplineScore] = useState<string>(
    entry?.disciplineScore !== null && entry?.disciplineScore !== undefined ? String(entry.disciplineScore) : ""
  );
  const [mistakes, setMistakes] = useState(entry?.mistakes ?? "");
  const [lessons, setLessons] = useState(entry?.lessons ?? "");
  const [improvements, setImprovements] = useState(entry?.improvements ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [tags, setTags] = useState((entry?.tags ?? []).join(", "));

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      setError("Pick a valid date.");
      return;
    }

    let score: number | null = null;
    if (disciplineScore.trim() !== "") {
      const n = Number(disciplineScore);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        setError("The discipline score must be a whole number from 1 to 10, or left blank.");
        return;
      }
      score = n;
    }

    if (
      !title.trim() && !goals.trim() && !marketObservations.trim() && !preMarketPlan.trim() &&
      !tradesSummary.trim() && !mistakes.trim() && !lessons.trim() && !improvements.trim() && !notes.trim()
    ) {
      setError("An entry with no content is not worth saving. Write at least one line.");
      return;
    }

    const payload = {
      entryDate,
      period,
      title: title.trim() || undefined,
      goals: goals.trim() || undefined,
      marketObservations: marketObservations.trim() || undefined,
      preMarketPlan: preMarketPlan.trim() || undefined,
      tradesSummary: tradesSummary.trim() || undefined,
      emotionalState: emotionalState.trim() || undefined,
      disciplineScore: score,
      mistakes: mistakes.trim() || undefined,
      lessons: lessons.trim() || undefined,
      improvements: improvements.trim() || undefined,
      notes: notes.trim() || undefined,
      linkedTradeIds: entry?.linkedTradeIds ?? [],
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    };

    setBusy(true);
    const result = await runSave(() =>
      entry ? store.updateJournalEntry(entry.id, payload) : store.createJournalEntry(payload)
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
      title={entry ? "Edit journal entry" : "New journal entry"}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : entry ? "Save changes" : "Save entry"}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid cols-3">
          <Field label="Date" required htmlFor="j-date">
            <input id="j-date" className="input" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </Field>
          <Field label="Period" htmlFor="j-period">
            <select id="j-period" className="select" value={period} onChange={(e) => setPeriod(e.target.value as JournalEntry["period"])}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Discipline (1–10)" htmlFor="j-score" hint="Your own rating. The app will not guess it for you.">
            <input id="j-score" className="input" inputMode="numeric" value={disciplineScore} onChange={(e) => setDisciplineScore(e.target.value)} placeholder="Optional" />
          </Field>
        </div>

        <Field label="Title" htmlFor="j-title" hint="A one-line summary you will recognise in six months.">
          <input id="j-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Range break, clean execution" />
        </Field>

        <div className="form-grid cols-2">
          <Field label="Goals for the session" htmlFor="j-goals">
            <textarea id="j-goals" className="textarea" value={goals} onChange={(e) => setGoals(e.target.value)} />
          </Field>
          <Field label="Market observations" htmlFor="j-obs">
            <textarea id="j-obs" className="textarea" value={marketObservations} onChange={(e) => setMarketObservations(e.target.value)} />
          </Field>
        </div>

        <div className="form-grid cols-2">
          <Field label="Plan before the open" htmlFor="j-plan">
            <textarea id="j-plan" className="textarea" value={preMarketPlan} onChange={(e) => setPreMarketPlan(e.target.value)} />
          </Field>
          <Field label="What actually happened" htmlFor="j-summary">
            <textarea id="j-summary" className="textarea" value={tradesSummary} onChange={(e) => setTradesSummary(e.target.value)} />
          </Field>
        </div>

        <Field label="Emotional state" htmlFor="j-emotion" hint="Naming the feeling is often the most useful line in the entry.">
          <input id="j-emotion" className="input" value={emotionalState} onChange={(e) => setEmotionalState(e.target.value)} placeholder="Calm and patient" />
        </Field>

        <div className="form-grid cols-2">
          <Field label="Mistakes" htmlFor="j-mistakes">
            <textarea id="j-mistakes" className="textarea" value={mistakes} onChange={(e) => setMistakes(e.target.value)} />
          </Field>
          <Field label="Lessons" htmlFor="j-lessons">
            <textarea id="j-lessons" className="textarea" value={lessons} onChange={(e) => setLessons(e.target.value)} />
          </Field>
        </div>

        <Field label="What I will change next time" htmlFor="j-improvements">
          <textarea id="j-improvements" className="textarea" value={improvements} onChange={(e) => setImprovements(e.target.value)} />
        </Field>

        <Field label="Tags" htmlFor="j-tags" hint="Comma separated, e.g. london, discipline">
          <input id="j-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>

        <Field label="Notes" htmlFor="j-notes">
          <textarea id="j-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {entry ? (
          <div>
            <div className="form-section-title" style={{ marginBottom: 8 }}>
              Images ({(journalAttachmentsByEntry[entry.id] ?? []).length})
            </div>
            <JournalAttachmentGallery
              attachments={journalAttachmentsByEntry[entry.id] ?? []}
              onDeleted={reload}
            />
            <div style={{ marginTop: 12 }}>
              <JournalAttachmentUploader
                journalEntryId={entry.id}
                onUploaded={async () => {
                  await reload();
                }}
              />
            </div>
          </div>
        ) : (
          <div className="hint" style={{ marginTop: 4 }}>
            Save the entry first, then attach images from the edit view.
          </div>
        )}

        {error ? (
          <Banner tone="danger" title="Check this">
            {error}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}

export { fmtNumber };
