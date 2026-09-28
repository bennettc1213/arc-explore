# Instela Market-Ready Release Gates

**Purpose:** A single reference for every phase gate and release trigger in the market-ready plan. Each gate must be `PASS` (or explicitly non-blocking and not advertised) before the next phase begins.  
**Source:** `INSTELA_MARKET_READY_MASTER_IMPLEMENTATION_PLAN.md`

---

## Phase gates overview

| Phase | Gate prompt | Gate document | Must prove |
|---|---|---|---|
| 1 — Trust sprint | INS-011 | `gates/phase-1-trust-gate.md` | The live site no longer contradicts the core promise. |
| 2 — Verified-data spine | INS-015 | `gates/phase-2-data-spine-gate.md` | GitHub audits scale; source registry, ingestion contract, scheduler, lifecycle, and observability work. |
| 3 — Coverage expansion | INS-023 | `gates/phase-3-coverage-gate.md` | AcademicWorks, Workday, and USAJOBS coverage is verified and stable. |
| 4 — Eligibility, competition, ranking | INS-028 | `gates/phase-4-ranking-gate.md` | Free/Pro UX matches the feature split; ranking is explainable and honest. |
| 5 — Free/Pro, alerts, billing | INS-036 | `gates/phase-5-pro-core-gate.md` | A complete test-mode purchase and alert journey works without live charges. |
| 6 — Historical moat | INS-043 | `gates/phase-6-moat-gate.md` | Outcomes are captured safely; Opening Soon, answer bank, triage, etc. are validated. |
| 7 — Business vertical + growth | INS-050 | `gates/phase-7-growth-gate.md` | Business is coherent; growth hooks and partnership tracking are ready. |
| 8 — Staging launch candidate | INS-054 | `gates/final-staging-launch-candidate.md` | The full release is proven in staging before production. |

---

## Phase 1 — Trust Sprint gate (INS-011)

**Run after:** INS-004 through INS-010.

### Required evidence
- 20 open listings sampled across source types for term correctness and source labeling.
- 20 scholarships sampled across amount statuses, including suspected totals and unknowns.
- New, partial, complete, and conflicting profiles.
- First 10 default scholarship results.
- Two-successful-miss, failed-poll, partial-poll, and reopen paths.
- Production-build navigation and entitlement paths with dev unlock removed.
- Homepage, pricing, cards, filters, and mobile layouts.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| Unknown term share | Below 25% of open listings. |
| Ended terms | No normally visible open listing has an ended term. |
| False `$0` | No scholarship displays false `$0`; program totals are distinguished. |
| Fit labels | No fit label appears without all four profile fields. |
| Marketing/lottery awards | Marketing awards are demonstrably down-ranked; lottery-style awards are separate. |
| Free limit copy | Consistently states 20. |
| Dev unlock | No production dev unlock or client-side paid grant remains. |
| Closure/reopen | Closure/reopen state tests pass. |
| Primary copy | Student-facing copy leads with outcomes, freshness, and privacy. |
| Gate rule | Every criterion needs evidence; otherwise Phase 1 is BLOCKED. |

---

## Phase 2 — Data-Spine gate (INS-015)

**Run after:** INS-012 through INS-014.

### Required evidence
- GitHub audit rate-limit design matches where calls run and includes 24-hour caching where server-shared.
- Source registry, shared ingestion state machine, scheduler, lifecycle, and run observability pass integration tests.
- Existing verified listings remain traceable and saved/tracker relations are intact.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| GitHub caching | 24-hour cache, deduped concurrent requests, batched/reused calls where possible. |
| Adapter contract | Every current adapter validates against the shared run/lifecycle contract, or an explicit migration blocker is listed. |
| Idempotency | Representative polls replay idempotently. |
| Discovery-only rule | Discovery-only data cannot publish as verified. |
| Source health | Source health/run counts are inspectable. |
| Scheduler | Each schedule tier is tested in a controlled scheduler environment. |

---

## Phase 3 — Coverage Expansion gate (INS-023)

**Run after:** INS-016 through INS-022.

