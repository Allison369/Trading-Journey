# TradeVault

A trading journal and analytics tool: record trades, review the numbers they
actually produced, and write down what you learned.

TradeVault is a **journal and analysis tool**. It does not place trades, connect
to a broker, hold funds, or predict prices. It will not tell you a strategy
works.

---

## What is in this repository

This is a monorepo with three parts, and the split matters:

| Path | What it is | Can be run here? |
| --- | --- | --- |
| `packages/core` | The shared logic: money maths, metrics, validation, CSV, FX, risk sizing, the offline sync engine. Pure TypeScript, no framework, no React Native, no browser. | Yes — tested under Node |
| `apps/web` | The web app. React + Vite, one static bundle. A public landing page, sign-in/sign-up, the journal itself, and a super-admin users overview. Runs against Supabase (the shared cloud database) or a clearly-labelled local store. | Yes — built and previewed |
| `apps/mobile` | The Expo / React Native app for Android (architected for iOS). Offline-first over SQLite, synced through Supabase. | Yes - release APK built (`TradeVault-1.0.1.apk`, arm64-v8a + armeabi-v7a, 46.7 MB); see `docs/android-build.md` |
| `supabase/` | Database schema, Row Level Security policies, storage rules, an isolation test suite, and a one-paste setup bundle. | Written; **not run** (no project credentials here) |

Both apps compute every figure through `packages/core`. The phone and the browser
cannot disagree about what a trade was worth, because there is only one
implementation of that arithmetic.

---

## The rules this app is built around

These are not aspirations; they are enforced in code and pinned by tests.

**1. An undefined figure is `N/A`, never `0`.**
A win rate of 0% is a claim about your trading. `N/A` is the absence of a claim.
They are different, and conflating them is how a journal lies to you. See
`packages/core/src/domain/metrics.ts` (`winRate: number | null`) and every
`describe` block that asserts `toBeNull()`.

**2. Money is never a float.**
All arithmetic runs on scaled `BigInt` values with 12 decimal places of working
precision (`packages/core/src/domain/decimal.ts`). `0.1 + 0.2` does not equal
`0.30000000000000004` here.

**3. Currencies are never silently added together.**
Every page reports in one account's currency and names that account. Converting
requires an explicit rate with a date attached (`packages/core/src/lib/fx.ts`);
if no rate is available the total is reported as incomplete rather than guessed.

**4. Open trades are excluded from realised figures.**
An open position has no result yet. It is listed separately, and a partly-closed
trade's figure is always labelled "so far".

**5. Nothing is fabricated.**
There is no demo data in the code path of a real journal. Where the web app
shows sample records (only when no database is configured) they carry a
persistent "Sample data" banner and copy that says they are not the user's
results.

**6. Conflicts are never resolved by silent overwrite.**
If two devices edit the same record, the conflict is recorded with both
revisions and left `unresolved` until a policy is chosen
(`packages/core/src/lib/sync.ts`).

**7. Deletes are soft.**
Rows carry `deleted_at`. A delete made offline has to be reconcilable with the
server later.

---

## The design system

The interface follows one visual language, defined once as CSS custom
properties in `apps/web/src/styles/app.css` and used everywhere:

| Token | Light | Dark | What it is |
| --- | --- | --- | --- |
| `--rail` | `#fafbf8` | `#101010` | The off-white rail down the left |
| `--bg` | `#ffffff` | `#131313` | The canvas |
| `--border` | `#e9e9e7` | `#2e2e2c` | Hairlines |
| `--text` | `#2f2f2f` | `#f2f1ec` | Body text |
| `--pastel-coral` | `#f9b69f` | `#3d2a22` | Headline blocks |
| `--pastel-yellow` | `#f7df8f` | `#3a3220` | Headline blocks |
| `--pastel-pink` | `#f6cee0` | `#3a2530` | Headline blocks |
| `--pastel-blue` | `#b6d5f4` | `#1f2c3c` | Headline blocks |
| `--panel-cool` | `#f6fafd` | `#16202b` | Large tinted panel |
| `--panel-warm` | `#fff0ec` | `#2a1f1c` | Large tinted panel |
| `--footer-bg` | `#2f2f2f` | `#1c1c1b` | The dark band that closes every page |

Four things about it are deliberate:

- **The palette was extracted from a reference design, not chosen by eye.** The
  hex values above were read off that design programmatically, so they match it
  exactly rather than approximately.
