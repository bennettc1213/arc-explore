# Handoff — read this before writing any code

You are picking up a working Next.js 16 scholarship-and-internship platform that
is further along than it looks. Nearly every roadmap line is done. **The
remaining work is in `FIXES.md`, not in the roadmap** — read that sentence
again, because it is the single most important thing on this page.

Last session ended at commit `27e73e5`. `master` is **25 commits ahead of
`origin/master` and has never been pushed.**

---

## 0. The protocol you must follow every single time

This is not optional and it is not a style preference. The owner asked for it
explicitly and it is the reason this project has stayed legible.

**Every time you finish a prompt, before you hand back:**

1. **Did you find anything broken, missing, blocked, or deliberately skipped?**
   Add it to `FIXES.md` — in the *same commit* as the work that found it. Never
   let one accumulate silently until later.
2. **Did you fix something already listed there?** Change its line from `- [ ]`
   to `- [x]` and leave the text describing what it was, in the same commit.
3. **Say so in your reply.** End every response with a short section naming
   exactly what you added to or closed in `FIXES.md`. If you added nothing, say
   "no new FIXES entries" — explicitly, so silence is never ambiguous.
4. **Did you finish a roadmap checklist item?** Flip `- [ ]` to `- [x]` in
   `scholarship-platform-roadmap.md` in the same commit, and write a short
   italic note under it saying what was actually built and where it differs
   from the line as written.

`FIXES.md` uses `[ ]` open · `[x]` fixed · `[~]` partly done. It has seven
sections; put things where they belong rather than at the bottom.

---

## 1. What this project is

A platform that helps students find and apply to internships and scholarships.
One combined feed, one honest Fit Score per listing, plus the materials
(resume, cover letter, GitHub/LinkedIn profiles) and the tracking around them.

- **Stack:** Next.js 16 App Router · Supabase Postgres · Drizzle ORM · Vercel ·
  GitHub Actions for cron.
- **Auth:** magic link only. No passwords. This matters — see §6.
- **Corpus today:** 3,788 open postings, 820 employer ATS boards polled
  directly, 5 signups (all test accounts — no real student has ever used this).
- **Tests:** 551, all passing. `npm run check` = typecheck + lint + test.

### Files that carry the context

| File | What it is |
|---|---|
| `CLAUDE.md` | Project memory. Pulls in the three below. |
| `scholarship-platform-roadmap.md` | *What to build.* Seven phases, with a long italic note under most lines explaining what was actually built and why it differs. **The notes are the real documentation.** |
| `FIXES.md` | *What is wrong with what exists.* Where the remaining work is. |
| `AGENTS.md` | **Machine-owned.** `next dev` rewrites it. Do not put anything you care about there — it will come back. |
| `HANDOFF.md` | This file. |

---

## 2. Where we are, honestly

49 lines done · 5 partly done · 10 not started.

| Phase | State |
|---|---|
| 01 Foundation | Done except two aggregator sources (one blocked on a key) and "more scholarship sources" |
| 02 Core Matching MVP | Done. Only the "test with real students" line is open, and it needs real students |
| 03 Resume & Cover Letters | Done except the Smart Resume converter, which is **blocked on the owner** |
| 04 Professional Profiles | Complete |
| 05 Trust, Applications & Tracking | Complete. The auto-submit line is a deliberate refusal — see §4 |
| 06 Engagement | Complete except peer reviews (deferred) and part of gamification (refused) |
| 07 Launch & Growth | Analytics and metrics built. The other four lines need real people |

**The conclusion that matters: there is essentially no unblocked roadmap work
left.** If you go looking for the next checkbox to tick, you will either hit
something waiting on the owner or something that needs students who do not
exist yet. Work from `FIXES.md` instead.

---

## 3. What to build next, in order

These are all from `FIXES.md`. Ranked by real value, not by how easy they are.

1. **Collapse the nav into a tools menu.** `FIXES.md` §5. Seven links for an
   admin, six for everyone else, and the file explicitly warns this is blocking
   *before the next page lands* — a warning that has already been ignored once.
   `/github`, `/linkedin` and `/essay` share a shape and should become one
   "tools" menu.
2. **Surface what is already built.** `FIXES.md` §5. The cover letter builder
   shipped and *its own owner did not know it existed.* Same for the
   application packet and the keyword-gap view. If he could not find them, no
   student will. Route to them from the feed, the tracker and the listing page.
