# Instela Market-Ready Execution Ledger

**Purpose:** Track every `INS-###` prompt from `INSTELA_MARKET_READY_MASTER_IMPLEMENTATION_PLAN.md` through completion.  
**Updated:** 2026-09-27

## Legend

- `PASS` — acceptance criteria met with evidence.
- `PARTIAL` — some work exists, but at least one acceptance criterion is not yet demonstrated.
- `BLOCKED` — cannot proceed without an external decision, credential, permission, or upstream fix.
- `NOT STARTED` — no implementation yet.
- `ALREADY SATISFIED` — the requirement is already met by existing code/tests.
- `NON-BLOCKING` — post-launch work; not required for first paying student.

---

## Phase 0 — Baseline and execution control

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-001 | Map the real system and create the execution ledger | **PASS** | 2026-09-23 | Created `docs/instela-market-ready/system-map.md`, `execution-ledger.md`, `report-requirements-traceability.md`. Repository inspected; no behavior changed. Tests pass: `npm test` → 768 pass / 0 fail (see Evidence section). |
| INS-002 | Establish repeatable data-quality baseline | **PASS** | 2026-09-23 | Added `scripts/baseline-audit.ts`, `npm run baseline:audit`, and artifact `docs/instela-market-ready/baselines/2026-09-23-baseline.md`. Script sets read-only session, runs only SELECTs, and redacts personal data. Ran successfully against live DB: 6,027 open / 6,117 tracked, 84.0% missing/unknown term, 14 past-term listings, 2 amount-needs-review, 0 marketing in top 10, 8/10 incomplete profiles, DEV unlock configured. Tests still pass (768/0). |
| INS-003 | Install phased validation and rollback harness | **PASS** | 2026-09-23 | Added `src/lib/market-ready/fixtures.ts`, `redact.ts`, `flags.ts`, `smoke.test.ts`; `docs/instela-market-ready/runbook.md`; `docs/instela-market-ready/release-gates.md`. Fixtures cover required term/amount/trust/lifecycle/profile cases; smoke test validates fixtures, redaction, flags default off, and existing domain functions accept fixtures. Rollout flags default safely off and are server-controlled. Tests pass: 778/0. |

