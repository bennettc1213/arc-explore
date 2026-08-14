# Build Roadmap — Scholarship & Internship Platform

Seven phases, ordered so the core matching loop (Phase 02) is live before anything else gets built on top of it. Work through phases in order — each one should be functional before starting the next.

**Status legend:** `[x]` done · `[~]` partly done, see note · `[ ]` not started.
Notes in _italics_ record what was actually built and where it differs from the original line, so the difference is deliberate rather than forgotten.

---

## Phase 01 — Foundation
*Data pipelines, schema, and auth. Nothing here is visible to a user yet, but nothing after it works without it.*

- [x] Choose your stack — frontend framework, backend/API layer, database, hosting
  _Next.js 16 (App Router) · Supabase Postgres · Drizzle ORM · Vercel · GitHub Actions for cron._
- [x] Set up the GitHub repo and basic project structure
  _`bba15c3` tracks 112 files, `.env*` ignored, tree verified free of credentials before it landed. Pushed to `github.com/bennettc1213/arc-explore`, public, `master` tracking `origin/master`._
- [x] Design the database schema: users, profiles, opportunities, applications, saved items
  _12 tables. Row Level Security added in migration 0002 — before it, every table was readable **and writable** from the open internet via the public anon key._
- [x] Build basic auth (sign up / log in)
  _Magic link only, no passwords. `src/proxy.ts` handles session refresh._
- [ ] Connect the Adzuna API for internship listings
  _Still open, and now blocked rather than merely unstarted: there is no Adzuna app id/key in `.env`, so nothing here is testable until one is registered. **USAJobs was wired instead** (next line) — it was the better source and its key was already sitting unused._
- [x] Connect USAJobs — federal student openings _(added; not in the original plan)_
  _**21 postings across 25 agencies, all 21 carrying a real employer-stated deadline** — deadline coverage no ATS source comes close to. `USAJOBS_API_KEY` was already in `.env`, unreferenced by any code. Not an aggregator: USAJobs is the federal system of record, so absence from a response means the announcement is gone, the same inference Tier A makes on an employer's own ATS. Written as `periodic_check`, not `live_polled` — it runs daily in `ingest-daily`, so these rows say "checked as of 8/14/2026" rather than "confirmed live"; moving the step to `ingest-fast` is what would earn the stronger claim. **The trap:** `HiringPath=student` looks like a classifier and is only a scope. 58 of its 102 results also list `public` (open to everyone, students merely eligible), and the 44 student-exclusive ones include a grade-15 Physician and a Staff Psychologist. Trusting it would have published senior clinical roles as internships. Classification stays title-driven per `classifyOpportunity`, with the federal naming convention (`student trainee`, `student volunteer`, `student research assistant`) added to `INTERNSHIP_RE` beside the existing regional entries — only 1 of the 22 genuine student postings contained the word "intern". 80 of 102 are correctly rejected. Pay is deliberately dropped: USAJobs states a rate whose unit lives in a separate `RateIntervalCode`, and writing 17 (dollars/hour) into the same `amount_min` column that holds a 5000-dollar scholarship award would break the "min award" filter in both directions — that needs a rate-interval column first. A live-only bug the fixture caught: USAJobs sends zoneless timestamps, which `new Date()` reads as server-local, so a deadline landed on a different calendar day on a Pacific laptop than in UTC CI; naive stamps are now pinned to UTC._
- [ ] Add The Muse and RemoteOK as additional free internship sources into the same pipeline
  _Same decision. **These are aggregators** — we measured Simplify, an aggregator, at 50% stale beyond 30 days, which is why the pipeline polls employer ATS feeds directly. Their rows cannot carry the "confirmed live 5h ago" claim and must be visibly labelled differently._
- [x] De-duplicate the combined internship feed by title, company, and posting date
  _`canonical_hash` over normalized company + title + location + term. Location and term rather than posting date: the same title genuinely runs as separate reqs per city, and Summer 2026 vs 2027 are different opportunities._
