# Instela System Map

**Prepared for:** INS-001 — Map the real system and create the execution ledger  
**Date:** 2026-09-23  
**Repo root:** `C:\Users\benne\OneDrive\Desktop\internshipscholarship`

This document is a verified, file-path-level map of the Instela codebase. It was produced by reading `CLAUDE.md`, `README.md`, `HANDOFF.md`, `FIXES.md`, `scholarship-platform-roadmap.md`, `package.json`, `next.config.ts`, `drizzle.config.ts`, `src/db/schema.ts`, and representative files under `src/app/`, `src/lib/`, `scripts/`, `.github/workflows/`, and `extension/`. No code was changed.

---

## 1. Overview and core stack

| Layer | Technology | Key files |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript 5 | `package.json`, `next.config.ts`, `tsconfig.json` |
| Styling | Tailwind CSS v4, custom CSS variables, Space Grotesk + IBM Plex Mono | `postcss.config.mjs`, `public/`, `docs/design-system.md` |
| Database | Supabase Postgres (transaction pooler), Drizzle ORM, `postgres` driver | `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts` |
| Auth | Supabase Auth, magic-link only | `src/lib/auth.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/auth/confirm/route.ts` |
| Hosting | Vercel | `.vercel/`, `.vercelignore` |
| Cron / jobs | GitHub Actions → `tsx scripts/*.ts` | `.github/workflows/*.yml` |
| Browser extension | MV3 Chrome extension | `extension/` |

Test command: `npm run check` runs `typecheck && lint && test`. Unit tests are executed with `tsx --test "src/**/*.test.ts"`.

---

## 2. Frontend

### 2.1 Routes and pages (`src/app/`)

| Route | Purpose |
|---|---|
| `/` | Combined internship + scholarship feed (`src/app/page.tsx`) |
| `/login` | Magic-link sign-in |
| `/auth/confirm` | Confirms magic link token (`src/app/auth/confirm/route.ts`) |
| `/profile` | Profile intake / completion meter |
| `/resume` | Resume editor / upload / print |
| `/tracker` | Application tracker |
| `/compare` | Side-by-side opportunity comparison |
| `/listing/[id]` | Listing detail + cover-letter builder |
| `/listing/[id]/apply` | Apply packet / wizard |
| `/github` | GitHub profile README generator + audit |
| `/linkedin` | LinkedIn headline/About builder + checker |
| `/essay` | Essay/SOP reviewer (browser-only) |
| `/pricing` | Plan comparison |
| `/extension` | Browser-extension install / hand-off |
| `/admin` | Operator triage dashboard (env-allowlisted) |
| `/privacy` | Privacy policy |
| `/unsubscribe` | Per-search / all-reminders unsubscribe |
| `/dev` | Dev-mode tier unlock (`src/app/dev/page.tsx`) |

### 2.2 Layout, loading, and shell

- Root layout: `src/app/layout.tsx`
- Generic loading shell: `src/app/loading.tsx`
- Listing-specific loading skeleton: `src/app/listing/[id]/loading.tsx`

### 2.3 Key components (`src/components/`)

Representative components observed:

- `FilterPanel` — feed filters
- `PostingRow` — single feed/listing row
- `SavedSearches` — saved-search list + save form
- `ToolsTease` — signed-out tool discovery
- `ScoreBadge` — fit/timing score display
- `BackLink`, `PendingButton`, `Mascot`
- `ApplyWizard` — apply hand-off modal (portaled to `document.body`)

### 2.4 State and data fetching

- Server Components call `src/lib/feed.ts`, `src/lib/profile/store.ts`, etc.
- Server Actions handle mutations (save search, set tracker status, profile update, dev unlock, etc.).
- URL is the source of truth for filters and for the signed-out profile.
- Client-side state is minimal; `useOptimistic` is used for tracker/save buttons.

### 2.5 Design system

- Documented in `docs/design-system.md`.
- Uses Tailwind v4 utility classes and a custom variable set (`--text`, `--muted`, `--accent`, `--line`, etc.).

### 2.6 Tests

- `npm test` → `tsx --test "src/**/*.test.ts"`.
- HANDOFF.md reports **551 passing tests** as of the last session.
- Key test files: `src/lib/feed-trim.test.ts`, `src/lib/feed-search.test.ts`, `src/lib/score/*.test.ts`, `src/lib/scholarships/*.test.ts`, `src/lib/apply/*.test.ts`, `src/lib/profile/*.test.ts`.