3. **The UNL crawl drops a row and closes a live scholarship.** `FIXES.md` §2.
   This is active data corruption, not a cosmetic bug: 263/263/264 across three
   consecutive scrapes, and a dropped row marks a real, open scholarship closed
   until the next run. **There is a working precedent to copy** —
   `lib/ingest/linkcheck.ts` implements exactly the two-observation rule this
   needs (`urlDeadStrikes`, cleared by contrary evidence, timestamp stamped
   once). Add a `missing_strikes` column and require absence from **two
   consecutive scrapes** before setting `closed_at`. Do not reach for another
   sort key.
4. **`postings.category` is NULL on all 3,765 rows**, and
   `organizations.vertical` is equally empty. Both are dead columns and a trap
   for whoever next assumes a column with a name means something. Backfill or
   drop them.
5. **Two copies of the slot-marker regex** (`lib/github/readme.ts`,
   `lib/linkedin/build.ts`). Small, and the third looser copy in
   `lib/cover-letter/types.ts` deliberately cannot be shared — it matches
   markdown link labels. Export one function for the two strict copies only.
6. **More scholarship sources.** Roadmap Phase 01. 4 of a target 10–15 are
   wired. The finding that should drive this: **row count is the wrong metric.**
   Scholarships.com carries an amount on 0% and a deadline on 0% of its 1,559
   rows, while directly-scraped UNL carries both on 100% of 259. Depth comes
   from direct university/foundation scrapes, not from more aggregator rows.
   Check `robots.txt` and terms **before writing any code** — that is how
   scholarships.com, niche.com and bold.org were ruled out.

---

## 4. Rules that are not yours to change

These are from `CLAUDE.md` and from decisions already made on the record.
Breaking one is not a refactor, it is a regression.

- **Never fetch linkedin.com. In any form.** No scraping, no unofficial API, no
  logged-in automation. The LinkedIn checker scores only text a student pastes
  in. LinkedIn sued Proxycurl out of existence; this line is why.
- **The GitHub audit may call GitHub's public REST/GraphQL API directly.** No
  auth required for public data. A `GITHUB_TOKEN` is read if present and raises
  the rate limit, but is not required.
- **Do not invent a structure for the Smart Resume converter.** The roadmap line
  says "the logic you provide" and that logic has not landed. Leave it
  unchecked and flag it if asked to work on Phase 03.
- **Auto-submitting applications is refused**, decided 2026-08-14, for three
  reasons written out in the Phase 05 roadmap note. Do not build it. **The route
  back in was taken on 2026-08-19: `extension/` now exists** — it autofills the
  real form in the student's own browser and they click submit. Before anyone
  reopens the server-side version, know that it is blocked on measurement, not
  taste: **every submission endpoint in the corpus is authenticated with the
  employer's own credentials** (SmartRecruiters OAuth, Greenhouse board key,
  Lever/Ashby the same, USAJobs login.gov), and there are zero `mailto:` apply
  links. Reading is public; submitting is ~500 employer permissions. The numbers
  are in the Phase 05 roadmap note.
- **The extension must never click submit.** Not a style preference — it is the
  line the whole design rests on, and `extension-invariants.test.ts` fails the
  build if `.click()`, `.submit()` or `requestSubmit` appears anywhere in
  `extension/*.js`. Same file asserts linkedin.com stays out of the manifest.
- **Never reimplement the autofill rules in JavaScript.** `extension/vendor/` is
  gitignored and generated by `npm run build:extension` from
  `lib/apply/autofill.ts`. A hand-written copy in the extension would be a
  second definition of what is safe to type into a legal form.
- **Work phases in order.** Do not start a phase until the previous one is
  functional.

---

## 5. The doctrines — why this codebase looks the way it does

Read these. Code that violates them will look wrong next to everything around
it, and these decisions were each paid for with a real bug.

**Unknown is dropped, never scored as a miss.** Every Fit Score averages only
the dimensions it could actually compute. A posting known on one dimension can
hit 100 — which is why the `N of M` confidence marker must appear *everywhere*
the score appears, and why `rankingScore` shrinks toward a neutral prior of 50.
An absent fact never stands in for a convenient one.

**Deterministic over model call.** The resume critique, the GitHub audit, the
LinkedIn checker, the essay reviewer and the README generator all avoid an LLM
deliberately, each with its reason written at the top of the file. A model pass
adds cost, latency, and the chance of inventing a problem that is not there.
Where a model *is* used (resume parsing, cover letter prose), it may assert only
facts present in the parsed resume or profile, and must emit a literal
`[YOUR SPECIFIC DETAIL: …]` slot for anything it wants but does not have.

**Name things after what you observed, not what you wish you knew.** Listings
say "confirmed live 5h ago" — what we verified on the employer's own board — not
"posted". The analytics metric is "filtered feed requests", not "searches run".
"New" in an alert means *new to us*, and every email says so.