- **Each pastel is paired with a deep ink of the same hue** (`#341109` on
  coral, `#081f38` on blue, and so on). Neutral grey on a coral block looks
  dirty; the deep hue makes the block read as one object.
- **Both themes carry the same geometry** — spacing, radii, the pastel blocks,
  the tinted panels — and differ only in palette. The light theme *is* the
  reference design; the dark theme is its translation.
- **Profit and loss keep their colour rule.** Because a pastel block's number
  wears the block's own ink, the sign on the number and a small semantic chip
  carry the profit/loss meaning instead, so coloured text still always means
  money.

The reference design's *typography* could not be recovered from it — a raster
image does not carry font names — so the type scale is a close approximation
in a system sans, not a copy.

### Previewing the design locally

```bash
cd tradevault/apps/web
npm install
npx vite build
npx vite preview --port 4173 --strictPort
```

Then open `http://localhost:4173/`. `tradevault/preview.html` is a small
harness that embeds the running build in a 1512px frame, so the desktop
layout can be seen at its real width.

`tradevault/admin-preview.html` is a **static layout preview** of the super-admin
page, with placeholder rows instead of accounts. The real page only renders for
an admin session against the shared database, so this exists to review its
layout without one. It is a preview artefact, not part of the app.

---

## Quick start (web app)

```bash
cd tradevault
npm install
```

**Preview it with no configuration at all** — this is what runs locally with no
Supabase project, using browser storage and clearly-labelled sample data:

```bash
cd apps/web
npm run build
npm run preview        # http://localhost:4173
```

To run it against the shared cloud database instead, create `apps/web/.env` from
`apps/web/.env.example`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only the **anon** key belongs there. The service-role key bypasses Row Level
Security and must never be shipped in a client bundle.

Store selection, in priority order:

1. `VITE_OFFLINE_DEMO=true` → local store with sample data
2. Supabase URL + anon key present → cloud store (the real product)
3. Neither → local store, with an "Offline mode" banner and a "Sample data" banner

---

## Setting up the database

Everything needed is in one file: `supabase/all_in_one.sql`. Paste it into the
Supabase SQL editor for a new project and run it. It creates:

- 16 tables (accounts, trades, exits, strategies, journal, risk settings, tags,
  rules, attachments, profiles, sync bookkeeping)
- Row Level Security **forced** on all of them, with per-user policies
- A private `trade-attachments` storage bucket with per-user-prefix policies
- No `anon` policies at all