## Phase 1 — Trust sprint

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-004 | Term parser (explicit/inferred/unknown) | **PASS** | 2026-09-24 | Added `term_source` (`explicit`/`inferred`/`unknown`), `term_season`, `term_year`, `term_raw` to `postings`. Created deterministic parser in `src/lib/terms/parser.ts` with full boundary tests (`src/lib/terms/parser.test.ts`). Wired into `preparePosting`/`applyDescription` in `src/lib/ingest/*`; explicit terms are used for stable `canonicalHash`, and inferred terms are never allowed to overwrite explicit ones. Migration `src/db/migrations/0019_term_model.sql` created and journal updated. `npm run check` passes: typecheck, lint, 801 tests. |
| INS-005 | Term backfill/UX | **PASS** | 2026-09-24 | Added `term_ended_flag_at` (`0020_term_sanity_flag.sql`) and `src/lib/terms/bounds.ts` for deterministic term windows. Backfilled all 6,084 open postings with `npm run backfill:terms` (702 explicit, 5,382 inferred, 0 unknown, 41 flagged). Feed now hides ended-term rows by default (`isNull(termEndedFlagAt)`), exposes `termSource/termSeason/termYear`, and supports `includeInferred` filter. `getAvailableTerms` omits past terms. `PostingRow` and listing detail render inferred terms with `(inferred)` label. Ingest writes `termEndedFlagAt` on insert/touch/reopen/description backfill; explicit terms never overwritten. Tests added: `bounds.test.ts`, `display.test.ts`; parser tests already exist. `npm run check`: 818 tests pass. `npm run baseline:audit`: 0 missing/unknown term, 3 past-term listings (0.05%). `npm run build` succeeds. |
| INS-006 | Award amounts | **PASS** | 2026-09-25 | Replaced min/max-only model with four-field award representation (`amount_per_award`, `awards_count`, `program_total`, `amount_status`, `amount_is_estimated`). Migration `0021_award_fields.sql` applied and `amount_status` set `NOT NULL`. Parser rewritten in `src/lib/scholarships/amount.ts` with `exact/range/varies/unparseable` statuses, explicit total/count handling, and `$0.00`/`Varies`/`unparseable` rules. Display helper `formatAward` added; feed selects new columns and supports `includeUnknownAmounts` filter. UI updated in `FilterPanel`, `PostingRow`, and listing detail. Adapters (`cftexas`, `unl`, `unr`, `iup`, `scholarshipscom`, `scholarshipportal`) and `persist.ts` write new columns. Score function ignores `varies`/`unparseable` for amount scoring. Backfilled all scholarships with `npm run backfill:amounts` (344 exact, 14 range, 3 unparseable, 1,645 unchanged). `npm run check` passes (827 tests), `npm run build` succeeds, `npm run baseline:audit` shows amount status distribution. See INS-006 completion evidence below. |
| INS-007 | Close lifecycle (two-successful-miss) | **PASS** | 2026-09-25 | Replaced one-shot scholarship close with shared two-successful-miss lifecycle in `src/lib/lifecycle.ts`, used by both `src/lib/ingest/reconcile.ts` and `src/lib/scholarships/close.ts`. `closed_at` is now the first-miss time, `missing_since` is stamped on first miss, and missed rows reset on return. Failed/partial polls are blocked via `successfulComplete` flag in `FetchBoardResult` and `PersistPollOptions`. Reopens clear `missingStrikes`/`missingSince` and emit a `listing_reopened` event. Migration `0022_close_lifecycle.sql` applied; historical `closed_at` values invented no timestamps. Tests added: `lifecycle.test.ts`, updated `reconcile.test.ts`, `close.test.ts`. `npm run check` passes (843 tests), `npm run build` succeeds, `npm run baseline:audit` updated. See INS-007 completion evidence below. |
| INS-008 | Profile fit gate | **PASS** | 2026-09-25 | Added four-field readiness rule (`isProfileReadyForFit`, `missingFitFields`) in `src/lib/profile/types.ts`. Gated `presentFit` behind `profileReady`; blocked conflicts show "Check eligibility". Hard-gated high-confidence location and education-level conflicts in `scoreFit`. Added feed CTA "Add 4 details to score your feed" with dynamic missing fields and return-to-feed flow. Added `profile_activated` event + `profiles.activated_at` column; activation emitted on first save when four fields complete. Added `activatedProfiles` metric. Migration `0023_profile_activation.sql` applied. `npm run check` passes (852 tests), `npm run build` succeeds, `npm run baseline:audit` updated. See INS-008 completion evidence below. |
| INS-009 | Trust/marketing awards | **PASS** | 2026-09-25 | Added `trust_score`, `trust_reasons`, `is_lottery`, `lottery_reasons`, `corroboration_count` to `postings` (`0024_scholarship_trust.sql`). Built deterministic v1 trust classifier in `src/lib/scholarships/trust.ts` with exported `TRUST_CONFIG` and stored reasons. Wired assessment into `src/lib/scholarships/persist.ts` so every scholarship ingest recomputes trust and corroboration count from `posting_sources`. Updated `scoreScholarshipFit` to exclude lottery/content-marketing rows from the misleading "competition" dimension. Added bounded trust penalty to `sortKey` in `src/lib/feed.ts`. Added UI badges in `PostingRow` and a warning block + meta rows in listing detail. Added a separate "lottery-style awards" shelf on the feed via `getLotteryAwards`. Added law-firm, rehab, credible-association, and corroborated fixtures; updated `smoke.test.ts`. Added `scripts/backfill-trust.ts` and backfilled all 2,006 existing scholarship rows. Updated `baseline-audit.ts` to report trust/lottery in the scholarship top 10. `npm run check` passes (863 tests), `npm run build` succeeds, `npm run db:migrate` applies `0024_scholarship_trust.sql`, `npm run baseline:audit` updated. See INS-009 completion evidence below. |
| INS-010 | Public trust cleanup | **PASS** | 2026-09-25 | Standardized Free ranked-match limit to 20 across code, homepage, pricing, tier description, and baseline audit (`FREE_DAILY_RESULTS = 20`). Disabled dev mode in production builds via `devModeAllowed` in `dev-tier.ts`; `/dev` now 404s in production and nav/pricing dev banners are hidden. Replaced homepage hero with the report-proposed test candidate "Internships the day they open. Scholarships you can actually win." + "Every listing checked at the source. Your data is never sold." and added `/how-we-verify` page. Updated `system-map.md` R2 issue tracker and `report-requirements-traceability.md`. `npm run check` passes (864 tests), `npm run build` succeeds, `npm run baseline:audit` updated. See INS-010 completion evidence below. |
| INS-011 | Trust gate | **PASS** | 2026-09-27 | Gate document `docs/instela-market-ready/gates/phase-1-trust-gate.md` with criterion-by-criterion evidence, before/after numbers, commands, and rollback. Baselines: `2026-09-23-baseline.md` → `2026-09-27-baseline.md`. New read-only sampler `scripts/gate-phase-1-samples.ts` → `gates/phase-1-samples.md` (20 listings across 6 sources, 20 scholarships across all 4 amount statuses, 10 profiles, live default top 10, every ended-term row). All 10 acceptance criteria PASS: unknown term share 84.0% → **0.0%**; visible ended terms 14 → **0**; stored `$0` = 0; no fit label without all 4 profile fields; marketing in default top 10 = 0 with lottery awards on a separate shelf; free limit copy consistently 20; no production dev unlock or client-side paid grant; closure/reopen tests pass; outcome/freshness/privacy copy reviewed. `npm run check` passes (**884 tests, 0 fail**), `npm run build` succeeds (22 routes). Fixed four trust-sprint regressions found while sampling: (1) list-only polls erasing an ended-term quarantine — the rule is now the pure `termUpdateForTouch`/`termUpdateForReopen` in `reconcile.ts` that `persist.ts` consumes, covered by 8 new tests; (2) label/structure divergence letting a live card display an already-ended term — new `resolveTermView`/`parseTermLabel` in `src/lib/terms/display.ts` make the structured season/year authoritative at the read boundary, and `backfill-terms.ts` repaired 9 divergent rows (divergence now 0, no rows hidden); (3) `SET default_transaction_read_only` in the audit scripts leaking through Supabase's Transaction Pooler and breaking every write — removed from both scripts, which are now read-only by construction; (4) **a raw `Date` interpolated into a drizzle `sql` template threw `ERR_INVALID_ARG_TYPE` on every miss-strike and close**, rolling back the whole poll for any board with a stale listing — `drizzle-orm` replaces postgres.js's date serializers with an identity function, so untyped `sql` params are never mapped; new `timestamptz()` in `src/db/fragments.ts` fixes all four call sites, with 7 tests. Bug (4) had silently frozen **350 boards / 2,995 open postings (~48% of the corpus)**; only 1 was due for retry, the rest backed off to the 24 h ceiling, so `scripts/reset-stuck-poll-backoff.ts` reset the interval on all 350 (counters left alone to self-heal, no `postings` row touched). Known limitation: the repo has no browser/e2e/a11y harness, so accessibility and responsive checks were static only; visual confirmation is deferred to INS-011A. Nothing deployed, no flag activated — but the configured database **was** written to by the backfills, so its staging-vs-production status must be confirmed before INS-011A. See INS-011 completion evidence below. |
| INS-011A | Release A — publish the trust sprint | **PASS** | 2026-09-28 | Section 3A popup shown, answered **Yes**. Released commit `ae01fcf` to production in order: push to `origin/master` (crons now run the fixed code), Vercel production deploy `project-o66x1-w61pkwkik` (`/how-we-verify` 404 → 200; a push does **not** auto-deploy — closes INS-001 item 8's open question), and the idempotent backoff reset (356 boards due). **No migrations ran** (25/25 already applied); **no backfills ran at release** per the popup. Post-deploy audit (2026-09-28-baseline.md): unknown terms 0.0%, visible past-term **0**, divergence **0** (16 rows the old code's final 16:48 run diverged were repaired by a second owner-approved `backfill-terms.ts` run), false `$0` 0, marketing in top 10 0, free limit 20 verified live, no dev unlock. Live smoke: homepage 200, listing page renders the structured term over a stale label. Full record: `docs/instela-market-ready/releases/release-a.md`. **Recovery in progress, not instant:** 405 boards recorded failing (356 date-bug victims, now due; 49 `HTTP 404` dead slugs for INS-012/016); `consecutive_failures` clears only on real success and GitHub's scheduler drops high-frequency crons under load, so watch `ingest-status` and expect `postings_closed` to move off 0. Visual rendering at mobile/desktop widths remains unverified (no browser/e2e tooling in repo). |

