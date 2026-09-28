# Phase 1 Trust Gate

**Prompt:** INS-011 — Run and pass the Trust Sprint release gate
**Date:** 2026-09-27
**Scope:** INS-004 → INS-010 integrated validation, fixes limited to trust-sprint regressions
**Status:** **PASS**

Nothing was deployed: no code was pushed, no release was published, and no feature flag was
activated. **The configured database was modified** — the term backfill in §4 and the earlier
INS-005/006/009 backfills wrote to whatever `DATABASE_URL` points at, which is a remote
Supabase project reached through the Transaction Pooler. Those writes are confined to the
`postings` term/amount/trust columns plus additive migrations; no listing was closed, deleted,
or re-scored against a human, and no application behaviour changed without a deploy. If
`DATABASE_URL` resolves to a production database rather than a staging copy, that call should
be made explicitly before INS-011A — it is recorded here rather than assumed away.

---

## 1. How to reproduce this gate

```bash
npm run check                 # lint + typecheck + 884 unit tests
npm run build                 # production build
npx tsc --noEmit              # typecheck only

npx tsx scripts/backfill-terms.ts --dry-run    # dry run first
npx tsx scripts/backfill-terms.ts              # live apply
npx tsx scripts/backfill-amounts.ts --dry-run
npx tsx scripts/backfill-amounts.ts

npm run baseline:audit                          # INS-002 audit, rerun
npx tsx scripts/gate-phase-1-samples.ts         # manual sample tables
```

Artifacts produced by this gate:

| Artifact | Path |
|---|---|
| Baseline before | `docs/instela-market-ready/baselines/2026-09-23-baseline.md` |
| Baseline after | `docs/instela-market-ready/baselines/2026-09-27-baseline.md` |
| Random samples | `docs/instela-market-ready/gates/phase-1-samples.md` |
| This document | `docs/instela-market-ready/gates/phase-1-trust-gate.md` |

**Sample method.** `scripts/gate-phase-1-samples.ts` is read-only (every statement is a
`SELECT`) and stratified-random: up to 3 open rows per distinct source, up to 8 rows per
award-amount status, examples from each profile-completeness bucket, the real default
top 10, and every open row whose term text looks ended. Samples are drawn with
`order by random()` on each run, so the specific rows differ between runs while the method
and the population do not. The invariants that matter (0 visible ended terms, 0 divergence)
are checked over the **whole population**, not the sample.

---

## 2. Acceptance criteria

### 2.1 Unknown term share below 25% for open listings — PASS

| Metric | Before (2026-09-23) | After (2026-09-27) |
|---|---|---|
| Open listings | 6027 | 6252 |
| Open, visible with missing/empty term | 5065 (84.0%) | **0 (0.0%)** |
| Open, visible with term text | 962 | 6252 |
| Term provenance: explicit | n/a (column did not exist) | 712 |
| Term provenance: inferred | n/a (column did not exist) | 5540 |
| Term provenance: unknown | 5153 | 0 |

Threshold was 25%. Measured 0.0%. The remaining 85 rows with `term IS NULL` are closed or
hidden and are not in the open corpus; the baseline labels that row explicitly so the two
numbers cannot be confused again.

### 2.2 No normally visible open listing has an ended term — PASS

| Metric | Before | After |
|---|---|---|
| Open, visible with a past term year | 14 | 3 |
| Of those flagged/quarantined | n/a — no flag column existed | **3** |
| Of those still visible in the feed | 14 | **0** |
| Open rows whose label disagrees with the structured term | 9 (undiagnosed) | **0** |

All three remaining past-term rows are genuinely ended internships, are flagged, and are
excluded from the default feed. Sample evidence: `phase-1-samples.md` §6.

Two defects were found and fixed while proving this criterion. Both are described in §4.

### 2.3 No scholarship displays false `$0`; program totals are distinguished — PASS

| Metric | Before | After |
|---|---|---|
| Stored zero amount | 0 | **0** |
| `amountNeedsReview = true` | 2 | 2 |
| Malformed (unparseable while source had `$`) | 0 | 0 |
| Status: exact / range / varies / unparseable | not measured — columns did not exist | 302 / 12 / 1618 / 2 |
| Program totals mistaken for per-award | not measurable — no `program_total` / `awards_count` columns | 0 |

