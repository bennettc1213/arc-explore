# Release A — INS-011A: the trust sprint, published to instela.org

**Released:** 2026-09-28, ~20:00 UTC
**Release identifier:** commit `ae01fcf` on `master` — "Fix the eight trust problems the Phase 1 gate found, then gate them"
**Deployment:** Vercel production, project `project-o66x1` (`prj_jsTVqq1vfWgzS6SfGBBFBerNlXT7`), deployment `project-o66x1-w61pkwkik` (Ready, Production, 43 s). Previous production deployment was 25 days old.
**Owner confirmation:** Section 3A popup shown and answered **Yes** ("Yes, publish to the live site"). A second explicit Yes approved the post-deploy label repair (below), because the popup had said no backfills would run at release time.

## What went live, in order

1. **`git push origin master`** (`80ddfde..ae01fcf`) — the GitHub Actions crons (ingest-fast, ingest-daily, scholarships, check-links, reminders, search-alerts) now run the fixed code. This is the artifact that fixes the ingest path; it went live before the site did.
2. **Vercel production deploy** (`npx vercel deploy --prod --yes`, after owner `vercel login`) — the site now serves the new build. Verified by route probe: `/how-we-verify` 404 → **200**.
3. **Backoff reset re-run** (`scripts/reset-stuck-poll-backoff.ts`, idempotent) — 356 boards that the raw-`Date` bug had frozen (350 at gate time + 6 more re-frozen by the old code on 2026-09-28) were set back to the 1,200 s default, so they are due at the next ingest run instead of asleep at the 24 h ceiling.

A Git push does **not** auto-deploy this project (verified: after the push, `/how-we-verify` still 404'd until the CLI deploy ran) — that closes INS-001 item 8's open question about how a production release is triggered: it is the Vercel CLI, not Git integration.

## Migrations and backfills

- **Migrations run at release: none.** All 25 migrations (0000–0024, additive) were already applied and verified against the live database before the release (`drizzle.__drizzle_migrations` = 25/25). Nothing new ran.
- **Backfill run at release: none**, per the popup. One backfill ran **after** the deploy with a second explicit owner approval: the old deployed code's final ingest run (2026-09-28 16:48 UTC, 28,952 postings touched) had re-derived 16 free-text labels that disagreed with the structured term columns — the §4.5 mechanism, one last time. `scripts/backfill-terms.ts` repaired all 16 (`divergedRepaired: 16`, `failed: 0`), returning label/structure divergence to **0**.

## Before / after

| Metric | Gate (2026-09-27) | Post-release audit (2026-09-28 20:14 UTC) |
|---|---|---|
| Open listings | 6,252 | 6,293 |
| Missing/unknown term | 0 (0.0%) | **0 (0.0%)** |
| Past-term listings | 3 | 3 — all flagged/quarantined |
| **Visible past-term in default feed** | 0 | **0** (1 found at 20:04, repaired at 20:11; see below) |
| Label/structure divergence | 0 | **0** (16 found, all from the old code's final run, repaired) |
| False `$0` | 0 | **0** |
| Amount status | 302 exact / 12 range / 1,618 varies / 2 unparseable | same |
| Marketing in default top 10 | 0 | **0** |
| Free limit copy | 20 everywhere | **20 everywhere**, verified live |

The one visible past-term the 20:04 audit found was a ZipRecruiter row whose label said "Spring 2025" (old code, 16:48) while the structure said summer 2027. Verified directly on the live site before repairing: the listing page already displayed **"Summer 2027"** and never rendered the stale label — the display guard held, so no student could see an ended term even before the repair.

## Live smoke checks (production, read-only)

- `/how-we-verify` → 200 (new route; 404 on the old build)
- Homepage → 200; renders "The free plan shows your **20** highest-ranked matches" and "your top **20** of 6,265 matches" — the 20 is a separate React text node, which is why a raw-string grep alone is not a valid check
- Listing page for the one divergent row → 200, shows the structured term, not the stale label
- No dev unlock / dev login surface on production
- `npm run check` (884/884) and `npm run build` green on the released commit

## Rollback path

- **Code:** `git revert ae01fcf` + `npx vercel deploy --prod --yes` (the previous production deployment is 25 days old and served the pre-sprint build). The market-ready flags are all OFF by default, so no flag needs flipping.
- **Data:** all migrations are additive; `term_raw` preserves the source text behind every explicit term. Restore point is Supabase's automatic daily backups (no local `pg_dump` exists — disclosed, not assumed).
- **Board backoff:** `scripts/reset-stuck-poll-backoff.ts` is idempotent and can be re-run at any time.
- **Threshold rule (unchanged):** if unknown-term share ≥ 25% or any visible ended term appears, roll back rather than adjusting the threshold.

## Follow-ups

- **Board recovery is in progress, not instant.** 405 boards are recorded as failing (356 date-bug victims + 49 `HTTP 404` dead slugs). The 356 are due now; `consecutive_failures` clears only on a genuinely successful poll, and GitHub's scheduler drops high-frequency crons under load (observed runs today: 01:43, 08:12, 15:34/36, 16:48 UTC), so the count falls over the next runs, not in one. Watch: `npx tsx scripts/ingest-status.ts`, and expect `postings_closed` to move off 0 as the two-successful-miss lifecycle finally works in production.
- **The 49 `HTTP 404` boards** are dead/renamed ATS slugs — source-registry work for INS-012/INS-016, deliberately untouched by this release.
- **Visual rendering at mobile/desktop widths is still unverified** (no browser/screenshot/e2e tooling in this repo). This release was verified by HTTP probes, rendered-text checks, and the read-only audit only.
- **Term parser still reads whole JDs**, so a season mentioned only in an eligibility window is parsed as explicit. Harmless for display (structure is authoritative) and for the feed, but a context-aware parser pass remains worthwhile.
- **2 unparseable scholarship amounts** display as "needs review" — next parser target.