To verify isolation before trusting it, run `supabase/tests/rls_isolation_test.sql`
(11 checks: one user cannot read, write, or delete another user's rows).

Regenerate the bundle after editing any migration:

```bash
node scripts/print-sql.mjs > supabase/all_in_one.sql
```

---

## Running the checks

```bash
# Shared logic — the verification anchor
cd packages/core
npm test              # jest
npm run typecheck     # tsc --noEmit

# Web app
cd apps/web
npm run typecheck
npm run build

# Mobile — pure modules only (see note below)
cd apps/mobile
npm test
npm run typecheck
```

Current state: **core 264 tests in 8 suites**, **mobile 37 tests in 2 suites**,
all three packages typecheck clean, web builds.

The mobile test suite covers only pure modules (row↔domain mappers and CSV
export). Anything touching `expo-sqlite`, `expo-file-system` or another native
module is covered by the type checker and by manual steps, not by a mock — a
mock of a native module proves the mock works, not the app.

---

## Mobile app

```bash
cd apps/mobile
npx expo start            # then press 'a' for Android, or scan the QR code
```

Structure:

- `app/(tabs)/` — the five sections: Dashboard, Trades, Add, Stats, Journal
- `app/trade/[id].tsx` — trade detail
- `app/strategies.tsx`, `app/risk.tsx`, `app/settings.tsx`
- `src/db/` — SQLite schema, connection, row mappers, the offline store
- `src/state/` — app state and theme contexts
- `src/ui/` — shared components, formatting rules, hand-drawn SVG charts
- `src/export/` — CSV and JSON export through the OS share sheet

Offline-first: every read and write goes to SQLite first, and each mutation is
appended to a durable sync queue. The app is fully usable with no network.

**Charts are hand-drawn inline SVG**, not a charting library, and the y-axis is
labelled with its real bounds. A library that auto-scales from the minimum
exaggerates a small move; the chart should reflect the result, not flatter it.

---

## What still needs external configuration

These are the things this environment could not do for you:

| Item | Needs |
| --- | --- |
| Cloud sync (both apps) | A Supabase project; paste `all_in_one.sql`; set the URL and **anon** key |
| Google/Apple sign-in | Provider credentials in the Supabase dashboard |
| Play-Store AAB | A real signing keystore; the test APK is signed with the debug key. `eas build` or `gradlew bundleRelease` |
| iOS build | macOS with Xcode |
| Push notifications | `expo-notifications` + an Expo project ID |
| Running the RLS suite | Supabase credentials, or a local Supabase instance |
| Image storage | The `trade-attachments` bucket from `0003_storage.sql`, applied by `all_in_one.sql` |
| The super-admin account | Run the bootstrap SQL at the bottom of `0004_admin_role.sql` once, with database access |

Notifications are **not implemented** — the dependency is declared nowhere and
no code claims otherwise.

### Making yourself an admin

There is no way to grant the admin role from inside the app, and that is
intentional: the flag lives in `profiles.is_admin`, a trigger blocks a non-admin
from setting it, and the first admin therefore has to be set once with database
access. The exact SQL is at the bottom of
`supabase/migrations/0004_admin_role.sql`. After that, an existing admin can
grant or revoke the role from the Admin page, and cannot revoke their own.

---

## Known limitations

Stated plainly, because a journal that overstates itself is worse than one that
does not exist.

1. **The APK is a test build.** It compiles and installs
   (`TradeVault-1.0.1.apk`, arm64-v8a + armeabi-v7a, release bundle, no Metro server needed),
   but it is signed with the debug keystore, so it is not Play-Store distributable
   and a later build signed with another key needs an uninstall first. It has not
   been run on a physical device in this environment. Build notes and the four
   required patches are in `docs/android-build.md`, and the workspace is not a
   git repository.
2. **No real Supabase project was contacted.** The schema, policies and
   isolation tests are written but have not been executed against a live
   database. Run the RLS suite before storing anything real.
3. **The web app's "Offline mode" is browser-local.** It is not a fallback sync
   engine — data written there does not migrate to the cloud later. It exists so
   the app can be evaluated without a backend, and the UI says so on every
   screen.
4. **No broker integration, by design.** There is no import from a broker API,
   and the app never asks for broker credentials.
5. **Notifications are not implemented.**
6. **i18n is readiness, not translation.** All formatting goes through
   locale-aware helpers, and no user-facing string is assembled by concatenating
   fragments, but only English strings exist today.
7. **Attachments are web-only.** Uploading a chart screenshot works in the web
   app; the mobile upload UI has not been built. The bucket and policies are in
   place for it.
8. **A file's type is not proven by its extension.** Validation checks the MIME
   type the browser reports, which is derived from the file extension, so a
   renamed file is not proven to be an image. This is survivable because
   attachments are served privately with a stored content type and are never
   executed, but the UI says so rather than implying a stronger guarantee.
9. **The admin page is a users overview, not an operations console.** It can
   enable or disable admin access. It cannot delete an account, suspend a user,
   or read anyone's trades — those would need decisions that should be made
   deliberately.

---

## Legal and privacy

- `docs/privacy-policy.md` — what is collected, where it lives, and how to
  remove it
- `docs/terms-of-use.md` — the terms, including the "not financial advice"
  position in full

Both are drafts and need review by a qualified lawyer before you rely on them
for a public launch.

---

## Repository layout

```
tradevault/
├── packages/core/            Shared logic (the tested anchor)
│   └── src/
│       ├── domain/           types, decimal, pnl, metrics
│       ├── lib/              validation, risk, csv, fx, sync
│       └── testing/          fixtures
├── apps/web/                 React + Vite web app
│   └── src/
│       ├── pages/            the eight sections
│       ├── components/       UI primitives and charts
│       └── lib/              store contract, cloud + local stores
├── apps/mobile/              Expo / React Native app
│   ├── app/                  Expo Router routes
│   └── src/                  db, state, ui, export
├── supabase/
│   ├── migrations/           0001 schema, 0002 RLS, 0003 storage
│   ├── tests/                RLS isolation suite
│   ├── seed.sql
│   └── all_in_one.sql        paste this one
└── scripts/print-sql.mjs     regenerate the bundle
```