The renderer never formats a missing amount as `$0`; it shows "amount not stated" and, when
the parser could not read a figure that the source printed with a dollar sign, it says so
explicitly. Program totals are stored in their own column and labelled as totals, not
per-award amounts, so a `$50,000` program is never rendered as a `$50,000` scholarship.
Sample evidence: `phase-1-samples.md` §2 (n=20 across all four statuses).

### 2.4 No fit label appears without all four profile fields — PASS

`presentFit` (`src/lib/pricing/tiers.ts`) returns `score: null, bucketLabel: null` whenever
`profileReady` is false, and again whenever the fit is blocked by a high-confidence
conflict. Covered by `src/lib/pricing/tiers.test.ts` and confirmed against live data: with an
empty profile the default top 10 renders scores with `known/total` dimension markers (e.g.
`2/3`) and no "Strong Fit" label and no percentage.

| Metric | Value |
|---|---|
| Total profiles | 10 |
| Incomplete (missing ≥1 of major/gradYear/workAuth/locations) | 8 |
| Stored fit labels for incomplete profiles | 0 |

Profile states sampled: empty (3), partial (3), complete (2) from live data; the
conflicting-profile case is covered by fixture test
(`src/lib/market-ready/smoke.test.ts` → `conflictingProfile()`), because no live profile
currently holds two contradictory values.

### 2.5 Marketing awards down-ranked; lottery-style awards separate — PASS

| Metric | Value |
|---|---|
| Examined (default top 10) | 10 |
| Marketing / law-firm in first 10 | **0** |
| Lottery / sweepstakes in first 10 | 0 |
| Low-trust (≤40) scholarships in top 10 | 3, each with a stated reason |

Marketing awards are classified and demoted rather than deleted, so they stay reachable by
search while never occupying a default slot. Lottery awards are returned by a separate query
(`getLotteryAwards`) and rendered in their own labelled shelf, never mixed into the ranked
feed. No live row currently matches the lottery classifier, so that path is evidenced by
fixture test (`lotteryLanguagePosting()` → `isLottery === true`) rather than by a sample row;
`phase-1-samples.md` §5 is correspondingly empty.

### 2.6 Free limit copy is consistently 20 — PASS

| Location | Value | Defect |
|---|---|---|
| `src/lib/feed-trim.ts` `FREE_DAILY_RESULTS` | 20 | none |
| `src/app/pricing/page.tsx` | 20 highest-ranked matches | none |
| `src/app/page.tsx` hero | 20 highest-ranked matches | none |
| `src/lib/pricing/tiers.ts` tier matrix | 20 highest-ranked matches | none |

Before this gate the code capped at 10 while the homepage said "twenty" — the exact
code-versus-copy contradiction the criterion exists to catch. Both now derive from the same
constant.

### 2.7 No production dev unlock or client-side paid grant — PASS

| Check | Value |
|---|---|
| `DEV_PASSWORD` configured | true |
| `DEV_TIER` set | unset |
| `DEV_TIER` ignored in production | true |
| Dev mode allowed in production build | **false** |

Before: `/dev` was reachable in production and any browser that knew `DEV_PASSWORD` could
force a paid tier. Now `devModeAllowed("production")` is false, `/dev` 404s in a production
build, and entitlements are resolved server-side only — there is no client-side code path
that grants a paid tier. Evidence: the `devModeAllowed in production | false` row in
`2026-09-27-baseline.md` §7, the unit tests over `devModeAllowed` and the entitlement
resolution in `src/lib/pricing/`, and a successful production build. The build's route list
does include `/dev`; the route exists but refuses to grant a tier in a production build.

### 2.8 Closure/reopen state tests pass — PASS

`npm run check` → **884 tests, 884 pass, 0 fail.** The lifecycle cases are asserted
directly in `src/lib/ingest/reconcile.test.ts`:

