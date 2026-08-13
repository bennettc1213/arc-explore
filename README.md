# internship tracker

Internships sourced by polling each employer's own applicant-tracking system, scored
against your profile with reasons you can read, and ranked by how recently we confirmed
the posting was still live.

The product rule everything else follows from: **if we don't know something, we say so.**
No guessed deadlines, no invented win probabilities, no score we can't explain.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

| script | what it does |
| --- | --- |
| `npm run check` | typecheck + lint + tests, in that order |
| `npm test` | `node:test` suites under `src/**/*.test.ts` |
| `npm run db:generate` | drizzle-kit migration from `src/db/schema.ts` |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:audit` | assert every table is protected — see below |
| `npm run ingest:fast` | Tier A — poll every registered employer's ATS |
| `npm run ingest:daily` | Tier B — discover companies and enroll them |
| `npm run ingest:status` | is the corpus still moving? |
| `npm run ingest:rederive` | re-run the detectors over stored JD text (dry run; `-- --apply`) |

## Environment

`.env`, never committed:

```
DATABASE_URL=                     # Supabase transaction pooler
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # public by design; RLS is what protects data
SUPABASE_SERVICE_ROLE_KEY=        # admin scripts only, never in the request path
ANTHROPIC_API_KEY=                # JD + resume parsing, cold-email drafting
RESEND_API_KEY=                   # alerts (M5)
NEXT_PUBLIC_SITE_URL=             # optional locally; set it in production
```

`NEXT_PUBLIC_SITE_URL` matters in production: without it, callback URLs are built from
the request's `Host` header, which a client controls.

## Supabase dashboard setup

Auth is magic-link only. Two settings have to be right or sign-in links fail:

1. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (or the deployed origin)
   - Redirect URLs: add `http://localhost:3000/**` and the production equivalent.
     Supabase refuses any `emailRedirectTo` not on this list — which is also the
     backstop against a poisoned `Host` header pointing sign-in links elsewhere.

2. **Authentication → Email Templates → Magic Link** (recommended, not required)

   ```
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a>
   ```

   `/auth/confirm` accepts both this shape and the stock `{{ .ConfirmationURL }}` PKCE
   shape, so the app works on a default project and keeps working after you customise it.

## Ingestion

Three scheduled workflows in `.github/workflows/`. All three need one repo secret:
**`DATABASE_URL`** (Settings → Secrets and variables → Actions).

**`ingest-fast`, every 20 minutes.** Polls each registered company's own ATS —
Greenhouse, Ashby, Lever, SmartRecruiters — and reconciles against what we hold.

This is the freshness engine, and it only works *as a loop*. A posting in today's
response is verifiably live; `closed_at` is set by a posting's **absence from a later
response**. A single run cannot close anything, which is why "we ran ingestion once" and
"we have a freshness signal" are not the same claim.

**`ingest-daily`, 07:17 UTC.** Reads the Simplify repo for company names only and enrolls
them so Tier A can poll their real boards. No listing content is stored — that repo
carries no license, and its own listings measured 50% stale beyond 30 days, so taking
the names (facts) and pulling postings from each employer's ATS is both the clean path
and the better data. Capped at 400 new companies per run so the registry grows at a pace
the polling budget can absorb.

Three things in `runTierA` are load-bearing and easy to get wrong:

- **`limit` covers the whole registry, it does not ration it.** If it is smaller than
  the number of pollable boards, oldest-first rotation stretches full coverage across
  several runs and the 30-minute freshness gate quietly stops holding.
- **Failing boards back off** (`pollIntervalSec × 3` per failure, capped at daily).
  Companies rename slugs and shut down constantly. Without backoff, dead boards keep a
  slot in every run forever and crowd live ones out of a capped run — the registry stops
  being polled from the bottom up, silently.
- **A single bad board never fails the job.** Exiting non-zero when one company 404s
  would leave the workflow permanently red and train you to ignore it, which is exactly
  how stale data goes unnoticed. Only a majority-failure run fails.

Scripts close the database pool explicitly. postgres.js keeps sockets open, and an open
handle keeps Node alive — a job that does its work in six seconds and then sits until
the runner's timeout looks, from CI, like a job that failed.

