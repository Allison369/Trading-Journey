# TradeVault — Privacy Policy (draft)

**Status: draft.** This document has not been reviewed by a lawyer. Do not rely
on it for a public launch without professional review. It describes what the
software in this repository actually does, which is the part that is verifiable.

Last updated: [DATE — set this when you publish]

---

## The short version

TradeVault stores the trading records you enter. If you connect a Supabase
project, those records live in **your** Supabase database, under **your**
credentials, isolated from every other user by Row Level Security. If you do not
connect one, they live only on your device or in your browser.

We do not sell your data. We do not run analytics on it. We do not ask for your
broker credentials, because TradeVault cannot place trades.

---

## What is stored

Only what you enter or import:

| Data | Why |
| --- | --- |
| Account names, brokers, currencies, balances | Every return figure is measured against an account |
| Trades: instrument, direction, prices, size, times, fees | The record itself |
| Exits and partial closes | A trade's result comes from its exits |
| Stop loss, take profit, risk settings | R multiples and position sizing |
| Strategy definitions and checklists | Comparing a plan against its results |
| Journal entries, including any emotions or mistakes you note | The written half of the app |
| Attachments you choose to upload (web) | Charts and screenshots, if you add them |

And, if you sign in: your email address and authentication identifiers, handled
by Supabase Auth.

**We do not collect** your broker API keys, bank details, card numbers, or
government identifiers. There is no code path in this repository that asks for
them.

---

## Where it lives

**With Supabase configured (the intended setup):**

- Records are stored in the PostgreSQL database of the Supabase project **you**
  created. You are the data controller for that database.
- Access is governed by Row Level Security. Every table has policies restricting
  reads and writes to the owning user. The policies are in
  `supabase/migrations/0002_rls_policies.sql` and can be audited.
- The client uses the **anon** key, which is subject to those policies. The
  service-role key, which bypasses them, is never present in the app.
- Attachments are stored in a **private** storage bucket. Files are not public.
- Transport to Supabase is over HTTPS.

**Without Supabase configured (offline / evaluation mode):**

- On the web app: records are stored in your browser's local storage on that one
  device. Clearing browser data removes them permanently. Nothing is uploaded.
- On mobile: records are stored in the app's SQLite database on that device.
  Uninstalling the app, or using "Clear local records" in Data & Settings,
  removes them.
- In this mode the app shows an "Offline mode" banner. It does not sync, and
  data written here does **not** migrate to the cloud if you configure Supabase
  later.

---

## Who can see it

- **You**, on any device you sign in from.
- **Your Supabase project operator** — which, in the intended setup, is you.
- **Nobody else**, as enforced by the RLS policies rather than by convention.

If you run TradeVault as a hosted service for other people, *you* become the
processor for their data, and you need your own policy covering your hosting,
backups and retention.

---

## Data you import

CSV import parses the file **on your device**. The file's contents are not sent
anywhere except, in cloud mode, to your own database as the trades you chose to
import. Imports are de-duplicated by a fingerprint of the trade itself, not by
filename, so re-importing the same file does not create duplicates.

---

## Your control over your data

- **Export at any time.** Trades export to CSV, and the mobile app exports a full
  JSON backup. Both are generated on your device and handed to your own share
  target or download folder.
- **Delete records.** Deleting a trade marks it deleted and removes it from every
  list and figure.
- **Clear local data.** "Clear local records" removes everything stored on that
  device and empties the pending sync queue. It is explicit in the UI that this
  **cannot reach the server** — anything already synced stays in your database.
- **Delete everything.** Drop the rows in your Supabase database, or delete the
  project. Because it is your database, this is entirely within your control and
  does not require asking us.

---

## Retention

TradeVault itself does not expire or archive your records. They remain until you
delete them. If you operate a hosted instance, you must state your own backup
and retention periods here.

---

## Children

TradeVault is not intended for anyone under 18. It is a financial record-keeping
tool.

---

## Changes to this policy

Because this is a self-hosted codebase, the policy that applies to you is the
one in the version you deploy. If someone operates TradeVault for you, they are
responsible for telling you when this document changes.

---

## Contact

[PLACEHOLDER — a real contact address is required before you publish this.]

---

## What a lawyer still needs to check

Listed so the gaps are visible rather than implied:

1. Your lawful basis for processing, under GDPR or the equivalent in your
   jurisdiction. Trade records are financial data; the basis needs stating.
2. Whether Supabase acts as a processor or a controller in your configuration,
   and the resulting data processing agreement.
3. International transfer mechanisms, if your Supabase region differs from your
   users' locations.
4. Retention periods, if you operate a hosted instance.
5. Breach notification obligations and the procedure behind them.
6. Confirmation that "no broker credentials" is accurate for your deployment —
   it is accurate for the code as written, and would stop being accurate if
   someone adds broker integration.