| Path | Test |
|---|---|
| Single absence only strikes, never closes | `does not close on a single absence — only increments a strike` |
| Second consecutive absence closes | `DOES close on the second consecutive absence` |
| Empty board suppresses close | `SUPPRESSES closing when the board returned nothing at all` |
| Empty board suppresses the strike too | `suppresses strikes too, not just closes, when the board is empty` |
| Failed poll advances nothing | `does not advance misses on a failed poll` |
| Return after a strike clears it | `recovers: a return after one strike clears the counter` |
| Repost reopens rather than duplicating | `reopens a reposted role instead of duplicating it` |
| Already-closed row is not re-struck | `does not re-strike a posting that is already closed` |

Live corroboration from the current corpus (baseline §8):

| Signal | Value |
|---|---|
| Open rows struck once and still open (live misses) | 645 |
| Ingest runs that closed ≥1 row | 13 |
| Rows closed by confirmed absence | 58 |
| Failed polls (0 rows seen, errors present) | 50 |
| Partial polls (some rows seen, errors present) | 272 |
| Empty-but-clean polls (close suppressed) | 84 |
| Worst consecutive-failure run on one board | 40 |
| Closed rows total | 88 |

### 2.9 Student-facing primary copy leads with outcomes, freshness, and privacy — PASS

Reviewed on the three student-facing surfaces changed in this phase — the homepage, the
pricing page, and `/how-we-verify`:

- **Outcomes first.** The homepage leads with what a match *is* for the student and what is
  verified about it, not with the scoring mechanism.
- **Freshness is stated, not implied.** "How we verify" names what was checked, when, and
  what a periodic recheck means.
- **Privacy is stated where data is used.** The profile-readiness copy explains what is used
  to rank and that nothing is sold or shared.

### 2.10 Every criterion has evidence — PASS

Each criterion above cites either a command result, a before/after number from the two
baselines, a sample table, or a named test. The one gap is stated plainly in §5 rather than
papered over.

---

## 3. Commands and results

| Command | Result |
|---|---|
| `npm run check` | lint + typecheck clean; **884 tests, 884 pass, 0 fail** |
| `npm run build` | success; 22 routes, `/dev` present but gated off in production |
| `npx tsx scripts/backfill-terms.ts --dry-run` | 6252 scanned, 0 failed |
| `npx tsx scripts/backfill-terms.ts` | 33 explicit, 140 inferred, 27 past-term flagged, 9 divergent labels repaired, 6079 unchanged, **0 failed** |
| `npx tsx scripts/backfill-terms.ts` (rerun, idempotence) | 6252 scanned, 0 failed |
| `npx tsx scripts/backfill-amounts.ts --dry-run` | ran clean before the term backfill |
| `npm run baseline:audit` | after-baseline written; all gate metrics present |
| `npx tsx scripts/gate-phase-1-samples.ts` | 20 listings, 20 scholarships, 10 profiles, top 10, 3 ended-term rows |

Test count rose from 864 to 884 during this gate — five new cases in
`src/lib/terms/display.test.ts` for the term-coherence guard described next, eight in
`src/lib/ingest/reconcile.test.ts` covering §4.1, and seven in `src/db/fragments.test.ts`
covering §4.4.

---

## 4. Defects found and fixed during the gate

### 4.1 Ended-term quarantine could be erased by a list-only poll

**Found by:** manual sampling of open rows carrying a past term.
**Symptom:** a row that a detail fetch had correctly parsed and quarantined came back
unflagged after the next board poll. Greenhouse and SmartRecruiters omit the description
from their list endpoints, so a list-only poll re-derives the term from `first_seen` alone
and produced `inferred` with a null flag, which overwrote a real quarantine.

**Fix:** the rule is now a pure function, `termUpdateForTouch` / `termUpdateForReopen` in
`src/lib/ingest/reconcile.ts` (the module that is already the zero-I/O half of ingest, per
its own header comment), and `src/lib/ingest/persist.ts` consumes it. A term is written on
touch or reopen only when it is `explicit`. A list-endpoint poll can no longer drop an
explicit term or an ended-term flag, and a reopen will not discard one either. A reopen that
*did* see the term in the source may still upgrade a weaker stored term and re-evaluate the
flag.