**`ingest-scholarships`, weekly (Sundays).** Scrapes `lib/scholarships/`, currently one
source — Communities Foundation of Texas. Not built on the internship Tier A machinery:
there is no ATS underneath a scholarship page to poll every 20 minutes, and the source
states open/closed on each listing directly, so there is nothing to infer from absence
the way `closed_at` works for internships. `persistScholarships` upserts a full snapshot
of the page and closes anything previously scraped from that source that is missing from
the new one entirely — but never on an empty scrape, which reads as a broken parser, not
every scholarship on the page closing at once.

Getting here took two rounds of verification before writing any scraper code, because the
obvious targets all turned out to be dead ends: scholarships.com, niche.com and bold.org
all carry explicit contractual scraping bans (checked their actual ToS text, not assumed
one); CareerOneStop's Scholarship Finder — rated the best free scholarship source going
in — sits behind a site-wide WAF that 403s every request including `robots.txt`; most
state financial-aid-agency pages turned out to be navigation hubs pointing at gated
portals, structurally empty despite being legally the cleanest category on paper.
University/foundation aid-office pages were the ones that actually worked — open
`robots.txt`, server-rendered HTML, real data. CFT's page currently reads **0 open, 48
closed**: not a bug, its funds run on a spring deadline and this was scraped in August.

`postings.freshness_tier` exists for exactly this case. A scholarship or an
aggregator-sourced internship (Adzuna, Muse, RemoteOK, once built) cannot honestly carry
the "confirmed live Xh ago" copy that Tier A earns by polling every 20 minutes — the tier
is `periodic_check`, and the UI owes it different, weaker copy. `postings.kind` keeps the
two verticals in one shared table, per the roadmap's own design intent for a combined
feed, without letting a scholarship get scored by the internship-shaped `scoreFit` — every
existing feed/competitiveness query is explicitly scoped to `kind = 'internship'` until a
scholarship Fit Score exists to score the other kind with.

### Derived fields

`work_auth` and `term` are read out of JD text, and JD text does not always come with
the posting. Greenhouse omits it from the list endpoint; SmartRecruiters — the majority
of the corpus — publishes none at all and has to be fetched one posting at a time, so
both are handled by the bounded backfill rather than inline in the poll.

Because both fields are computed once, when a description first lands, **improving a
detector does nothing for postings already stored.** `npm run ingest:rederive` is the
pass that fixes that; it reads only stored text, makes no network calls, and defaults to
a dry run. It refuses to clear a field it can no longer detect — that is a regression in
the detector, not an improvement in the data, and it should be looked at rather than
applied.

`detectWorkAuth` is precision-first on purpose. A missed requirement drops a scoring
dimension, which is honest under the unknown-is-not-bad rule. A false one tells an
international student an employer will not sponsor them when it might. So every pattern
in it was taken verbatim from live posting text, and phrasings that only look decisive
are deliberately left unmatched — "open to candidates legally authorized to work in the
United States" says nothing, because someone on OPT *is* legally authorized.

## Row Level Security

`src/db/migrations/0002_rls_policies.sql` is load-bearing, and worth understanding before
adding a table.

We migrate with drizzle-kit rather than the Supabase CLI. Supabase's default privileges
grant `anon` and `authenticated` full CRUD on every new table in `public`, and PostgREST
serves those roles to anyone holding the anon key — which ships to every browser. Before
that migration, every table here was readable *and writable* from the open internet at
`https://<ref>.supabase.co/rest/v1/<table>`.

Our own connection is the table owner and bypasses RLS, so:

- **No app behaviour depends on the policies**, and no amount of exercising the app would
  have caught the hole. `npm run db:audit` asserts it directly and exits non-zero on a
  regression. Run it after every new table.
- **Server code still has to scope by `user_id` itself.** RLS covers the door we don't
  control; the `where` clause covers the one we do.

## Layout

```
src/lib/ingest/     Tier A ATS adapters, dedup, freshness reconcile
src/lib/scholarships/ scraped sources (cftexas.ts), separate persist path — see Ingestion
src/lib/score/      fit (deterministic rules + reasons) and timing
src/lib/profile/    profile shape, validation, store  (types.ts is DB-free and tested)
src/lib/resume/     upload rules + Anthropic extraction  (types.ts is DB-free and tested)
src/lib/auth.ts     session helpers; safe-redirect.ts guards the post-auth `next` param
src/proxy.ts        session refresh — Next 16's rename of middleware.ts
src/lib/applications/ tracker status model + store (types.ts is DB-free and tested)
src/app/            feed (/), sign-in (/login), onboarding (/profile), tracker
scripts/db-audit.ts the RLS guard described above
```