---

## 3. Backend / runtime

### 3.1 API routes (`src/app/**/route.ts`)

- `src/app/auth/confirm/route.ts` — magic-link confirmation (handles both PKCE and custom token shapes)
- `src/app/api/extension/packet/route.ts` — returns autofill packet to the extension
- `src/app/api/extension/applied/route.ts` — receives submission-detection postMessage from extension

### 3.2 Server Actions

Actions are co-located with pages, e.g.:

- `src/app/dev/actions.ts` — dev-tier cookie set/clear
- `src/app/profile/actions.ts`
- `src/app/tracker/actions.ts`
- `src/app/listing/[id]/apply/actions.ts`
- `src/app/admin/actions.ts`

### 3.3 Jobs and worker entry points (`scripts/`)

| Script | Purpose | Cron workflow |
|---|---|---|
| `scripts/ingest-fast.ts` | Tier A ATS poll of all registered employer boards | `ingest-fast.yml` (every 20 min) |
| `scripts/ingest-daily.ts` | Company discovery via Simplify repo + USAJobs | `ingest-daily.yml` (07:17 UTC) |
| `scripts/ingest-scholarships.ts` | Weekly scholarship scrapes | `ingest-scholarships.yml` (Sundays) |
| `scripts/ingest-usajobs.ts` | Federal student openings | Called from `ingest-daily.yml` |
| `scripts/ingest-status.ts` | Corpus health report | Manual / diagnostic |
| `scripts/ingest-rederive.ts` | Re-run detectors over stored JD text | Manual |
| `scripts/check-links.ts` | Apply-URL health check | `check-links.yml` (twice daily) |
| `scripts/send-reminders.ts` | Deadline-reminder emails | `reminders.yml` (dry-run by default) |
| `scripts/send-search-alerts.ts` | Saved-search alert emails | `search-alerts.yml` (dry-run by default) |
| `scripts/send-digest.ts` | Weekly digest emails | `digest.yml` (dry-run by default) |
| `scripts/metrics.ts` | Prints defined metrics | Manual |
| `scripts/feed-turnover.ts` | Measures day-over-day feed churn | Manual |
| `scripts/search-quality.ts` | Search quality probe | Manual |
| `scripts/db-audit.ts` | Asserts every table has RLS | Manual / CI |
| `scripts/probe-adapters.ts` | Adapter probe | Manual |
| `scripts/build-mark.ts` | Build helper | Manual |
| `scripts/backfill-content-marketing.ts` | Backfill content-marketing tag | Manual |

### 3.4 Workflows (`.github/workflows/`)

- `check-links.yml`
- `digest.yml`
- `ingest-daily.yml`
- `ingest-fast.yml`
- `ingest-scholarships.yml`
- `reminders.yml`
- `search-alerts.yml`

All cron jobs require the `DATABASE_URL` repo secret; scholarship ingestion additionally needs `PARSE_API_KEY`; USAJobs needs `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT`.

### 3.5 Queues / scheduling

No external queue (Redis, SQS, etc.) is used. Scheduling is GitHub Actions cron. The `ingest-fast.yml` cron is configured for every 20 minutes, but HANDOFF.md notes that GitHub's scheduler drifts to roughly every 3–5 hours in practice.

---

## 4. Database

### 4.1 Technology and access

- **Engine:** Supabase Postgres, connected through the transaction pooler (`DATABASE_URL`).
- **ORM:** Drizzle ORM (`drizzle-orm`, `drizzle-kit`).
- **Driver:** `postgres` (Node driver).
- **Connection owner:** `src/db/client.ts` connects as the table owner, which **bypasses Row Level Security**. Every server query must therefore scope by `user_id` in code.

### 4.2 Migrations and RLS

- Schema source of truth: `src/db/schema.ts`.
- Migrations live in `src/db/migrations/`.
- `drizzle-kit generate` emits `CREATE TABLE` only; RLS blocks are **hand-appended** to generated migrations (precedent: migrations `0008`, `0011`, `0012`, `0014`).
- Guard script: `npm run db:audit` (`scripts/db-audit.ts`) asserts every table is protected.

### 4.3 Generated types

No separate generated-types file was observed; the codebase imports TypeScript types directly from `src/db/schema.ts` (e.g., `PostingKind`, `PlanId`, `FreshnessTier`).

### 4.4 Key tables