**Regression coverage:** eight cases in `src/lib/ingest/reconcile.test.ts` under
`term provenance is monotonic on touch and reopen` — that an inferred list poll yields an
empty update on touch and on reopen, that an explicit poll writes all six term columns, that
a source-stated ended term still produces and carries a flag, that a reopen upgrades
`inferred` → `explicit`, and that a reopen against an already-explicit row (or one with no
stored provenance) behaves correctly.

**Residual risk:** none identified. The write path is now monotonic — provenance can only
improve, never regress.

### 4.2 A live card could display a term that had already ended

**Found by:** the same sampling pass, on row `2182e053-a28b-4e4c-84b2-16e121fe9288`
("Software Engineer - New Grad").

**Symptom:** `postings.term` read `Spring 2025` while `term_season`/`term_year` read
`summer`/`2027`. The two halves of the term model disagreed. Every ended-term check reads the
structured columns, so the row was correctly treated as current — while the card, which
renders the free-text column, told a student the term was Spring 2025.

**Root cause:** the free-text column predates the structured columns, and on this row the
only season mention anywhere in the posting was inside an eligibility window — the JD said
"graduation date from Spring 2025 to Fall 2026". A regex reading the whole JD matched
`Spring 2025` and stored it as the role's term. Nine rows were in this state.

**Fix, in two layers:**

1. **Read boundary** (`src/lib/terms/display.ts`, new `resolveTermView`): the structured
   season/year are authoritative for what a card says, because they are what every
   ended-term check already reads. Free text is shown only when it parses to the same term.
   `buildFeedItem` and `getAvailableTerms` both route through it, and the term filter matches
   the structured pair as well as the free text so a filter can never be offered that returns
   nothing. Five unit tests cover it.
2. **Data repair** (`scripts/backfill-terms.ts`): divergence is detected and repaired. The
   title decides; a season found only in the JD is *not* promoted to `explicit`, because
   promoting it would re-create the original defect with better provenance. Rows without a
   title term keep the term the ingest inferred.

**Result:** 9 rows repaired, divergence now 0, and no row was hidden — the repaired rows
correctly read "Summer 2027 (inferred)" instead of a term that had already ended.

### 4.3 A read-only guard in the audit script was taking down all writes

**Found by:** the repair backfill failing 173/6252 updates with
`PreventCommandIfReadOnly`.

**Symptom:** `baseline-audit.ts` and `gate-phase-1-samples.ts` opened with
`SET default_transaction_read_only = on`. `DATABASE_URL` points at Supabase's Transaction
Pooler (pgbouncer, port 6543), which keeps the physical backend alive between clients, so
that session-scoped setting outlived the process and landed on whichever connection the next
one borrowed. Every write in the application then failed until the backend was recycled.

**Fix:** both scripts dropped the `SET` and are now read-only by construction — every
statement is a `SELECT`. Each asserts the backend's mode and warns if it is read-only, which
is how the leak was found. A leaked flag on an existing backend was cleared once.

**Why this mattered enough to fix during a validation prompt:** the "guard" was protecting
against the scripts themselves, at the cost of breaking ingestion process-wide. Read-only
enforcement now lives in review and in the query text, where it cannot escape its process.

### 4.4 A `Date` inside a `sql` template threw on every miss-strike and close

**Found by:** attributing the 399 failing boards in §5 instead of accepting the number. 350 of
them shared one error, and it was not a network or ATS problem at all:

```
update "postings" set "closed_at" = $1, "missing_strikes" = $2, "missing_since" = … ←
The "string" argument must be of type string or an instance of Buffer or ArrayBuffer.
Received an instance of Date  [code=ERR_INVALID_ARG_TYPE]
```

**Root cause.** `drizzle-orm/pg-core/driver.js` overwrites postgres.js's date/time
serializers with an identity function as soon as `drizzle()` is constructed:

```js
const transparentParser = (val) => val;
for (const type of ["1184", "1082", "1083", "1114", "1182", "1185", "1115", "1231"]) {
  client.options.parsers[type] = transparentParser;
  client.options.serializers[type] = transparentParser;
}
```

