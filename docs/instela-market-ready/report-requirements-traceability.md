# Instela Report Requirements Traceability

**Purpose:** Map every requirement, rule, and recommendation in the source market-research report to the implementation IDs (`INS-###`) that will satisfy it, plus the current state.  
**Source:** `INSTELA_MARKET_READY_MASTER_IMPLEMENTATION_PLAN.md` (derived from the September 21, 2026 report).  
**Updated:** 2026-09-23

## Legend

- `NOT STARTED` — no implementation yet.
- `PARTIAL` — some related code exists, but the requirement is not fully satisfied.
- `ALREADY SATISFIED` — existing code/tests already meet the requirement.
- `BLOCKED` — cannot proceed without an external decision, credential, or permission.
- `NOT LAUNCH-BLOCKING` — post-launch work; tracked but not required for initial sale.

---

## R2 — Live-site audit and trust leaks

| # | Trust issue | INS IDs | State | Notes |
|---|---|---|---|---|
| R2.1 | Unknown / missing terms | INS-004, INS-005, INS-011 | NOT STARTED | `postings.term` is plain nullable text with no `term_source`. |
| R2.2 | Impossible past terms remain visible | INS-004, INS-005, INS-011 | NOT STARTED | No ended-term quarantine or past-term filter hiding. |
| R2.3 | Inflated program totals / false `$0` awards | INS-006, INS-011 | PARTIAL | `amount.ts` rejects `$0` and flags review, but lacks four-field model and per-award/total distinction. |
| R2.4 | Profile-free "Strong Fit" labels | INS-008, INS-025, INS-028 | NOT STARTED | `presentFit` buckets scores even for empty profiles. |
| R2.5 | Marketing / law-firm awards ranked too high | INS-009, INS-027, INS-028 | PARTIAL | `classify.ts` tags content marketing; no Lottery-style shelf; down-rank not yet dominant. |
| R2.6 | Inconsistent Free ranked-match limit | INS-010, INS-029, INS-034 | PASS | `FREE_DAILY_RESULTS` set to 20; pricing, homepage, tier description, and baseline audit all consistent. |
| R2.7 | Production dev unlock grants paid tier | INS-010, INS-029, INS-052 | NOT STARTED | `/dev` cookie unlock can work in production when `DEV_PASSWORD` is set. |
| R2.8 | Insider / operator-facing copy on public pages | INS-010, INS-035, INS-052 | NOT STARTED | Hero still explains ATS polling; tier labels are "See it" / "Apply". |

---

## R7 — Pipeline, freshness, parsing, eligibility, scoring, ranking, prediction, outcomes, GitHub scaling

| Ref | Report rule / requirement | INS IDs | State | Notes |
|---|---|---|---|---|
| R7.1 | Canonical pipeline: Discover → Resolve → Verify → Normalize → Enrich → Score → Rank → Notify → Recheck | INS-012, INS-013 | PARTIAL | `organizations` + `posting_sources` + `ingest/*` provide much of the shape; no formal state-machine contract typed across adapters. |
| R7.2 | Configurable polling tiers (hot ATS 20 min, other ATS 6–24 h, Workday 6–12 h, USAJOBS 6 h, AcademicWorks daily, direct scholarships weekly / daily near deadline, saved-link check daily) | INS-014 | PARTIAL | `pollIntervalSec` and `ingestRuns` exist; cadences do not match report tiers. |
| R7.3 | Two-successful-miss closure + failed polls cannot advance misses + reopen logging | INS-007, INS-013 | PARTIAL | Schema has `missingStrikes`/`missingSince`; scholarship close uses two-observation rule; needs full lifecycle integration and tests. |
| R7.4 | Provenance model + term with `term_source = explicit \| inferred \| unknown`; preserve raw evidence | INS-004, INS-005, INS-012 | NOT STARTED | No `term_source` column; terms are plain text. |
| R7.5 | Four-field award model (`amount_per_award`, `awards_count`, `program_total`, `amount_status`) | INS-006 | PARTIAL | Only `amountMin/Max/NeedsReview` exist today. |
| R7.6 | Structured eligibility with evidence/confidence per constraint; deterministic evaluator; four-field profile gate | INS-024, INS-025, INS-008 | PARTIAL | `eligibility` jsonb and `workAuth` detection exist; no evidence/confidence model or evaluator. |
| R7.7 | Estimated Competition score (Low/Medium/High) with explainable factors | INS-026, INS-028 | PARTIAL | Scholarship Fit Score has a competition dimension; internship competition estimate not built. |
| R7.8 | Trust signals (third-party account, no essay, sweepstakes, lead-gen, no winner evidence, no contact, ad-heavy, corroboration) | INS-009, INS-012, INS-018 | PARTIAL | Content-marketing tag exists; no formal Trust score or corroboration model. |
| R7.9 | Exact ranking formula (0.35 Fit + 0.25 (100−Competition) + 0.20 Timing + 0.10 Value + 0.10 Trust), top-three reasons, sponsor-type cap, verified-first | INS-027, INS-028 | NOT STARTED | Current ranking in `src/lib/feed.ts` is fit/timing/relevance blend. |
| R7.10 | First-seen recruiting-cycle history → Opening Soon predictions with uncertainty | INS-037, INS-038, INS-039 | NOT STARTED | `recruiting_cycles` is curated, not derived from first-seen history. |
| R7.11 | Outcome loop (applied/interview/offer/rejected) with scoring snapshot; no probability model until hundreds of outcomes | INS-043, INS-061 | PARTIAL | `applications` table captures statuses and `outcome`; no scoring-version snapshot. |
| R7.12 | GitHub audit scales without exhausting shared anonymous quota (server token, 24 h cache, dedupe) | INS-015 | PARTIAL | Optional `GITHUB_TOKEN` exists; Next fetch cache is ~15 min, not 24 h. |

