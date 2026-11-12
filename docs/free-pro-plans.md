# Free and Pro plans

Status as of 2026-11-03. Code: `src/lib/pricing/` (`tiers.ts`, `allowance.ts`, `grants.ts`,
`describe.ts`, `quote.ts`, `checkout-quote.ts`), `src/lib/searches/alerting.ts`,
`src/lib/applications/types.ts`, migration `0032_recurring_allowances`.

Nothing here has been deployed, and migration 0032 has not been applied to any database.

---

## 1. What the code did before this change

Measured from the repository on 2026-11-03, not from production.

| Area | Enforced behaviour | What the UI or comments said |
|---|---|---|
| Plan names | `free` / `apply` | Free was labelled "See it"; some copy still said "Edge" or "Apply plan" |
| Feed depth | Free: top 10 per request | "re-ranked daily", "daily 10" |
| Funding Plan | 10 cards signed out; **uncapped for signed-in Free** | Not documented as different from the list |
| Tracker | Free: 5 tracked rows **of any status**, history included | "Track up to 5 applications" |
| Resume, GitHub, LinkedIn | 1 use **ever** (lifetime counter in `feature_usage`) | Some copy said "1 free run" |
| LinkedIn metering | Counted on the first keystroke, keyed on nothing, so **a reload after typing locked the tool** | |
| GitHub metering | Charged **before** the fetch; a GitHub error still spent the use | |
| Cover letter | Free cap counted `cover_letters` rows, so deleting a draft gave the use back; **regenerations were unlimited model calls on every plan** | |
| Essay reviewer | Pro only | |
| Saved searches | Pro only; 20 max | |
| Weekly digest | Pro only (SQL `plan in ('edge','apply')`) | |
| Fit (v1 path) | Free bucketed label **also dropped work-authorization and location conflicts** | |
| Stripe | Checkout, portal and signed webhook exist behind `MARKET_READY_BILLING`. `tiers.ts` and `schema.ts` comments said "no Stripe exists" | |
| Stripe price | **Local test price `STRIPE_PRICE_APPLY_MONTHLY` = $20.00/month** (read-only check, test mode), page showed $5.99 (the Pro price was changed to $20.00 the same day, which this test price now matches). No coupons exist. A second env var, `STRIPE_PRICE_INSTELLA_PRO_MONTHLY`, appears twice in `.env` and names a price that does not exist; no code reads it | |
| Student discount | Pricing page showed "50% off" for a *pending* claim; checkout never applied any discount | |
| Webhook | `checkout.session.completed` granted Pro without checking `payment_status`; subscription events were applied in arrival order | |
| Build | `lib/stripe.ts` constructed the client at import and threw without `STRIPE_SECRET_KEY`, failing `next build` page-data collection | |

Production configuration (Vercel env, the live Stripe account, whether `MARKET_READY_BILLING` is on there) was **not** inspected.

## 2. Competitors, checked 2026-11-03

Official pages only. "Unknown" means the official source did not state it or could not be fetched; nothing here is inferred.

| Product | Free | Paid price | Source |
|---|---|---|---|
| Simplify | Autofill on supported forms (you submit), manual resume builder, one uploaded resume, job tracker | Simplify+: $19.99/week, $39.99/month, $89.99/3 months. Adds AI resume tailoring, AI cover letters and answers, and Autopilot (submits for you, 20 credits/week) | https://help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing |
| Huntr | Track up to 100 jobs, unlimited autofills, 2 job-tailored resumes, 2 application packets, "a small number" of AI credits (unquantified) | Pro: $40/month, $90/3 months, $160/6 months; unlimited tracking, AI resumes and cover letters | https://huntr.co/pricing |
| Kickresume | 4 templates, no AI writer, no ATS checker | $24/month, $54/3 months, $96/year | https://www.kickresume.com/en/pricing/ |
| Fastweb | Free scholarship search and matching; email reminders. No paid tier mentioned | none stated | https://www.fastweb.com/ |
| Appily | Free account to see scholarship matches. Paid tier, tracking and alerts: not mentioned on the page | unknown | https://www.appily.com/scholarships |
| ScholarshipOwl | Account and matches free; applying through the site is paid | $20/month, $45/3 months, $60/6 months; one-application submission, recurring re-entry, tracking | https://intercom.help/scholarshipowl/en/articles/4146909-why-is-the-half-yearly-membership-60 |
| Teal | unknown (pricing page returned 403) | unknown | https://www.tealhq.com/pricing |
| Bold.org | unknown (site returned 429 to every fetch) | unknown | https://bold.org/ |

