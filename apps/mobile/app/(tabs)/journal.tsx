/**
 * Journal.
 *
 * The written half of the app. A journal entry is where a result becomes a
 * lesson: what you planned, what happened, and what you will change. These are
 * the user's own words, stored verbatim and never summarised or scored on their
 * behalf.
 *
 * The discipline score is labelled as self-rated everywhere it appears, because
 * it is a self-assessment and nothing in this app can verify it.
 */

import { useState } from "react";
import { Modal, Text, TextInput, View } from "react-native";
import {
  generateId,
  nowIso,
  type JournalEntry,
  type JournalPeriod,
} from "@tradevault/core";
import { useApp } from "../../src/state/appContext";
import { useTheme } from "../../src/state/themeContext";
import { insertJournal } from "../../src/db/store";
import { Banner, Button, Card, Chip, EmptyState, Hint, PageHeader, Screen, SectionTitle, Segmented } from "../../src/ui/components";
import { NA, shortDate } from "../../src/ui/format";

export default function JournalScreen() {
  const { snapshot, reload } = useApp();
  const [composing, setComposing] = useState(false);

  return (
    <Screen>
      <PageHeader
        eyebrow="Journal"
        title="Journal"
        subtitle="What you wrote down, and when. Entries are the part a P&L number cannot tell you."
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <SectionTitle>Entries ({snapshot.journal.length})</SectionTitle>
        <Button label="New entry" variant="primary" onPress={() => setComposing(true)} />
      </View>

      {snapshot.journal.length === 0 ? (
        <EmptyState title="Nothing written down yet">
          A journal entry is where a result turns into a lesson. Write one after a session — what you
          planned, what actually happened, and what you will change.
        </EmptyState>
      ) : (
        snapshot.journal.map((entry) => <EntryCard key={entry.id} entry={entry} />)
      )}

      <Hint>
        Entries are stored word for word. TradeVault does not rewrite, summarise or score them — the
        discipline figure is your own rating of yourself.
      </Hint>

      {composing ? (
        <Composer
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const theme = useTheme();

  const sections: Array<[string, string | undefined]> = [
    ["Goals", entry.goals],
    ["Market observations", entry.marketObservations],
    ["Plan", entry.preMarketPlan],
    ["What happened", entry.tradesSummary],
    ["Emotional state", entry.emotionalState],
    ["Mistakes", entry.mistakes],
    ["Lessons", entry.lessons],
    ["What I will change", entry.improvements],
  ];

  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700", flexShrink: 1 }}>
          {entry.title ?? "Untitled entry"}
        </Text>
        <Chip label={entry.period} />
      </View>

      <Hint>
        {shortDate(entry.entryDate)} · discipline{" "}
        {entry.disciplineScore === null ? NA : `${entry.disciplineScore}/10`} (self-rated)
      </Hint>

      {sections
        .filter(([, value]) => value !== undefined && value.trim() !== "")
        .map(([label, value]) => (
          <View key={label} style={{ gap: 2 }}>
            <Text style={{ color: theme.textFaint, fontSize: 10, letterSpacing: 0.8 }}>
              {label.toUpperCase()}
            </Text>
            <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{value}</Text>
          </View>
        ))}

      {entry.tags.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {entry.tags.map((tag) => (
            <Chip key={tag} label={tag} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const PERIODS: JournalPeriod[] = ["daily", "weekly", "monthly"];

function Composer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [period, setPeriod] = useState<JournalPeriod>("daily");
  const [title, setTitle] = useState("");
  const [goals, setGoals] = useState("");
  const [observations, setObservations] = useState("");
  const [plan, setPlan] = useState("");
  const [happened, setHappened] = useState("");
  const [emotion, setEmotion] = useState("");
  const [mistakes, setMistakes] = useState("");
  const [lessons, setLessons] = useState("");
  const [improvements, setImprovements] = useState("");
  const [discipline, setDiscipline] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function save() {
    setError(null);

    const disciplineNumber = discipline.trim() === "" ? null : Number(discipline);
    if (disciplineNumber !== null && (!Number.isInteger(disciplineNumber) || disciplineNumber < 0 || disciplineNumber > 10)) {
      setError("The discipline rating is your score from 0 to 10, or leave it blank.");
      return;
    }

    if (title.trim() === "" && happened.trim() === "" && lessons.trim() === "") {
      setError("Write at least a title, what happened, or a lesson — otherwise there is nothing to keep.");
      return;
    }

    const now = nowIso();
    const entry: JournalEntry = {
      id: generateId(),
      userId: null,
      entryDate: now.slice(0, 10),
      period,
      title: title.trim() || undefined,
      goals: goals.trim() || undefined,
      marketObservations: observations.trim() || undefined,
      preMarketPlan: plan.trim() || undefined,
      tradesSummary: happened.trim() || undefined,
      emotionalState: emotion.trim() || undefined,
      disciplineScore: disciplineNumber,
      mistakes: mistakes.trim() || undefined,
      lessons: lessons.trim() || undefined,
      improvements: improvements.trim() || undefined,
      linkedTradeIds: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: null,
    };

    setBusy(true);
    try {
      insertJournal(entry);
      setBusy(false);
      onSaved();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not save this entry.");
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <Screen>
        <PageHeader
          eyebrow="Journal"
          title="New entry"
          subtitle="A record of the session, written while it is still fresh."
        />

        <Segmented
          value={period}
          onChange={setPeriod}
          options={PERIODS.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
        />

        <Field label="Title" value={title} onChange={setTitle} placeholder="London session review" />
        <Field label="Goals" value={goals} onChange={setGoals} multiline placeholder="What were you trying to do today?" />
        <Field label="Market observations" value={observations} onChange={setObservations} multiline />
        <Field label="Plan" value={plan} onChange={setPlan} multiline />
        <Field label="What happened" value={happened} onChange={setHappened} multiline />
        <Field label="Emotional state" value={emotion} onChange={setEmotion} placeholder="Calm, impatient, frustrated…" />
        <Field label="Mistakes" value={mistakes} onChange={setMistakes} multiline />
        <Field label="Lessons" value={lessons} onChange={setLessons} multiline />
        <Field label="What I will change" value={improvements} onChange={setImprovements} multiline />
        <Field
          label="Discipline rating (0–10, your own)"
          value={discipline}
          onChange={setDiscipline}
          placeholder="Optional"
        />

        {error ? (
          <Banner tone="danger" title="Check this">
            {error}
          </Banner>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Cancel" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label="Save entry" variant="primary" onPress={save} busy={busy} style={{ flex: 1 }} />
        </View>
      </Screen>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.borderStrong,
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          color: theme.text,
          fontSize: 14,
          minHeight: multiline ? 74 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
