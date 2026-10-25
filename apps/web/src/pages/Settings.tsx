/**
 * Data and settings.
 *
 * The page that owns the user's ability to get their data in and out:
 *
 *   * **Accounts** — every trade belongs to one, and its currency is the unit
 *     every return figure is measured in.
 *   * **Import** — a CSV from a broker is parsed, mapped and previewed before a
 *     single row is written. Duplicate rows are flagged, not silently skipped.
 *   * **Export** — the whole journal as a CSV, generated in the browser.
 *   * **Erase** — behind an explicit confirmation, because there is no undo.
 *
 * Nothing here fabricates data. An import that cannot be parsed reports the
 * rows it rejected rather than importing partial rows without saying so.
 */

import { useMemo, useRef, useState } from "react";
import {
  SUPPORTED_CURRENCIES,
  buildPreview,
  candidatesToTrades,
  detectAdapter,
  generateId,
  genericAdapter,
  parseCsv,
  suggestMapping,
  type AssetClass,
  type ColumnMapping,
  type CurrencyCode,
  type ImportPreview,
  type ParsedCsv,
  type TradingAccount,
} from "@tradevault/core";
import { useApp, useDerived, runSave } from "../lib/appContext";
import { capitalBase } from "../lib/store";
import {
  Banner,
  ConfirmDialog,
  Field,
  Icon,
  KeyValue,
  Modal,
  icons,
} from "../components/ui";
import { fmtDate, fmtMoney, fmtNumber, humanise, NA } from "../components/format";
import {
  buildTradesCsv,
  downloadText,
  exportFileName,
  readFileAsText,
} from "../lib/exportCsv";