## Phase 2 — Verified-data spine

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-012 | Source registry / provenance model | PARTIAL | — | `organizations` + `posting_sources` give source identity; no formal approval/robots/terms/crawler registry. |
| INS-013 | Shared idempotent ingestion state machine | PARTIAL | — | `src/lib/ingest/*` provides reconciler/persister; no explicit `successful_complete`/`partial`/`failed` contract typed across adapters. |
| INS-014 | Polling cadence / observability | PARTIAL | — | `ingestRuns`, `pollIntervalSec`, `npm run ingest:status` exist; cadences do not match report tiers. |
| INS-015 | GitHub audit / data-spine gate | PARTIAL | — | `src/lib/github/*` audit exists; caching is ~15 min via Next fetch, not report's 24 h. |

## Phase 3 — Coverage expansion

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-016 | Source approvals / seed registries | NOT STARTED | — | No AcademicWorks/Workday seed registry. |
| INS-017 | AcademicWorks adapter | NOT STARTED | — | — |
| INS-018 | Scholarship dedupe / corroboration | NOT STARTED | — | — |
| INS-019 | AcademicWorks release (50 portals) | NOT STARTED | — | — |
| INS-020 | Workday adapter | NOT STARTED | — | — |
| INS-021 | Workday release (100 employers) | NOT STARTED | — | — |
| INS-022 | USAJOBS Pathways / Government category | PARTIAL | — | `scripts/ingest-usajobs.ts` exists; not exposed as `Government` category; not on 6-hour polling. |
| INS-023 | Coverage expansion gate | NOT STARTED | — | — |

## Phase 4 — Eligibility, competition, and ranking

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-024 | Structured eligibility extraction | PARTIAL | — | `postings.eligibility` jsonb and `workAuth` detection exist; no evidence/confidence schema per constraint. |
| INS-025 | Deterministic eligibility evaluator | NOT STARTED | — | Current fit scoring does some hard blocking but not a structured eligibility evaluator. |
| INS-026 | Competition score v1 | PARTIAL | — | Scholarship Fit Score has competition dimension; internship competition estimate not built. |
| INS-027 | Ranking engine (report formula) | NOT STARTED | — | Current ranking in `src/lib/feed.ts` is fit/timing/relevance blend, not 0.35/0.25/0.20/0.10/0.10. |
| INS-028 | Ranking UX / gate | NOT STARTED | — | — |

## Phase 5 — Free/Pro, alerts, and billing

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-029 | Server-side entitlements | PARTIAL | — | `src/lib/pricing/tiers.ts` + `entitlements.ts` provide feature matrix; only `free`/`apply` tiers; no trial/refund/cancel states. |
| INS-030 | Free weekly digest | PARTIAL | — | `src/lib/digest/*` + `scripts/send-digest.ts` exist, but digest is currently paid-only. |
| INS-031 | Pro instant alerts | PARTIAL | — | Saved-search alerts exist; not Pro-only instant new-listing alerts. |
| INS-032 | Stripe billing | NOT STARTED | — | No Stripe integration; `TIER_PRICE_USD.apply = 5.99` is display-only. |
| INS-033 | Trial/upgrade moments | NOT STARTED | — | — |
| INS-034 | Usage limits | PARTIAL | — | `feature_usage` + `consumeUsage` meters tools; tracker cap is 5 (report wants 10); counters are lifetime (report wants monthly). |
| INS-035 | Pricing/account UX | PARTIAL | — | `/pricing` page exists; no checkout, billing management, refund flow. |
| INS-036 | Pro core / billing gate | NOT STARTED | — | — |

## Phase 6 — Historical moat and saved effort

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-037 | First-seen recruiting-cycle history | NOT STARTED | — | `recruiting_cycles` table exists but is curated, not derived from first-seen history. |
| INS-038 | Opening Soon prediction | NOT STARTED | — | — |
| INS-039 | Opening Soon calendar / watchlist | NOT STARTED | — | — |
| INS-040 | Essay answer bank | NOT STARTED | — | — |
| INS-041 | Email-forward auto-tracking | NOT STARTED | — | — |
| INS-042 | Weekly five-application triage | NOT STARTED | — | — |
| INS-043 | Outcomes / moat gate | NOT STARTED | — | — |

## Phase 7 — Business vertical and growth hooks

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-044 | Business vertical | NOT STARTED | — | `recruiting_cycles` covers IB/consulting cycles; no Business feed taxonomy. |
| INS-045 | Proprietary SEO pages | NOT STARTED | — | — |
| INS-046 | Delayed community alert feed | NOT STARTED | — | — |
| INS-047 | Referral loop | NOT STARTED | — | — |
| INS-048 | Semester recap / share card | NOT STARTED | — | — |
| INS-049 | University of Utah pilot | NOT STARTED | — | — |
| INS-050 | Partnerships / growth gate | NOT STARTED | — | — |

## Phase 8 — Market readiness and release

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-051 | Analytics / measurement system | PARTIAL | — | `events` + `metrics` exist; definitions do not match report's activation/D7/CTR/D35/churn exactly. |
| INS-052 | Trust/claims audit | NOT STARTED | — | — |
| INS-053 | Launch hardening | NOT STARTED | — | — |
| INS-054 | Staging release candidate | NOT STARTED | — | — |
| INS-055 | Production release | NOT STARTED | — | Explicit deployment prompt; requires user instruction and named target. |

## Phase 9 — Post-launch backlog (non-blocking)

| ID | Short name | Status | Date | Evidence / notes |
|---|---|---|---|---|
| INS-056 | Autofill verification | NOT STARTED | — | Extension exists but not end-to-end verified. NON-BLOCKING. |
| INS-057 | Long-tail ATS adapters | NOT STARTED | — | NON-BLOCKING. |
| INS-058 | Curated/association awards | NOT STARTED | — | NON-BLOCKING. |
| INS-059 | State/community sources + submissions | NOT STARTED | — | NON-BLOCKING. |
| INS-060 | Permissioned partner feeds | NOT STARTED | — | NON-BLOCKING. |
| INS-061 | Outcome-based calibration | NOT STARTED | — | NON-BLOCKING. |
| INS-062 | $7.99 price experiment | NOT STARTED | — | NON-BLOCKING. |
| INS-063 | B2B2C discovery | NOT STARTED | — | NON-BLOCKING. |

---

## INS-001 completion evidence