---

## R8 — Free vs Pro feature split

| Feature | Free (See it) | Pro (Apply) | INS IDs | State |
|---|---|---|---|---|
| Search and filters | Unlimited, all listings | Unlimited, all listings | INS-029, INS-034 | ALREADY SATISFIED |
| Ranked matches | Top 20 per day | Full list | INS-029, INS-034, INS-027 | PASS (`FREE_DAILY_RESULTS = 20`) |
| Fit | Label only | Full explanation + gap closer | INS-008, INS-028, INS-029 | NOT STARTED |
| Competition | Low/Medium/High label | Breakdown + Low Competition Only filter | INS-026, INS-028, INS-029 | PARTIAL |
| Alerts | Weekly digest | Instant, within minutes | INS-030, INS-031 | PARTIAL (digest exists but paid-only; no instant Pro alerts) |
| Opening Soon | Next 7 days | Full calendar + watchlist | INS-038, INS-039 | NOT STARTED |
| Saved items / deadline reminders | Included | Included | — | ALREADY SATISFIED |
| Safety, marketing, eligibility flags | Included | Included | INS-009, INS-028 | PARTIAL |
| Tracker | 10 items | Unlimited + email-forward automation | INS-034, INS-041 | PARTIAL (free cap is 5; no email-forward tracking) |
| Resume / cover letter / LinkedIn / GitHub / essay tools | One use of each per month | Unlimited | INS-034 | PARTIAL (lifetime counters, not monthly) |
| Essay answer bank | Not included | Included | INS-040 | NOT STARTED |
| Weekly triage | Not included | Five best applications that week | INS-042 | NOT STARTED |
| Autofill / apply | Not included | Included only after verification | INS-034, INS-056 | PARTIAL (extension exists but unverified) |
| Semester recap | Not included | Included and shareable | INS-048 | NOT STARTED |

---

## R9 — Build / skip / grow and positioning

| Report call / rule | INS IDs | State | Notes |
|---|---|---|---|
| Keep discovery free; sell speed, odds, saved effort | INS-029, INS-030–031, INS-026, INS-040–043 | PARTIAL | Entitlements exist; speed/odds/effort features incomplete. |
| Verified freshness as the moat | INS-012–015, INS-031, INS-037–039 | PARTIAL | Data spine and history features incomplete. |
| Repair trust leaks before new features | INS-004–011 | NOT STARTED | Trust sprint not yet executed. |
| Expand scholarships via AcademicWorks, internships via Workday, USAJOBS Pathways next | INS-016–023 | NOT STARTED | USAJobs partial. |
| Launch one adjacent vertical next: Business | INS-044 | NOT STARTED | `recruiting_cycles` is curated; no Business feed. |
| Low transparent pricing; student-friendly billing periods; clear cancel/refund | INS-032–036 | NOT STARTED | No Stripe; display price only. |
| Honest positioning: outcome-first hero, privacy, no insider ATS jargon | INS-010, INS-035, INS-052 | NOT STARTED | Copy still operator-facing. |
| Do-not-build register (no mass auto-submit, no data sale, no prohibited scraping, no win probability, no hidden pricing, etc.) | INS-052 | NOT STARTED | Many are already avoided in code; formal audit not done. |
| Growth hooks: proprietary SEO pages, delayed community alerts, referrals, semester recap, Utah pilot | INS-045–049 | NOT STARTED | — |
| Measure activation, D7 return, alert CTR, D35 conversion, seasonal churn | INS-051 | PARTIAL | Metrics exist but definitions differ. |

