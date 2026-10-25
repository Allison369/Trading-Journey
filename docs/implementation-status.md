# TradeVault — Implementation Status

This document separates what **exists and is verified** from what **exists but is
unverified** from what **does not exist**. The distinction is the point: a
feature is not listed as complete unless the code is present and something
executed it.

Last verified: the run recorded at the bottom of this file.

---

## Verified here

### Shared logic — `packages/core`

Verified by execution: **264 tests in 8 suites**, plus `tsc --noEmit` clean.

| Area | Detail |
| --- | --- |
| Decimal arithmetic | Scaled `BigInt`, 12 dp. Add, subtract, multiply, divide, round, compare, parse, format. No binary float in the money path. |
| Trade P&L | Gross per leg, fee aggregation, net, manual override, average exit price, partial closes, open quantity. |
| R multiples | Only when a stop loss makes one meaningful; `null` otherwise. |
| Metrics | Win rate, loss rate, profit factor, expectancy, average win/loss, largest win/loss, gross profit/loss, total fees, streaks (breakeven neither breaks nor extends), holding times. |
| Equity curve | Built from closed events only; open trades excluded. |
| Drawdown | Peak-to-trough on the curve; `null` when the curve is too short. |
| Grouping | By strategy, session, market, asset class, direction, order type. |
| Period buckets | Day, week, month, year, time-zone aware. |
| Calendar heatmap | Per-day results; a day with no trade is distinct from a zero-result day. |
| Capital base | Starting balance + adjustments. Deposits change the denominator of a return, never the numerator. |
| Validation | zod schemas for account, trade, exit, strategy, journal, risk settings, profile. |
| CSV | Import with fingerprint de-duplication; export with correct quoting. |
| FX | Conversion requires a dated rate; incomplete totals are reported as incomplete. |
| Risk sizing | Position size rounded *down*, stop distance, notional, actual risk. |
| Reward/risk | Ratio plus break-even win rate. |
| Sync engine | Durable queue, revision-based conflict detection, no silent overwrite. |

### Web app — `apps/web`

Verified by `tsc --noEmit`, a production build, and DOM inspection of every
section in a running browser.

- Build: `dist/index.html` 1.80 kB, `index.css` 29.42 kB, `index.js` 646 kB
  (179 kB gzipped).
- Nine sections plus three pre-app screens render real computed values, with
  `N/A` wherever a figure is undefined and no console errors.
- Dashboard, Trades, Add Trade, Analytics, Journal, Strategies, Risk, Settings,
  Admin, Landing, SignIn and the session-check screen all present.
- Charts are inline SVG with labelled axes.
- Two stores behind one interface: `cloudStore` (Supabase) and `localStore`
  (browser), with "Offline mode" and "Sample data" banners when local.

**Front page (landing).** Shown first to a signed-out visitor on a
cloud-configured deployment: hero, a dashboard preview, six feature cards and a
footer. The preview's figures are computed at render by `@tradevault/core` from
the labelled sample set, and the panel carries a "Sample data" badge — a
marketing panel drawn separately from the product is one that can drift from it.
The mechanism disclaimer (no broker, no order placement, no API keys, risk of
loss) is in the hero, not a footnote. There is a theme toggle on the landing
page itself.

**Auth screens.** One card with a sign-in / create-account switch, a
forgot-password mode, and a link back to the landing page. There is deliberately
**no separate admin login route** — see the admin section below.

**Design system.** The interface was restyled to a supplied reference design.
The reference could not be viewed directly (the model in use reads no image
input), so it was analysed programmatically instead: custom PNG decoders read
its pixels to recover the exact palette, the geometry of every block, the
corner radii and the text colours. Those extracted values — not an
approximation — are the design tokens in `apps/web/src/styles/app.css`.

What was recovered, and is now in the build:

- Canvas `#ffffff`, rail `#fafbf8` (19.3% of the reference width), border
  `#e9e9e7`, text `#2f2f2f`, muted `#64655e`.