- **Test command:** `npm test`
- **Result:** 768 tests passed, 0 failed, 0 skipped, 92 suites, ~2.6 s.
- **Files created:**
  - `docs/instela-market-ready/system-map.md`
  - `docs/instela-market-ready/execution-ledger.md`
  - `docs/instela-market-ready/report-requirements-traceability.md`
- **Behavior/schema/config changes:** None.
- **Rollback:** Delete the three files if needed.
- **Risks / follow-ups:** None. Next eligible prompt is INS-002.

---

## INS-005 completion evidence

- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, 818 tests pass, 0 fail, 0 skip.
- **Build command:** `npm run build`
- **Result:** production build succeeds.
- **Data-quality command:** `npm run baseline:audit`
- **Result:** 6,084 open / 6,174 tracked, 0 missing/unknown term (0.0%), 3 past-term listings (0.05%). Artifact: `docs/instela-market-ready/baselines/2026-09-24-baseline.md`.
- **Backfill command:** `npm run backfill:terms -- --batch-size 1000`
- **Result:** 6,084 open rows processed: 702 explicit, 5,382 inferred, 0 unknown, 41 ended-term flags.
- **Files created/modified:**
  - `src/lib/terms/bounds.ts` + `bounds.test.ts`
  - `src/lib/terms/display.ts` + `display.test.ts`
  - `src/lib/ingest/reconcile.ts` / `persist.ts` — term-ended flag writes, explicit-term protection
  - `src/lib/feed.ts` — term fields, `includeInferred`, past-term filter
  - `src/app/page.tsx`, `src/components/FilterPanel.tsx`, `src/components/PostingRow.tsx`, `src/app/listing/[id]/page.tsx` — term provenance UX
  - `scripts/backfill-terms.ts`
  - `src/db/migrations/0020_term_sanity_flag.sql`
- **Behavior/schema/config changes:**
  - Adds `postings.term_ended_flag_at` column.
  - Backfills `term_source`/`term_season`/`term_year`/`term_raw` for all open postings.
  - Default feed hides rows whose term has ended; filter dropdown hides past terms.
  - Inferred terms are labelled; can be excluded with a checkbox.
- **Rollback:** Re-run backfill with `--all` is idempotent; migrations cannot be reverted without a down migration. To undo UI changes, revert the commits/files above.
- **Risks / follow-ups:**
  - 41 rows flagged as ended-term remain hidden from the default feed; monitor whether legitimate evergreen listings are being flagged and refine `isTermEnded` bounds if needed.
  - Next eligible prompt is **INS-006**.

---

## INS-006 completion evidence

- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, 827 tests pass, 0 fail, 0 skip.
- **Build command:** `npm run build`
- **Result:** production build succeeds.
- **Data-quality command:** `npm run baseline:audit`
- **Result:** 6,084 open / 6,174 tracked; amount status — exact 300, range 12, varies 1,604, unparseable 2; zero/needs-review amounts 0 / 2. Artifact: `docs/instela-market-ready/baselines/2026-09-25-baseline.md`.
- **Backfill command:** `npm run backfill:amounts -- --batch-size 1000`
- **Result:** 2,006 scholarship rows processed: 344 exact, 14 range, 3 unparseable, 1,645 unchanged.
- **Migration / schema changes:**
  - `src/db/migrations/0021_award_fields.sql` adds `amount_status`, `program_total`, `awards_count`, `amount_is_estimated`.
  - Applied `ALTER TABLE postings ALTER COLUMN amount_status SET NOT NULL` after backfill.
- **Files created/modified:**
  - `src/lib/scholarships/amount.ts` + `amount.test.ts` — parser and tests.
  - `src/lib/scholarships/display.ts` + `display.test.ts` — `formatAward` helper.
  - `src/lib/scholarships/types.ts`, `persist.ts`, `cftexas.ts`, `unl.ts`, `unr.ts`, `iup.ts`, `parse.ts` — column wiring.
  - `src/lib/feed.ts` — new columns, `includeUnknownAmounts`, `minAmount` filter logic.
  - `src/app/page.tsx`, `src/components/FilterPanel.tsx`, `src/components/PostingRow.tsx`, `src/app/listing/[id]/page.tsx` — filter and display UX.
  - `src/lib/score/scholarship-fit.ts` — amount status-aware scoring.
  - `src/lib/compare.ts`, `src/lib/cover-letter/context.ts`, `src/lib/market-ready/fixtures.ts` — downstream updates.
  - `scripts/backfill-amounts.ts` — idempotent amount backfill.
  - `scripts/baseline-audit.ts` — amount-status metrics.
- **Behavior changes:**
  - `$0.00` and `Varies` are stored as `varies`, never a zero-dollar award.
  - Malformed/unparseable monetary text is stored as `unparseable`, never `$0`.
  - Program totals are stored separately; per-award amounts are estimated only when the source gives both total and count.
  - The default `minAmount` filter excludes `varies` and `unparseable` rows; a checkbox includes them.
  - UI renders exact amounts, ranges, estimated amounts with `(est.)`, program totals, counts, `Amount varies`, and `Amount not stated` honestly.
- **Rollback:** Migrations cannot be reverted without a down migration; the backfill is idempotent. Revert UI/parser changes by reverting the relevant commits/files.
- **Risks / follow-ups:**
  - 2 rows remain `unparseable`; monitor parser failures and refine patterns as new source formats appear.
  - Next eligible prompt is **INS-007**.

---

## INS-007 completion evidence

- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, 843 tests pass, 0 fail, 0 skip.
- **Build command:** `npm run build`
- **Result:** production build succeeds.
- **Migration command:** `npm run db:migrate`
- **Result:** `0022_close_lifecycle.sql` applied successfully against live DB.
- **Data-quality command:** `npm run baseline:audit`
- **Result:** baseline artifact `docs/instela-market-ready/baselines/2026-09-25-baseline.md` updated.
- **Files created/modified:**
  - `src/lib/lifecycle.ts` + `lifecycle.test.ts` — shared two-miss transition engine.
  - `src/lib/ingest/reconcile.ts` — uses lifecycle, adds `successfulComplete`, tracks `missingSince`.
  - `src/lib/ingest/persist.ts` — writes `missing_since` on first miss, `closed_at = first-miss time`, clears misses on reopen, records `listing_reopened` event.
  - `src/lib/ingest/poll.ts`, `src/lib/ingest/types.ts` — `successfulComplete` flag on `FetchBoardResult`.
  - `src/lib/ingest/reconcile.test.ts` — state-transition tests including failed poll.
  - `src/lib/scholarships/close.ts` + `close.test.ts` — scholarship lifecycle plan and tests.
  - `src/lib/scholarships/persist.ts` — applies lifecycle before upsert, reopens closed rows that return as open, records events.
  - `scripts/ingest-scholarships.ts` — logs reopened count.
  - `src/db/schema.ts` — added `listing_reopened` to `EVENT_NAMES`.
  - `src/db/migrations/0022_close_lifecycle.sql` + journal entry.
  - `scripts/ingest-dryrun.ts` — added `missingSince` to simulated existing rows.
  - `src/lib/market-ready/smoke.test.ts` — updated `selectPostingsToClose` call to new shape.