### Required evidence
- Staging-like full ingestion cycle for AcademicWorks, Workday, and USAJOBS.
- Exact source counts, stable-run summaries, 20-row AcademicWorks audit, at least 20 Workday link checks, USAJOBS sample checks, errors/blocks, and rollback/pause steps.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| AcademicWorks | Meets 50-portal target or has explicit access blockers. |
| Workday | Meets 100-employer target or has explicit access blockers. |
| Stability | Two back-to-back-run stability gates pass. |
| USAJOBS | Government results and six-hour polling pass. |
| Traceability | Every published row is verified at its source and traceable. |
| Quality | No unexplained mass churn, false closure, false `$0`, stale term, or duplicate canonical award remains. |
| Launch claim | Phase 3 may be PARTIAL for externally blocked targets, but market launch cannot claim those coverage numbers unless achieved. |

---

## Phase 4 — Eligibility/Competition/Ranking gate (INS-028)

**Run after:** INS-024 through INS-027.

### Free experience
- Eligibility/conflict/check status and evidence link.
- Fit label only after four-field completion.
- Low/Medium/High competition label with a concise estimated reason.
- Trust/marketing/lottery/source-verification warnings.
- Top ranking reasons on cards.
- No paywall around safety or work authorization.

### Pro experience
- Full Fit breakdown and gap-closer suggestions grounded in profile/listing evidence.
- Full Competition factor breakdown.
- Low Competition Only filter, protected by server entitlement.
- No suggestion that changing a protected identity or misrepresenting facts is a gap closer.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| Plan split | Free and Pro surfaces match the report's visibility split. |
| Safety | Safety/eligibility is never paywalled. |
| Competition filter | Low Competition Only is server-protected as Pro, with a truthful locked-state preview for Free. |
| Fit | No fit appears without four fields. |
| Lottery | No lottery has a competition score. |
| Verification | No unverified row outranks verified live inventory. |
| Explanations | Explanations are grounded in stored reasons. |
| Quality | Integrated phase fixtures and key responsive/accessibility checks pass. |

---

## Phase 5 — Pro Core and Billing gate (INS-036)

**Run after:** INS-029 through INS-035.

### Required staging journeys
1. New Free user -> four profile fields -> personalized top 20 -> saves three -> sees trial offer -> accepts -> test checkout/trial -> gains Pro.
2. Free weekly digest selection/send/idempotent retry/unsubscribe.
3. Newly verified matching listing -> eligible Pro instant alert -> click to correct opportunity.
4. Ineligible and duplicate-listing negative alert cases.
5. Monthly, Semester, and Annual checkout; webhook duplicate/out-of-order handling; trial expiry; renewal; cancel; refund; downgrade with excess tracker items.
6. Low Competition Only, Fit detail, Competition detail, tool allowance, tracker limit, and all server-side bypass attempts.
7. Public pricing/account management on mobile/desktop and accessibility smoke.
8. Notification latency and failure/dead-letter visibility.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| Journeys | Full Free and Pro journeys pass in test mode. |
| Security | No client manipulation unlocks Pro or bypasses usage limits. |
| Idempotency | No duplicate alert, charge, webhook effect, or allowance consumption under retries. |
| Honesty | All public prices, renewal terms, cancellation, and refund promises are accurate. |
| Live mode | Live Stripe mode and production alerts remain disabled. |
| Feature states | Every R8 feature is `implemented`, `feature-flagged pending later ID`, or `honestly unavailable`; none is falsely advertised. |

---

## Phase 6 — Historical Moat gate (INS-043)

**Run after:** INS-037 through INS-042.

### Required evidence
- Core outcome statuses captured from manual and reviewed email paths.
- Scoring version/factor snapshot supports later calibration without retaining unnecessary personal content.
- No model/probability trained or shown before the data threshold and separate validation.
- Opening alerts require verified ATS state.
- Essay/email content remains account-isolated and absent from analytics logs.
- Every Phase 6 feature passes entitlement, privacy, idempotency, and responsive/accessibility checks relevant to it.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| Outcomes | Core outcome statuses are captured from manual and, where available, reviewed email paths. |
| Calibration | Scoring version/factor snapshot can support later calibration without retaining unnecessary personal content. |
| No premature model | No model/probability is trained or shown before the data threshold and separate validation. |
| Opening Soon | Opening alerts require verified ATS state. |
| Privacy | Essay/email content remains account-isolated and absent from analytics logs. |
| Quality | Every Phase 6 feature passes entitlement, privacy, idempotency, and responsive/accessibility checks relevant to it. |

---

## Phase 7 — Growth gate (INS-050)

**Run after:** INS-044 through INS-049.