- Four pastel blocks in a row: coral `#f9b69f`, yellow `#f7df8f`, pink
  `#f6cee0`, blue `#b6d5f4` — each with its **deep hue-matched ink**
  (`#341109`, `#2c1900`, `#320d1e`, `#081f38`), which is what the reference
  uses for the text on them.
- Large tinted panels: cool `#f6fafd`, warm `#fff0ec`, cream `#fff7f5`.
- A near-black accent block `#141412` and a full-width dark footer bar
  `#2f2f2f`.

What was **not** recoverable: the reference's typography. A raster image does
not carry font names or exact sizes, so the type scale is a close approximation
in the system sans rather than a copy of the original.

The dashboard was restructured to the reference's own arrangement: a row of
four tinted headline blocks (Net realised P&L, Win rate, Profit factor,
Return), a wide cool panel carrying the equity curve and open positions beside
a narrower warm panel carrying the quality readouts (Average R, Expectancy,
Largest win, Max drawdown), then the detail cards. The app shell gained the
off-white rail, a large display heading, and the dark footer bar; the front
page gained the same pastel blocks, the tinted preview panel and the dark
footer.

Both themes carry the same geometry and differ only in palette: the light
theme *is* the reference, and the dark theme is its translation (pastels become
deep desaturated blocks, inks invert with them). Dark remains the default but
respects an explicit OS `prefers-color-scheme: light`.

Verified by DOM inspection of the running build in both themes: the four
blocks render at the exact extracted colours with their exact inks, the tinted
panels measure `#f6fafd` / `#fff0ec`, the rail measures `#fafbf8`, the footer
measures `#2f2f2f`, the primary button is the near-black block, and the
headline figures are unchanged (+$1,812.30, 80.0%, 5.96, +18.12%). At the
reference's 1512px width the four blocks measure 278px each with an 18px gap,
matching the reference's proportions.

One consequence of the palette is worth stating plainly: a pastel block's
number wears the block's own ink, so profit and loss are carried by the sign
on the number and by a small semantic chip rather than by colouring the number
itself. The app-wide rule — coloured text always means money — still holds, and
`--chip-pos` / `--chip-neg` are darkened to stay legible on a light tint.

**Admin page.** Rendered only when the database answers that the signed-in
account is an admin (`profiles.is_admin`, asked after sign-in, on every session).
Users overview: email, display name, join date, last activity, trade count,
journal count, and a make/revoke-admin control. Counts only — there is no column
for balance, instrument or performance. The page documents its own limits in the
UI.

It wears the same design language as the dashboard: four pastel totals blocks
(coral users, yellow new sign-ups, pink trades, blue journal entries), a cool
panel holding the users table, and a warm panel for the "what this page cannot
do" text. Admin rows are marked with the near-black ink block rather than a
brighter colour, because the role is a fact about the row and not a warning.
`admin-preview.html` at the repository root is a **static layout preview** of
that page — its rows are placeholders, not accounts, and it exists only because
the real page needs an admin session against the shared database to render.

**Mobile theme.** The phone app carries the same tokens: the same palette, the
same four pastels with their deep inks, the same tinted panels and ink block. The
mobile dashboard's four headline figures use the pastel blocks (Net P&L coral
with a PROFIT/LOSS chip, win rate yellow, profit factor pink, return blue); the
remaining readouts stay on neutral surfaces. Light mode was given the missing
`chipPos` / `chipNeg` values so the semantic chip is legible there too.

**Image uploads.** A chart screenshot can be attached to a trade from the trade
detail view, with drag-and-drop or a file picker, and shown as a thumbnail with
a full-size lightbox. Rules are enforced in three places: the client
(`validateAttachmentFile`, for a fast answer), the storage bucket
(`allowed_mime_types`, `file_size_limit`) and the table `CHECK`. The bytes are
uploaded **before** the row is inserted, so a failure leaves an invisible
orphaned object rather than a record that looks saved and cannot be opened. The
object key is `<user_id>/<trade_id>/<uuid>.<ext>` — the user's filename is never
part of the path, only of the displayed row. Signed URLs are short-lived (300 s)
and are never persisted or logged. The UI states plainly that a file's type
reflects its extension, not a decoded format, so a renamed file is not proven to
be an image.