- **Behavior changes:**
  - Internships and scholarships both require two consecutive successful complete misses before closing.
  - `closed_at` represents the first miss, not the crossing observation.
  - Failed/partial polls do not advance misses or close rows.
  - A row that returns after a miss has its strike counter cleared.
  - A closed row that reappears is reopened exactly once and emits a `listing_reopened` event.
  - Empty snapshots still suppress closes/misses for scholarships.
- **Rollback:** Re-run `0022_close_lifecycle.sql` is idempotent for counters; the lifecycle logic can be reverted by reverting the relevant files. Migrations cannot be reverted without a down migration.
- **Risks / follow-ups:**
  - Adapters currently default `successfulComplete` to `true`; future adapter work should explicitly set it false on partial pagination or parser failure.
  - Next eligible prompt is **INS-008**.

---

## INS-008 completion evidence

- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, 852 tests pass, 0 fail, 0 skip.
- **Build command:** `npm run build`
- **Result:** production build succeeds.
- **Migration command:** `npm run db:migrate`
- **Result:** `0023_profile_activation.sql` applied successfully against live DB; existing qualifying profiles backfilled with `activated_at`.
- **Data-quality command:** `npm run baseline:audit`
- **Result:** baseline artifact `docs/instela-market-ready/baselines/2026-09-25-baseline.md` updated.
- **Files created/modified:**
  - `src/lib/profile/types.ts` + `profile.test.ts` — `isProfileReadyForFit`, `missingFitFields`, and tests for all four required fields.
  - `src/lib/profile/activation.ts` — `maybeRecordActivation`, `isActivated`, `countActivatedProfiles`.
  - `src/lib/pricing/tiers.ts` + `tiers.test.ts` — `presentFit` now requires `{ profileReady }`; added `check` bucket for "Check eligibility".
  - `src/components/ScoreBadge.tsx` — renders "Check eligibility" without paywall lock icon.
  - `src/lib/score/fit.ts` + `score.test.ts` — term-after-graduation and non-remote location mismatch now set `blocking: true`.
  - `src/app/page.tsx` — computes `profileReady` for signed-in and signed-out visitors; shows "Add N details to score your feed" CTA with missing fields; passes readiness into `PostingRow`.
  - `src/components/PostingRow.tsx` — accepts `profileReady` and passes it to `presentFit`.
  - `src/app/listing/[id]/page.tsx` — computes `profileReady` and gates `presentFit` on listing detail.
  - `src/lib/compare.ts` + `src/app/compare/page.tsx` — `buildComparison` accepts `profileReady`; compare page computes and passes it.
  - `src/app/profile/page.tsx` + `ProfileEditor.tsx` + `actions.ts` — supports `?next=/` return path; redirects to feed after save when requested.
  - `src/app/tracker/actions.ts` — calls `maybeRecordActivation` after a successful status save.
  - `src/lib/metrics/store.ts` + `src/lib/metrics/types.ts` — added `activatedProfiles` metric.
  - `src/db/schema.ts` — added `profiles.activated_at` and `profile_activated` to `EVENT_NAMES`.
  - `src/db/migrations/0023_profile_activation.sql` + journal entry.
- **Behavior changes:**
  - Fit labels (Strong Fit / Good Fit / Low Fit) and numeric fit scores are no longer shown unless the viewer has major, graduation year, work authorization, and a target location/state.
  - Signed-out visitors with all four query parameters are treated as ready; otherwise labels are suppressed.
  - High-confidence location mismatches and terms after graduation are marked `blocked` and shown as "Check eligibility", never Strong Fit.
  - The feed shows a single CTA prompting completion, lists remaining fields, and routes through `/profile?next=/` to return to the feed after saving.
  - A `profile_activated` event is emitted exactly once per user, only when all four fields are present and at least one posting is saved.
  - Operator metrics now report `activatedProfiles` as the R9 activation count.
- **Rollback:** Revert the files above; the migration adds a nullable column and can be dropped with a down migration if needed.
- **Risks / follow-ups:**
  - "State" is currently approximated by any non-empty `target_locations` list; exact state/county/school extraction is INS-024.
  - Next eligible prompt is **INS-009**.

---

## INS-009 completion evidence

- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, 863 tests pass, 0 fail, 0 skip.
- **Build command:** `npm run build`
- **Result:** production build succeeds.
- **Migration command:** `npm run db:migrate`
- **Result:** `0024_scholarship_trust.sql` applied successfully against live DB.
- **Backfill command:** `npx tsx scripts/backfill-trust.ts`
- **Result:** 2,006 existing scholarship rows updated with `trust_score`, `trust_reasons`, `is_lottery`, `lottery_reasons`, and `corroboration_count`.
- **Data-quality command:** `npm run baseline:audit`
- **Result:** baseline artifact `docs/instela-market-ready/baselines/2026-09-25-baseline.md` updated with a new "Scholarship default top 10 trust" section.
- **Files created/modified:**
  - `src/lib/scholarships/trust.ts` + `trust.test.ts` — deterministic v1 trust classifier with exported `TRUST_CONFIG`, stored reasons, lottery detection, and corroboration signal.
  - `src/lib/scholarships/persist.ts` — computes `assessTrust` and distinct-source count after every scholarship chunk upsert; writes trust/lottery/corroboration columns.
  - `src/lib/score/scholarship-fit.ts` — lottery and content-marketing rows now return `value: null` for the competition dimension instead of a misleading score.
  - `src/lib/feed.ts` — `FeedItem` carries trust/lottery/corroboration; `sortKey` applies a bounded penalty for scholarship rows with `trust_score < 50`; added `getLotteryAwards` for the separate shelf.
  - `src/components/PostingRow.tsx` — shows "lottery / sweepstakes", "low trust", and "listed by N sources" badges for scholarships.
  - `src/app/listing/[id]/page.tsx` — shows lottery type, trust meta rows, and a warning block with the stored reasons.
  - `src/app/page.tsx` — fetches and renders the "lottery-style awards" shelf below the main feed.
  - `src/lib/market-ready/fixtures.ts` + `smoke.test.ts` — added law-firm, rehab, credible-association, and corroborated scholarship fixtures; smoke tests assert trust behavior.
  - `scripts/backfill-trust.ts` — re-derives trust/lottery/corroboration for every existing scholarship row.
  - `scripts/baseline-audit.ts` — added scholarship top-10 trust/lottery report.
  - `src/db/schema.ts` + `src/db/migrations/0024_scholarship_trust.sql` + `_journal.json`.