**Two observations before a conclusion.** A single 404 does not close a listing;
`lib/ingest/linkcheck.ts` requires two consecutive, treats 403/429/5xx as *no
information*, and neither adds nor resets a strike on an inconclusive answer.
The first real run vindicated this: 2 of 400 URLs answered 403 and both were
scholarships.com behind a WAF, perfectly alive. Believing them would have
flagged all 1,559 of its rows dead.

**Refuse dependencies.** DOCX import/export, the Resend SDK, DOM-to-image and
`server-only` have all been declined, each with a reason. Email is one `fetch`
POST. PDFs are print stylesheets. Do not add a package without a strong reason
and a written note.

**Nothing below ten is citable.** The tracker withholds a response rate below
ten submissions; `lib/metrics/types.ts` applies the same floor. A fraction over
a tiny base reads as a rate and is not one.

**Validate jsonb in *and* out.** Anything stored as jsonb (`saved_searches.
filters`, `resumes.parsed`) is schema-checked on write and `.catch()`-defaulted
field-by-field on read, so a row written by an older shape degrades rather than
throwing on a page someone just wanted to look at.

**One definition per rule.** The most recent bug found: the feed page re-read
filters from `searchParams` itself, beside the `filtersFromParams` call that
feeds "save this search". They disagreed on one key, and **remote-only silently
never survived a saved search in either direction** — alerts had been emailing
non-remote roles for weeks. If two places need the same judgement, they call the
same function. Never restate the taxonomy regexes in SQL.

**Verify against live data, not just tests.** Almost every interesting bug in
this repo was found by running the thing against the real corpus and reading the
output — not by a unit test. Run it. Look at what it produced. The tests then
pin what you learned. The autofill matcher is the sharpest example yet: it
passed 24 unit tests, then walking the DOM of **one** live Greenhouse form found
that it would type the student's first name into the reCAPTCHA token field and
answer a yes/no question with their school name. One live Lever form found a
third and fourth. Every ATS read so far has produced at least one bug that
reading it was the only way to find — which is why two of them being unread is
recorded in `FIXES.md` §3 rather than assumed fine.

---

## 6. Landmines

- **`db.execute` returns timestamptz as a `string`**, and `db.execute<T>()`
  casts blindly. A field typed `Date` compiles fine and throws
  `getTime is not a function` on the first real row. Format timestamps to ISO
  **in SQL** (`to_char(... at time zone 'UTC', ...)`) and parse them explicitly.
  This has bitten twice.
- **The app connects as table owner and BYPASSES RLS.** Every query must scope
  by `userId` in code. RLS guards the PostgREST door we do not control; your
  `where` clause guards the one we do.
- **drizzle-kit emits `CREATE TABLE` only.** Migration 0002's RLS pass cannot
  cover a table created after it, so **RLS blocks are hand-appended** to
  generated migrations. See `0008`, `0011`, `0012`, `0014`. Forget this and the
  new table is world-readable through the public anon key.
- **The Supabase pooler drops connections mid-persist.** Batch your upserts;
  `idle_timeout: 55`. An unbatched insert of a few hundred rows is the shape
  that kills it.
- **Drizzle error messages are the whole statement plus every bound parameter.**
  The real Postgres cause is on `err.cause`. `lib/ingest/errors.ts` walks the
  chain, pulls SQLSTATE, drops the params (they can hold user data) and caps at
  400 chars. Use it.
- **The driver cannot bind a JS `Date` inside a raw `sql` template** — serialize
  to ISO explicitly or it fails at query time with `ERR_INVALID_ARG_TYPE`.
- **Never `mkdir`/`New-Item -Force` over an existing file.** Windows dev box;
  PowerShell 5.1 has no `&&`.
- **Email jobs are dry-run by default** (`reminders`, `alerts`, `digest`).
  `--send` is the mode you ask for by name. A mistake here lands in someone
  else's inbox and cannot be recalled. Keep it that way.
- **`/admin` fails closed.** `ADMIN_EMAILS` unset, empty or unparseable means
  *nobody* is an admin, and it answers **404 rather than redirecting to
  sign-in** — a login prompt confirms the route exists. Every Server Action
  re-checks `requireAdmin()` itself, because an action is a public POST
  endpoint and checking in the page that renders the button is not a check.
- **A long-lived `next dev` process is a source of phantom bug reports.**
  Multiple agents (or an agent plus a human) editing the same tree over hours
  can leave Turbopack's incremental cache out of sync with a file that is
  correct on disk — seen firsthand as `ReferenceError: BackLink is not
  defined` at a render site whose import was fine, on a dev server that had
  been up ~7.5 hours through heavy concurrent edits. The page rendered
  perfectly on a fresh `next dev`. Before debugging a "this button doesn't
  work" report, check how old the dev server is and restart it first — it is
  a five-second test that rules out an entire category of non-bugs.