Spot-checked values in the running app (sample set, 5 closed trades):

| Figure | Value |
| --- | --- |
| Net realised P&L | +$1,812.30 across 5 closed trades, after $52.70 costs |
| Win rate | 80.0% (4 won, 1 lost) |
| Profit factor | 5.96 |
| Return on $10,000 | +18.12% |
| Average R | +0.50R from 4 trades with a stop loss |
| Expectancy | +$362.46 |
| Max drawdown | 3.45% ($10,609.50 → $10,244.00) |

The landing page's preview panel was verified against these same figures. An
earlier revision of that panel passed `computeDrawdown`'s percentage (3.45)
straight into `fmtPercent`, which expects a fraction, and rendered the drawdown
as **344.5%**. It was caught by reading the rendered DOM, not by a test, and
fixed by dividing by 100 as the Dashboard already did. This is why the panel is
computed by the shared engine rather than hand-drawn.

Controls confirmed working: `N/A` for a 100%-win group's profit factor (division
guard), `N/A` for an open trade's P&L, validation errors shown instead of a
fabricated risk result, and an explicit note that empty calendar squares are not
zero-P&L days.

Auth flows confirmed by DOM inspection: the sign-in / create-account tabs switch
(3 fields and "Create your journal" on the sign-up tab), forgot-password shows
"Reset your password" with email only and no tab switch, "Back" returns to the
landing page, and the theme toggle moves light → dark.

The image-upload path was exercised end to end in the local store: a 2×2 PNG was
uploaded through the file input, validated, stored, and re-read after a page
reload — the thumbnail renders, the gallery shows name/size/type, and a count
badge appears in the trades table. The cloud path (bucket upload, signed URL) is
written but unverified; see below.

### Mobile app — `apps/mobile`

Verified by `tsc --noEmit` clean and **37 tests in 2 suites** over the pure
modules.

- Expo Router structure: 5 tabs + trade detail + strategies + risk + settings.
- SQLite schema with indexes; soft delete and revision columns throughout.
- Row↔domain mappers, including the cases that matter: empty numeric → `null`
  (not `0`), unparseable numeric → `null`, malformed JSON array → fallback rather
  than a thrown row, required text trimmed.
- CSV export with quoting, embedded-quote escaping, and multi-exit aggregation.
- Sync queue wired to every mutation.
- All figures computed through `@tradevault/core`.
- **Design system.** The phone mirrors the web's design tokens value-for-value:
  the four pastel blocks with their deep inks, tinted equity/quality panels, the
  violet accent, ink-slab primary buttons, 18-radius cards and the bottom nav.
  Headers are in-screen editorial headings rather than Android toolbars; dark is
  the default and the light theme is a setting. Release **1.0.1** adds the
  launcher icon, adaptive icon and splash (including the Android 12 splash style)
  and bundles both phone ABIs (arm64-v8a and armeabi-v7a).

### Database — `supabase/`

Written and reviewable; **not executed here**.

- `0001_initial_schema.sql` — 16 tables.
- `0002_rls_policies.sql` — RLS **forced** on every table, per-user policies,
  zero `anon` policies.
- `0003_storage.sql` — private `trade-attachments` bucket, per-user-prefix
  policies, 10 MiB limit, image MIME allow-list.
- `0004_admin_role.sql` — `profiles.is_admin`, a trigger that silently restores
  the flag for a non-admin (RLS has no column granularity, so the trigger is the
  column-level control), an `is_admin()` security-definer helper, narrowly
  scoped admin policies, the `admin_user_overview` and `admin_platform_totals`
  views, and the one-time bootstrap SQL for the first admin.
- `tests/rls_isolation_test.sql` — 16 isolation checks, of which 12–16 pin the
  admin boundary: a user cannot self-promote, a non-admin sees zero overview
  rows, an admin cannot read another user's trades, the overview exposes no
  trading columns, and an admin cannot demote themselves.