- **Behavior changes:**
  - Scholarships now carry a 0–100 `trust_score` and a list of human-readable `trust_reasons`.
  - Lottery/sweepstakes awards are detected from source text, excluded from the competition fit dimension, and surfaced on a separate "lottery-style awards" shelf.
  - Marketing awards (law firms, rehab/SEO sponsors, minimal-requirement awards) receive a lower trust score and are down-ranked in the default feed by a bounded penalty.
  - Corroboration across independent source portals is counted and shown as a positive signal.
  - Every visible warning (low trust / lottery) has a stored reason, and the classifier configuration is exported for review.
- **Rollback:** Revert the files above; the migration adds nullable/defaulted columns and can be dropped with a down migration if needed.
- **Risks / follow-ups:**
  - The v1 classifier is deterministic heuristics, not an LLM; future work can add LLM-derived signals with provenance metadata.
  - Corroboration count is currently derived from distinct `posting_sources.source` values; deduplication quality depends on source normalization.
  - Next eligible prompt is **INS-010**.

---

## INS-010 completion evidence

- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, 864 tests pass, 0 fail, 0 skip.
- **Build command:** `npm run build`
- **Result:** production build succeeds; `/how-we-verify` is generated, `/dev` route still exists but 404s at runtime in production.
- **Data-quality command:** `npm run baseline:audit`
- **Result:** baseline artifact `docs/instela-market-ready/baselines/2026-09-25-baseline.md` updated.
- **Files created/modified:**
  - `src/lib/feed-trim.ts` — `FREE_DAILY_RESULTS` changed from `10` to `20`; comment updated to match the public promise.
  - `src/app/page.tsx` — homepage hero now reads "Internships the day they open. Scholarships you can actually win." with the subline "Every listing checked at the source. Your data is never sold." and a link to `/how-we-verify`. The free-limit upsell copy now uses `{FREE_DAILY_RESULTS}` instead of the hard-coded word "twenty".
  - `src/app/how-we-verify/page.tsx` — new verification-method page explaining source-of-truth polling, scholarship scraping, timestamps, inferred fields, and the privacy/data-sale stance in student language.
  - `src/lib/pricing/dev-tier.ts` — added `devModeAllowed(nodeEnv)`, which returns `false` for `production`.
  - `src/lib/pricing/dev-session.ts` — `devModeConfigured()` now requires `devModeAllowed()` in addition to `DEV_PASSWORD`; `devTier()` and `devUnlocked()` short-circuit to null/false when dev mode is not configured; `setDevTier()` refuses to issue the cookie when disallowed.
  - `src/app/dev/page.tsx` — calls `notFound()` when `devModeConfigured()` is false.
  - `src/components/chrome/Nav.tsx` + `MobileNav.tsx` — already keyed off `devModeConfigured`, so dev links are hidden in production.
  - `src/app/pricing/page.tsx` — dev-mode banner is hidden when `devModeConfigured` is false.
  - `src/lib/pricing/dev-tier.test.ts` — added test asserting `devModeAllowed("production") === false`.
  - `scripts/baseline-audit.ts` — updated free-limit copy locations to show value `20` with no defects; added `devModeAllowedInProduction` check and note.
  - `docs/instela-market-ready/system-map.md` — updated R2 issues 6, 7, and 8 to "Fixed".
  - `docs/instela-market-ready/report-requirements-traceability.md` — updated R2.6 and Ranked matches rows to `PASS`.
- **Behavior changes:**
  - The Free ranked-match limit is consistently 20 everywhere visible to users and in code.
  - Dev mode cannot be reached in production builds: `/dev` 404s, the nav chip is absent, the pricing banner is absent, and the cookie/env-var paths are inert.
  - The homepage leads with a student outcome and a privacy promise; the ATS mechanics explanation moved to `/how-we-verify`.
  - Unbuilt features remain labeled `coming_soon` via the existing feature-state system.
- **Rollback:** Revert the files above; `FREE_DAILY_RESULTS` can be restored to 10 and the hero can be reverted if the test candidate underperforms.
- **Risks / follow-ups:**
  - The new hero is a test candidate; actual conversion/understanding should be measured before declaring it the winning variant.
  - Next eligible prompt is **INS-011**.

---

## INS-011 completion evidence

- **Status:** PASS. Gate document: `docs/instela-market-ready/gates/phase-1-trust-gate.md`.
- **Test command:** `npm run check`
- **Result:** typecheck passes, lint passes, **884 tests pass, 0 fail** (up from 864 — five for the term-coherence guard, eight for the term-provenance regression, seven for the raw-`Date` binding regression).
- **Build command:** `npm run build`
- **Result:** production build succeeds from a clean `.next` ("Compiled successfully in 14.3s"), 22 routes.
- **Backfill commands (dry run first, per the prompt):**
  - `npx tsx scripts/backfill-terms.ts --dry-run` → 6,252 scanned, 0 failed.
  - `npx tsx scripts/backfill-terms.ts` → 33 explicit, 140 inferred, 27 past-term flagged, **9 divergent labels repaired**, 6,079 unchanged, **0 failed**.
  - `npx tsx scripts/backfill-amounts.ts --dry-run` → ran clean ahead of the term work.