| Table | Purpose |
|---|---|
| `organizations` | Employer registry: name, ATS type/slug, polling state, discovery source |
| `postings` | Canonical deduped opportunities (internships + scholarships) |
| `posting_sources` | Every place a posting was observed (many-to-one with `postings`) |
| `profiles` | User profile + plan + email preferences |
| `resumes` | Uploaded resume + parsed structure |
| `cover_letters` | Per (user, posting) editable cover-letter paragraphs |
| `matches` | Cached fit/timing scores per user |
| `applications` | Application tracker statuses and outcomes |
| `deadline_reminders` | Idempotent record of sent reminder emails |
| `contacts` | Cold-outreach contacts |
| `outreach_drafts` | Generated cold-email drafts |
| `recruiting_cycles` | Curated IB/consulting cycle windows |
| `ingest_runs` | Ingestion observability |
| `listing_reports` | Student-submitted listing reports |
| `feature_usage` | Lifetime usage counters for capped tools |
| `saved_searches` | Saved searches + alert watermark |
| `events` | First-party analytics events |

### 4.5 Seeds and fixtures

No seed script was found. Tests use inline fixtures. The corpus is populated by the ingestion scripts against live sources.

---

## 5. Current opportunity schema and lifecycle

### 5.1 `postings` schema

Key columns (see `src/db/schema.ts` lines 103–283):

- `id`, `kind` (`internship` | `scholarship`), `freshnessTier` (`live_polled` | `periodic_check` | `unverified_static`)
- `canonicalHash` — stable dedup key
- `title`, `normalizedTitle`, `url`, `sponsorName`, `locations`, `isRemote`
- `term` — plain text (e.g. `"Summer 2027"`), **no `term_source`**
- `degrees`, `eligibility` (jsonb), `workAuth`, `descriptionText`, `skills` (text array)
- `amountMin`, `amountMax`, `amountNeedsReview`
- `isContentMarketing`
- Freshness engine: `firstSeenAt`, `lastSeenAt`, `closedAt`, `missingStrikes`, `missingSince`, `postedAt`, `deadlineAt`
- Apply-URL health: `urlCheckedAt`, `urlStatus`, `urlDeadStrikes`, `urlDeadSince`
- Frame embedding: `frameAllowStrikes`, `frameCheckedAt`
- Curation: `hiddenAt`, `hiddenReason`, `reviewedAt`

### 5.2 Internships vs scholarships