### Required evidence
- Source-partnership/access records for CareerOneStop, Kaleidoscope, SimplifyJobs, Adzuna, NSF REU with status `not contacted`, `contacted`, `approved`, `denied`, or `needs review`.
- Phase 7 gate across Business vertical inventory, SEO fact/estimate/staleness, community delay/deduplication, referral idempotency/anti-abuse, semester recap accuracy/privacy, Utah pilot attribution/feedback/readiness, and prohibited multi-vertical or unauthorized-source behavior.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| Permissions | Partnership-dependent source code cannot activate without recorded approval. |
| Verticals | Business is the only newly launched vertical. |
| Data | Growth hooks use verified/proprietary data and preserve privacy. |
| Decisions | External decisions are listed with owner/status/evidence, not silently assumed. |
| Tests | Phase 7 integrated tests pass or the exact external blockers are documented. |

---

## Phase 8 — Final Staging Launch Candidate (INS-054)

**Run after:** INS-001 through INS-053, except externally permission-gated sources explicitly classified as post-launch/non-blocking.

### Staging journey matrix
- Anonymous/new/partial/complete Free profiles.
- Top 20/day personalized feed vs unlimited search.
- Eligible/ineligible/unknown constraints.
- Term, amount, trust, marketing, lottery, verification, first-seen, closure/reopen.
- Tech and Business feeds.
- AcademicWorks, Workday, USAJOBS complete/partial/failed/replayed polls.
- Free weekly digest and Pro instant alert.
- All plans, trial triggers, checkout/webhooks, cancel/refund/downgrade.
- Tool allowances, tracker 10/11, saves/reminders.
- Opening Soon, watchlist, verified-opening alert.
- Answer bank, email tracking, weekly triage, outcomes, recap.
- SEO, community feed in disabled/test destination, referrals, Utah pilot disabled/configured.
- Analytics and claim register.
- Privacy/export/deletion/unsubscribe paths.
- Kill switches and rollback/reconciliation drills.

### Launch candidate document
`docs/instela-market-ready/gates/final-staging-launch-candidate.md` must contain:
1. Commit/build/migration identifiers.
2. Exact environment and feature-flag matrix.
3. Every phase gate link/status.
4. Current data-quality/coverage/latency metrics.
5. Unresolved external approvals and why each is or is not launch-blocking.
6. Live claims approved for homepage/pricing.
7. Rollout steps and rollback thresholds.
8. Owner decisions still needed.
9. Final `GO`, `CONDITIONAL GO`, or `NO-GO` recommendation.

### Acceptance criteria
| Criterion | Threshold |
|---|---|
| Evidence | Every market-ready condition in Section 2 has direct evidence. |
| Gates | All Phase 1-7 gates pass, or a report-designated later/external item is explicitly non-blocking and not advertised. |
| Claims | No false coverage, alert-speed, prediction, privacy, or feature claim remains. |
| Readiness | Production configuration/secrets/migrations are prepared and separately verified without being activated. |
| Rehearsal | Rollout and rollback are documented and rehearsed in staging where possible. |
| Proceed rule | Only `GO` may proceed to INS-055. `CONDITIONAL GO` still requires the named conditions to be closed first. |

---

## Release triggers

| Release | Prompt | Scope | Owner confirmation required |
|---|---|---|---|
| Release A — Trust sprint | INS-011A | Phase 1 fixes only | Yes |
| Release B — Controlled paid beta | INS-036A | Phases 1-5 | Yes |
| Release C — Full production release | INS-055 | Phases 1-8 | Yes |

### Release rules
1. The preceding gate must be `PASS` (Release A/B) or `GO` (Release C).
2. A Section 3A confirmation popup must be shown and answered **Yes** before any live change.
3. Migrations and backfills run in order with a dry-run first.
4. Only approved adapters and flags are activated.
5. Live Stripe is enabled only after prices, webhooks, cancellation, and refund paths are verified.
6. If any gate threshold is breached in production, roll back or disable the implicated change using the documented rollback steps. Do not improvise new thresholds.

---

## Kill switches and rollback

- Environment flags in `src/lib/market-ready/flags.ts` default OFF and can disable new rankers, source adapters, notifications, billing, and Opening Soon.
- Database backups must be taken before any Release A/B/C.
- Rollback steps for each phase are recorded in the corresponding gate document and in `runbook.md`.