export function SettingsPage() {
  const { store, reload, isOffline, isSampleData, user, snapshot } = useApp();
  const { accounts, trades, exits, strategies, journal } = useDerived();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingAccount, setEditingAccount] = useState<TradingAccount | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseBusy, setEraseBusy] = useState(false);

  const currencies = useMemo(
    () => [...new Set(accounts.map((a) => a.currency))],
    [accounts]
  );

  function exportTrades() {
    setError(null);
    try {
      const csv = buildTradesCsv(trades, exits, accounts);
      downloadText(exportFileName("trades"), csv);
      setNotice(
        `Exported ${trades.length} trade${trades.length === 1 ? "" : "s"} to a CSV file. Check your downloads folder.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the export file.");
    }
  }

  function exportJson() {
    setError(null);
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "TradeVault",
        note: "This is a full backup of the records loaded in this session.",
        accounts: snapshot.accounts,
        trades: snapshot.trades,
        exits: snapshot.exits,
        strategies: snapshot.strategies,
        journal: snapshot.journal,
      };
      downloadText(
        exportFileName("backup").replace(/\.csv$/, ".json"),
        JSON.stringify(payload, null, 2),
        "application/json"
      );
      setNotice("Full backup downloaded as JSON. Keep it somewhere you will find it again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the backup file.");
    }
  }

  async function confirmErase() {
    setEraseBusy(true);
    setError(null);
    const result = await runSave(() => store.eraseAllData());
    setEraseBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEraseOpen(false);
    setNotice("All records for this account were removed.");
    await reload();
  }

  return (
    <div className="stack">
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
        <Banner tone="warn" title="Offline mode">
          Supabase is not configured, so this journal lives in this browser only. Import, export and
          accounts all work — but nothing syncs to another device, and clearing browser storage
          removes it. To connect the shared database, set{" "}
          <code className="mono">VITE_SUPABASE_URL</code> and{" "}
          <code className="mono">VITE_SUPABASE_ANON_KEY</code> and rebuild (see{" "}
          <code className="mono">apps/web/.env.example</code>).
        </Banner>
      ) : null}

      {isSampleData ? (
        <Banner tone="info" title="Currently showing sample data">
          These example rows are not yours. Add your own account below to start a real journal.
        </Banner>
      ) : null}

      {/* Accounts --------------------------------------------------- */}

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Trading accounts</div>
            <div className="card-desc">
              Each account has its own currency. Returns are always measured against the account a
              trade belongs to, and balances in different currencies are never added together.
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCreatingAccount(true)}>
            <Icon path={icons.add} />
            Add account
          </button>
        </div>

        {currencies.length > 1 ? (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="warn" title="More than one currency in use">
              You have accounts in {currencies.join(", ")}. Pages that summarise your performance will
              report in one currency and say which account that is, rather than converting silently.
            </Banner>
          </div>
        ) : null}

        {accounts.length === 0 ? (
          <div className="hint">
            No accounts yet. Add one — its name, currency and starting balance are what every return
            figure is measured against.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Broker</th>
                  <th className="num">Starting balance</th>
                  <th className="num">Adjustments</th>
                  <th className="num">Capital base</th>
                  <th className="num">Trades</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const count = trades.filter((t) => t.accountId === a.id).length;
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        <div className="hint">
                          {a.currency}
                          {a.isArchived ? " · archived" : ""}
                        </div>
                      </td>
                      <td>{a.broker || <span className="na">{NA}</span>}</td>
                      <td className="num">{fmtMoney(Number(a.startingBalance), a.currency)}</td>
                      <td className="num">
                        {Number(a.balanceAdjustments) === 0 ? (
                          <span className="na">—</span>
                        ) : (
                          fmtMoney(Number(a.balanceAdjustments), a.currency, { signed: true })
                        )}
                      </td>
                      <td className="num">{fmtMoney(capitalBase(a), a.currency)}</td>
                      <td className="num">{count}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingAccount(a)}
                          aria-label={`Edit ${a.name}`}
                        >
                          <Icon path={icons.edit} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Import / export ------------------------------------------- */}

      <section className="grid grid-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Import from CSV</div>
          <div className="card-desc" style={{ marginBottom: 14 }}>
            Load a broker export. Columns are matched automatically and you see a preview, including
            any rows that look like duplicates, before anything is saved.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setImportOpen(true)}
            disabled={accounts.length === 0}
          >
            <Icon path={icons.upload} />
            Import a CSV
          </button>
          {accounts.length === 0 ? (
            <div className="hint" style={{ marginTop: 10 }}>
              Add an account first — imported trades have to belong to one.
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>Export your data</div>
          <div className="card-desc" style={{ marginBottom: 14 }}>
            {trades.length} trade{trades.length === 1 ? "" : "s"}, {journal.length} journal entr
            {journal.length === 1 ? "y" : "ies"} and {strategies.length} strateg
            {strategies.length === 1 ? "y" : "ies"} loaded. The export is generated in your browser
            and is never uploaded anywhere.
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={exportTrades} disabled={trades.length === 0}>
              <Icon path={icons.download} />
              Trades CSV
            </button>
            <button type="button" className="btn" onClick={exportJson}>
              <Icon path={icons.download} />
              Full backup (JSON)
            </button>
          </div>
        </div>
      </section>

      {/* Session and store ----------------------------------------- */}

      <section className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Session</div>
        <KeyValue
          rows={[
            {
              key: "Data source",
              value: isOffline ? "Local to this browser (Supabase not configured)" : "Shared cloud database (Supabase)",
            },
            {
              key: "Syncs across devices",
              value: store.capabilities.syncsAcrossDevices ? "Yes" : "No",
            },
            { key: "Signed in as", value: user?.email ?? (isOffline ? "Not signed in (offline mode)" : NA) },
            { key: "Accounts", value: fmtNumber(accounts.length, { decimals: 0 }) },
            { key: "Trades", value: fmtNumber(trades.length, { decimals: 0 }) },
            { key: "Exits recorded", value: fmtNumber(exits.length, { decimals: 0 }) },
            { key: "Strategies", value: fmtNumber(strategies.length, { decimals: 0 }) },
            { key: "Journal entries", value: fmtNumber(journal.length, { decimals: 0 }) },
          ]}
        />
      </section>

      {/* Danger zone ----------------------------------------------- */}

      <section className="card" style={{ borderColor: "var(--loss)" }}>
        <div className="card-title" style={{ marginBottom: 4, color: "var(--loss-text)" }}>
          Erase all data
        </div>
        <div className="card-desc" style={{ marginBottom: 14 }}>
          Removes every account, trade, exit, strategy and journal entry you own. This cannot be
          undone from inside the app, so export a backup first if there is any chance you will want
          the records back.
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setEraseOpen(true)}
          disabled={
            accounts.length === 0 && trades.length === 0 && journal.length === 0 && strategies.length === 0
          }
        >
          <Icon path={icons.trash} />
          Erase everything
        </button>
      </section>

      {creatingAccount ? (
        <AccountEditor
          account={null}
          onClose={() => setCreatingAccount(false)}
          onSaved={async () => {
            setCreatingAccount(false);
            setNotice("Account added.");
            await reload();
          }}
        />
      ) : null}

      {editingAccount ? (
        <AccountEditor
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={async () => {
            setEditingAccount(null);
            setNotice("Account updated.");
            await reload();
          }}
        />
      ) : null}

      {importOpen ? (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={async (summary) => {
            setImportOpen(false);
            setNotice(summary);
            await reload();
          }}
        />
      ) : null}

      {eraseOpen ? (
        <ConfirmDialog
          title="Erase all of your data?"
          busy={eraseBusy}
          confirmLabel="Yes, erase everything"
          body={
            <>
              <p>
                Every account, trade, exit, strategy and journal entry will be deleted. On the shared
                database this removes them from every device you use.
              </p>
              <p>
                <strong>There is no undo in the app.</strong> If you have not exported a backup yet,
                cancel and use <em>Trades CSV</em> or <em>Full backup (JSON)</em> above first.
              </p>
            </>
          }
          onConfirm={() => void confirmErase()}
          onCancel={() => setEraseOpen(false)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account editor                                                     */
/* ------------------------------------------------------------------ */

function AccountEditor({
  account,
  onClose,
  onSaved,
}: {
  account: TradingAccount | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { store } = useApp();

  const [name, setName] = useState(account?.name ?? "");
  const [broker, setBroker] = useState(account?.broker ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? "USD");
  const [startingBalance, setStartingBalance] = useState(account?.startingBalance ?? "");
  const [balanceAdjustments, setBalanceAdjustments] = useState(account?.balanceAdjustments ?? "0");
  const [isArchived, setIsArchived] = useState(account?.isArchived ?? false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);

    if (!name.trim()) {
      setError("Give the account a name — it labels every trade in your lists.");
      return;
    }
    const start = Number(startingBalance);
    if (!startingBalance.trim() || !Number.isFinite(start)) {
      setError("Enter a starting balance. Use 0 if you would rather not track it.");
      return;
    }
    const adjust = balanceAdjustments.trim() === "" ? 0 : Number(balanceAdjustments);
    if (!Number.isFinite(adjust)) {
      setError("Adjustments must be a number. Deposits are positive, withdrawals negative.");
      return;
    }

    const payload = {
      name: name.trim(),
      broker: broker.trim() || undefined,
      currency,
      startingBalance: String(start),
      balanceAdjustments: String(adjust),
      isArchived,
    };

    setBusy(true);
    const result = await runSave(() =>
      account ? store.updateAccount(account.id, payload) : store.createAccount(payload)
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
      title={account ? `Edit ${account.name}` : "Add a trading account"}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : account ? "Save changes" : "Add account"}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="form-grid cols-2">
          <Field label="Account name" required htmlFor="acc-name" hint="e.g. FTMO Challenge, Live — Pepperstone">
            <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Broker" htmlFor="acc-broker" hint="Optional">
            <input id="acc-broker" className="input" value={broker} onChange={(e) => setBroker(e.target.value)} />
          </Field>
        </div>

        <div className="form-grid cols-3">
          <Field label="Currency" required htmlFor="acc-currency" hint="Locked once trades exist, to avoid mixing currencies">
            <select
              id="acc-currency"
              className="select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Starting balance" required htmlFor="acc-start" hint="The account's value before your first recorded trade">
            <input
              id="acc-start"
              className="input"
              inputMode="decimal"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
              placeholder="10000"
            />
          </Field>
          <Field label="Deposits / withdrawals" htmlFor="acc-adjust" hint="Net cash added or removed. Deposits positive.">
            <input
              id="acc-adjust"
              className="input"
              inputMode="decimal"
              value={balanceAdjustments}
              onChange={(e) => setBalanceAdjustments(e.target.value)}
            />
          </Field>
        </div>

        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />
          <span>Archived — kept for the record but hidden from the pickers</span>
        </label>

        <Banner tone="info">
          Deposits and withdrawals change the capital base and therefore the return figure, but they
          never affect win rate, profit factor or expectancy — paying money in is not a winning trade.
        </Banner>

        {error ? (
          <Banner tone="danger" title="Check this">
            {error}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* CSV import                                                         */
/* ------------------------------------------------------------------ */

const IMPORTABLE_FIELDS = [
  "symbol",
  "direction",
  "assetClass",
  "entryPrice",
  "entryAt",
  "exitPrice",
  "exitAt",
  "quantity",
  "contractMultiplier",
  "stopLoss",
  "takeProfit",
  "entryFees",
  "manualNetPnl",
] as const;

function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (summary: string) => Promise<void>;
}) {
  const { store } = useApp();
  const { accounts, trades } = useDerived();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fingerprints already in the journal, so the preview can flag duplicates.
  // A stored fingerprint is used when present; otherwise one is derived from
  // the same fields the importer uses, so a trade added by hand is still
  // recognised as a duplicate of the same row arriving from a CSV.
  const existingFingerprints = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.importFingerprint) {
        set.add(t.importFingerprint);
        continue;
      }
      set.add(
        [
          t.symbol.toUpperCase(),
          t.direction,
          t.entryPrice,
          t.entryAt,
          t.quantity,
        ].join("|")
      );
    }
    return set;
  }, [trades]);

  const preview: ImportPreview | null = useMemo(() => {
    if (!parsed) return null;
    return buildPreview(parsed, mapping, existingFingerprints);
  }, [parsed, mapping, existingFingerprints]);

  async function chooseFile(file: File) {
    setError(null);
    try {
      const text = await readFileAsText(file);
      const result = parseCsv(text);
      if (result.headers.length === 0) {
        setError("That file does not look like a CSV — no header row was found.");
        return;
      }
      const adapter = detectAdapter(result.headers, [genericAdapter]);
      setFileName(file.name);
      setParsed(result);
      setMapping(suggestMapping(result.headers, adapter));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  async function runImport() {
    if (!preview || !accountId) return;
    setError(null);

    const rows = candidatesToTrades(preview, accountId);
    const toImport = skipDuplicates
      ? rows.filter((r) => {
          const fp = (r as { importFingerprint?: string | null }).importFingerprint;
          return fp ? !existingFingerprints.has(fp) : true;
        })
      : rows;

    if (toImport.length === 0) {
      setError("There is nothing to import — every valid row is already in your journal.");
      return;
    }

    setBusy(true);
    let imported = 0;
    const failures: string[] = [];

    for (const row of toImport) {
      const r = row as Record<string, unknown>;
      const result = await runSave(() =>
        store.createTrade({
          id: generateId(),
          accountId: String(r.accountId),
          symbol: String(r.symbol ?? ""),
          assetClass: (r.assetClass as AssetClass) ?? "other",
          direction: (r.direction as "long" | "short") ?? "long",
          status: (r.status as "open" | "closed") ?? "closed",
          orderType: "market",
          entryAt: String(r.entryAt ?? new Date().toISOString()),
          entryPrice: String(r.entryPrice ?? ""),
          exitAt: r.exitAt ? String(r.exitAt) : null,
          exitPrice: r.exitPrice ? String(r.exitPrice) : null,
          quantity: String(r.quantity ?? ""),
          contractMultiplier: String(r.contractMultiplier ?? "1"),
          stopLoss: r.stopLoss ? String(r.stopLoss) : null,
          takeProfit: r.takeProfit ? String(r.takeProfit) : null,
          entryFees: String(r.entryFees ?? "0"),
          exitFees: "0",
          fundingFees: "0",
          slippage: "0",
          session: "outside",
          manualNetPnl: r.manualNetPnl ? String(r.manualNetPnl) : null,
          importFingerprint: (r.importFingerprint as string | null) ?? null,
        })
      );

      if (result.ok) {
        imported += 1;
      } else {
        failures.push(`${String(r.symbol ?? "row")}: ${result.error}`);
      }
    }

    setBusy(false);

    await onImported(
      `Imported ${imported} trade${imported === 1 ? "" : "s"}` +
        (failures.length > 0
          ? `, ${failures.length} failed. First error: ${failures[0]}`
          : "") +
        (preview.errorRows > 0
          ? ` ${preview.errorRows} row${preview.errorRows === 1 ? " was" : "s were"} rejected for missing or invalid values.`
          : "") +
        (skipDuplicates && preview.duplicateRows > 0
          ? ` ${preview.duplicateRows} duplicate row${preview.duplicateRows === 1 ? " was" : "s were"} skipped.`
          : "")
    );
  }

  return (
    <Modal
      title="Import trades from a CSV"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runImport()}
            disabled={busy || !preview || preview.validRows === 0 || !accountId}
          >
            {busy ? "Importing…" : `Import ${preview ? preview.validRows : 0} rows`}
          </button>
        </>
      }
    >
      <div className="stack">
        <Banner tone="info" title="Nothing is saved until you press Import">
          TradeVault reads the file in your browser, suggests a column mapping and shows what it
          found. Rows with missing or invalid values are listed and are never imported.
        </Banner>

        <Field label="Which account do these trades belong to?" required htmlFor="imp-account">
          <select id="imp-account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>

        <div className="field">
          <label className="label" htmlFor="imp-file">CSV file</label>
          <input
            id="imp-file"
            ref={fileInput}
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void chooseFile(file);
            }}
          />
          {fileName ? <div className="hint">Reading {fileName}</div> : null}
        </div>

        {error ? (
          <Banner tone="danger" title="Import problem">
            {error}
          </Banner>
        ) : null}

        {preview ? (
          <>
            <div className="grid grid-3">
              <div className="stat" style={{ padding: "11px 13px" }}>
                <div className="stat-label">Rows found</div>
                <div className="stat-value sm">{preview.totalRows}</div>
              </div>
              <div className="stat" style={{ padding: "11px 13px" }}>
                <div className="stat-label">Valid</div>
                <div className="stat-value sm pos">{preview.validRows}</div>
              </div>
              <div className="stat" style={{ padding: "11px 13px" }}>
                <div className="stat-label">Rejected</div>
                <div className={`stat-value sm ${preview.errorRows > 0 ? "neg" : ""}`}>
                  {preview.errorRows}
                </div>
              </div>
            </div>

            {preview.duplicateRows > 0 ? (
              <Banner tone="warn" title={`${preview.duplicateRows} possible duplicate${preview.duplicateRows === 1 ? "" : "s"}`}>
                These rows match the symbol, direction, entry price, entry time and quantity of
                another row. They are flagged, not dropped — decide whether to import them.
                <label className="row" style={{ gap: 8, marginTop: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                  <span>Skip rows flagged as duplicates</span>
                </label>
              </Banner>
            ) : null}

            <div>
              <div className="form-section-title">Column mapping</div>
              <div className="hint" style={{ marginBottom: 10 }}>
                Matched automatically from the header row. Change any column that was mapped to the
                wrong field.
              </div>
              <div className="table-wrap">
                <table className="data" style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th>Your column</th>
                      <th>Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.headers.map((header) => (
                      <tr key={header}>
                        <td>{header}</td>
                        <td>
                          <select
                            className="select"
                            value={mapping[header] ?? ""}
                            onChange={(e) =>
                              setMapping((m) => ({ ...m, [header]: e.target.value || null }))
                            }
                            aria-label={`Field for column ${header}`}
                          >
                            <option value="">Ignore this column</option>
                            {IMPORTABLE_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {humanise(f)}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {preview.errorRows > 0 ? (
              <div>
                <div className="form-section-title">Rows that will be rejected</div>
                <div className="table-wrap">
                  <table className="data" style={{ minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.candidates
                        .filter((c) => c.errors.length > 0)
                        .slice(0, 12)
                        .map((c) => (
                          <tr key={c.rowNumber}>
                            <td>{c.rowNumber}</td>
                            <td>{c.errors.join(" ")}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {preview.errorRows > 12 ? (
                  <div className="hint" style={{ marginTop: 8 }}>
                    Showing the first 12 of {preview.errorRows} rejected rows.
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export { fmtDate };