- `all_in_one.sql` — generated one-paste bundle, regenerated to include 0004.

The admin role is a **database column, not a client flag**, because the anon key
ships in the bundle. A client-side admin flag is not an access control. The UI
shows the admin page based on the server's answer, but the policies are the
boundary — an edited front-end that forces the page open gets the same empty
result set. Deliberately, an admin **cannot read anyone's trades, exits, journal,
strategies, balances or screenshots**; only identity and row counts through a
view.

---

## Exists but unverified

| Item | Why unverified | What would verify it |
| --- | --- | --- |
| Running the APK on a phone | The Android release APK builds (`assembleRelease`, arm64-v8a + armeabi-v7a, debug-key signed) but this environment has no device or emulator; the phone refused it with Android's generic "App not installed" | Install `TradeVault-1.0.1.apk`; build notes in `docs/android-build.md` |
| iOS native build | No macOS/Xcode | `eas build --platform ios` |
| Supabase connectivity | No project credentials (and asking for secrets would be wrong) | Configure `.env`, then run the app |
| RLS isolation suite | Same | Run `rls_isolation_test.sql` against a live project |
| Cloud store end-to-end | Same | Sign in on both web and mobile; confirm one journal |
| Admin overview against a real database | Same | Sign in as an admin and read the users table |
| Cloud image upload + signed URLs | Same | Attach a screenshot with Supabase configured; confirm a signed URL loads |
| Sync conflict resolution | Needs two devices or two clients racing | Edit the same record from two clients with sync on |
| OS share-sheet export | Needs a device | Tap "Trades CSV" on a real device |

The admin page and the cloud upload path were therefore verified only as far as
the **local** store allows. The landing page and the auth screens were verified
against a build with placeholder Supabase environment values, so that the
cloud-mode screens render; no request reached a real project.

---

## Does not exist

Named explicitly so nothing is implied that is not there.

- **Broker integration.** No broker API, no OAuth to a broker, no order placement.
- **Notifications.** Not implemented; the dependency is not installed.
- **Attachment upload UI on mobile.** The bucket and policies exist, and the web
  app can upload; the mobile upload screen does not exist.
- **Attachment captions in the web UI.** The column and the data model support a
  caption; the uploader does not yet offer a field for one.
- **Account creation and editing on mobile.** The web app has full account CRUD.
  The mobile Settings screen shows accounts and states plainly that creating them
  is web-only for now, rather than showing a form that does nothing.
- **i18n translations.** Locale-aware formatting is in place; only English
  strings exist.
- **Biometric lock / PIN.**
- **Admin actions beyond the users overview.** No account deletion, no
  suspension, no impersonation, and no platform-wide trade statistics. Each would
  need a decision about other people's data that should be made deliberately, not
  by adding a column.
- **Multi-user / team sharing.** The model is one user, many devices.
- **Tax reporting.**
- **A pixel-for-pixel copy of the reference design.** Its colour, geometry and
  layout were recovered exactly and are in the build. Its **typography was not**,
  because a raster image carries no font names or sizes — the type scale is an
  approximation in the system sans.
- **Screenshot capture of the running app.** The harness's browser window is
  not visible to the screenshot tool in this environment, so verification was
  done by reading computed styles and geometry out of the live DOM instead.
  `tradevault/preview.html` embeds the running build in a 1512px frame so the
  desktop layout can be seen at its real width.

---

## How to re-verify

```bash
cd packages/core   && npm test && npm run typecheck
cd apps/web        && npm run typecheck && npm run build
cd apps/mobile     && npm test && npm run typecheck
```

Expected: 264 core tests pass, 37 mobile tests pass, all three typechecks exit 0,
the web build succeeds (with a chunk-size warning only).

Then, for the running app: build the web app, run `npm run preview`, and read the
DOM of each section. The figures above are what it should show for the sample
set, and every undefined figure should read `N/A`.