**What this says about positioning.** Instela is not the most generous on every axis and should not say it is. Simplify and Huntr give unlimited autofill free; Huntr tracks 100 jobs free against our 10 active. Fastweb is a free scholarship search with no paid tier at all. Instela's specific combination is: internships *and* scholarships in one ranked feed, every safety and eligibility fact on Free, a fit explanation that admits what it does not know, and preparation tools that run without uploading essays or profile text — at $20/month: the same as ScholarshipOwl's monthly plan, below Kickresume ($24), Simplify+ ($39.99) and Huntr Pro ($40), and with no weekly plan. Material gaps worth a later experiment: Free tracking capacity (Huntr's 100), and free autofill (Simplify, Huntr), which Instela cannot offer until the extension is verified.

## 3. The plans

| | Free | Pro ($20/month) |
|---|---|---|
| Search, filter, open every listing | unlimited | unlimited |
| Source links, verification and freshness, eligibility and work-authorization facts, scam/lottery/marketing flags | always | always |
| Ranked results | top 20 per search/filter combination | full list, paginated |
| Fit | Strong/Good/Low label, confidence marker, eligibility conflicts and unknown requirements | + 0–100 score, factor explanations, gap-closing skills |
| Tracker | 10 active at a time; history unlimited | unlimited |
| Deadline reminders | tracked items with a published deadline | same |
| Weekly digest | up to 6 matches | same |
| Saved searches | 1, weekly alerts | up to 20, daily alerts |
| Resume critique | 1 revision every 30 days | unlimited |
| Cover letter | 1 opportunity every 30 days; revising that draft is free | unlimited, 30 AI generations/hour on every plan |
| GitHub audit + README | 1 account every 30 days | unlimited |
| LinkedIn check + builder | 1 72-hour session every 30 days | unlimited |
| Essay review | 1 72-hour session every 30 days | unlimited |
| Timing-weighted ranking | — | up to 20 points |
| Internship autofill extension | — | usable with a "not verified end to end" caveat; **not listed as a benefit** |
| Smart Resume, scholarship autofill, answer bank, one-click reapply, deadline triage, semester recap | not built | not built |

**Why these boundaries.** Free has to finish a real workflow — find, check, organize, produce one artifact — or nobody learns whether the product is any good. Twenty ranked results per search (not per day) means a student who changes filters always sees a fresh top 20, so depth is a limit on *scrolling*, never on *exploring*. Pro is priced on the things that scale with how hard someone is applying: many drafts, many active applications, detailed guidance across many listings, and faster alerts. Safety, eligibility and source evidence are never on the Pro side, because a student deciding whether to apply must not need to pay to learn they are ineligible. Free ranking is the same ranking Pro gets, minus the timing bonus; nothing was made worse to create a gap.

## 4. Allowance semantics (exact)

All times are UTC instants. Implemented in `allowance.ts` (pure, clock injected) and `grants.ts`.

1. The first **successful new use** of a tool starts that tool's period.
2. The allowance renews exactly 30 × 24 h after the period started (inclusive at that instant). Periods do not tick over on their own: the next new use after renewal starts a fresh period.
3. Each tool has its own period.
4. Revisiting an earned result (same key) is a **replay**: free, forever, including after the period ends and after a downgrade from Pro.
5. A use is **reserved** under a per-(user, tool) Postgres advisory lock, the work runs, and the reservation is confirmed on success or deleted on failure. Concurrent requests cannot both take the last unit; a crashed request's reservation stops counting after 10 minutes.
6. Pro uses are recorded with no period: replayable after a downgrade, never counted against Free.

| Tool | One use is | Replay key |
|---|---|---|
| Resume critique | a resume revision not critiqued before | sha256 of the parsed resume (`rev:…`); pre-0032 resume id accepted as an alias. Editing the resume is a new revision |
| Cover letter | a first draft for a new opportunity | posting id. Regenerating or rewriting an existing draft never charges; edits and export are untouched |
| GitHub | auditing a new account (audit and README builder together) | lower-cased username. A failed GitHub fetch releases the use. **Signed-out visitors are unmetered** (existing, documented gap) |
| LinkedIn, essay | a 72-hour session, started with a button | `session`. The request carries no text; the tools still run entirely in the browser |

The "Free includes 1 every 30 days" wording is used everywhere; nothing says "per month".

**Browser-local enforcement is partial by construction.** The server decides whether to render the LinkedIn or essay tool. Inside an open session nothing is metered, and the server cannot tell one essay from another — that is the cost of never receiving the text.

**Cover-letter cost.** Every generation (new, regenerate, paragraph rewrite) passes `throttleAiRequest`: 30 per user per rolling hour on every plan, and a second request within 4 seconds is refused as a double submit. This bounds provider cost per account at roughly 720 calls a day; there is no monthly cap and none is implied.

## 5. Tracker active and history

`occupiesActiveSlot` in `src/lib/applications/types.ts` is the one definition:

- Active: `saved`, `applied`, `screen`, `interview`.
- History: `offer`, `rejected`, `ghosted`, `withdrawn` (the existing terminal statuses).
- A `saved` row on a closed listing is history (nothing left to apply to); a submitted row on a closed listing stays active (still waiting on an answer).

Only a move **into** the active set can be refused: a new save, or reopening a finished one. Moves between active statuses, moves into history, notes, outcomes and removal always work. The check and write run in one transaction under a per-user advisory lock. The extension's "I submitted" callback and the apply wizard's mark-applied path deliberately bypass the limit: a real submission is always recorded. A downgraded account with more than 10 active rows keeps all of them and can still move every one of them to history.

## 6. Notifications

- **Weekly digest:** every plan, up to 6 items, unchanged floors (`DIGEST_FLOOR`, `MIN_PER_KIND`), "send nothing when nothing qualifies", per-profile watermark, unsubscribe link. Free emails show the fit label, never the number. Rows already covered by a search that *actually alerts* on the account's plan are suppressed; a Free account's paused searches no longer suppress digest rows.
- **Saved-search alerts:** Free 1 search, at most once every 7 days; Pro up to 20, at most daily. `search-alerts.yml` runs once a day (13:23 UTC), so "daily" is the fastest real cadence. A 3-hour slack absorbs scheduler drift. Alerts only report rows already found by ingestion.
- **Downgrade:** all saved searches are kept. On Free one search holds the alert slot: the student's latest pick ("alert on this one instead"), else the newest. Turning that search's alerts off, or unsubscribing from its email, silences it and never promotes another.
- **Delivery is not verified.** All three jobs stay dry-run by default. Real delivery still needs `REMINDER_FROM_EMAIL` on a verified Resend domain (FIXES.md §1). Selection is unit-tested; no email was sent in this work.

## 7. Billing

- `getCheckoutQuote` reads the configured Stripe price (read-only) and checkout is offered and accepted **only** if it equals the displayed Pro price ($20.00), USD, monthly and active. The local test price ($20.00) matches; production has no `STRIPE_PRICE_APPLY_MONTHLY`, so checkout there stays closed.
- Student price: shown as applied only for a **current** verified enrollment claim **and** a valid coupon in `STRIPE_COUPON_STUDENT`, at the amount computed from the coupon (a 50% coupon on $20.00 is exactly $10.00). A pending claim shows "may be available", never a price. No coupon exists today, so no student price is offered.
- Pro is granted only by the signed webhook: `checkout.session.completed` now requires `payment_status` paid (or no payment required), and subscription events re-read the subscription from Stripe so a late "active" cannot override a cancellation. The `?checkout=success` redirect grants nothing.
- Cancellation and the billing portal are unchanged.

## 8. Rollout and rollback

Local or staging only; none of this has been run against the shared database.

1. `npm run check`.
2. On a staging database (FIXES.md §7: none exists yet — create one first): `npm run db:migrate`, which applies `0032_recurring_allowances`. It creates `feature_grants` and `tool_request_log` with RLS, adds `saved_searches.free_alert_picked_at`, and backfills grants from `cover_letters` and from `feature_usage.last_key`.
3. Verify: a Free account's existing cover letters reopen and regenerate without a wall; a resume critiqued in the last 30 days replays; an older one does not block a new revision.
4. Set `STRIPE_PRICE_APPLY_MONTHLY` to a $20.00 monthly USD price. Optionally create a 50% `forever` coupon and set `STRIPE_COUPON_STUDENT`. Run one test-mode checkout per path.
5. Deploy the code and the migration together. Code without 0032 fails on every page that reads `feature_grants` (profile, GitHub, LinkedIn, essay, cover letters).

**Rollback:** redeploy the previous commit. 0032 is additive; the old code never reads the new tables or column and `feature_usage` was left intact. Grants written meanwhile are simply ignored. Dropping the new objects is optional.

**Transition for existing users.** Lifetime counts are not carried over, so nobody starts with an exhausted allowance. Each old counter's last key becomes a granted use at its last-used time: if that was within 30 days it is this period's use, otherwise the allowance is open. Every existing cover letter becomes a granted use for its posting (period from its creation date on Free, no period on Pro). Tracker rows are untouched; history no longer counts against the limit.

## 9. Measurement

The `events` table holds no user id, by design (`/privacy`). That rules out per-person funnels from events; this change adds only `upgrade_prompt_viewed {feature}` and `checkout_started {student}` as counts. Everything per-user below is read from tables that already exist for a functional reason.

| Metric | Definition | Source | Status |
|---|---|---|---|
| Free→paid conversion | accounts that became Pro in the window ÷ accounts that existed on Free at the start of the window (28-day window) | `profiles.plan`, `plan_updated_at`, `created_at` | computable; unmeasured (no paying users) |
| Activated Free→paid | the same, with the denominator restricted to `profiles.activated_at` set before the window | `profiles.activated_at` | computable; unmeasured |
| Paid conversion after a limit | Pro starts in the 14 days after an account's first Free limit hit ÷ accounts that hit that limit | limit hits are inferable per user only for tools (`feature_grants` periods); tracker and saved-search limit hits are event counts without user ids | **only for tools**; exposures are aggregate counts |
| Day-7 return | accounts with any user-owned write (grant, tracker change, saved search, letter edit) on days 7–13 after signup ÷ signups that day | those tables' timestamps | computable as a lower bound; sign-in without a write is invisible |
| Paid retention at first renewal | Pro subscriptions still active 35 days after start ÷ those started | Stripe subscriptions + `billing_webhook_events` | requires Stripe reporting; unmeasured |
| Tool cost per active user | AI calls (`tool_request_log`, retained ≥ 1 h) × provider cost ÷ weekly active accounts, split by plan | `tool_request_log`, `feature_grants` | needs a retention policy for the log; unmeasured |

No benchmark conversion rate is assumed. With 10 profiles, all test accounts, none of these numbers is citable (the project's below-ten rule applies).

**Later experiments**, one at a time and only once a Free cohort exists: 20 vs 30 ranked results; 10 vs 25 active tracker slots; 1 vs 2 cover letters per period; upgrade copy about saved effort vs detailed guidance. The baseline is the matrix above.

## 10. Open operational dependencies

- Migration 0032 needs a staging database to rehearse on.
- Stripe price must be $20.00 for checkout to open; the student coupon does not exist.
- Email sender (`REMINDER_FROM_EMAIL`) for any delivery.
- The signed-in flows above have not been driven by a human session; see FIXES.md.

## 11. Upgrade hooks, and the proof under each (2026-11-12)

The Free plan now shows the *shape* of what Pro holds, never fabricated
content. Every hook is a count over real rows or a timestamp we observed, and
each is paired with a way to check it.

| Hook | Where | Built from | Proof the student can check |
|---|---|---|---|
| "found 7m ago" / "confirmed live 12m ago" | every feed row, listing header | `firstSeenAt` (our crawler), `lastSeenAt` on `live_polled` sources | listing receipt, `/live` |
| "25,380 more ranked matches past your top 20 · 621 close within 14 days · 258 found in 24h · $X in N confirmed awards" plus 3 redacted stubs | after row 20 on Free | `summarizeHidden` over the rows this request ranked and trimmed | the counts match SQL (verified 2026-11-12) |
| "Pro shows the exact score, the 3 skills you match and the 1 you're missing" | fit badge tooltip, listing page | `presentFit` `lockedCounts` (counts only, no names) | n/a: the counts are this student's own |
| "14 new to Instela since Tuesday · 5 Strong Fit · 3 past your free top 20" | above the feed, signed in | `profiles.last_feed_seen_at` / `prev_feed_seen_at` (migration 0035) + `summarizeNew` | the `?new=N` filter |
| "N saved listings close within 7 days" | tracker | stated `deadline_at` only | the listing's own deadline |
| live pulse: boards checked in the last hour, last check, new/closed in 24h; "paused" when stale | explore, pricing, `/live` | `organizations.last_polled_at`, `postings` | `/live` source ledger |
| listing receipt: source, first found, confirmed on the board, apply-link check result | `/listing/[id]` | `posting_sources`, `confirmed_at`, `url_checked_at`/`url_status` | — it is the proof |

**Refused, so nobody rebuilds them:** "N students viewing this" (no per-user
data, and fewer than ten real users), countdown timers that reset, "posted X
min ago" without an employer date, testimonials without a named source, and
delaying listings for Free. Free still sees every listing the moment we find
it; the owner chose framing over degrading Free.

Events: `upgrade_prompt_viewed` now carries a `surface` (`hidden_matches`,
`since_visit`, `listing_teaser`) beside `feature`, still with no user id.
