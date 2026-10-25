# TradeVault — Terms of Use (draft)

**Status: draft.** This document has not been reviewed by a lawyer. Do not rely
on it for a public launch without professional review.

Last updated: [DATE — set this when you publish]

---

## 1. What TradeVault is

TradeVault is a **record-keeping and analysis tool** for your own trading
activity. You enter what you traded, and it calculates what those trades
produced.

## 2. What TradeVault is not

This section is the important one.

- **It is not financial advice.** Nothing in the app — no figure, no chart, no
  breakdown, no risk calculation — is a recommendation, a prediction, or a
  suggestion to buy or sell anything.
- **It does not place trades.** There is no broker integration, and no order is
  ever transmitted by this software.
- **It cannot make you money.** It records outcomes. It does not cause them.
- **It does not guarantee accuracy of your inputs.** Every figure is derived from
  the numbers you enter. If a price, fee or size is wrong, the result is wrong,
  and the app has no way to know.
- **It does not predict the future.** No projection, forecast or annualised
  figure appears anywhere in the app, by design.

Trading involves substantial risk of loss. You can lose more than you expect —
prices gap past stop losses, and a calculated risk is not a capped loss. Decisions
you make are yours.

## 3. The numbers

TradeVault computes every metric from the records on the device or in your
database. Two properties are worth stating as terms, because they are promises
the code keeps:

- **A figure with no data behind it is displayed as `N/A`, never as zero.** A
  win rate of `N/A` means you have closed no trades. A win rate of `0%` means you
  have closed trades and lost all of them. These are different facts and are
  never conflated.
- **Currencies are not combined without a stated, dated exchange rate.** Figures
  are reported in a single named account's currency. This is why a page always
  tells you which account it is reporting in.

Small sample sizes make every statistic misleading. The app shows the trade count
beside each group figure so you can judge this yourself.

## 4. Your data and your responsibilities

- You are responsible for the accuracy of what you enter and import.
- If you connect a Supabase project, you are the operator of that database and are
  responsible for its security, backups and access control.
- You are responsible for keeping your sign-in credentials secure.
- Do not use TradeVault to store data you are not permitted to hold, including
  another person's records without their consent.

**Back up your data.** The app provides CSV and JSON export for exactly this
reason. No warranty is made against data loss, and the local store depends on
your device and browser, which can and do lose data.

## 5. Availability and changes

TradeVault is provided as-is. Features may change. If you operate an instance for
others, you are responsible for communicating changes to them.

## 6. Limitation of liability

To the maximum extent permitted by law, the authors of TradeVault are not liable
for trading losses, lost profits, lost data, or any indirect or consequential
damages arising from use of this software.

**This clause requires legal review to be enforceable in your jurisdiction, and
its wording is deliberately not final.**

## 7. Acceptable use

Do not use TradeVault to:

- break any law or regulation, including financial record-keeping obligations;
- misrepresent results to another person, including as evidence of track record
  to attract investment;
- attempt to access another user's data.

## 8. Open source

TradeVault's source is available for inspection, which is deliberate: the money
arithmetic and the security policies can be read and audited. The licence terms
in the repository govern your use of the code.

## 9. Governing law

[PLACEHOLDER — jurisdiction to be set.]

---

## What a lawyer still needs to check

Listed so the gaps are visible:

1. Consumer protection and financial-promotion rules in your jurisdiction. A
   tool that records trading results can fall within financial promotion
   regulation depending on how it is marketed, even though it gives no advice.
2. Whether the limitation of liability in §6 is enforceable as written.
3. The disclaimer's prominence. Many jurisdictions require risk warnings to be
   conspicuous; placing this document behind a link may not satisfy that. A
   first-run acknowledgement screen is the safer pattern and is **not** built.
4. Data protection cross-references to the privacy policy.
5. Governing law, jurisdiction and dispute resolution.
6. Whether age restrictions need to be stronger than the 18+ statement in the
   privacy policy.