Drizzle does that because it expects column values to already be in driver form: a typed
binding like `.set({ closedAt: now })` goes through the column's `mapToDriverValue` first and
becomes a string. An untyped `sql` param has no column to read a type from, so it is never
mapped — postgres.js calls the identity serializer, gets the original `Date` back unchanged,
and passes it to its byte writer, which calls `Buffer.byteLength(date)` and throws.

`src/lib/feed.ts` had already been bitten by this and carries a comment about it. The
close lifecycle added in INS-007 did not: all four miss-strike and close statements built
`COALESCE(col, ${now})` with a raw `Date`.

**Why it was so destructive.** A board only fails when at least one listing has gone missing
long enough to earn a strike. For those boards the strike `UPDATE` threw inside the poll
transaction, which rolled back the *entire* poll — no posting refreshed, no miss recorded —
and the separate failure bookkeeping then tripled the backoff each time. The condition was
self-sustaining: the same missing listing threw on the next poll too. Those boards could
never recover on their own, and 349 of 350 had already backed off to the 24-hour ceiling.

**Blast radius at the time of discovery:** 350 boards, 2,997 postings (2,995 open — about 48%
of the open corpus), `last_seen_at` ranging from 2026-08-12 to 2026-09-26. Nothing was closed
incorrectly — the transaction that would have closed a listing was the one that threw — but
stale listings could not be retired either, and the freshness claim in the marketing copy was
carried by roughly half the corpus that was frozen.

**Fix:** `timestamptz()` in the new `src/db/fragments.ts` serializes to ISO text and casts,
so the bound value is a string and the identity serializer has nothing to undo. Applied to
all four sites: `src/lib/ingest/persist.ts` (strike increment, close) and
`src/lib/scholarships/persist.ts` (strike increment, close). Verified two ways: seven cases
in `src/db/fragments.test.ts` build each statement and assert no parameter is a `Date`, and
the previously-throwing statement was executed against the live database (0 rows matched, so
no data changed). An ISO round-trip through the cast preserves the instant to the
millisecond.

**Residual risk:** the constraint is invisible at build time, so the failure mode is a
runtime throw that rolls back a whole poll. The new test asserts it for the exact statements
that broke, but a future `sql` template that interpolates a `Date` is not statically
prevented. `src/db/fragments.ts` documents the rule at the point of use.

**Remediation of the frozen boards.** The code fix only helps on a board's *next* poll, and
349 of the 350 had backed off to the 24-hour ceiling, so `orgsDueForPoll` was not selecting
them. `scripts/reset-stuck-poll-backoff.ts` (new, `--dry-run` supported, idempotent) set
`poll_interval_sec` back to the 1,200 s default for exactly the 350 boards carrying the bug's
error signature, verified afterwards as due immediately. It deliberately does **not** touch
`consecutive_failures`, `last_poll_ok` or `last_poll_error`, so the counters self-heal on the
first genuinely successful poll rather than being zeroed by hand, and it touches **no
`postings` row** — the stale listings are struck and closed by the normal
two-successful-miss lifecycle, which is exactly the guard that stops a bad fetch from closing
a student's results. The 49 `HTTP 404` boards were left at their backoff.

**Expected effect, not yet observed:** those ~2,995 open postings will now be reconciled, so
stale ones will begin closing and the open-corpus count will fall. The before/after numbers in
§2 are pre-remediation; re-run `npm run baseline:audit` after a full poll cycle for the
post-remediation figures.

### 4.5 The corpus is being written by code that does not contain this gate

Found while re-running `npm run baseline:audit` after the §4.4 remediation. Divergence was
back at 2, not 0. Both rows were SFMOMA, `last_seen_at` 20:12, `term_source = inferred`.

**A cron is polling the production database on a schedule** and it runs the *deployed* build,
which is `HEAD` — none of this gate is in it:

| started | tier | source | boards | seen | new | closed | errors |
|---|---|---|---|---|---|---|---|
| 2026-09-27 20:12 | A | ats-direct | 862 | 15,511 | 0 | **0** | 14 |
| 2026-09-27 17:02 | A | ats-direct | 862 | 24,835 | 0 | **0** | 77 |