---

## R10 — Now / Next / Later roadmap

| Roadmap window | Items | INS IDs | State |
|---|---|---|---|
| **Now** — Trust sprint (fix all 8 R2 leaks) | Term model, term sanity, amounts, close lifecycle, profile fit gate, marketing awards, plan copy/dev unlock, trust gate | INS-004–INS-011 | NOT STARTED |
| **Next** — Coverage + Pro core | Source registry, ingestion contract, cadence/observability, GitHub scaling, AcademicWorks (50), Workday (100), USAJOBS, eligibility, competition, ranking, entitlements, weekly/instant alerts, Stripe billing, usage limits, pricing UX, Pro core gate | INS-012–INS-036 | PARTIAL (some foundations exist) |
| **Later** — Historical moat + growth | First-seen history, Opening Soon, watchlists, answer bank, email tracking, weekly triage, outcomes, Business vertical, SEO, community feed, referrals, recap, Utah pilot, partnerships gate | INS-037–INS-050 | NOT STARTED |
| **Release** | Analytics, claims audit, hardening, staging candidate, production release | INS-051–INS-055 | NOT STARTED |
| **Post-launch backlog** | Autofill verification, long-tail ATS, curated awards, state/community sources, partner feeds, outcome calibration, $7.99 test, B2B2C discovery | INS-056–INS-063 | NOT LAUNCH-BLOCKING |

---

## RA — Open questions and external gates

| Decision / gate | Needed by | INS IDs | State | Safe default before decision |
|---|---|---|---|---|
| Semester Pass renews or ends after 4 months | INS-032 live activation | INS-032 | BLOCKED pending owner decision | Do not activate Semester price; show no misleading terms. |
| Community alert delay and destination | INS-046 activation | INS-046 | BLOCKED pending owner decision | Keep channel disabled. |
| Referral attribution window and interaction with paid time | INS-047 activation | INS-047 | BLOCKED pending owner decision | Keep rewards disabled. |
| Utah pilot timing, audience, institutional permissions | INS-049 activation | INS-049 | BLOCKED pending owner decision | Keep pilot routes disabled. |
| Crawler contact email | INS-016 source activation | INS-016–INS-023 | BLOCKED pending owner decision | Keep scraped sources inactive. |
| AcademicWorks / Workday site-by-site robots/terms approval | INS-016–INS-023 | INS-016–INS-023 | BLOCKED pending owner decision | Source stays paused/blocked. |
| CareerOneStop / Gale commercial display permission | Any CareerOneStop build | INS-050, INS-060 | BLOCKED pending owner decision | No ingestion/display. |
| Kaleidoscope partner feed permission | Any Kaleidoscope build | INS-050, INS-060 | BLOCKED pending owner decision | No scraping/ingestion. |
| Simplify repo license for discovery beyond names | External-history or discovery expansion | INS-057 | BLOCKED pending owner decision | Discovery path disabled if not permitted. |
| Adzuna commercial agreement | Adzuna activation | INS-050, INS-057 | BLOCKED pending owner decision | No commercial use. |
| NSF REU access terms | NSF source build | INS-058 | BLOCKED pending owner decision | No ingestion. |
| Public hero winner / final homepage copy | Final homepage selection | INS-010, INS-035 | BLOCKED pending owner decision | Keep honest tested candidate; do not call it validated. |
| Production deployment target and timing | INS-055 | INS-055 | BLOCKED pending owner decision | No deployment. |

---

## Summary by state

| State | Count |
|---|---|
| NOT STARTED | ~42 |
| PARTIAL | ~13 |
| ALREADY SATISFIED | ~2 |
| BLOCKED | ~11 external gates |
| NOT LAUNCH-BLOCKING | 8 (INS-056–INS-063) |

The next eligible implementation prompt after INS-001 is **INS-002**.