Signed out, the feed still works — the profile lives in the URL, so a scored feed is a
shareable link. Signed in, the stored profile wins and URL parameters cannot override it.

## Resume-aware matching

An uploaded resume is an input to the scorer, not a stored document. `lib/score/skills.ts`
extracts a canonical skill set from both sides — the resume and the job description — and
the fifth fit dimension is the overlap.

Three decisions in there are load-bearing:

- **Prose and lists are matched differently.** "Go" in "we go fast" is noise; "Go" as an
  entry in a skills list is the student saying so on purpose. Job descriptions get
  conservative anchored patterns where short names like Go, R and C are deliberately
  unmatchable; explicit skill lists get exact-token lookup. Without the split, every
  student who writes the tidy one-line skills header their career centre taught them
  silently loses those skills.
- **Bullets count as evidence.** A skills header is a claim; "rebuilt the ingest path in
  Go" is proof. Both are read.
- **Coverage saturates at five.** Internship postings list twelve technologies for a role
  that uses three. Linear coverage would put almost every student in the 20s and make the
  number useless for ranking.

A false skill is worse than a missing one: it inflates a score *and* prints a reason the
student can see is wrong, which discredits every other number on the page. The test suite
is mostly false-positive cases for that reason.

`postings.skills` is derived at ingest, not at render. Extraction depends only on the
posting, and the feed scores up to 500 rows per request — re-running ~70 patterns over
every description for every visitor is the same answer computed thousands of times a
minute. It also lets the competitiveness summary aggregate in SQL. Run
`npm run ingest:rederive` after changing the vocabulary.

## Resume critique

`lib/resume/critique.ts` scores an uploaded resume on four dimensions and returns findings
that name a section, quote the offending line, and say what to change. No model call — the
parse already produced the structure, and a second LLM pass would add cost, latency and the
chance of inventing a problem that is not there.

**On the phrase "ATS compatibility."** It is the most oversold idea in the resume industry:
nobody selling a score has the parser the employer actually runs, so the number is invented.
We are in an unusual position to be honest about it, because **we are a machine that just
read the resume.** When the panel says we could not find an email, that is not a guess about
someone else's software — a competent reader was handed the document and came back without
one. The corollary is that by the time we hold a `ParsedResume` the layout is gone, so we
never assert that a table or a column caused it. We report what went missing and name the
likely causes.

Three details worth keeping:

- **A date is not an achievement.** `/\d/` would mark "Built the pipeline in Summer 2025
  using Python 3.11" as quantified. Dates, spaced versions and identifiers like `ES6`/`S3`
  are stripped first — but a bare number is kept, so "grew to 2000 users" still counts. Date
  *ranges* are matched as one unit including the leading preposition, or "from 2023" is
  consumed and the trailing "2025" survives as a phantom quantity.
- **Quantification credit caps at half the bullets.** A resume where every line carries a
  metric reads as padded, not as better.
- **Two findings never quote the same line.** The quantification example deliberately steps
  around whatever the bullet-language finding will quote, because the same sentence printed
  twice reads as a bug rather than as two problems.

Projects are a conditional check, not a required section: they are only raised when there
are fewer than two roles to stand on.

## The tracker

`/tracker` is where saved postings go, and it is the only place this product will ever
get ground truth. Fit, timing and freshness are all heuristics we assert; `outcome` is
the one field that records what actually happened. It ships early for exactly one reason:
outcome data only accumulates from the moment it exists.

Two rules it enforces:

- **`applied_at` is stamped once and never moved.** "When did I apply" has one answer;
  re-stamping on every advance would rewrite the user's own history and destroy the only
  timing evidence a future odds model would have.
- **A response rate under ten submissions is not shown.** One reply out of two is not a
  50% response rate. Below the threshold the UI says how many more it needs, which is a
  real answer; a number there would be a confident-looking figure derived from nothing.

Nothing in the app predicts odds today, and nothing should until this table has enough
behind it.

## What is not here yet

Cold-email generator (M4), alerts (M5), the business vertical (M6) and scholarships (M7).
The schema already carries their tables.