- **Audit command:** `npm run baseline:audit` → `2026-09-27-baseline.md` (rerun of the INS-002 audit).
- **Sample command:** `npx tsx scripts/gate-phase-1-samples.ts` → `gates/phase-1-samples.md`.
- **Before/after (INS-002 audit):**
  | Metric | 2026-09-23 | 2026-09-27 |
  |---|---|---|
  | Open listings | 6,027 | 6,252 |
  | Open, visible missing/unknown term | 5,065 (84.0%) | **0 (0.0%)** |
  | Term provenance explicit / inferred / unknown | n/a / n/a / 5,153 | **712 / 5,540 / 0** |
  | Open visible with a past term | 14 | 3 |
  | Of those visible in the feed | 14 | **0** |
  | Label/structure divergence | 9 (undiagnosed) | **0** |
  | Stored `$0` scholarship amounts | 0 | **0** |
  | Marketing awards in default top 10 | 0 | **0** |
  | Lottery awards in default top 10 | 0 | **0** (separate shelf) |
  | Free-limit copy | 10 in code vs "twenty" in hero | **20 everywhere** |
  | Dev unlock allowed in production | yes | **no** |
- **Acceptance criteria:** all 10 PASS. Unknown term share 0.0% (<25%); zero visible ended terms; zero false `$0` with program totals distinguished; no fit label without all four profile fields; marketing down-ranked and lottery separated; free limit copy consistently 20; no production dev unlock or client-side paid grant; closure/reopen tests pass (8 named lifecycle cases in `src/lib/ingest/reconcile.test.ts`); student copy leads with outcomes, freshness, and privacy.
- **Regressions found and fixed during the gate:**
  1. **Ended-term quarantine erasable by a list-only poll.** Greenhouse/SmartRecruiters omit descriptions from list endpoints, so a list poll re-derived the term from `first_seen`, wrote `inferred` with a null flag, and un-quarantined a correctly flagged row. The rule is now the pure function `termUpdateForTouch`/`termUpdateForReopen` in `src/lib/ingest/reconcile.ts`, which `src/lib/ingest/persist.ts` consumes, so provenance is monotonic and an ended-term flag can only be cleared by a poll that actually saw the term in the source. Covered by 8 new tests.
  2. **A live card could display a term that had already ended.** `postings.term` said `Spring 2025` while `term_season`/`term_year` said `summer`/`2027`; ended-term checks read the structured columns, so the row was current while the card claimed an ended term. Root cause: the only season mention in that JD was inside an eligibility window ("graduation date from Spring 2025 to Fall 2026"), which a whole-JD regex matched. Fixed at the read boundary with `resolveTermView`/`parseTermLabel` in `src/lib/terms/display.ts` (structured season/year are authoritative for display and for the term filter) and in the data by `backfill-terms.ts`, which repairs divergence using the title first and never promotes a JD-only match to `explicit`. 9 rows repaired, none hidden.
  3. **A read-only guard was breaking all writes.** `baseline-audit.ts` and `gate-phase-1-samples.ts` opened with `SET default_transaction_read_only = on`. `DATABASE_URL` uses Supabase's Transaction Pooler (pgbouncer :6543), which keeps the backend alive between clients, so the session GUC outlived the process and made every application write fail with `PreventCommandIfReadOnly` (173/6,252 backfill updates failed). Both scripts now issue only `SELECT`s and warn if the backend is read-only; the leaked flag was cleared once.
  4. **A raw `Date` bound inside a `sql` template threw on every miss-strike and close.** Found by attributing the 399 failing boards instead of accepting the number: 350 of them shared one `ERR_INVALID_ARG_TYPE` error, unrelated to any ATS. `drizzle-orm/pg-core/driver.js` replaces postgres.js's date/time serializers with an identity function, on the assumption that column values arrive already mapped by `mapToDriverValue`. A typed `.set({ closedAt: now })` satisfies that; an untyped `sql` param does not, so postgres.js handed the raw `Date` to its byte writer and `Buffer.byteLength(date)` threw. All four statements built by the INS-007 close lifecycle (`COALESCE(col, ${now})`) hit it. Because the throw happened inside the poll transaction, the whole poll rolled back — no posting refreshed, no miss recorded — while the separate failure bookkeeping tripled the backoff each time, making the condition self-sustaining. `timestamptz()` in the new `src/db/fragments.ts` serializes to ISO text and casts so the bound value is a string; applied to `src/lib/ingest/persist.ts` and `src/lib/scholarships/persist.ts` (strike + close in each), covered by 7 tests, and verified by executing the previously-throwing statement against the live database. `src/lib/feed.ts` had already been bitten by this and carried a comment; the close lifecycle had not.
- **Files created/modified:**
  - `docs/instela-market-ready/gates/phase-1-trust-gate.md` — new; the gate document.
  - `docs/instela-market-ready/gates/phase-1-samples.md` — new; generated sample tables.
  - `docs/instela-market-ready/baselines/2026-09-27-baseline.md` — new; post-gate baseline.
  - `scripts/gate-phase-1-samples.ts` — new; read-only stratified sampler.
  - `scripts/baseline-audit.ts` — added label/structure divergence metric, term-provenance counts, and live miss/failed-poll/partial-poll/close evidence from `ingest_runs` and `organizations` (replacing three "not measurable" rows); corrected the mislabeled `term = NULL` row; removed the leaking read-only `SET`.
  - `scripts/backfill-terms.ts` — added divergence detection/repair and a `divergedRepaired` count.
  - `src/lib/terms/display.ts` — added `resolveTermView` and `parseTermLabel`.
  - `src/lib/terms/display.test.ts` — 5 added tests.
  - `src/lib/terms/parser.ts` — `displayTerm` exported.
  - `src/lib/feed.ts` — cards, term filter, and `getAvailableTerms` use the structured term.
  - `src/lib/ingest/reconcile.ts` — added `termUpdateForTouch` / `termUpdateForReopen` (pure) and `TermUpdate`.
  - `src/lib/ingest/reconcile.test.ts` — 8 added tests for term-provenance monotonicity.
  - `src/lib/ingest/persist.ts` — consumes the pure term-merge helpers; `timestamptz()` in the strike and close statements.
  - `src/lib/scholarships/persist.ts` — `timestamptz()` in the strike and close statements.
  - `src/db/fragments.ts` — new; `timestamptz()` and the written-out reason a raw `Date` cannot be bound in a `sql` template.
  - `src/db/fragments.test.ts` — new; 7 tests that build the failing statements and assert no `Date` param, without executing a query.
  - `scripts/reset-stuck-poll-backoff.ts` — new; `--dry-run` supported, idempotent. Clears the 24 h backoff the bug caused on exactly the 350 affected boards, leaving `consecutive_failures`/`last_poll_ok`/`last_poll_error` alone so they self-heal on the first real success, and touching no `postings` row. Applied: 350 boards reset to the 1,200 s default and confirmed due; the 49 `HTTP 404` boards deliberately left at their backoff.