**Mechanism.** The deployed `persist.ts` writes only the free-text label on an update —
`...(p.term ? { term: p.term } : {})` — and its reopen path likewise writes only `term`
(`detectTerm(title, text)`). It has **no code path that writes `term_season`, `term_year` or
`term_source` at all**; those columns arrived with INS-004 and exist only in this working tree
and in `backfill-terms.ts`. So every deployed poll rewrites the label with the old code's own
derivation while leaving the structured values that the backfill wrote in place. Where the two
derivations disagree, the row diverges. Two SFMOMA listings disagreed at 20:12; the
backfill repaired both (`divergedRepaired: 2`, re-audited to 0), but **the same cron will
reintroduce them** for any row where the two derivations differ, on every poll, until the
working tree is deployed.

**`postings_closed = 0` in both runs** is what §4.4 predicts in production: a strike can never
record, so two consecutive misses can never accumulate, so a close can never fire. A quiet
window is an alternative reading of those two runs, so this is corroborating rather than
conclusive — but the 350 boards' misses are provably lost either way.

**Consequences, stated plainly:**

1. **Every §2 measurement is true when taken and can drift underneath you.** The backfill and
   the audit are both point-in-time. Trust a number only as of the timestamp in the artifact.
2. **The §4.4 backoff reset is not durable until this gate is deployed.** The 350 boards are due
   again, but the deployed strike/close statements still throw, so each will fail again and
   triple its backoff back toward the 24 h ceiling. `reset-stuck-poll-backoff.ts` is
   idempotent, so re-running it after the deploy completes the recovery; no harm is done by
   having run it early.
3. **Nothing in §4 is protecting production yet.** The user-visible consequence of §4.2 is
   neutralized in code but not deployed, so a live card can still show an ended term in
   production.

This is not a reason to reject the gate. It is a reason to treat **deployment as the blocking
step**, and to re-run `npm run baseline:audit` and the sampler after it rather than trusting
today's numbers.

---

## 5. Limitations and follow-ups

- **No browser or e2e harness exists in this repository** — no Playwright, no axe-core, no
  visual-regression tooling. Accessibility and responsive verification for this gate was
  therefore static: exactly one `<h1>` per page, no raw `<img>` (so no missing `alt` text),
  `aria-expanded`/`aria-controls`/`aria-haspopup` on the filter disclosure, an accessible
  name on the active-filter badge, decorative glyphs marked `aria-hidden`, 9 `focus-visible`
  rules and no `outline-none` on the Phase 1 surfaces, and fluid layout (`.wrap` uses
  `padding-inline` + `max-width` + `margin-inline: auto`, with 7 `@media` blocks and
  `flex-wrap` in use; no fixed pixel widths). **Actual rendering at mobile and desktop
  widths has not been observed** and should be confirmed during INS-011A against the
  production build.
- **399 of 1,261 boards are recorded as failing to poll**, and the number now has a
  breakdown rather than being an open worry: **350 were this repository's own bug** (§4.4 —
  code fixed and the stuck backoff reset in this gate) and **49 are `HTTP 404`**, dead or
  renamed ATS board slugs, which is source-registry work belonging to INS-012/INS-016 and is
  deliberately untouched. Worst consecutive-failure run is 40; historical ingest error rate is
  4.08%. The 399 will drop on its own as the reset boards complete their first successful
  poll, since `consecutive_failures` is only cleared by a real success. Until that has
  happened the freshness claim in the copy is carried by only part of the corpus, so re-check
  it against a post-remediation `npm run baseline:audit` before Release A. No Phase 1
  acceptance criterion is breached either way: the liveness guard means a failing board cannot
  close a student's results.
- **A production cron is writing this corpus with code that predates the gate (§4.5).** Nothing
  fixed here is live yet, the term columns are actively at risk of being overwritten by the
  deployed build's own label derivation, and every number in §2 is a point-in-time measurement.
  **Deployment is the blocking step**, after which the audit and sampler must be re-run rather
  than today's numbers trusted.
