/**
 * Data and settings.
 *
 * The screen that owns getting data in and out, plus the honest description of
 * where the data currently lives. Two rules this screen enforces:
 *
 *   * It states plainly whether records are device-only or synced. A journal
 *     that silently discards a trade is worse than one that refuses to.
 *   * The local wipe says exactly what it does and does not do. It cannot prove
 *     what is on the server, so it never claims to have erased it.
 */

import { useMemo, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { capitalBase, type CurrencyCode } from "@tradevault/core";
import { useApp } from "../src/state/appContext";
import { useTheme } from "../src/state/themeContext";
import { useThemeToggle } from "../src/state/themeContext";
import { getMeta, wipeLocalData } from "../src/db/store";
import { config } from "../src/config";
import { Banner, Button, Card, Confirm, DetailRow, Hint, PageHeader, Screen, SectionTitle } from "../src/ui/components";
import { buildCsvExport } from "../src/export/csv";
import { NA, money, shortDate } from "../src/ui/format";
import { writeAndShare } from "../src/export/share";

export default function SettingsScreen() {
  const { snapshot, reload, isOffline } = useApp();
  const theme = useTheme();
  const toggleTheme = useThemeToggle();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const lastSyncedAt = useMemo(() => getMeta("last_synced_at"), [snapshot]);

  const currencies = useMemo(
    () => [...new Set(snapshot.accounts.map((a) => a.currency))],
    [snapshot.accounts]
  );

  async function exportCsv() {
    setError(null);
    setBusy(true);
    try {
      const csv = buildCsvExport(snapshot.trades, snapshot.exits, snapshot.accounts);
      const shared = await writeAndShare(`tradevault-trades-${dateStamp()}.csv`, csv, "text/csv");
      setNotice(
        shared
          ? `Exported ${snapshot.trades.length} trade${snapshot.trades.length === 1 ? "" : "s"}.`
          : "Export is not available on this device."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the export file.");
    }
    setBusy(false);
  }

  async function exportBackup() {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "TradeVault",
        note: "Full backup of the records on this device.",
        accounts: snapshot.accounts,
        trades: snapshot.trades,
        exits: snapshot.exits,
        strategies: snapshot.strategies,
        journal: snapshot.journal,
      };
      const shared = await writeAndShare(
        `tradevault-backup-${dateStamp()}.json`,
        JSON.stringify(payload, null, 2),
        "application/json"
      );
      setNotice(shared ? "Backup exported." : "Export is not available on this device.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the backup file.");
    }
    setBusy(false);
  }

  function wipe() {
    try {
      wipeLocalData();
      setConfirmWipe(false);
      setNotice("All records on this device were removed.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear the local records.");
    }
  }

  return (
    <Screen>
      <PageHeader
        back
        eyebrow="Data"
        title="Data & settings"
        subtitle="Accounts, sync and the records stored on this device."
      />
      {error ? (
        <Banner tone="danger" title="That did not work">
          {error}
        </Banner>
      ) : null}
      {notice ? (
        <Banner tone="accent" title="Done">
          {notice}
        </Banner>
      ) : null}

      {isOffline ? (
        <Banner tone="warn" title="Offline mode — this device only">
          Supabase is not configured, so this journal lives on this device. Import, export and
          accounts all work, but nothing syncs to another device, and clearing the app's data removes
          it. To connect the shared database, set EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY (see apps/mobile/.env.example).
        </Banner>
      ) : (
        <Banner tone="info" title="Connected to the shared database">
          Signed in, and changes sync through Supabase. The same trades appear in the TradeVault web
          app.
        </Banner>
      )}

      {/* Sections --------------------------------------------------- */}

      <SectionTitle>Sections</SectionTitle>
      <Card>
        <NavRow label="Strategies" detail={`${snapshot.strategies.length} playbooks`} onPress={() => router.push("/strategies")} />
        <NavRow label="Risk & Plan" detail="Position sizing and limits" onPress={() => router.push("/risk")} />
      </Card>

      {/* Accounts --------------------------------------------------- */}

      <SectionTitle>Accounts</SectionTitle>
      <Card>
        {currencies.length > 1 ? (
          <Banner tone="warn" title="More than one currency in use">
            You have accounts in {currencies.join(", ")}. Pages report in one currency and say which
            account, rather than converting silently.
          </Banner>
        ) : null}

        {snapshot.accounts.length === 0 ? (
          <Hint>
            No accounts yet. An account's name, currency and starting balance are what every return
            figure is measured against.
          </Hint>
        ) : (
          snapshot.accounts.map((account) => (
            <View key={account.id} style={{ gap: 2, paddingVertical: 4 }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                {account.name} · {account.currency}
              </Text>
              <Hint>
                {account.broker ? `${account.broker} · ` : ""}
                Capital base {money(capitalBase(account), account.currency as CurrencyCode)}
              </Hint>
            </View>
          ))
        )}

        <Hint>
          Accounts are created and edited in the web app today. The mobile form for this is the next
          piece of work, and this screen will not pretend it exists.
        </Hint>
      </Card>

      {/* Export ----------------------------------------------------- */}

      <SectionTitle>Export</SectionTitle>
      <Card>
        <Hint>
          {snapshot.trades.length} trade{snapshot.trades.length === 1 ? "" : "s"},{" "}
          {snapshot.journal.length} journal entr{snapshot.journal.length === 1 ? "y" : "ies"} and{" "}
          {snapshot.strategies.length} strateg{snapshot.strategies.length === 1 ? "y" : "ies"} on this
          device. Exports are generated on the device and are never uploaded anywhere.
        </Hint>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Button
            label="Trades CSV"
            onPress={exportCsv}
            disabled={snapshot.trades.length === 0 || busy}
          />
          <Button label="Full backup (JSON)" onPress={exportBackup} disabled={busy} />
        </View>
      </Card>

      {/* Session ---------------------------------------------------- */}

      <SectionTitle>Session</SectionTitle>
      <Card>
        <DetailRow
          label="Data source"
          value={isOffline ? "This device only (Supabase not configured)" : "Shared cloud database (Supabase)"}
        />
        <DetailRow label="Syncs across devices" value={isOffline ? "No" : "Yes"} />
        <DetailRow label="Last synced" value={lastSyncedAt ? shortDate(lastSyncedAt) : NA} />
        <DetailRow label="Accounts" value={String(snapshot.accounts.length)} />
        <DetailRow label="Trades" value={String(snapshot.trades.length)} />
        <DetailRow label="Exits recorded" value={String(snapshot.exits.length)} />
        <DetailRow label="Strategies" value={String(snapshot.strategies.length)} />
        <DetailRow label="Journal entries" value={String(snapshot.journal.length)} />
        <DetailRow
          label="Supabase project"
          value={config.supabaseUrl ?? "Not configured"}
        />
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Button label={`Switch to ${theme.name === "dark" ? "light" : "dark"} theme`} onPress={toggleTheme} />
        <Hint>Dark is the default. The choice is remembered on this device.</Hint>
      </Card>

      {/* Danger zone ------------------------------------------------ */}

      <SectionTitle>Danger zone</SectionTitle>
      <Card style={{ borderColor: theme.loss }}>
        <Text style={{ color: theme.loss, fontSize: 15, fontWeight: "700" }}>Clear local records</Text>
        <Hint>
          Removes every account, trade, exit, strategy and journal entry stored on this device, and
          empties the sync queue. It cannot reach the server: anything already synced stays there.
          Export a backup first if there is any chance you will want the records back.
        </Hint>
        {confirmWipe ? (
          <Confirm
            title="Clear everything on this device?"
            body="This removes the local copy and the pending sync queue. There is no undo in the app. Records already on the server are not affected."
            confirmLabel="Yes, clear this device"
            onConfirm={wipe}
            onCancel={() => setConfirmWipe(false)}
          />
        ) : (
          <Button label="Clear local records" variant="danger" onPress={() => setConfirmWipe(true)} />
        )}
      </Card>

      <Hint>
        TradeVault is a journal and analysis tool. It does not place trades, hold funds, or ask for
        broker credentials.
      </Hint>
    </Screen>
  );
}

function NavRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{label}</Text>
        <Hint>{detail}</Hint>
      </View>
      <Text style={{ color: theme.textFaint, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export { Sharing };