- [~] Build a scraper for an initial small set of 10–15 trusted scholarship sources
  _**5 of the target 10–15 wired; 4 of them actually landed — the corpus is ~1,935 scholarships, not the 5,537 this line claimed** (measured 2026-08-14 via `ingest:status`).

  **Row count is the wrong metric, and measuring it changed what to build next.** Data density by source, open rows only: Scholarships.com carries an amount on **0%**, a deadline on **0%** and eligibility on **0%** of its 1,559 rows — its listing endpoint returns a name and a URL and nothing else — while the direct-scraped UNL carries amount and deadline on **100%** of 259. So 86% of the corpus was a title and a link: unscoreable on the Fit Score's award dimension, invisible to the deadline filter, unusable for Phase 05 reminders. Enriching it is not an option — Parse detail endpoints cost a credit each, so 1,559 rows against a 200/month budget is arithmetically impossible. **Depth comes from direct scrapes, not from more aggregator rows.** Communities Foundation of Texas (48 endowed institutional funds, all past-deadline right now), University of Nebraska–Lincoln's external list (264, ~259 genuinely open), Scholarships.com (1559 US listings across 8 curated directory sections, live-verified and persisted 2026-08-14 00:21), and University of Nevada, Reno's external list (59 entries, added 2026-08-14 on the strength of the density finding above — `robots.txt` is `Disallow:` with an empty value, permitting everything). **UNR was picked for what it states, not how many rows it has: eligibility prose on 100% of entries**, which no other source gives us at all, and which is exactly the text `fieldsFromDegreeLanguage` reads. Its rows are field-classifiable at 32% against Scholarships.com's 4%. Amounts land on 39% and deadlines on 10%, both parsed out of prose and left null wherever `parseAmount` is not confident; a deadline stated without a year ("deadline of March 22") rolls forward to the next occurrence rather than resolving into the past. **ScholarshipPortal (3666 rows) has never persisted** — three consecutive attempts died: a pooler `CONNECTION_CLOSED` after a 17-minute crawl, an insert failure whose real cause was unreadable, then a 429. Two fixes landed since (see below); the third attempt is gated on Parse credits, not on code. Verified before writing any code: the direct-scrape candidates (scholarships.com, niche.com, bold.org, CareerOneStop) are contractually banned, WAF-blocked, or structurally empty behind a gated portal — so Scholarships.com and ScholarshipPortal were brought in through the **Parse scraping API**, a licensed wrapper, instead of being scraped directly (`lib/scholarships/parse.ts`; metered at **200 credits/month** on the free tier — not the 100/day this line used to say, and the distinction matters: one full ScholarshipPortal crawl is ~19 pages and therefore ~19 credits, so a failed attempt costs ~10% of the month's budget and "wait for tomorrow" is the wrong advice. The 429 message no longer names a reset window it cannot know). University/foundation financial-aid pages are what actually worked direct. See README for the bugs only a live run surfaced — unstable pagination faking closures, a source typo parsing as a confident $0, re-closing already-closed rows, Supabase pooler dropping connections mid-persist (`idle_timeout: 55` plus batched upserts), and an uncapped `Retry-After` sleep that made a 429 hang for hours (now capped at 60s). **Two more found 2026-08-14 while diagnosing why ScholarshipPortal never landed:** the `posting_sources` insert was never batched — the `postings` upsert beside it was, with a comment explaining exactly why — so every row went in one statement, the shape that drops a pooler connection; and every ingest failure was recorded as `err.message`, which for a Drizzle error is the whole statement plus every bound parameter, burying the actual Postgres cause on `err.cause`. That is why the 00:52 failure logged ~300KB and still could not be diagnosed. `lib/ingest/errors.ts` now walks the cause chain, pulls the SQLSTATE and constraint off it, drops the params (they can hold user data) and caps the result at 400 chars. **Open issue:** the UNL crawl still intermittently drops a row (263/263/264 across three consecutive scrapes), which closes a live scholarship until the next run picks it up again; the real fix is requiring absence from two consecutive scrapes, not another sort key. Rows now also carry `amount_needs_review` (source stated a figure we could not parse, as distinct from stating none) and `is_content_marketing` (small-award law-firm link-building scholarships — 126 of 314, tagged not filtered, for the scholarship Fit Score to weigh later)._
- [x] Normalize both feeds into one shared "opportunity" schema (title, org, deadline, amount/pay, eligibility, posted date, source URL)
  _`postings.kind` discriminates the two verticals in one table, per this line's own intent. Added `amount_min`/`amount_max`, `eligibility` (jsonb), `sponsor_name` (for rows with no `organizations` link), `freshness_tier` (`live_polled` vs `periodic_check` — the honesty distinction Adzuna/Muse/RemoteOK will need too, not just scholarships). Migration `0005`, applied._
- [x] Set up a scheduled refresh job so listings update daily, not just on first import
  _`ingest-fast` every 20 min (all four ATS adapters), `ingest-daily` for company discovery. Needs the `DATABASE_URL` repo secret to run in CI._
- [~] Build a simple internal admin view to spot-check the scraped data for accuracy
  _CLI only: `npm run ingest:status`. No web view._

## Phase 02 — Core Matching MVP
*One profile, one feed, one honest score. This is the actual product — everything else layers on top of it.*

- [x] Build the student profile intake form (major, GPA, grad year, location, interests, eligibility flags)
- [x] Build the combined browse/search feed — scholarships and internships together, one list
  _One shared `postings` table, one feed, one rank. `getFeed` returns both kinds and the in-memory ranking runs before the limit so one kind cannot crowd out the other. Text search added: AND-of-substrings over title, org/sponsor and eligibility, pushed into SQL because it is the one filter that can cut the row count by orders of magnitude and everything downstream costs per row. `descriptionText` is deliberately not searched — "python" sits in the boilerplate of half our internship descriptions, so including it makes search look broken by matching nearly everything. `ilike`, not `tsvector`: at ~4k rows the scan is free and "eng" should find "Engineering", which stemming would break. Wildcards in the query are escaped (`feed-search.ts`) — unescaped, a search for "100%" matched every row in the table._
- [x] Add filters: deadline, amount/pay, category, location, remote
  _`kind`, `deadline` (days out), `minAmount`, and `location` added; term, remote and show-closed existed. Category now added — and deliberately **not** backed by `postings.category`, which is null on all 3,765 rows and would have filtered to zero forever (`organizations.vertical` is equally empty). It reuses the six-key field taxonomy the Fit Score already matches on, via the same exported functions the scorer calls, so a row can never show a "matches software" chip and be missing from the software category. Applied in memory for that reason: restating the regexes in SQL would create a second copy to drift. **The honest cost:** the taxonomy can only read what a source wrote, and 90% of open scholarships (1,632 of 1,820) name no field at all, so the feed reports that count beside the results rather than letting a category look like an empty corpus._
- [x] Design the scholarship Fit Score formula (eligibility match, competition-level heuristic, essay/effort required)
- [x] Implement the scholarship Fit Score and show it on every listing
  _Three dimensions: field (35, degree-language match over title/sponsor/eligibility), award (35, tiered by stated amount), competition (30, the `is_content_marketing` tag). Unknown is dropped, never a miss, same contract as the internship score._
- [x] Design the internship Fit Score approach (skills/keyword match against the listing description)
- [x] Implement the internship Fit Score and show it on every listing
  _Five weighted dimensions: work authorization, term, field, location, skills. Unknown dimensions are dropped from the average, never scored as a miss._
- [x] Add a "why this score" breakdown so a student can see what drove the number
  _Plus an `N/5` marker, because a posting known on one dimension can otherwise hit 100 and look as confident as one known on all five. Ranking shrinks toward neutral by confidence for the same reason._
- [x] Add a "posted X hours/days ago" freshness badge to every listing
  _Reads "confirmed live 5h ago" — what we last verified on the employer's own board, not a posting date we were told._
- [~] Test the full loop end-to-end with your own profile and a few real student profiles
  _Automated browser walkthroughs pass. No real students yet._

## Phase 03 — Resume & Cover Letters
*Every material a student submits with an application, grounded in the same match data as the Fit Score, not generated in a vacuum.*

- [ ] Build the resume editor (education, experience, skills, projects)
- [~] Add resume import — upload an existing PDF/DOCX, or paste from LinkedIn
  _PDF and plain text. DOCX is a zip of XML we cannot read without another dependency — the UI says so rather than failing oddly. No LinkedIn paste._
- [x] Parse resume content into structured fields the matching engine can read
  _PDFs go to Claude as a document block, not through a text extractor: two-column resumes interleave into nonsense otherwise. Absent means null, always._
- [x] Connect resume content directly into the internship Fit Score, so matches become resume-aware
  _Skills are read from the explicit skills list **and** from experience bullets — a bullet saying "rebuilt the ingest path in Go" is evidence, not just a claim. Derived on read, so improving the extractor improves everyone's scores without a re-upload._
- [x] Add a keyword-gap view per internship listing — what is missing vs. that posting
  _Shown on every row. Rendered even with no resume, worded as "this role names…" rather than "not on your resume" — there is nothing to be missing from yet._
- [ ] Add resume export (PDF/DOCX download)
- [x] Add an overall resume competitiveness summary, not just a per-listing score
  _On `/profile`: roles sharing a skill, roles matched, and the top gaps ranked by how many more roles each would put in reach._
- [x] Build a resume critique engine — score an uploaded resume on ATS compatibility, section completeness, and quantified-achievement usage
  _`src/lib/resume/critique.ts`. Deterministic, no model call: the parse already produced the structure, so a second LLM pass would only add cost, latency and the chance of inventing a problem that is not there. Every check reports what it counted._
- [x] Surface the critique as specific, actionable fixes per section, not just one score
  _Each finding names the section, quotes the offending bullet where there is one, and says what to change. Findings are ordered by how much the fix moves the score._
- [ ] Build the Smart Resume converter using the resume-structuring logic you provide
  _**Blocked on you.** The line says "the logic you provide" and that logic has not landed yet — paste it in and this becomes buildable. Without it there is nothing here that the critique engine does not already do._
- [ ] Add Smart Resume PDF export
  _Follows the converter. Note this and "resume export" above are the same renderer, built once._
- [x] Build a cover letter editor tied to a specific listing, pulling in the org/role name and key requirements automatically
  _`/listing/[id]` with the full posting facts, the "why this score" breakdown, and the coverage gap line; the editor renders the same grounded context the Fit Score uses._
- [x] Generate a first-draft cover letter grounded in the actual resume-to-listing match data, not generic filler
  _`src/lib/cover-letter/` — context builder (candidate facts, posting facts, ranked evidence, honest gaps) plus the generator. The anti-fabrication rule from the cold-email module applies here verbatim: the model may assert only facts present in the parsed resume or profile, and must emit a literal `[YOUR SPECIFIC DETAIL: …]` slot for anything it wants but does not have. Slots are re-derived from the text deterministically (`slotsFromText`), so a model that ignores the field still leaves visible gaps, never invented facts._
- [x] Let the student edit and regenerate individual paragraphs instead of accepting one opaque draft
  _Per-paragraph textareas with a rewrite button (single-paragraph regeneration), a save form, and a start-over. `cover_letters` table: one row per (user, posting), paragraphs jsonb, unique index._
- [x] Add cover letter PDF export
  _Print stylesheet in `globals.css` + a print button: the `.letter-sheet` renders from editor state, so print always matches the edits on screen. Paper is the honest destination — no DOM-to-image dependency._

## Phase 04 — Professional Profiles
*Standing assets outside the platform, built to the same no-slop standard as everything else here.*

- [ ] Build a GitHub profile builder for tech-track students — profile README generator and pinned-repo recommendations
- [ ] Add a GitHub profile audit (README quality, repo descriptions, contribution consistency) grounded in what recruiters actually check, not contribution-graph gaming
  _Genuinely buildable: GitHub's REST API serves public profiles, repos and READMEs with no auth and a published rate limit. This is the one audit here we can run on real fetched data._
- [ ] Build a LinkedIn profile builder for general applicants — headline, About section, and experience bullet templates grounded in real optimization patterns
  _Fine as specified — it generates text the student pastes into their own profile. Nothing is fetched, so nothing touches LinkedIn's terms._
- [ ] Add a LinkedIn profile checker — scores profile text the student pastes in against headline strength, skills alignment, and recommendations; never fetches a live profile
  _Now buildable as written. The paste-in constraint is the whole reason: LinkedIn sued Proxycurl in N.D. Cal. and it shut down in July 2026, so a fetch here is the one thing that could end the project. Scoring text the student hands us touches nothing._
- [ ] Add an Open to Work reminder as static advice, not a check — the setting is not visible to a logged-out request
  _Correctly demoted. There is no way to observe this without being logged in as the student, so any "check" would be a number we invented — the exact thing the resume critique refuses to do._
- [ ] Add a short routing prompt — tech-track students toward GitHub, everyone toward LinkedIn, without forcing both
- [ ] Let students link a finished GitHub/LinkedIn profile back into their platform profile so it feeds the overall competitiveness summary
  _`profiles.portfolio_url` already exists and the resume parser already picks a non-platform link out of the resume, so this is wiring, not new plumbing._

## Phase 05 — Trust, Applications & Tracking
*The failure mode of every aggregator is dead links and stale data. Do not repeat it.*

- [x] Build an application tracker (Saved, Applying, Submitted, Decision)
  _Eight states. `applied_at` is stamped once and never moved; response rate is withheld below ten submissions rather than shown as a flattering fraction._
- [ ] Add deadline reminders (email, X days before)
  _Resend key is already in `.env`._
- [ ] Build an admin dashboard to review and curate listings before they go live
- [~] Set up automated dead-link checking on a schedule, flag anything that 404s
  _Stronger than a link check already: a posting that disappears from its employer's ATS gets `closed_at` set within ~20 minutes. No HTTP check on the apply URL itself yet._
- [ ] Add a "report this listing" button for students
- [ ] Write and publish a clear "we do not sell your data" privacy policy

## Phase 06 — Engagement & Differentiation
*What makes someone come back a second time.*

- [ ] Build an essay/SOP reviewer tool (structured feedback: clarity, relevance, specificity)
- [ ] Add peer reviews on individual listings
- [ ] Add saved searches with new-match alerts
- [ ] Add light gamification — points for profile completion, applying, and referrals
- [ ] Add a side-by-side comparison view for two or three opportunities
- [ ] Add a weekly email digest of new matches

## Phase 07 — Launch & Growth
*The phase that actually produces the number for your resume.*

- [ ] Recruit a small beta group, starting with your own campus network
- [ ] Collect structured feedback from beta users and fix the top issues
- [ ] Reach out to career centers and student orgs for distribution
- [ ] Set up basic usage analytics — signups, searches run, applications tracked
- [ ] Define the specific metrics you want to cite and confirm you are capturing them
- [ ] Public launch push — social, campus channels, student groups

---

## What to do next

1. **Land the ScholarshipPortal rows** (Phase 01). **Blocked on Parse credits, not on code.** The corpus is 3,765 postings — 1,890 internships and 1,875 scholarships. Both bugs the failed attempts exposed are now fixed (unbatched `posting_sources` insert; unreadable error capture — see line 28), and the persist path was re-verified end-to-end against CFT. What is still unproven is the multi-batch path at ScholarshipPortal's scale: nothing above 500 rows has been persisted since the fix, because every source big enough to exercise it costs credits. Before re-running, **check the Parse account's remaining balance** — the free tier is 200/month, one crawl is ~19, and 2026-08-14's three failures already spent some of it. Then `npm run ingest:scholarships -- --source scholarshipportal` and confirm with `npm run ingest:status`.
2. **More scholarship sources** (Phase 01). 4 of the target 10–15 are wired (CFT, UNL, Scholarships.com, ScholarshipPortal — the last two through the Parse scraping API; see line 28). Freshness is labelled honestly via `freshness_tier`.
3. **Decide whether the field taxonomy covers non-tech students** (Phase 02, needs a call from you). The category gap is no longer mainly an ingestion problem — UNR proves eligibility text can be had for free. It is now a *taxonomy* ceiling. `FIELDS` has six keys, all tech/business (software, data_ai, hardware, quant_finance, product, business), and the scholarship corpus is not. Of the 1,632 unclassifiable rows, **182 name a subject the taxonomy has no key for at all** — education (42), nursing/health (36), engineering (29), arts/media (28), law (19), science (18), trades (16) — and the remaining 1,450 state no subject anywhere in title or sponsor, so nothing but a detail fetch would place them. Adding keys widens `INTEREST_OPTIONS`, the profile intake and both Fit Scores, so it is a product decision about who this serves, not a parser change.
4. **Aggregator sources** (Phase 01) — Adzuna first, labelled unverified. **Needs you to register a free Adzuna app id/key** and put them in `.env`; there is nothing to build against until then. USAJobs already covers the "more internship sources" goal for now, and unlike these it is not an aggregator.
5. **Deadline reminders** (Phase 05). The Resend key is already in `.env`, and 316 scholarship rows carry a known deadline to remind against.

**Waiting on you:** the resume-structuring logic for the Smart Resume converter.