- **Behavior changes:** a card can no longer display a term that has ended; the term filter control offers exactly the labels cards show; provenance can only improve on ingest; the audit scripts can no longer take down ingestion; **miss-striking and closing work at all**, so stale listings can finally be retired and a recovered board returns to full cadence.
- **Rollback:** no code was deployed, so code rollback is just reverting the listed files. The data change is narrower than a deploy: the backfills wrote only `postings` term/amount/trust columns, and the term columns are additive (`0019`, `0020` use `ADD COLUMN IF NOT EXISTS`); `term_raw` preserves the source text behind each explicit term, and a restore from the pre-INS-004 backup reverts the data. If a future release breaches the two watched thresholds (unknown term share ≥25%, or any visible ended term), roll back rather than adjusting the threshold.
- **Risks / follow-ups:**
  - **The 399 failing-board count will fall on its own.** 350 were this gate's own bug (§4) and their backoff has been reset; `consecutive_failures` is only cleared by a real success, so the number drops as those boards complete their first good poll, and the ~2,995 open postings on them will then be struck and closed by the normal lifecycle. The remaining 49 are `HTTP 404` dead slugs, left alone as source-registry work for INS-012/INS-016. **Open action before Release A:** re-run `npm run baseline:audit` after a full poll cycle and re-check the freshness claim in the copy against the post-remediation corpus.
  - **A production cron is writing this corpus with code that predates the gate — deployment is the blocking step.** Found by re-auditing after the backoff reset: divergence was back at 2, both rows SFMOMA, `last_seen_at` 20:12. `ingest_runs` shows tier-A `ats-direct` runs at 17:02 and 20:12, 862 boards each, `postings_new 0`, **`postings_closed 0`**. The deployed `persist.ts` (HEAD) writes only the free-text label on update (`...(p.term ? { term: p.term } : {})`) and its reopen path likewise writes only `term`; it has no path that writes `term_season`/`term_year`/`term_source`, which exist only in this working tree and `backfill-terms.ts`. So every deployed poll re-derives the label while the structured columns stay, and any row where the two derivations differ diverges again. Repaired once more with `backfill-terms.ts` (`divergedRepaired: 2`, re-audited to 0) but **it will recur on every poll until this gate is deployed**. Two further consequences: (a) the §4 backoff reset is not durable until deploy, because the deployed strike/close still throws and will re-inflate the 350 boards toward the 24 h ceiling — `reset-stuck-poll-backoff.ts` is idempotent, so re-run it after deploying; (b) every §2 acceptance number is true as of its artifact timestamp and can drift, so re-run the audit and sampler after deploy instead of trusting today's figures. The `postings_closed 0` is consistent with the broken miss-strike making closes structurally impossible in production, though a quiet window is an alternative reading, so it is corroborating rather than conclusive.
  - **No browser, e2e, or a11y automation exists in this repo** (no Playwright, no axe-core). Accessibility and responsive checks for this gate were static only — one `<h1>` per page, no raw `<img>`, `aria-expanded`/`aria-controls`/`aria-haspopup` on the filter disclosure, accessible name on the active-filter badge, decorative glyphs `aria-hidden`, 9 `focus-visible` rules, no `outline-none` on Phase 1 surfaces, fluid `.wrap` layout with no fixed pixel widths. **Actual rendering at mobile and desktop widths is unverified** and should be confirmed in INS-011A against the production build.
  - The term parser still reads whole JDs, so a season mentioned only inside an eligibility window is parsed as explicit. §4.2 of the gate makes that harmless for display and for the feed, but a context-aware parser pass is worth a later prompt.
  - The 2 unparseable scholarship amounts are shown to students as "needs review" rather than hidden, and are the best next target for parser work.
  - Next eligible prompt is **INS-011A** (Release A), which requires the Section 3A confirmation popup and a named target. Nothing goes live without an explicit yes.

---

## Prompt index (short names)

| ID | Short name |
|---|---|
| INS-001 | System map |
| INS-002 | Baseline audit |
| INS-003 | Validation harness |
| INS-004 | Term parser |
| INS-005 | Term backfill/UX |
| INS-006 | Award amounts |
| INS-007 | Close lifecycle |
| INS-008 | Profile fit gate |
| INS-009 | Trust/marketing |
| INS-010 | Public trust cleanup |
| INS-011 | Trust gate |
| INS-012 | Source/provenance model |
| INS-013 | Ingestion state machine |
| INS-014 | Cadence/observability |
| INS-015 | GitHub/data gate |
| INS-016 | Source approvals/seeds |
| INS-017 | AcademicWorks adapter |
| INS-018 | Scholarship dedupe |
| INS-019 | AcademicWorks release |
| INS-020 | Workday adapter |
| INS-021 | Workday release |
| INS-022 | USAJOBS Pathways |
| INS-023 | Coverage gate |
| INS-024 | Eligibility extraction |
| INS-025 | Eligibility evaluator |
| INS-026 | Competition v1 |
| INS-027 | Ranking engine |
| INS-028 | Ranking UX/gate |
| INS-029 | Entitlements |
| INS-030 | Weekly digest |
| INS-031 | Instant alerts |
| INS-032 | Stripe billing |
| INS-033 | Trial/upgrade moments |
| INS-034 | Usage limits |
| INS-035 | Pricing/account UX |
| INS-036 | Pro core gate |
| INS-037 | First-seen history |
| INS-038 | Opening prediction |
| INS-039 | Calendar/watchlist |
| INS-040 | Essay answer bank |
| INS-041 | Email auto-tracking |
| INS-042 | Weekly triage |
| INS-043 | Outcomes/moat gate |
| INS-044 | Business vertical |
| INS-045 | Proprietary SEO |
| INS-046 | Community feed |
| INS-047 | Referrals |
| INS-048 | Semester recap |
| INS-049 | Utah pilot |
| INS-050 | Partnerships/growth gate |
| INS-051 | Analytics |
| INS-052 | Trust/claims audit |
| INS-053 | Launch hardening |
| INS-054 | Staging release candidate |
| INS-055 | Production release |
| INS-056 | Autofill verification |
| INS-057 | Long-tail ATS |
| INS-058 | Curated/association awards |
| INS-059 | Local/submitted awards |
| INS-060 | Permissioned feeds |
| INS-061 | Outcome calibration |
| INS-062 | $7.99 test |
| INS-063 | B2B2C discovery |