- **Any full-viewport modal must render outside `<main>`, or the header will
  paint over it.** `body > header { z-index: 20 }` (added so the tools-menu
  dropdown can out-paint `main`) makes `header` a sibling stacking context
  that outranks `main`'s own (`z-index: 2`) — and a z-index declared on
  something *nested inside* `main`, no matter how large, cannot escape that
  cap to compete with `header` directly. `ApplyWizard`'s modal hit this
  concretely: its `z-index: 9500` overlay lost to the header's nav text
  wherever they overlapped, which was every time it opened near the top of
  the page. Fixed by portaling the modal to `document.body` with
  `createPortal` so it competes at the root stacking context instead. Any new
  full-screen overlay needs the same treatment — check with
  `document.elementFromPoint()` at the header's rect before trusting a z-index
  number alone.

---

## 7. Untested surface — the biggest risk in the project

**Auth is magic-link only**, so no signed-in page has ever been driven end to
end with a real session. `/resume`, `/profile`, `/listing/[id]/apply`, `/github`
and `/linkedin` signed in, `/admin` with a real admin, filing a report, and
account deletion are all verified by unit test, accessibility snapshot or a
temporary stub — never by a human logging in. `FIXES.md` §3 lists them all.
**This is one login away from being closed out** and is worth doing early.

---

## 8. Blocked on the owner — do not try to route around these

| What | Why it blocks |
|---|---|
| `RESEND_API_KEY` + verified sender domain | Deadline reminders, saved-search alerts and the weekly digest are all built and dry-run verified but deliberately inert |
| `ADMIN_EMAILS` on Vercel | `/admin` 404s for everyone in production, including him |
| `GITHUB_TOKEN` | Unauthenticated GitHub is 60 req/hr **per IP**, shared across every visitor. ~6 audits an hour site-wide. Any token fixes it, no scopes needed |
| `DATABASE_URL` repo secret | `ingest-fast` / `ingest-daily` cannot run in CI |
| Adzuna app id/key | Free tier, nothing to build against until registered |
| Parse credit balance | ScholarshipPortal's ~3,666 rows have never persisted across three attempts. Free tier is 200/month, one crawl ~19. **Check the balance before re-running** |
| Smart Resume structuring logic | Phase 03. Do not invent one |

**Decisions he owes, each with a recommendation already written in `FIXES.md`:**

- **Does the field taxonomy serve non-tech students?** `FIELDS` has six keys,
  all tech/business. Of 1,632 unclassifiable scholarships, 182 name a subject
  with no key at all — education 42, nursing 36, engineering 29, arts 28, law
  19, science 18, trades 16. Adding keys widens `INTEREST_OPTIONS`, the profile
  intake and both Fit Scores. A product decision about who this serves.
- **Scholarships structurally outrank internships.** A scholarship is scored on
  3 dimensions and can be known on all 3, reaching a confident 100; an
  internship is scored on 5 and lands ~82 at best. Measured. The digest works
  around it by reserving slots per kind, but the feed has the same bias.
- **Sponsor company names are read as degree language.** "Mendoza Law Firm" and
  "Red Egg Marketing" classify as *business* on the sponsor's line of work
  alone. Needs a judgement, because "American Society of Mechanical Engineers"
  genuinely does mean hardware.
- **Peer reviews** — deferred to Phase 07. Needs users *and* a moderation rule
  decided before the first review is written.

---

## 9. Running it

```bash
npm run dev            # localhost:3000
npm run check          # typecheck + lint + test — run before every commit
npm run metrics        # every number, with its definition and caveats
npm run ingest:status  # corpus health
npm run reminders      # dry run. --send to actually mail
npm run alerts         # dry run. --send to actually mail
npm run digest         # dry run. --send to actually mail
npm run check:links    # apply-URL health, flags never closes
npm run db:generate    # then HAND-APPEND RLS before db:migrate
npm run db:migrate
```

Commit messages here are long and explain *why*, especially what a live run
changed about the design. Match that. End them with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

…adjusted to whichever model you actually are.

---

## 10. If you read nothing else

1. Update `FIXES.md` every prompt and **say what you changed in it.**
2. The work is in `FIXES.md`, not the roadmap.
3. Unknown is dropped, never scored as a miss.
4. Run it against real data and read the output before you believe it.
5. Nothing has been pushed. 25 commits sit only on this machine.