- **Internships** are linked to `organizations` (the employer's ATS board). Freshness is `live_polled` for the four ATS families.
- **Scholarships** have no `orgId`; they use `sponsorName` scraped from the listing page. Freshness is `periodic_check` or `unverified_static`.
- Both live in the same `postings` table and share the same feed query; scorers are kind-specific.

### 5.3 Closure / freshness lifecycle

- **ATS internships:** `scripts/ingest-fast.ts` → `src/lib/ingest/run.ts` → `src/lib/ingest/reconcile.ts` → `src/lib/ingest/persist.ts`. The schema now has `missingStrikes` / `missingSince` to support a two-consecutive-miss rule.
- **Scholarships:** `src/lib/scholarships/persist.ts` and `src/lib/scholarships/close.ts` implement a two-observation close (`selectPostingsToClose` skips already-closed rows).
- **Apply-URL health:** `src/lib/ingest/linkcheck.ts` and `scripts/check-links.ts` flag dead links via `urlDeadStrikes` but **never close** a posting.
- **Reopen:** Rows that reappear after closure have `closedAt` set back to null in the scholarship path; the ATS path uses `missingStrikes` reset.

### 5.4 First-seen / provenance

- `firstSeenAt` is immutable; `lastSeenAt` updates on every observed presence.
- `posting_sources` records every observed source for a canonical posting, with `source`, `sourceId`, `sourceUrl`, and `raw` payload.
- No formal source registry with robots/terms/crawler identity exists yet (see INS-012).

---

## 6. Source adapters, polling, and normalization

### 6.1 Tier A ATS adapters (`src/lib/ingest/`)

Core pipeline files:

- `src/lib/ingest/types.ts` — shared types
- `src/lib/ingest/poll.ts` — per-ATS fetch logic
- `src/lib/ingest/run.ts` — orchestrates a Tier A run
- `src/lib/ingest/reconcile.ts` — diff current vs fetched rows
- `src/lib/ingest/persist.ts` — upsert postings and sources
- `src/lib/ingest/normalize.ts` — normalize ATS rows
- `src/lib/ingest/http.ts`, `html.ts`, `errors.ts` — shared fetch/HTML/error helpers
- `src/lib/ingest/linkcheck.ts` — apply-URL health checker

Supported ATS types (`ATS_TYPES` in `src/db/schema.ts`): `greenhouse`, `ashby`, `lever`, `smartrecruiters`.

### 6.2 Company discovery

- `scripts/ingest-daily.ts` reads the Simplify repository for company names only (no listing payloads, due to license concerns) and enrolls up to 400 new companies per run.
- Discovered companies get `discoveredVia = "simplify-discovery"`.

### 6.3 Scholarship sources (`src/lib/scholarships/`)

| Source | File |
|---|---|
| Communities Foundation of Texas | `src/lib/scholarships/cftexas.ts` |
| University of Nebraska–Lincoln external list | `src/lib/scholarships/unl.ts` |
| University of Nevada, Reno external list | `src/lib/scholarships/unr.ts` |
| Indiana University of Pennsylvania | `src/lib/scholarships/iup.ts` |
| Scholarships.com + ScholarshipPortal (Parse API) | `src/lib/scholarships/parse.ts` |

Orchestration: `scripts/ingest-scholarships.ts` → `src/lib/scholarships/persist.ts`.

### 6.4 USAJobs

- `scripts/ingest-usajobs.ts` queries the official USAJobs API for student/Pathways-style roles.
- Currently runs inside `ingest-daily.yml`; rows are stored as `periodic_check`.

### 6.5 Polling cadence

- Tier A default: `organizations.pollIntervalSec = 1200` (20 minutes), with backoff on failure (`×3`, capped at daily).
- Scholarships: weekly.
- USAJobs: daily (inside `ingest-daily`).
- Link checker: twice daily.

Actual GitHub Actions scheduler drift means Tier A runs occur roughly every 3–5 hours (FIXES.md).

### 6.6 Run observability

- `ingestRuns` table records `tier`, `source`, `startedAt`, `finishedAt`, `orgsPolled`, `postingsSeen`, `postingsNew`, `postingsClosed`, `errors`, `detail`.
- `npm run ingest:status` prints corpus health.

### 6.7 Normalization and enrichment

- `src/lib/ingest/normalize.ts` normalizes ATS rows.
- `postings.skills` and `workAuth` are derived from JD text at ingest; `scripts/ingest-rederive.ts` can re-run detectors.
- Scholarship amount parsing: `src/lib/scholarships/amount.ts`.
- Content-marketing tagging: `src/lib/scholarships/classify.ts`.

### 6.8 Freshness badges

- `src/lib/score/timing.ts` → `describeTiming` renders:
  - `"confirmed live Xh ago"` for `live_polled`
  - `"checked X"` for `periodic_check`
  - `"imported X, not re-checked"` for `unverified_static`

---

## 7. Profile, scoring, ranking, saved items, tracker, and tools

### 7.1 Profile

- `src/lib/profile/types.ts` defines `UserProfile`, `ScoreProfile`, `isProfileUsable`, `toScoreProfile`, work-auth options, interest options, location parsing.
- `src/lib/profile/store.ts` reads/writes `profiles`.
- `src/lib/profile/completion.ts` computes the completion meter.
- Stored profile fields: `displayName`, `school`, `major`, `gradYear`, `gpa`, `workAuth`, `targetVerticals`, `targetLocations`, `openToRemote`, `portfolioUrl`, `githubUsername`, `linkedinUrl`.
- **No four-field readiness gate exists yet.** Fit labels are rendered for any profile state.

### 7.2 Fit / match scoring

- **Internships:** `src/lib/score/fit.ts` (`scoreFit`, `rankingScore`). Five dimensions: work auth (25), term (20), field (25), location (20), skills (25). Unknown dimensions are dropped, never scored as a miss.
- **Scholarships:** `src/lib/score/scholarship-fit.ts` (`scoreScholarshipFit`). Three dimensions: field (35), award (35), competition (30).
- **Field taxonomy:** `FIELDS` and `MAJOR_TO_FIELDS` in `src/lib/score/fit.ts`; six keys: `software`, `data_ai`, `hardware`, `quant_finance`, `product`, `business`.
- **Skills:** `src/lib/score/skills.ts` extracts canonical skills from resume and JD.
- **Timing:** `src/lib/score/timing.ts` (`scoreTiming`, `rankingTiming`, `describeTiming`). Uses deadline pressure and freshness pressure, damped by verification staleness.
- **Relevance:** `src/lib/score/relevance.ts` boosts search-query matches.
- **Rotation tiebreak:** `src/lib/score/rotation.ts`.
- **Confidence shrink:** `src/lib/score/evidence.ts`.

### 7.3 Filters

- `src/lib/feed-search.ts` — filter schema and deadline options.
- `src/lib/search/query.ts` — query parsing, synonym/alternate expansion.
- Supported filters: `kind`, `term`, `remoteOnly`, `deadline`, `minAmount`, `location`, `category` (derived field), `q`, `includeClosed`, `hideBlocked`, `excludeMarketing`, `newSince`.
- Saved-search serialization: `src/lib/searches/types.ts` (`filtersFromParams`, `filtersToQuery`).

### 7.4 Ranking

- `src/lib/feed.ts` `getFeed` fetches matched rows, scores each in memory, then sorts via `makeRank`.
- Current ordering:
  1. Hidden rows excluded; closed rows excluded unless `includeClosed`.
  2. Blocked rows sort last.
  3. Search relevance comes first when a query is present.
  4. Fit/timing blend: `rankingScore(fit)` + paid timing bonus (`TIMING_PRIORITY_POINTS[tier]`) + deterministic daily jitter.
  5. Timing tiebreak.
  6. Deterministic rotation tiebreak.
- **This is not the report's 0.35/0.25/0.20/0.10/0.10 formula.** That formula is part of INS-027.
- Free depth cap: `FREE_DAILY_RESULTS = 20` in `src/lib/feed-trim.ts` (consistent with pricing, homepage, and tier description).
- Kind reservation: `FEED_KIND_FLOOR = 0.25` via `reservationFor(show)`.

### 7.5 Saved searches and tracker

- Saved searches: `src/lib/searches/store.ts`, `saved_searches` table, alert job `scripts/send-search-alerts.ts`.
- Tracker: `src/lib/applications/store.ts`, `applications` table, 8 statuses (`saved`, `applied`, `screen`, `interview`, `offer`, `rejected`, `withdrawn`, `ghosted`).
- Tracker cap: free = 5, apply = unlimited (`FEATURES.tracker.limits` in `src/lib/pricing/tiers.ts`).

### 7.6 Generation / application tools

- **Resume:** `src/lib/resume/parse.ts` (Anthropic document parse), `critique.ts` (deterministic), `edit.ts`, `types.ts`.
- **Cover letter:** `src/lib/cover-letter/context.ts`, `generate.ts`, `store.ts`, `types.ts`.
- **GitHub:** `src/lib/github/client.ts`, `audit.ts`, `readme.ts`, `types.ts`.
- **LinkedIn:** `src/lib/linkedin/check.ts`, `build.ts`, `types.ts`.
- **Essay reviewer:** `src/lib/essay/review.ts`, `types.ts` (runs entirely in browser).
- **Apply wizard / extension:** `src/lib/apply/wizard.ts`, `autofill.ts`, `apply-url.ts`, `frame-headers.ts`, `submitted.ts`, `packet.ts`, `confirmation.ts`, `extension.ts`; extension code in `extension/`.

---

## 8. Auth, account, plan, billing, email, and analytics

### 8.1 Auth

- Magic-link only. No passwords.
- `src/lib/auth.ts` provides `getSessionUser()` and helpers.
- `src/proxy.ts` refreshes the Supabase session on each request.
- `src/app/login/page.tsx` collects email; `src/app/auth/confirm/route.ts` handles the token.

### 8.2 Plan and entitlements

- `profiles.plan` column; valid `PLAN_IDS`: `["free", "apply"]`.
- **Current tiers:** Free and Apply ($5.99 display price). The report's Pro / Monthly / Semester / Annual model does not exist yet.
- `src/lib/pricing/tiers.ts` — pure feature catalog (`FEATURES`), `evaluateFeature`, `presentFit`, pricing constants.
- `src/lib/pricing/entitlements.ts` — `getUserTier` reads DB and applies dev override.
- `src/lib/pricing/usage.ts` — check/get/consume usage for `feature_usage` counters.
- Dev unlock: `src/lib/pricing/dev-tier.ts` + `src/lib/pricing/dev-session.ts` + `src/app/dev/page.tsx`. A signed cookie (`instela_dev_tier`) can force a tier when `DEV_PASSWORD` is set. `DEV_TIER` env var is ignored in production builds.

### 8.3 Billing

- **No Stripe integration exists.** `TIER_PRICE_USD.apply = 5.99` is display-only.
- `/pricing` renders from the same config every gate reads.
- `plan_updated_at` is the seam a future billing provider would write to.

### 8.4 Email

- Provider: Resend (single `fetch` POST, no SDK).
- `src/lib/reminders/email.ts` — deadline reminders
- `src/lib/searches/email.ts` — saved-search alerts
- `src/lib/digest/email.ts` — weekly digest
- `src/lib/apply/confirmation.ts` — extension submission confirmation
- Batch jobs are **dry-run by default**; pass `--send` to actually mail.
- `REMINDER_FROM_EMAIL` is required for a verified sender domain.

### 8.5 Analytics

- First-party only; `events` table with `name` + anonymous `props`.
- Valid events: `search_run`, `listing_viewed`, `github_audited`.
- `src/lib/analytics/record.ts` and `src/lib/analytics/props.ts` enforce the no-PII boundary.
- Metrics definitions: `src/lib/metrics/types.ts`; store: `src/lib/metrics/store.ts`; command: `npm run metrics`.

---

## 9. Production / staging configuration and release commands

### 9.1 Environment variables

Required / used (names only, no values):

- `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`, `REMINDER_FROM_EMAIL`
- `PARSE_API_KEY`, `PARSE_SCHOLARSHIPS_COM_BASE_URL`, `PARSE_SCHOLARSHIPPORTAL_BASE_URL`
- `USAJOBS_API_KEY`, `USAJOBS_USER_AGENT`
- `GITHUB_TOKEN` (optional, raises GitHub rate limit)
- `ADMIN_EMAILS` (comma-separated allowlist for `/admin`)
- `EXTENSION_ORIGINS` (comma-separated Chrome extension IDs)
- `NEXT_PUBLIC_SITE_URL`
- `DEV_PASSWORD`, `DEV_TIER` (dev only)

### 9.2 Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + test
npm run db:generate  # then hand-append RLS
npm run db:migrate
```

### 9.3 Release commands

- Vercel production deploy: push to tracked remote / `vercel --prod`.
- Database migrations: `npm run db:generate`, hand-append RLS policies, `npm run db:migrate`, then `npm run db:audit`.
- Cron workflows require GitHub Actions secrets; they run from the default branch.
- Extension build: `npm run build:extension`.

### 9.4 Current deploy state

- `master` is ~25 commits ahead of `origin/master` and has not been pushed (per `HANDOFF.md`).
- There are uncommitted working-tree changes (`FIXES.md` modified, `INSTELA_MARKET_READY_MASTER_IMPLEMENTATION_PLAN.md` untracked).

---

## 10. Location of the eight R2 live-site trust issues

| # | R2 issue | Where it lives today | Current state |
|---|---|---|---|
| 1 | Unknown / missing terms | `postings.term` is nullable `text` with no `term_source`; `getFeedStats` counts `term is null`; `parseTerm` in `src/lib/score/fit.ts` only parses explicit `"Season YYYY"`. | No inference; unknown share measured as part of feed stats. |
| 2 | Impossible past terms | No ended-term validation; `getAvailableTerms` in `src/lib/feed.ts` returns all non-null terms including past ones. | Past terms remain selectable/visible; no quarantine. |
| 3 | Inflated program totals / `$0` | `src/lib/scholarships/amount.ts` produces `{min,max,needsReview}`; no `amount_status`, no `awards_count`, no `program_total`, no per-award vs total distinction. | `$0` is rejected, but amount semantics are not fully modeled. |
| 4 | Profile-free "Strong Fit" | `presentFit` in `src/lib/pricing/tiers.ts` buckets free-tier labels; `scoreFit` in `src/lib/score/fit.ts` scores with empty profile; `src/app/page.tsx` renders bucket labels without a four-field gate. | Fit labels can appear before major/gradYear/state/workAuth are all present. |
| 5 | Marketing / law-firm awards too high | `src/lib/scholarships/classify.ts` sets `isContentMarketing`; scholarship Fit Score uses it in competition dimension; `excludeMarketing` filter exists but is off by default. | Tag exists; no separate Lottery shelf; down-rank weight not yet fully resolving the issue. |
| 6 | Inconsistent Free limit | `FREE_DAILY_RESULTS = 20` in `src/lib/feed-trim.ts`; pricing, homepage, tier description, and baseline audit all use 20. | Fixed. |
| 7 | Production dev unlock | `src/lib/pricing/dev-tier.ts` now exposes `devModeAllowed`, which is `false` in production. `devModeConfigured` requires both a password and `devModeAllowed`, so `/dev` 404s in production builds and nav/pricing banners are hidden. | Fixed. |
| 8 | Insider / operator-facing copy | `src/app/page.tsx` hero now leads with "Internships the day they open. Scholarships you can actually win." and the subline "Every listing checked at the source. Your data is never sold." ATS mechanics moved to a new `/how-we-verify` page. | Fixed as a test candidate; student testing needed before declaring the winning variant. |

---

## 11. Existing work that already satisfies later INS prompts

| INS ID | Short name | What already exists | Evidence | State |
|---|---|---|---|---|
| INS-006 | Award amounts | `src/lib/scholarships/amount.ts` parses min/max and flags malformed figures; schema has `amountMin/Max/NeedsReview`. | `amount.ts`, `amount.test.ts`, `postings` schema | partial |
| INS-007 | Close lifecycle | Schema has `missingStrikes`/`missingSince`; scholarship close path has two-observation rule (`src/lib/scholarships/close.ts`). | `close.ts`, `close.test.ts`, schema | partial |
| INS-009 | Trust / marketing awards | `src/lib/scholarships/classify.ts` tags content-marketing awards; `excludeMarketing` filter exists. | `classify.ts`, `classify.test.ts`, `src/lib/feed.ts` | partial |
| INS-012 / 013 | Source registry / ingestion contract | `organizations` + `posting_sources` give source identity and provenance; `ingestRuns` records outcomes. No formal approval/robots registry yet. | schema, `src/lib/ingest/*` | partial |
| INS-014 | Cadence / observability | `organizations.pollIntervalSec`, `ingestRuns`, `npm run ingest:status`. Not yet the report's exact tier schedule. | schema, `scripts/ingest-status.ts` | partial |
| INS-015 | GitHub audit scaling | `src/lib/github/client.ts` reads optional `GITHUB_TOKEN`; Next.js fetch cache is used. Not yet the report's 24-hour cache. | `src/lib/github/*`, `/github` route | partial |
| INS-022 | USAJOBS Pathways | `scripts/ingest-usajobs.ts` exists and ingests student federal roles. Not yet a `Government` category or 6-hour polling. | `scripts/ingest-usajobs.ts`, roadmap note | partial |
| INS-024 / 025 | Structured eligibility | `postings.eligibility` jsonb and `workAuth` detection exist. No evidence/confidence-backed constraint model yet. | schema, `src/lib/ingest/normalize.ts` | partial |
| INS-026 | Competition score | Scholarship Fit Score has a competition dimension using `isContentMarketing`. Internship competition estimate not built. | `src/lib/score/scholarship-fit.ts` | partial |
| INS-029 | Entitlements | `getUserTier`, `evaluateFeature`, `presentFit`, and feature catalog provide a capability matrix. Only `free`/`apply` tiers; no trial/refund states. | `src/lib/pricing/tiers.ts`, `entitlements.ts` | partial |
| INS-030 | Weekly digest | `src/lib/digest/*` and `scripts/send-digest.ts` exist. Currently gated to paid users, not free. | `digest/select.ts`, `digest/email.ts` | partial |
| INS-031 | Instant alerts | Saved-search alerts (`src/lib/searches/*`, `scripts/send-search-alerts.ts`) are event-driven, but not Pro-only instant new-listing alerts. | `searches/run.ts`, `searches/email.ts` | partial |
| INS-034 | Usage limits | `feature_usage` table + `consumeUsage` meters run-capped tools; tracker cap enforced. Free limit is 5 (report wants 10) and lifetime (report wants monthly). | `src/lib/pricing/usage.ts`, schema | partial |
| INS-035 | Pricing / account UX | `/pricing` page renders from `tiers.ts`. No checkout, billing management, or refund flow. | `src/app/pricing/page.tsx` | partial |
| INS-051 | Analytics / metrics | `events` table and `src/lib/metrics/types.ts` define metrics. Not the report's exact activation/D7/CTR/D35/churn definitions. | `src/lib/metrics/*`, `src/lib/analytics/*` | partial |

Most other INS prompts are **not started** as of this map.