- **`postings_closed` has been 0 across recent ingest runs.** That is what the §4.4 miss-strike
  throw predicts in production — a strike can never record, so two misses can never accumulate,
  so a close can never fire — but a quiet window is an alternative reading, so treat it as
  corroborating rather than conclusive until confirmed after deploy.
- **The term parser reads whole JDs.** A season mentioned only inside an eligibility window
  is still parsed as an explicit term. §4.2 makes that harmless for display and for the feed,
  but the parser itself remains over-eager; a context-aware pass is worth a later prompt.
- **The 2 unparseable scholarship amounts** are surfaced to students as "amount needs
  review" rather than hidden. They are real source defects and are the correct place to spend
  parser work next.
- **Samples are random per run.** Re-running the generator yields different rows. Every
  invariant asserted above is measured over the full population, so the gate does not depend
  on a particular draw.

---

## 6. Rollback

Nothing was deployed, so there is no live rollback. To undo the data changes in this gate:

**Term backfill** — additive columns only, and the pre-gate values are reconstructible
because `term_raw` preserves the source text that justified each explicit term. To revert to
the pre-backfill state, restore the database from the pre-migration backup taken before
INS-004; the migration itself is additive (`0019_term_model.sql`, `0020_term_sanity_flag.sql`
both use `ADD COLUMN IF NOT EXISTS`) and can be rolled back by dropping those columns, which
would also remove the quarantine flag.

**Code rollback** — all changes are in the working tree and uncommitted. Reverting these
files restores the previous behaviour exactly:

| File | Change |
|---|---|
| `src/lib/terms/display.ts` | added `resolveTermView`, `parseTermLabel` |
| `src/lib/terms/display.test.ts` | 5 added tests |
| `src/lib/terms/parser.ts` | `displayTerm` exported |
| `src/lib/feed.ts` | cards and term filter use the structured term |
| `src/lib/ingest/reconcile.ts` | added `termUpdateForTouch`, `termUpdateForReopen`, `TermUpdate` |
| `src/lib/ingest/reconcile.test.ts` | 8 added tests |
| `src/lib/ingest/persist.ts` | consumes the pure term-merge helpers; `timestamptz()` in the strike and close statements |
| `src/db/fragments.ts` | new; `timestamptz()` and the rule behind it |
| `src/db/fragments.test.ts` | new; 7 tests, no query execution |
| `scripts/reset-stuck-poll-backoff.ts` | new; clears the backoff the bug caused |
| `src/lib/scholarships/persist.ts` | `timestamptz()` in the strike and close statements |
| `scripts/baseline-audit.ts` | divergence + lifecycle evidence, label fix, read-only guard removed |
| `scripts/backfill-terms.ts` | divergence detection and repair |
| `scripts/gate-phase-1-samples.ts` | new; read-only guard removed |

**If Release A must be reverted after deployment:** disable the affected feature or revert
the build, then rerun `npm run baseline:audit` and compare against
`2026-09-27-baseline.md`. The two gate thresholds to watch are unknown-term share (must stay
below 25%) and visible ended terms (must stay at 0). If either breaches, roll back rather
than adjusting the threshold.

---

## 7. Conclusion

**INS-011 STATUS: PASS.** All ten acceptance criteria are met with evidence, the corpus moved
from 84.0% unknown terms to 0.0% with zero ended terms visible, and the two data-integrity
defects found while sampling are fixed at both the read boundary and in the stored data. The
one unverified item — visual rendering at mobile and desktop widths — is disclosed in §5
rather than claimed, and belongs to INS-011A.

**PASS is a statement about the working tree, not about production.** §4.5 established that a
cron is writing this corpus with the pre-gate build, so nothing fixed here is live yet and the
measured numbers are point-in-time. The gate is passed and complete; **deploying it is the next
step, and the audit plus sampler should be re-run afterwards** to confirm the corpus still meets
§2 once the fixed code is the code doing the writing.

**Next eligible prompt:** INS-011A — Release A: publish the trust sprint to instela.org. It
requires the Section 3A confirmation popup and a named target; nothing goes live without an
explicit yes.
