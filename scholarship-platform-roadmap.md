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
  _Decided: add it, labelled unverified. Not built yet._
- [ ] Add The Muse and RemoteOK as additional free internship sources into the same pipeline
  _Same decision. **These are aggregators** — we measured Simplify, an aggregator, at 50% stale beyond 30 days, which is why the pipeline polls employer ATS feeds directly. Their rows cannot carry the "confirmed live 5h ago" claim and must be visibly labelled differently._
- [x] De-duplicate the combined internship feed by title, company, and posting date
  _`canonical_hash` over normalized company + title + location + term. Location and term rather than posting date: the same title genuinely runs as separate reqs per city, and Summer 2026 vs 2027 are different opportunities._
- [ ] Build a scraper for an initial small set of 10–15 trusted scholarship sources
  _**Not started. Zero scholarship coverage** — the largest gap between this roadmap and what exists._
- [~] Normalize both feeds into one shared "opportunity" schema (title, org, deadline, amount/pay, eligibility, posted date, source URL)
  _Internships normalized: title, org, deadline, posted date and source URL all exist. **No `amount` field, no eligibility columns** — both are scholarship-shaped and land with that work._
- [x] Set up a scheduled refresh job so listings update daily, not just on first import
  _`ingest-fast` every 20 min (all four ATS adapters), `ingest-daily` for company discovery. Needs the `DATABASE_URL` repo secret to run in CI._
- [~] Build a simple internal admin view to spot-check the scraped data for accuracy
  _CLI only: `npm run ingest:status`. No web view._

## Phase 02 — Core Matching MVP
*One profile, one feed, one honest score. This is the actual product — everything else layers on top of it.*

- [x] Build the student profile intake form (major, GPA, grad year, location, interests, eligibility flags)
- [~] Build the combined browse/search feed — scholarships and internships together, one list
  _One list, internships only. **No text search yet.**_
- [~] Add filters: deadline, amount/pay, category, location, remote
  _Term, remote and show-closed only. Deadline, amount, category and location filters are missing._
- [ ] Design the scholarship Fit Score formula (eligibility match, competition-level heuristic, essay/effort required)
- [ ] Implement the scholarship Fit Score and show it on every listing
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
- [ ] Build a cover letter editor tied to a specific listing, pulling in the org/role name and key requirements automatically
- [ ] Generate a first-draft cover letter grounded in the actual resume-to-listing match data, not generic filler
  _The anti-fabrication rule from the cold-email module applies here verbatim and is non-negotiable: the generator may assert only facts present in the parsed resume, and must emit a literal `[YOUR SPECIFIC DETAIL: …]` slot for anything it wants but does not have._
- [ ] Let the student edit and regenerate individual paragraphs instead of accepting one opaque draft
- [ ] Add cover letter PDF export

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

1. **Commit the repo.** Minutes of work, and right now a single mistake loses everything.
2. **Scholarship ingestion** (Phase 01). The product is named for it and has none. It needs its own schema fields (amount, essay required, eligibility) and its own Fit Score, because there is no ATS equivalent to poll — freshness will be weaker there and has to be labelled honestly.
3. **Feed search and the missing filters** (Phase 02). Cheap, and the feed is now large enough that browsing alone is getting unwieldy.
4. **Cover letters** (Phase 03). The match data they need to be grounded in already exists.
5. **Aggregator sources** (Phase 01) — Adzuna first, labelled unverified.

**Waiting on you:** the resume-structuring logic for the Smart Resume converter.
