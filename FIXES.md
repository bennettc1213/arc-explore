# Fixes & Open Items

Everything known to be broken, missing, or waiting on a decision. Kept separate
from `scholarship-platform-roadmap.md`: the roadmap is *what to build*, this is
*what is wrong with what exists* plus what is blocked on someone.

**Update rule:** anything discovered mid-build that we deliberately did not stop
for goes here in the same commit. Say so at the end of the session that adds it
— name what you added, and say "no new entries" explicitly when there are none,
so silence is never ambiguous. Fixing an item means editing its line to `[x]`
in the commit that fixes it, leaving the text that describes what it was.

**This file, not the roadmap, is where the remaining work is.** 49 of the
roadmap's 64 lines are done and almost every one still open is blocked on the
owner or needs real students. See `HANDOFF.md` for the ordered list of what to
pick up first.

**Status legend:** `[ ]` open · `[x]` fixed · `[~]` partly done.

---

## 1. Blocked on you — nothing to build until these land

These are not code problems. Each one is a key, a credit balance, or a decision
only you can make, and the feature on the other side of it is already written.

- [ ] **`ADMIN_EMAILS` is set locally but not in production.** `/admin` fails
  closed, so on Vercel it currently 404s for everyone including you. Add
  `ADMIN_EMAILS=bennettch1213@gmail.com` as a Vercel env var when you deploy.
  It was added to local `.env` this session (gitignored, as it should be).
- [ ] **`GITHUB_TOKEN` is not set.** The GitHub audit works without one, but
  unauthenticated GitHub allows **60 requests/hour per IP** and a hosted deploy
  shares one IP across every visitor. An audit costs up to 9 requests, so the
  whole site gets ~6 audits an hour. Any token fixes it (5,000/hr) and it needs
  **no scopes** — everything we read is public. Add `GITHUB_TOKEN=` to `.env`
  and as a Vercel env var.
- [~] **`RESEND_API_KEY` is set locally; `REMINDER_FROM_EMAIL` is not — so the
  sender is an unverified fallback domain.** Checked 2026-08-21: `.env` carries
  a real `RESEND_API_KEY` (36 chars), which this entry had claimed for weeks was
  absent. That matters most for the **extension's confirmation email**, which is
  the one that is *not* dry-run by default (see below) — it will make a genuine
  Resend API call the moment a student marks an application submitted.
  `REMINDER_FROM_EMAIL` being absent means `fromAddress()` falls back to
  `reminders@instela.org`, almost certainly not a verified sender on the
  account, so the send returns `failed` rather than delivering. Handled, never
  thrown — the tracker stamp still lands — but it is a live outbound call, not a
  simulation. **To close: verify a sender domain in Resend and set
  `REMINDER_FROM_EMAIL` to an address on it.** The three batch jobs below stay
  inert regardless, because they are dry-run until `--send`.
- [ ] **`REMINDER_FROM_EMAIL` + a verified sender domain.** All three email features —
  deadline reminders, saved-search alerts and the **weekly digest** — are built
  and dry-run verified but deliberately inert, and the apply wizard's
  confirmation email now joins them: it is composed and *shown* in the wizard's
  final step (copyable, never sent), and switching it to a real send is part of
  the same decision. Needs the repo secret and a **verified sender domain**.
  Run `npm run reminders`, `npm run alerts` and `npm run digest` first — with
  no `--send` each prints exactly what would go out. Worth knowing: 288 open
  postings carry a future deadline, but ATS internships almost never publish
  one, so reminders stay quiet until students save scholarships. The digest is
  the one that will actually fire — every profile with a usable profile gets
  one the week after it is switched on.

  **The browser extension's confirmation email is now the fourth, and it is the
  one that behaves differently.** `lib/apply/confirmation.ts` genuinely sends
  when a key is present, rather than being dry-run by default like the batch
  jobs — deliberately, because it is a single transactional email to one person
  who pressed a button one second earlier, so a dry-run guard would be
  protecting them from a message they just asked for. With no key it returns
  `not-configured` and the extension says *"email is not switched on yet — your
  application is still recorded"*. It never throws: the tracker stamp is the
  fact that matters and has already happened, so a failed email must not turn a
  successful application into an error. **Today this means students get no
  confirmation email at all** — everything else about the flow works.
- [ ] **`EXTENSION_ORIGINS` is not set.** The extension API (`/api/extension/*`)
  **fails closed** on it, exactly as `/admin` does on `ADMIN_EMAILS`: unset,
  empty or unparseable means no origin is allowed. Chrome assigns an unpacked
  extension its own ID at load time, so this cannot be committed — load the
  extension, copy the ID Chrome shows, and set
  `EXTENSION_ORIGINS=chrome-extension://<id>` in `.env` (and as a Vercel env var
  when deployed). See `extension/README.md`.
- [ ] **Adzuna app id/key.** Phase 01 line is blocked, not merely unstarted —
  there is nothing to build against until one is registered. Free tier.
- [ ] **Parse credit balance.** ScholarshipPortal's ~3,666 rows have **never
  persisted** across three attempts. Both bugs those attempts exposed are
  fixed; what is unproven is the multi-batch path at that scale. Free tier is
  **200 credits/month**, one crawl is ~19. Check the balance *before*
  re-running `npm run ingest:scholarships -- --source scholarshipportal`.
- [ ] **Smart Resume structuring logic (Phase 03).** The roadmap line says "the
  logic you provide" and it has not landed. Do not invent a structure for it.
- [~] **`DATABASE_URL` repo secret — the push half is done, the secret half is
  yours.** `master` was pushed 2026-08-23 (`65b9d72..13049f3`), so all seven
  workflows are now on the default branch, which is where GitHub requires them
  to be for a `schedule` trigger to fire at all. **What remains is one repo
  secret**: `DATABASE_URL`, at
  `github.com/bennettc1213/instela/settings/secrets/actions`, copied from
  local `.env`. Until it is set, `ingest-fast` runs every 20 minutes and fails
  immediately, which is loud but harmless.

  _Deliberately NOT recommended alongside it: **`PARSE_API_KEY`**.
  `ingest-scholarships.yml` runs weekly with no `--source` filter, so a present
  key would automatically spend ~19+ Parse credits every Sunday against a
  200/month budget — the balance-check-first rule above, defeated by a cron.
  Without the key that workflow reports 3/5 sources ok and exits 0, which is
  the intended state. **`RESEND_API_KEY` likewise stays off**; `reminders.yml`
  always takes the `--send` branch on a schedule, and `reminders/email.ts:91`
  throws without a key, so the job will go red daily and mail nothing. That is
  fail-safe as designed but it is also daily noise, and noise on Actions trains
  you to ignore the ingest failures that do matter — worth disabling that one
  workflow until a verified sender exists._

  _Committing was a prerequisite, not bookkeeping: the two-observation fix in
  `lib/ingest/reconcile.ts` was **entirely uncommitted** (0 references to
  `missingStrikes` in the committed file, 10 in the working tree), so enabling
  a 20-minute cron on the old code would have closed a live posting on a single
  absence, 72 times a day, against the live database. Found by auditing before
  pushing rather than after._

  _Measured 2026-08-22 after "every time I log on I'm getting the same
  scholarships and internships, no new ones": the newest ingest run in the
  database was **2026-08-14**, seven days earlier. `new_24h` was 0,
  `confirmed_1h` was 0, `polled_last_hour` was 0. The feed was not repeating
  itself because of the ranking — it was repeating itself because the corpus
  had not changed in a week, and every row claiming "confirmed live" was
  resting on a week-old observation._

  _A manual `npm run ingest:fast` fixed it on the spot: **784 boards polled,
  339 new postings**, internships 1,911 → 2,250, and rows able to say
  "confirmed live" went **0 → 1,918**. `npm run ingest:scholarships` against
  the three free direct scrapes added 8 more and correctly closed 12 (absent
  on the 8/14 scrape and absent again now — the two-observation rule, not a
  single miss). **But this decays again within a day.** Until the secret is
  set and the repo is pushed, the only thing keeping the corpus fresh is
  someone typing the command. The two Parse-metered sources were deliberately
  left alone — the balance has to be checked first, per the entry above._
- [ ] **Field taxonomy decision — does this serve non-tech students?** `FIELDS`
  has six keys, all tech/business. Of 1,632 unclassifiable scholarship rows,
  **182 name a subject the taxonomy has no key for** — education (42),
  nursing/health (36), engineering (29), arts/media (28), law (19), science
  (18), trades (16) — and 1,450 state no subject anywhere. Adding keys widens
  `INTEREST_OPTIONS`, the profile intake and both Fit Scores. It is a product
  decision about who this is for, not a parser change.
- [~] **Gamification: the completion meter is built; applying points and
  referrals are not — say if you disagree.** The Phase 06 line says "points for
  profile completion, applying, and referrals". The recommendation here was
  build the completion meter, drop the applying points, defer referrals, and
  that is what shipped. **Points for applying rewards volume**, which this
  project decided against on the record — the auto-submit refusal (Phase 05)
  cites poor mass-apply response rates and employers filtering for exactly that
  behaviour, so paying students in points to do more of it contradicts that in
  the same product. **Referrals need a referral system** that does not exist,
  and building one before there are users to refer is Phase 07 work at the
  earliest. Completion also ships as *coverage* rather than as points, for the
  reason the GitHub audit gives about the contribution graph: a number you can
  raise without your outcomes changing is not worth showing. Reopen this if you
  want either of the other two anyway.
- [ ] **Peer reviews need users, and moderation — needs your call.** Phase 06
  line. With no students on the platform this is a black hole worse than the
  reports queue: reports at least feed a triage list one operator works, while
  peer reviews are public content that needs a moderation path before the first
  one is written. Recommendation: defer to Phase 07, after the beta group
  exists, and decide the moderation rule before building it.
- [ ] **MCP servers need authorization** (environment, not this codebase):
  **claude.ai** and **Thumbtack**. claude.ai connectors go through claude.ai
  connector settings; others through `/mcp` in an interactive session. Nothing
  built so far depends on them.

---

## 2. Known bugs

- [x] **The UNL crawl intermittently drops a row.** Fixed by porting the two-observation
  rule from `lib/ingest/linkcheck.ts` onto the ATS-feed freshness path. Added
  `postings.missing_strikes` (integer, default 0) and `postings.missing_since`
  (timestamptz, first crossing of the threshold, never moved) as a direct
  analogue of `url_dead_strikes` / `url_dead_since`. `reconcile()` now returns
  three states in place of the old one-shot close: `toIncrementMissing` (absent
  once — strike bumped, posting stays open), `toClose` (absent on the *second
  consecutive* scrape — `closed_at` finally set), and `toResetMissing` (present
  again after a prior strike — counter cleared). Persist applies each in one
  transaction. Verified live: a dry-run crawl against the real corpus on a single
  absence now reports `closed: 0` where the old path would have closed the row,
  and the new columns backfill to 0 on all 3,765 open postings. Applies to every
  scholarship source on the same reconcile path, not just UNL.
- [x] **Remote-only never survived a saved search, in either direction.**
  Fixed. The feed page re-read every filter out of `searchParams` itself,
  beside the `filtersFromParams` call that feeds "save this search" — two
  parsers over one query string — and they disagreed on one key: the feed's
  checkbox posted `remoteOnly=1` while `filtersToQuery` wrote `remote=1`. So
  saving from a remote-filtered feed stored `remoteOnly: false`, and clicking a
  saved remote search produced a URL the feed ignored. **Saved-search alerts
  for those searches had been matching non-remote roles the whole time**, which
  is worse than the UI bug, since it went out by email. Found by instrumenting
  searches for analytics — the event log recorded `filters: ["kind"]` for a
  request that plainly also carried `remote=1`. Fixed at the root rather than
  by renaming a key: the page now derives its filters from `filtersFromParams`,
  so there is one definition of how a filter is read from a URL. Verified live,
  `?kind=internship` 500 rows vs `&remote=1` 94.
- [ ] **No test could have caught that, and the shape of the gap is worth
  knowing.** The round-trip test between `filtersToQuery` and
  `filtersFromParams` passed the whole time — both sides of the pair agreed
  with each other. The drift was between that pair and a *page*, and pages here
  are not unit-testable. Everything the feed page does is now delegated to
  tested functions, which is the structural answer, but the general problem
  stands: a Server Component that reads `searchParams` directly is untested
  surface. Worth a rule — params are parsed in a tested module, never in a
  page — rather than another test.
- [x] **`postings.category` is NULL on all 3,765 rows**, and
  `organizations.vertical` is equally empty. Both are dead columns. The
  category filter was deliberately built on the derived field taxonomy instead.
  Either backfill them or drop them — right now they are a trap for the next
  person who assumes a column with a name means something.
  _Fixed — dropped, not backfilled. Audited first: no insert ever wrote either
  column and no query ever read one (the feed's category filter reads the
  derived `fieldsForPosting` taxonomy; `recruiting_cycles.vertical` and
  `profiles.target_verticals` are live lookalikes and were left alone).
  Migration `0016_drop_dead_columns` applied to the live database and verified:
  both columns gone, both lookalikes intact. There was nothing to backfill
  from — the taxonomy derivation is computed at read time, not stored._
- [~] **A scholarship can score 100 with full confidence; an internship
  essentially cannot.** _Mitigated in three places now, root cause still open.
  Re-measured 2026-08-21 while capping the free feed, and it is worse than the
  digest run suggested: for a **signed-out/empty profile the best internship in
  the entire corpus ranks #1749 of 3,788** — 1,748 scholarships outrank every
  single internship — so an uncapped-but-short list contains no internships at
  all. **A filled profile fixes it**: for a CS student with stated skills the
  best internship ranks #0. So the bias is a cold-start problem, which makes it
  worst for exactly the audience the free tier serves. The digest reserves
  slots per kind, and the free feed now does too (`FEED_MIN_PER_KIND`); the
  underlying question below is unchanged._ Found by the first live digest dry run, which returned
  six scholarships and zero internships for a profile stating software,
  data/ai, product and business. It is structural: `scoreScholarshipFit` has
  **three** dimensions and all three are routinely known, so it reaches 100 at
  3-of-3 confidence, while `scoreFit` has **five** and `term`/`skills` are
  routinely unstated, so a strong internship sits at 3-of-5 and `rankingScore`
  shrinks it toward the prior. Measured that run: best scholarship rank
  **100.0**, best internship **82.0** — of 400 new rows, no internship could
  outrank any of the top scholarships. `rankingScore` is doing exactly what it
  was designed to do; the gap is that "known on 3 of 3" and "known on 3 of 5"
  are not the same confidence and the shrink cannot make them one. The digest
  works around it by reserving `MIN_PER_KIND` slots. **The feed has the same
  bias** and hides it only by showing everything — worth a decision on whether
  the two scorers should be normalised to a common number of dimensions, or
  whether cross-kind ranking should be abandoned in favour of ranking within
  each kind.
- [x] **Sponsor company names were read as degree language, and law/psychology
  were crammed into `business`.** Reported as "I logged back in and it's the
  same scholarships though", after the ingest cron was fixed and 902 fresh
  internships had landed. Two distinct faults, both measured on the live corpus
  against the reporter's own profile (information systems, 21 skills, interests
  software / data-ai / product / **business**):

  _**(1) The sponsor's line of work was treated as evidence about what you must
  study.** `scholarshipFields` fed title + **sponsor name** + eligibility
  through `fieldsFromDegreeLanguage`, so "First Generation College Student
  Scholarship" — an award with no field requirement at all — classified as
  `business` on the word "Law" inside *"The Law Offices of David A. Kadzai,
  LLC"*. Same for "Gravitate Scholarship" via "Siniard Law Injury Attorneys".
  Fixed with `SCHOLARLY_SPONSOR_RE`, an **allowlist** rather than a denylist of
  `LLC`/`Law Firm`/`Agency`: a denylist must anticipate every way a company can
  be named and fails open, while an allowlist fails closed — an unrecognised
  sponsor is simply not read, and the row scores on title and eligibility
  alone. "American Society of Mechanical Engineers" still reads as hardware,
  which is the case that made this a judgement rather than a deletion._

  _**(2) `law|sociology|psychology|political science|public policy → business`
  was an invented match.** None of those is business; the mapping existed only
  because the taxonomy has no key for them. For a student who ticked "business"
  it handed the entire feed to law-firm content-marketing awards — "RMD Law
  Scholarship", "HMW Law Against All Odds", "Burress Injury Law Underdog" —
  each at fit 90-95 on a confident **3-of-3**. Now mapped to nothing, so the
  field dimension goes unknown, is dropped rather than counted as a miss, and
  the row shrinks toward the prior at 2-of-3._

  _**Measured, same profile, before → after: the best internship in a corpus of
  4,690 moved from rank 38 to rank 6** on the paid feed (15 → 4 on free), and
  the law awards left the top entirely. One test changed — it had pinned
  `"open to law students" → ["business"]` — and now asserts the absence, with
  the reasoning written beside it._
- [ ] **Two follow-ons this exposed, both still open.**
  _**Content marketing is badly under-tagged.** "RMD Law Scholarship" ($2,500,
  sponsored by RMD Law), "Burress Injury Law Underdog" ($5,000) and "Red Egg
  Marketing Scholarship" ($2,500) are textbook link-building awards and all
  three carry `is_content_marketing = false`; only **123 of 1,879** open
  scholarships are tagged at all. The competition dimension therefore cannot
  down-rank the rows it was built for. A sponsor-name signal (law firm,
  marketing agency, `LLC`) plus a small-award threshold would catch most of
  them — note this is the denylist deliberately rejected for field derivation
  above, which is fine here because the cost of a false positive is one
  down-ranked row rather than an invented field match._

  _**The paid feed is worse-mixed than the free one.** FIXED — `page.tsx` had
  `reservePerKind: dailyCapped ? FEED_MIN_PER_KIND : 0`, so the per-kind
  reservation applied **only to the free window** and a paying subscriber got
  the raw ranking plus the full force of the cross-kind bias. Measured before:
  free 15 scholarships / 5 internships, paid **46 / 4**. Applying the flat five
  to both would not have fixed it — five of ten is a 50% floor and five of
  fifty is 10%, so a constant means a different promise at every window size,
  which is how the tiers drifted apart in the first place. Replaced with
  `FEED_KIND_FLOOR = 0.25` and `reservationFor(limit)`, a proportion that holds
  the same promise at any depth and still leaves half the window to the global
  ranking. A window showing everything still reserves nothing._

- [x] **Unbounded short words in the field taxonomy invented field matches.**
  Fixed in `MAJOR_TO_FIELDS`. Unbounded `law` matched **"Delaware"**,
  "Lawrence", "outlaw", "flawless" and "lawn", so every scholarship whose
  eligibility said "must be a Delaware resident" was classified **business**;
  `design` matched "designated"; `math` matched "aftermath"; and `materials`
  matched the phrase "application materials", ordinary scholarship boilerplate.
  Corpus incidence today is small (Delaware 2 rows, lawn 1), but the mechanism
  was wrong under any reading, and a false positive is worse than an unknown —
  unknown is dropped and labelled, an invented match is indistinguishable from
  a real one and silently moves a row up the ranking. Tested against the exact
  prose that produced each one.
- [x] **Two copies of the slot-marker regex.** `lib/github/readme.ts` and
  `lib/linkedin/build.ts` each define their own `SLOT_RE` for
  `[YOUR SPECIFIC DETAIL: …]`, and `lib/cover-letter/types.ts` has a third,
  looser one. The looser one cannot be shared (it matches markdown link labels)
  but the two strict copies should be one exported function.
  _Fixed — the strict scanner now lives once in `lib/cover-letter/types.ts` as
  `markerSlotsFromText(...texts)`, beside `slotMarker` (which defines the
  format) and the deliberately-looser `slotsFromText`. Both generators import
  it; five new tests pin the markdown-link-label case that is the reason the
  strict variant exists._
- [x] **The focus ring assumes the nav is `position: fixed`; it is not.**
  `FocusRing.tsx` marks anything inside a `<header>` as `fixed` and applies no
  scroll offset, on the comment "Only the nav is truly `position: fixed`". The
  nav header is actually `position: relative` in normal flow and scrolls away
  with the page, so the ring for a focused nav element detaches from it as soon
  as the page scrolls. Confirmed live: `body > header` computes to
  `position: relative`. Harmless until a keyboard user scrolls mid-focus, and
  the fixed branch never fires for the element it was written for.
  _Fixed — the heuristic `closest("header")` is replaced by `inFixedContext`,
  which walks the ancestor chain and asks `getComputedStyle` for an actual
  `position: fixed`. That corrects both directions of the old guess: the nav
  (relative) now gets a document-anchored ring that scrolls with it, and the
  apply wizard's overlay (genuinely fixed) gets a viewport-anchored ring that
  stays put — the old check would have gotten that case wrong too. The stale
   "fixed inside the nav" comment in globals.css was updated to match._
- [x] **The header's own text painted over the apply wizard modal.** Reported
  live as "text overlaying the pop up windows." Root cause: `body > header {
  z-index: 20 }` (added to let the tools-menu dropdown out-paint `main`, see
  §5) made `header` a sibling stacking context that now outranks `main` — but
  `ApplyWizard`'s `.wizard-overlay` (`z-index: 9500`) is a *descendant* of
  `main`, not a sibling of `header`. A z-index declared inside a stacking
  context never escapes it: `main`'s own context is capped at `z-index: 2`, so
  no matter how large a number the modal inside it declares, `header` (20)
  still wins wherever they overlap — which is always, since the modal is
  `position: fixed; inset: 0` and therefore covers the header's screen area
  every time it opens near the top of the page. Confirmed empirically before
  touching anything: injecting the real `.wizard-overlay` markup as a child of
  the live `<main>` and hit-testing the header's on-screen rect returned the
  header's own nav text as the paint winner; injecting the identical markup as
  a sibling of `<header>` (a child of `document.body`) correctly returned the
  overlay. **Fixed by portaling the modal** — `ApplyWizard.tsx` now renders its
  `role="dialog"` tree via `createPortal(..., document.body)` instead of in
  place, so it competes against `header` at the root stacking context instead
  of being trapped inside `main`'s. Re-verified the same way after the change.
  Click-outside-to-close, Escape-to-close and `FocusRing`'s fixed-context
  detection are all DOM-ancestry-based (`e.target`/`e.currentTarget`, a
  `window` keydown listener, `parentElement` walked via `getComputedStyle`)
  and unaffected by where in the tree the node is portaled to. Checked every
  other component for the same shape (`position: fixed` + `role="dialog"`) —
  `ApplyWizard` is the only one, so this was not a wider pattern to fix.
  **A second, unrelated symptom reported alongside this ("the back buttons
  aren't working") turned out not to be a code bug at all:** the dev server
  the report came from had been running ~7.5 hours through heavy concurrent
  edits and had a stale Turbopack module for the listing page, throwing
  `ReferenceError: BackLink is not defined` at render — even though the
  import is and was correct on disk. A restarted dev server rendered the page
  correctly on the first try; the back link, and native browser back/forward
  across several hops, both worked with no code change. Worth knowing for next
  time this comes up: a long-lived Turbopack dev process being hot-reloaded
  through a large volume of concurrent AI-driven edits is a real source of
  phantom "X is broken" reports, and the fix is a restart, not a diff.
- [x] **Cover letter drafts came back as hollow `[YOUR SPECIFIC DETAIL: …]`
   placeholders.** The grounding engine only matched a resume's *experience
   bullets* against a posting's skills, using a **tech-only** vocabulary. A
   non-technical resume (and ~70% of postings that carry no skills list at all)
   therefore produced a letter with no evidence to quote, so the generator
   filled it with placeholders — which read as broken. Fixed three ways: (1) the
   skill vocabulary now has a `general` group (retail, customer service,
   warehouse, creative, office skills…) and the skills-list splitter now handles
   ` & ` separators, so a non-tech resume's real skills register; (2)
   `evidenceForPosting` now also cites skills the candidate listed outright when
   the posting names them; (3) when nothing matches, `buildCoverLetterContext`
   falls back to the candidate's most substantive real experience as *honest
   background* evidence (quoted verbatim) instead of a placeholder shell, and
   the generator is told via a new `directMatch` flag not to claim a relevance
   the facts do not support. Verified end-to-end against the owner's own resume:
   letters now stand on real experience with at most one genuine slot
   (portfolio / transcript). 174 unit tests pass; typecheck and lint clean.
- [x] **The apply wizard had too many steps that felt like questions with only
   one answer.** Every attestation was its own "I understand — continue" screen,
   the cover letter and resume were not shown as attached, and facts were
   reviewed on a separate screen the student could not act on. Redesigned the
   wizard to a minimal flow: only genuine clarifying questions (profile gaps the
   wizard writes back to) get their own step; everything else — facts held,
   resume and cover letter as attachments, legal declarations — is folded into a
   single review screen. The student sees what's attached, confirms the legal
   statements once, then opens the employer's real form and submits themselves.
   `planApplySteps` now emits only `gap` / `review` / `handoff` (removed
   `facts`, `attestation`, `letter`). 13 wizard tests rewritten and passing;
   typecheck and lint clean.
- [x] **Every button on the feed took ~6 seconds to respond.** Reported as
  "we need to make the buttons respond quicker", and the cause was not in any
  button. **The feed rendered 500 rows — 4.16MB of HTML — on every request**,
  measured at 6.1s warm while the listing page beside it answered in 0.15s.
  Instrumenting it ruled out the obvious suspects: the SQL is ~345ms, scoring
  and ranking the full 3,788 rows is ~300ms end to end, and `getFeedStats` and
  `getAvailableTerms` are 36ms and 19ms and run in parallel anyway. The six
  seconds was **rendering and serialising 500 rows**, and it was being paid
  twice — once on load, then again on every mutation, because **nine Server
  Actions call `revalidatePath("/")`**. So clicking "save" on one posting
  rebuilt four megabytes of feed before the button could stop saying "saving…".
  _Fixed in two independent places, because either alone leaves half the
  problem. **(1) The feed renders a page.** `FEED_PAGE_SIZE = 50` with a
  `?show=` view preference and a "show more" link; `getFeed` still scores and
  ranks the entire matched set before trimming, so this cannot change what comes
  first — the no-SQL-LIMIT rule is intact and its comment now says why twice.
  `FeedResult` gained `total`, and the marker reads "showing 50 of 3,788 ranked
  matches" rather than a bare count that would read as the size of the corpus;
  it disappears entirely when everything is on screen, so a complete list never
  implies something is withheld. **Measured after: 6.1s → 0.92s, 4.16MB →
  455KB**, and the "show more" link preserves active filters (verified live at
  `?kind=internship&remote=1`, which correctly reports 94 — the same 94 the
  remote-filter fix was verified against). **(2) The buttons stopped waiting at
  all.** `TrackButton` and the tracker's status select are now `useOptimistic`,
  so they move on click and reconcile when the action settles. `useOptimistic`
  rather than a `useState` flag on purpose: it discards itself automatically on
  failure, where a hand-rolled flag has to be cleared by hand and the case
  people forget is exactly the one that leaves a row reading "saved" when the
  write did not happen. The tracker card drives its label and pip from the same
  optimistic value so the whole card moves together — a dropdown reading
  "submitted" above a label still reading "applying" looks more broken than the
  delay did. The three other `getFeed` callers (digest ×2, alerts) all pass
  explicit limits and are unaffected._
- [x] **Clicking a listing did nothing visible, and only the title text was
  clickable.** Reported together as "the redirecting is pretty slow and you
  need to click in an exact spot". Two independent causes, neither of them the
  server being slow.

  _**(1) There was no `loading.tsx` anywhere in the app.** Next's docs are
  explicit: for a dynamic route — which every interesting route here is, since
  they read the session and hit Postgres — "prefetching is skipped, or the
  route is partially prefetched if `loading.tsx` is present", and without one
  "the client must wait for the server response before showing the result …
  this can give the users the impression that the app is not responding". That
  is the whole report: the navigation was not slow so much as **silent**, and
  silence reads as broken. Added a generic `app/loading.tsx` (inherited by
  every route without its own, so the whole product gained instant feedback in
  one file) and a listing-shaped `app/listing/[id]/loading.tsx`. Measured
  after: the skeleton paints **187ms** after the click on a warm route, 391ms
  on a cold one — and both numbers are the *unprefetched* case, see §3. The
  skeletons draw bars only, never a number or a label: a skeleton rendering a
  plausible "94" where the fit score will land has invented a fact for as long
  as it is on screen._

  _**(2) Only the title `<a>` linked to the detail page**, inside a row 163px
  tall. Fixed with a stretched link — `.row-target::after` covers the article,
  and the genuinely separate actions (external apply ↗, score badges, track
  button, "why this score") are lifted back above it with `.row-raise`.
  Measured live by hit-testing a 30-point grid across a real row: **28 of 30
  points now open the listing**, the 2 exceptions being the score badges, and
  all four raised controls verified reachable — the track button with a real
  signed-in session. Verified the navigation itself by dispatching a click at
  50% across / 72% down the row, on empty space well away from the title: it
  resolved to `A.row-target` and navigated. **Not an `onClick` on the
  article**, deliberately — that is not focusable, has no href for the status
  bar, and breaks middle-click, ⌘-click and "open in new tab", which is exactly
  how someone shortlists six internships. The accepted cost is that dragging to
  select text inside a row now starts the link drag instead._
- [x] **The back link was 11px of unboxed text, and nothing that navigates had
  a hover state.** Reported as "make the back button a lot more bigger and
  noticeable… highlight it when you hover… do the hover effect for most buttons
  that will redirect".

  _`BackLink` is on **13 pages** and was `.mono` (0.6875rem) plus an accent
  colour and nothing else — no border, no padding, no hit area beyond the
  glyphs, no hover. The single control that *undoes* a navigation was smaller
  than the timestamps beside it. It is now a real bordered control at 0.8125rem:
  measured live, **186×42px — a 7,705px² hit area against roughly 1,400px²
  before**. Hover fills with `--accent-dim`, borders `--accent`, and **the arrow
  slides 4px left** — the one non-decorative piece of motion here, since
  direction is the whole meaning of a back control._

  _Generalised, per the ask, to everything that navigates. `.btn:hover` now
  **fills** with `--accent-dim` as well as changing its border — a 1px border
  colour change on a dark ground is close to invisible on a trackpad flick (50
  of these on the feed alone). New `.navlink` covers the nav links, the footer
  privacy link and the tools trigger, replacing `mono chrome` **plus an inline
  `color`** — the inline colour is why these could not simply be given a hover
  rule, since it out-ranks the stylesheet and would have silently defeated it.
  The class owns the resting colour so the hover can win. Verified the nav does
  not reflow on hover: with a permanently-present transparent border, hovering
  `tracker` moved only `tracker`, by the 1px `.press` offset, and every other
  link stayed at its exact pixel._

  _**A pre-existing bug fell out of this.** The tools trigger carried both a
  `.mono` class and an inline `font: "inherit"`, and the inline rule won — so
  "tools" had been rendering at the header's inherited size while
  `tracker`/`resume`/`profile` beside it rendered at 11px. Visible in any
  screenshot of the nav once you know to look. Dropping the inline `font` fixed
  it; all six nav items now measure 11px._
- [~] **The feed ordering was frozen, because ties resolved to raw database
  order.** Second half of the "same scholarships every time" report — the first
  half was the week-old corpus (§1, `DATABASE_URL`). Measured against the live
  corpus for the most-filled profile on the account, before writing anything:

  _**1,607 of 4,012 open rows score a perfect fit of 100.** That is the
  "unknown is dropped, never scored as a miss" rule working exactly as
  designed — a row known on one dimension that happens to match is a 100.
  `rankingScore` correctly shrinks those toward the neutral prior, but they all
  shrink to **the same place**: **1,529 rows share the single sort key 68.4**
  (fit 100 at 1-of-3, timing 63 at 1-of-3). Even in the well-differentiated
  head, **37 of the first 50 ranks sat in a tie group larger than one.**
  `Array.prototype.sort` is stable in V8, so every one of those ties resolved
  to Postgres row order — which never changes. The feed could not move even
  after new rows arrived._

  _Fixed with a deterministic daily rotation as the **final** tiebreaker
  (`score/rotation.ts`, FNV-1a over `id:day`, no dependency). It is reached
  only when blocked status, the fit/timing sort key **and** the timing score
  are all equal, so it can never promote a worse-matching posting — the same
  bound the timing bonus carries. It is stable within a UTC day, so "show more"
  pages consistently and a refresh does not reshuffle under the reader; one
  `day` is computed per request, for the same reason `buildFeedItem` takes one
  `now`. Rotating is the honest option rather than a gimmick: inside a tie we
  hold no evidence for preferring either row, so a fixed database order is
  equally arbitrary and merely staler. It also makes the free tier's
  "re-ranked daily" claim true, which for the 1,529-row plateau it was not._

  _**Marked `[~]` because the measured effect on the head is small, and
  overstating it would be the same error as the claim it replaces.** The head
  is genuinely well-differentiated — ranks 0–4 are singletons — so rotation
  correctly does nothing there. The tie group at ranks 5–19 **ends exactly at
  the free-20 cut**, so a free viewer sees the same 20 rows in a different
  internal order, not new ones; the group at 43–52 straddles the paid-50 cut,
  so a paid viewer turns over ~3 rows a day. Where it genuinely pays off is
  deeper in the list, which is where the 1,529-row plateau lives. **The thing
  that actually puts new rows in front of a student is the corpus updating**,
  which is §1. Left open: if real day-over-day turnover in the top 20 is
  wanted, that is a product decision about deliberately loosening the head's
  ordering, not a tuning change._
- [ ] **The remaining ~0.9s of feed time is the rank-everything design, and it
  is not obviously wrong.** `getFeed` fetches all 3,788 matched rows on every
  request because ranking is in memory and a pre-rank SQL `LIMIT` would let one
  kind crowd the other out of the top N — the feed's whole reason for existing.
  That floor is ~300ms of the ~0.9s; the rest is rendering 50 rows in dev, and
  Turbopack dev is materially slower than a production build, so the deployed
  number will be lower. If it does need to come down further, the precedent is
  `getCompletionCorpus`'s five-minute in-process memo — the corpus is identical
  for every visitor and changes at most every 20 minutes on the `ingest-fast`
  cadence — but caching a *filtered* row set is more complex than that one and
  should not be done speculatively. Measure on production first.

---

## 3. Never verified with a real signed-in session

Auth is **magic-link only**, so every signed-in page below has been verified by
unit test, by accessibility snapshot, or through a temporary preview route —
never driven end to end with a real session. This is one login away from being
closed out and is the largest untested surface in the project.

- [ ] **The optimistic status controls, on failure.** `TrackButton` and the
  tracker card now update on click and let `useOptimistic` roll back if the
  action rejects. The happy path is unverifiable without a session and the
  **failure** path doubly so — it needs a signed-in session *and* a rejected
  write. Worth forcing once (temporarily make `setStatusAction` return an
  error) to confirm the button reverts to "save" and the card's select, label
  and pip all snap back together rather than stranding one of the three.
- [ ] **Link prefetching has never been observed working, because `next dev`
  disables it entirely.** `RowLink` warms `/listing/[id]` on hover rather than
  on viewport, because the feed renders 50 rows and Next's docs name that exact
  case ("large lists of links"). Measured 2026-08-21 against the live feed: a
  real pointer hover fired **zero** prefetch requests. That is not the prop
  being wrong — it is structural, and worth recording because it is not in the
  docs. `client/components/links.js` initialises every link with
  `isVisible: false` (:141), the only thing that ever sets it true is
  `onLinkVisibilityChanged` (:228), and that function returns early when
  `NODE_ENV !== "production"` (:218, comment: "disabled in development …
  because it requires compiling the target page"). So `isVisible` can never be
  true in dev, and `rescheduleLinkPrefetch` takes its `if (!instance.isVisible)`
  branch and **cancels** the task (:254). The hover path (`onNavigationIntent`)
  needs no dev guard of its own because the flag it depends on is unreachable.
  **Consequences:** the skeleton timings recorded in §2 are the unprefetched
  case, so production should be faster rather than slower; and anyone
  re-measuring in `npm run dev` will see no prefetch traffic and must not
  conclude the prop is broken. **To close: measure once on a production build
  or on Vercel** — confirm a hover fires one RSC request for that listing and
  that a second hover does not repeat it.
- [ ] `/resume` — the editor renders, decode logic is tested, never driven.
- [ ] `/profile` — including the new presence prompt, the two link fields, and
  the new email-preferences panel (its action is separate from the profile
  form's, and that separation has never been exercised with a real session).
- [ ] `/listing/[id]/apply` — the application packet.
- [ ] **The apply wizard on `/listing/[id]`** ("apply with Instela" button).
  The step plan, prompt mapping, progress math and confirmation composer are
  unit-tested (13 tests in `lib/apply/wizard.test.ts`), and the page compiles
  through a production build — but the modal itself, the gap write-backs into
  the profile, and the final mark-applied stamp have never been driven with a
  real session. Verify alongside the packet page it sits beside: open the
  wizard, answer a gap, confirm an attestation, walk to the hand-off, and
  confirm the tracker stamps `applied` exactly once.
- [ ] `/github` signed in — the README generator filling from profile + resume,
  and the stored-handle fallback.
- [ ] `/linkedin` signed in — the builder filling from profile + resume.
- [ ] Saving a profile and confirming `github_username` / `linkedin_url`
  round-trip through the form.
- [ ] **`/admin` with a real admin session.** The page was rendered against
  real data by temporarily stubbing `requireAdmin`, and the guard was verified
  to 404 both with and without `ADMIN_EMAILS` set — but the two have never been
  exercised together. The hide / unhide / resolve actions have never been
  clicked, and the metrics panel has never been seen in a browser (the same
  numbers were verified through `npm run metrics`, which needs no session).
- [ ] **Filing a report end to end.** The validation is tested and the queue
  renders seeded rows, but no report has been submitted through the form.
- [ ] **Account deletion.** Never run, deliberately — the only way to test it is
  to destroy a real account. Verify on a throwaway account before anyone else
  has one: confirm all seven cascades fire, that `auth.users` is gone, and that
  the `deleted=partial` branch reads correctly when
  `SUPABASE_SERVICE_ROLE_KEY` is unset.
- [ ] **The browser extension, end to end in Chrome.** Everything testable
  without a browser has been tested and everything verifiable against live data
  has been verified — 616 unit tests including the source-level safety
  invariants; `findPostingByUrl` resolving 16/16 real postings across four ATS
  families and four URL shapes; the field matcher run over the *actual* DOM of a
  live Greenhouse form (tripadvisor 8043141) and a live Lever form (waabi), which
  is what found the four bugs recorded in §6; `/api/extension/packet` answering
  401 signed out and 400 with no `url`. **What has never happened is the
  extension being loaded into Chrome and driven with a real session**, which is
  the same magic-link gap as everything else in this section. Specifically
  unverified: that the packet endpoint returns real values with a live cookie,
  that `setNativeValue` actually satisfies React's change tracking on
  Greenhouse/Lever/Ashby (the failure mode is a field that looks filled and
  submits empty — the reason that function exists, but it has only been reasoned
  about, not watched), that the amber highlighting lands on the right boxes, and
  that "I submitted this" stamps the tracker exactly once. **Do this first** —
  it is one login and one `load unpacked` away.
- [ ] **The embedded apply path, with the extension actually loaded.** Built
  2026-08-20. What is verified: the frame renders inside an Instela page, the host
  banner and escape hatch are correct, 24 live form fields are present in the
  frame, and — after a bug fix — the no-extension fallback correctly disables
  the button and explains itself. What is **not** verified is every line that
  needs Chrome to have the extension loaded: that `all_frames: true` really
  does inject the content script into the embedded frame, that the origin check
  admits Instela and rejects everything else, that a fill inside the frame reports
  back, and that the amber marks land on the right boxes. Playwright is not a
  dependency of this project and this codebase refuses dependencies, so the
  extension could not be loaded from the harness — it needs a human running
  `load unpacked`. **Test the rejection direction too:** serve a page from a
  non-Instela origin that frames the same Greenhouse form and posts `INSTELA_EMBED_FILL`
  at it; nothing must happen.
- [ ] **Lever's hCaptcha never actually minted a token in a frame — so Lever is
  withheld from the embedded path until it does.** Greenhouse's reCAPTCHA did
  (2382 chars, framed and top-level identical), and Lever matched top-level on
  every initialisation measure — `checksiteconfig` `200 pass:true`, challenge
  frames, response field — but invisible hCaptcha only executes on a real submit
  gesture, so the token itself is unproven. It is listed in
  `EMBED_WITHHELD_HOSTS`, applies through its own tab, and loses nothing it had
  before. **To close it:** submit one real application through an embedded Lever
  form and confirm it lands, then move `jobs.lever.co` from
  `EMBED_WITHHELD_HOSTS` into `FRAMEABLE_ATS_HOSTS` and flip the expectation in
  `apply-url.test.ts`. Worth doing deliberately, once, on a role the student
  actually wants — not as a throwaway test that wastes an employer's time. That
  is 165 open rows waiting on one observation.
- [ ] **Only Greenhouse and Lever forms have been read; Ashby and
  SmartRecruiters have not.** The matcher is signature-based so it is not
  per-ATS, and both of those were verified for *URL resolution* — but their form
  DOMs have never been walked, and every ATS read so far produced at least one
  bug that reading it was the only way to find. Run the same extraction over one
  Ashby and one SmartRecruiters application page and add the findings as tests
  beside the existing ones.

---

## 4. Honesty and trust debt

Things that are currently true but should not stay true.

- [x] **No privacy policy.** Fixed — `/privacy`, written from the schema and
  linked from the footer. Writing it surfaced two things worth keeping in mind:
  the upload form's "we keep only the structured result — not the file" was
  **false for `.txt`/`.md` uploads** (fixed in the same commit), and a policy
  promising deletion needed a deletion path, so `deleteAccount` was built.
- [x] **No "report this listing" button.** Fixed — six reasons, sign-in
  required, `asks_for_payment` sorts to the top of the admin queue.
- [x] **No HTTP dead-link check on apply URLs.** Fixed — `npm run check:links`
  plus a twice-daily workflow. Flags, never closes. The first real run found
  2 of 400 answering 403, both scholarships.com behind a WAF and alive, which
  is exactly why 403 is treated as no information.
- [x] **No web admin view.** Fixed — `/admin`, a triage queue rather than a
  review gate (see the roadmap line for why a gate is the wrong mechanism for
  a live-polled corpus). Fails closed on `ADMIN_EMAILS`.
- [ ] **USAJobs is `periodic_check`, not `live_polled`.** Correct as written —
  it runs daily in `ingest-daily`. Moving the step to `ingest-fast` is what
  would earn the stronger "confirmed live" claim.
- [ ] **USAJobs pay is dropped entirely.** The API states a rate whose unit
  lives in a separate `RateIntervalCode`; writing 17 (dollars/hour) into the
  same `amount_min` that holds a $5,000 award would break the "min award"
  filter in both directions. Needs a rate-interval column first.

---

## 5. Discoverability

The cover letter builder shipped in `cbb92f5` and **its own owner did not know
it existed.** That is a product failure, not an oversight, and the same is true
of several other finished features. If you could not find it, no student will.

- [~] **Surface what is already built** from the feed, the tracker and the
  profile: cover letter builder, application packet, resume critique engine,
  keyword-gap view, deadline reminders. _Partly done: the completion panel on
  `/profile` now routes to `/resume` and the intake form with a reason attached
  to each, and the email panel below it names the reminders and the digest.
  The three open tools (github, linkedin, essay) are now surfaced on the feed
  itself via `ToolsTease` for signed-out visitors and carry labels + blurbs in
  the nav's "tools" menu — previously they were only findable by name. That
  metadata now lives in one place: `lib/tools.ts`, shared by the menu and the
  tease. The cover letter builder, the application packet and the keyword-gap
  view are still reachable only by opening a listing (the builder and packet
  are the "05 — cover letter" section and the "application packet" button there;
  the gap is the skills line on each feed and listing row)._
- [x] **The nav is over-full — fix this before the next page lands.** Seven links
  for an admin (github, linkedin, essay, tracker, resume, profile, admin), six
  for everyone else. `/essay` was added anyway this session rather than
  shipping a page nobody could find, which makes this the blocking item it was
  warned about. The three paste-in tools (github, linkedin, essay) share a
  shape and should collapse into one "tools" menu.
  _Fixed. The three tools now live under one "tools" disclosure
  (`src/components/chrome/ToolsMenu.tsx`) that opens signed-out like each tool
  it holds. Mouse and keyboard both work: ArrowDown opens and lands focus on
  the first item, arrows/Home/End cycle, Escape returns focus to the trigger,
  Tab leaving either end closes it, and any navigation (including the browser
  back button) closes it. Each item carries a one-line description, which is
  the first pass at the discoverability item above. The layout header now
  out-paints `main` (`body > header { z-index: 20 }`) so the panel can extend
  past the 72px bar. Nav is now five links for an admin (tools, tracker,
  resume, profile, admin), two for everyone else (tools, sign in).

---

## 5b. Pricing tiers & entitlement gating

- [x] **The production build still referenced the retired Edge tier.** The
  pricing model is now Free + Apply, but entitlement resolution and tests still
  accepted `edge`, which made `next build` fail in its TypeScript pass. Runtime
  gates and assertions now use the two-tier model; `npm run build` passes.

Built 2026-08-21. Three tiers — **Free ("See it")**, **Edge ($6.99/mo)**,
**Apply ($14.99/mo)** — with every entitlement defined in one place,
`src/lib/pricing/tiers.ts`. No billing provider was wired up; this is the
entitlement model and its enforcement only.

**Where the decisions live.** `tiers.ts` is pure (no `db` import) so it can be
imported from a client component and unit-tested without a connection — the
same split `admin/allowlist.ts` makes from `admin/auth.ts`. `entitlements.ts`
holds the one database read (`getUserTier`), `usage.ts` the run counters. No
component contains a `tier === "edge"` comparison or a price; they render
whatever `evaluateFeature` returns. 18 new tests, 644 total, all passing.

**The two gating patterns, as the roadmap defines them.** Discovery/scoring is
full access at lower fidelity — free sees a bucketed *Strong / Good / Low Fit*
label via `presentFit`, computed in the RSC so the number is genuinely absent
from the HTML. Generation tools are full fidelity at capped quantity — resume
critique 1, cover letter 1, GitHub 1, LinkedIn 1, tracker 5.

- [x] **The paywall stripped the `N of M` confidence marker, which is a
  doctrine violation.** Caught by running the feed, not by a test: signed out,
  fifty consecutive rows read a confident "Strong Fit" with nothing saying what
  it rested on — while `FitResult`'s own contract says the marker "must be shown
  wherever the score is", because an unknown dimension is dropped rather than
  scored as a miss. Bucketing may lower the *fidelity* of a score; it may not
  quietly remove the thing that stops the score overstating itself. Fixed —
  `presentFit` carries `known`/`total` through the bucketed branch and
  `ScoreBadge` renders it. Verified live: all 50 rows now show `2/3`. Pinned by
  a test.
- [x] **`/compare` printed the exact fit score, bypassing the paywall
  entirely.** It builds its fit row as a plain string rather than through
  `ScoreBadge`, so the badge-level gate missed it completely. Found by grepping
  `fit.score` across the codebase *after* the feed and listing gates were
  already working — worth remembering as the general shape: gating a component
  does not gate a second surface that formats the same value by hand. Fixed —
  `buildComparison` takes a tier and routes through `presentFit`, and marks **no
  winner** on a bucketed tier, since declaring one would rank two postings on a
  number the viewer is not being shown.
- [x] **`consumeUsage` blocked the very first allowed use.** It returned the
  quota as it stood *after* charging the unit, so on a limit of 1 the first
  resume critique came back `usable: false` having already spent it — free tier
  would have meant zero runs, not one. Found by running it against the live
  database; the unit tests had only ever called `evaluateFeature` directly.
  Fixed: `usable` answers "may THIS call proceed".

### Session 2 — free-tier limiting, pricing discoverability, timing rewrite

- [x] **The timing score had four distinct values across 3,788 rows, 97.5% of
  them on 53 or 54.** Reported as "the timing is kind of just like the same
  three numbers". Measured before touching anything, and the cause was
  structural rather than a tuning problem: the score hung entirely on
  `firstSeenAt` — a fact about *our ingest* — and this corpus was bulk-ingested
  across three days, so the one variable it rested on barely varied. Two
  genuinely discriminating facts were being discarded at the same time:
  **`postedAt` is present on 50.4% of open rows and was ignored outright**, and
  a stated deadline only counted inside 72 hours, so of the 288 rows carrying a
  real deadline exactly **2** benefited — a scholarship closing in three weeks
  scored the same as one closing in three years.
  _Rewritten to take the **stronger** of two continuous pressures (deadline
  proximity, posting freshness) rather than an average — averaging would report
  a comfortable middle for something closing in 48 hours — then damp by how
  recently we re-confirmed the listing. Both curves are logarithmic, because
  day 2 vs day 9 changes what someone does tonight and day 200 vs day 207 does
  not. **Measured after: 4 distinct values → 50, largest bucket 49.8% → 42.8%.**
  The remaining 42.8% cluster is honest — those rows genuinely have identical
  evidence (no posted date, no deadline, same ingest day) and now say so via a
  confidence marker._
- [x] **`postedAt` cannot be trusted flat, and the corpus says exactly why.**
  A still-open "User Interface Designer (Entry level)" carries **2012-02-29**;
  Lever's rows average 588 days old; 304 open rows claim to be over a year old.
  Employers reuse requisitions, so an ancient date means the req id is old, not
  that the vacancy is fourteen years old. _Handled with a plausibility bound
  (`POSTED_PLAUSIBLE_DAYS = 365`): inside it the employer's date is believed and
  preferred over `firstSeenAt`; outside it the field is treated as **unknown,
  not as evidence of staleness** — the Fit Score's own "unknown is dropped,
  never scored as a miss" rule. The corpus supports believing it inside the
  bound: `postedAt` is never in the future and never later than `firstSeenAt`
  on any of the 1,909 rows carrying one._
- [x] **"new today" was claiming something we never observed.** The label came
  off `firstSeenAt`, so on a bulk-ingested corpus it marked 2,080
  simultaneously-imported rows as new on the same day. _Now the label says
  "posted today" only when it rests on a believable employer date, and "found
  today" otherwise — the same rule the saved-search alerts already follow,
  where new means new *to us* and the email says so. The feed's accent is
  reserved for labels a student can act on; "found today" is a fact about our
  crawler and is deliberately not accented._
- [x] **A deadline earlier today was being scored as passed.** Elapsed-time
  arithmetic meant a scholarship stated as "deadline: August 12" went to
  score 0 at 00:01 on the 12th — buried on the one day it was most urgent.
  _Now counts whole UTC calendar days, the same correction the deadline
  reminders needed. Caught by a pre-existing test that encoded the old
  assumption._
- [x] **Timing never explained itself.** Every other score here reports its
  reasons and an `N of M` marker; timing reported a bare number. _It now
  returns `reasons` and `knownSignals`/`totalSignals`, the badge shows the
  fraction, and the listing page has a "why this timing" disclosure. Live
  distribution: 1,938 rows at 1/3, 1,839 at 2/3, 11 at 3/3. **The first cut of
  this was wrong** — it counted a *stale* verification as an *unknown* one and
  reported 1-of-3 on 3,777 of 3,788 rows, which is a constant rather than a
  marker._
- [x] **Each row now shows verified / posted / closes dates.** Asked for
  directly. `describeTiming` builds all three, calendar-relative
  ("today"/"yesterday"/"Aug 14"), and each is attributed to whoever actually
  stated it: `verified` is our claim and keeps the freshness-tier distinction
  (only sub-hour ATS polling says "confirmed live"), `posted` is the employer's
  and is **omitted entirely** rather than guessed when we hold no believable
  date, `closes` is the source's deadline with a countdown beside the date.
  Computed in `buildFeedItem` rather than in the component, because React's
  purity rule rejects `Date.now()` in render and one `now` per request means a
  long feed cannot straddle midnight and report two different "today"s.
- [x] **Free tier is now limited to its 20 highest-ranked matches.** Asked for
  as "the results need to be limited… updated results every single day".
  _Chosen as a **depth** cap rather than a per-listing view counter, and that
  is the load-bearing decision: a view counter needs a row written every time a
  listing is opened, punishes exploring, and would create the first
  behavioural log of what a named student looked at — exactly what the `events`
  table was designed never to be. The depth cap needs no new table and cannot
  be gamed by refreshing. It is genuinely daily without any date arithmetic,
  because the ranking reads timing, timing now moves every day, and
  `ingest-fast` adds rows every 20 minutes — so the UI says that rather than
  claiming a midnight reset we do not run. Searching, filtering and opening any
  listing stay unlimited on every tier._
- [x] **Capping the feed exposed the scholarship-vs-internship ranking bias,
  and needed the digest's answer.** Verified live and it is not marginal: for a
  **signed-out visitor the best internship in the whole corpus ranks #1749**,
  and a free feed of 20 would have contained **0 internships and 20
  scholarships**. `FEED_MIN_PER_KIND = 5` reserves slots per kind, the same
  mechanism the weekly digest uses for the same reason. Verified that rank
  order survives the promotion (positions 0–14 then 1749–1753, monotonic) and
  that the promoted rows are exactly that kind's best. **Worth knowing: a
  filled profile fixes the ranking on its own** — for a CS student with skills
  the best internship ranks #0 — so the bias bites hardest on first-time
  signed-out visitors, which is precisely the free tier's audience.
- [x] **Pricing had nowhere to be seen from.** _Now a nav item that earns its
  slot by carrying a fact rather than being a bare marketing link: signed in it
  names the plan you are actually on (the only place that says so), signed out
  it reads "pricing". One item either way, so the over-full-nav finding in §5
  is not undone. Also linked from the footer._
- [x] **"Not fully built" is now a first-class state, said before the plans
  rather than after.** Asked for directly. _A third `FeatureStatus`,
  `unverified`, sits between `live` and `coming_soon` — built and tested, but
  never driven end to end by a human. **The extension is the case that forced
  it**: 616 tests including source-level safety invariants, and FIXES.md §3
  records that nobody has loaded it into Chrome with a real session, while every
  ATS form actually read so far produced at least one bug that reading it was
  the only way to find. Selling that as finished would be false; refusing to run
  it would also be wrong. So it runs and says so — on the pricing page, in the
  upgrade wall, and in the tools menu blurb. `coming_soon` remains genuinely
  unusable on every tier including the one that pays for it. The pricing page
  lists both sets **above** the plan cards, because someone deciding whether to
  pay should meet the caveats while they are still deciding._

### Enforcement audit — server-enforced vs UI-only

Requested explicitly, and the honest answer is that most of it is real and two
things are not.

**Genuinely server-enforced** (a direct API/action call from a free account is
refused, not merely hidden):

| Gate | Where |
|---|---|
| Fit Score number, reasons, keyword gap | `presentFit` in the RSC — verified absent from served HTML |
| Cover letter cap | `generateCoverLetterAction`, counts `cover_letters` |
| Tracker cap | `setStatusAction`, counts `applications`; only blocks a *new* posting, never a status move |
| Saved-search creation | `saveSearchAction` |
| Saved-search alert sending | `alertCandidates` SQL — `plan in ('edge','apply')` |
| Weekly digest sending | `digestCandidates` SQL — same filter |
| Extension autofill | `/api/extension/packet` and `/api/extension/applied` both 403 |
| Resume critique cap | `/profile` RSC — findings are not computed at all when locked |
| Essay reviewer | `/essay` RSC — the component never mounts; verified 0 `<textarea>` served |
| GitHub audit cap | `/github` RSC, keyed on username |

**UI-only, or otherwise incomplete — these are the gaps:**

- [ ] **The LinkedIn checker's cap is not enforceable, by construction.**
  Access to the tool is gated server-side (the component does not render for a
  free account that has used its run), but the *metering* is a client-fired
  Server Action, because the tool scores entirely in the browser and there is
  no per-run server call to hook. A free user who blocks that one action keeps
  unlimited runs. This is the direct cost of the privacy promise on that page —
  the alternative is sending pasted profile text to a server to count it, which
  CLAUDE.md's LinkedIn rule and the page's own banner both forbid. Recorded
  rather than "fixed" by breaking the stronger guarantee.
- [ ] **The GitHub audit is unmetered for signed-out visitors.** The page is
  deliberately open signed-out (everything it reads is public), so there is no
  account to attach a quota to. Metering by IP or fingerprint was rejected as
  its own privacy problem rather than attempted quietly. A determined free user
  signs out and keeps auditing.
- [ ] **Quotas are lifetime, not monthly.** There is no billing cycle to reset
  against — no subscription, no renewal timestamp — so "1 free run" currently
  means "1 ever". Enforcing a monthly cap this codebase cannot observe would be
  inventing a number. Reset on the renewal date once a provider supplies one.
- [ ] **`consumeUsage` is read-then-write, not atomic.** Two simultaneous
  requests at a free user's last unit could both succeed. Accepted: the cost of
  losing that race is one extra free run, not a security boundary. Worth the
  stricter single-statement `UPDATE ... WHERE count < limit` once real money is
  behind it.
- [ ] **Deleting a cover letter frees its slot.** The cap counts rows in
  `cover_letters` rather than a monotonic counter, so a free user can delete and
  re-draft indefinitely. Deliberate — counting drafts in a second table would be
  the driftable duplicate the schema comment warns against — but it does mean
  the cap is "1 stored draft", not "1 draft ever".
- [ ] **Nothing ever sets `profiles.plan` to anything but `free`.** No Stripe,
  no checkout, no webhook — out of scope by instruction. The column and
  `plan_updated_at` are the seam; `/pricing`'s upgrade buttons are visibly inert
  and say so. **All 10 live profiles are on `free`**, so every paid path above is
  currently unreachable in production and was verified by temporarily flipping
  one profile's plan and restoring it.
- [ ] **Six features are `status: "coming_soon"` — gated *and* disabled on
  every tier including the one that pays for them.** The five named as reserved
  (scholarship autofill, answer bank, one-click reapply, submission
  confirmation, semester recap) plus **Smart Resume**, which CLAUDE.md forbids
  inventing the structure for. _Was seven: **priority freshest listings** was
  the other one ("no ranking boost exists in `rankingScore` to gate") and is now
  built and `live` — see Session 4 above._ A test asserts
  no `coming_soon` feature is usable on any tier, so the Apply tier can never
  advertise a working control for something unbuilt.
- [ ] **Migration `0017_pricing_tiers` was hand-written.** `drizzle-kit
  generate` needs an interactive TTY this environment does not have — the same
  limitation `0015` and `0016` hit. No columns are renamed or dropped, so there
  was nothing for its prompt to disambiguate. RLS hand-appended to
  `feature_usage` per the standing rule; applied and verified live (RLS on, one
  SELECT-own policy, both `profiles` columns present).

### Session 5 — the extension stops being an ATS-only feature

Asked for as "make sure it works for every single scholarship and internship".
Three structural caps stood in the way, none of them in the matcher — which was
already generic and contains no ATS name at all. Each is now removed or
measured.

- [x] **Embedding was a four-host hardcoded list; it is now an observation.**
  `FRAMEABLE_ATS_HOSTS` could cover four ATS families and **0 of the ~300
  distinct scholarship hosts**, which are roughly one row per host and could
  never fit in a list anyone maintains — and it silently excluded every source
  added later. `postings.frame_allow_strikes` / `frame_checked_at` (migration
  `0018`, applied and verified live) now record whether a page's own headers
  permit framing, read off **the response the link checker was already
  fetching, at zero extra requests**.
  _`lib/apply/frame-headers.ts` is pure and holds the whole matrix: any
  `X-Frame-Options` refuses (including `ALLOW-FROM`, which no current browser
  honours, so believing it would produce the blank rectangle this exists to
  prevent); `frame-ancestors` permits only a literal `*`; either header
  refusing is enough, so the strictest reading is both the safe one and the
  simple one. **Two consecutive `allow` observations before we embed, and a
  single refusal withdraws it immediately** — deliberately asymmetric, because
  a wrong "deny" costs one browser tab and a wrong "allow" shows a blank box at
  the moment someone was applying. `unknown` neither advances nor resets, the
  same rule `linkcheck.applyCheck` follows for a 403._

  _**Measured live, twice over, on 40 rows of each kind: 23/40 scholarships
  (58%) are now embeddable** — rows that previously had no option but a new
  tab. Internships 15/40, which is lower for a real reason: SmartRecruiters and
  Ashby genuinely refuse. **Verified end-to-end in a browser**: the wizard on a
  real scholarship (`creative-biolabs.com`) reached the hand-off step with the
  sponsor's own page rendered inside the Arc modal, host banner above it,
  escape hatch beside it, and "fill this form" correctly **disabled** because
  no extension is loaded in that browser._

  _**Withholding still outranks the observation.** Lever measured two clean
  `allow` readings and still reports `withheld`, because its captcha was never
  seen minting a token in a frame and no response header describes that. The
  three Lever rows in the sample came back `withheld`, not `embedded`, which is
  the intended precedence._
- [x] **The manifest's seven hosts capped autofill at the four ATS families.**
  That is 1,885 of 1,909 open internships and **zero scholarships**. Fixed with
  `optional_host_permissions` plus a per-site grant, not with `<all_urls>`.
  _Nothing broad is granted at install — Chrome shows none of it — and the
  student is prompted for **one origin, at the moment they apply on that site**,
  after which it is remembered forever. The four ATS families are declared and
  never reach this path, so the common case gains no friction at all; it is the
  ~300 one-row scholarship hosts that cost one click, once, ever._

  _**The prompt has to come from the popup**, and that is a Chrome constraint
  rather than a choice: `permissions.request` must run inside a user gesture in
  an extension surface, a content script cannot call it at all, and forwarding
  a click from a web page through the service worker loses the gesture. So the
  one place the toolbar is still needed is the first apply on a brand-new site._

  _**The safety invariant was replaced, not weakened.** The old test asserted no
  host pattern was broad; that still holds for install-time `host_permissions`
  and the content-script matches. A new test asserts the extension source never
  passes a wildcard or `<all_urls>` **inside an `origins:` array** — because a
  broad optional permission makes it possible to obtain blanket access in one
  click, and only this stops it. Every request is built from a real URL through
  the shared `originPatternForUrl`, compiled into `extension/vendor/` so the
  popup and the service worker cannot drift. The first cut of that test forbade
  the literal string `<all_urls>` anywhere and failed on popup.js's own comment
  explaining why it is not used — a test that forbids naming the thing you are
  avoiding makes the code less clear, not safer._
- [x] **Submission detection, so the loop actually closes.** `lib/apply/
  submitted.ts`, per platform as CLAUDE.md requires, Greenhouse first. The
  content script watches from **inside** the frame — Instela's own JavaScript
  cannot read a cross-origin document, so nothing else can see the employer's
  confirmation — and posts `INSTELA_EMBED_SUBMITTED` back, which advances the
  wizard.
  _**It never submits anything; it observes.** The student presses the
  employer's own button and this notices afterwards. The no-`.click()`
  invariant is untouched and still asserted. **An unrecognised platform returns
  `unknown`, never a guess**, because reporting a submission that did not
  happen makes a student stop tracking a live application — strictly worse than
  reporting nothing. Tests pin the phrases that must NOT fire: the privacy
  boilerplate under every Greenhouse form, and "Submit application" on the
  unsubmitted page. The observer starts only after a fill, so it never runs on
  a page someone is merely browsing._
- [ ] **Framing observations will take ~13 days to populate on the current
  schedule.** `check-links` runs twice daily at 300 rows, framing rides along
  with it, and two consecutive observations are needed — so 3,788 rows is about
  6 days a pass. Until a row has been seen twice it falls back to the old
  four-host answer, which is its own tab: no regression, just not yet the
  improvement. Accelerate with `npm run check:links -- --limit 2000` twice if
  it matters sooner.
- [ ] **1,559 scholarships can never be autofilled, and it is not a code
  problem.** They point at scholarships.com *listing* pages, which carry no
  application form at all — they link out to the sponsor. The addressable
  scholarship set is ~320 rows across ~302 hosts. "Works for every scholarship"
  therefore caps at ~320 no matter what is built, and the honest fix is
  ingesting the sponsor's own apply URL rather than the aggregator's listing
  URL. Worth doing; not attempted here.
- [ ] **Still zero observations in real Chrome.** 692 tests now, and the
  extension has never been loaded. Everything above is reasoned and
  server-verified; `setNativeValue` satisfying React's change tracking on a
  live form, the per-site grant prompt, and the Greenhouse confirmation
  actually firing are all unwatched. This remains the single highest-value hour
  available and nothing else should be built on top of it first.

### Session 4 — timing-weighted ranking, and what measuring it actually found

- [x] **`priority_freshest_listings` is built and is no longer `coming_soon`.**
  Asked for as "the more tiered up in the plan you go the better timing
  scholarships should be there". `TIMING_PRIORITY_POINTS` (free 0 · Edge 10 ·
  Apply 20) in `tiers.ts`, applied in `feed.ts`'s ranking and threaded through
  the digest and the saved-search alerts so all three rank the same way for the
  same subscriber. `rankingTiming` is new in `score/timing.ts` — the same
  confidence shrink `rankingScore` applies to fit, toward the same
  `NEUTRAL_PRIOR`, because two scales pulling toward two different neutrals do
  not add up to anything.
- [x] **A blend was the wrong shape, and the corpus said so before it shipped.**
  The first cut was `fit × (1−w) + timing × w`. Swept over six weights against
  all 3,788 live rows: from w=0.2 to w=0.5 it moved 2–3 rows of the top 20 and
  barely shifted mean timing, and the setting where it finally bit (w=0.7)
  dropped the top 20's mean fit from 98.7 to 83.7 with a **minimum of 22**. A
  blend cannot buy timing without spending fit, and a posting closing tomorrow
  that does not match you is not a recommendation, it is a countdown. Replaced
  with a **bounded bonus centred on the neutral prior** — an urgent row gains at
  most N points, an average one moves not at all — so timing reorders
  comparable matches and cannot promote a worse-fitting one. Verified: at 20
  points the CS top 20 keeps mean fit 98.4 and minimum fit 84, unchanged.
- [ ] **The ranking boost saturates at ~5 points, and the reason is the
  finding.** Measured at 0/5/10/15/20/30/50 points: **identical from 5 upward.**
  Timing was already the tiebreaker in `rank()`, and the top of the fit ranking
  is one large tie group — so *the part of the free feed anyone actually reads
  is already ordered by timing*, and a monotonic bonus cannot reorder what is
  already in that order. All it can do is pull a lower-fit row across a fit gap,
  which is exactly the trade the bound refuses. **What it does buy, top 20:**
  signed-out goes from 10 to 13 rows carrying a real stated deadline; a filled
  CS profile from 1 to 2; the worst timing score in that CS top 20 rises 29 →
  49. Real, and modest. **Making it bigger requires making free's ranking
  worse** — dropping timing as free's tiebreaker — which is a product decision,
  not a tuning one. Left as is pending that call.
- [ ] **The depth cap, not the boost, is what actually gates well-timed
  listings — and it already works.** Measured on the live corpus: 62 open rows
  close within 30 days. For a filled CS profile **0 of them are in free's top
  20**, 3 are in a paid top 50, and the best-ranked urgent row sits at **rank
  39** — below the free cap of 20. Signed out it is 3 of 20 versus 8 of 50. So
  "paid students see the listings still worth acting on" is already true through
  `FREE_DAILY_RESULTS`, and the ranking boost is a small refinement on top of
  it rather than the mechanism. Worth saying on the pricing page in those terms.
  **The cheaper honest alternative to a bigger boost is a gated sort control**
  ("best match / closing soonest / newest", the latter two paid) — a thing a
  student can see working, rather than a hidden weight they must take on trust.
  Not built; needs a decision.

### Session 3 — DEV_TIER, and the three call sites that bypassed the gate

- [x] **There was no way to see a paid surface on a development machine.**
  Asked for directly ("add a DEV mode so i can have full access"). Auth is
  magic-link only and **nothing sets `profiles.plan` off `free`**, so Edge and
  Apply were unreachable locally — which is how a paid surface joins the
  already-too-long list in §3. `DEV_TIER=free|edge|apply` in `.env` now forces
  the tier for every request.
  _Implemented in `lib/pricing/dev-tier.ts` (pure, 6 tests) and read in exactly
  one place — `getUserTier`, the single chokepoint every gate resolves through.
  **Two conditions, and the second is the load-bearing one:** the variable must
  name a real tier **and** `NODE_ENV` must not be `production`. That is not
  belt-and-braces. The realistic way a dev flag opens a live paywall is not a
  code bug, it is a whole local `.env` pasted into Vercel's environment editor —
  refusing the variable outright in a production build makes that paste inert.
  A test asserts every tier value resolves to `null` under `NODE_ENV=production`.
  **The stated cost:** `npm run build && npm start` sets `NODE_ENV=production`,
  so dev mode does not apply to a local production build. `npm run dev` is
  where the paid surfaces are visible._

  _**It says so on screen**, which is the point that matters more than the
  feature: the nav renders a filled `dev · apply` chip and `/pricing` replaces
  "you are on Apply" with a sentence naming the env var. Without that, every
  local check of "what does a free visitor actually see" — the exact question
  the last two sessions were built to answer — would silently be wrong, and a
  screenshot taken with it on would not be a picture of the product._

  _**It does not unlock `coming_soon`** (`evaluateFeature` refuses those before
  it looks at the tier, so this holds for free, and a test pins it) **and it
  does not grant `/admin`** — that boundary has its own written rule against
  exactly this shortcut in `admin/allowlist.ts`, and `ADMIN_EMAILS` plus a real
  session is still the only way in._
- [x] **Three call sites resolved the tier themselves instead of calling
  `getUserTier`, and dev mode was how that surfaced.** `app/page.tsx`,
  `app/github/page.tsx` and `app/linkedin/page.tsx` each wrote
  `user ? await getUserTier(user.id) : "free"` — which reads as exactly
  equivalent, since that is what the function returns for a missing id, but is
  a second definition of how a tier is decided. **Observed live:** with
  `DEV_TIER=apply` the nav correctly read `dev · apply` while the feed beside
  it still served 20 rows and 40 bucketed "Strong Fit" labels. The same shape
  as the remote-only filter bug — two parsers over one input, agreeing until
  they didn't. Fixed by passing `user?.id` through the one function on both
  branches. Verified after: 50 rows, 0 bucketed labels, real numbers, "showing
  50 of 3,788 ranked matches"; flipping to `DEV_TIER=free` returns 20 rows and
  40 buckets; a typo (`DEV_TIER=paid`) is inert, prints a named warning, and
  shows no chip.
- [x] **An unlimited tier no longer burns a usage counter.** `consumeUsage`
  wrote a `feature_usage` row whenever the call was allowed, including when the
  tier was unlimited. Those counters are **lifetime** with no billing cycle to
  reset against, so a row written while the viewer happened to be unlimited
  never goes away: anyone browsing with `DEV_TIER` set — or an Edge subscriber
  who later lapsed — would find the one free run they never actually used
  already spent. It now returns early on an unlimited tier and writes nothing.
- [x] **The dev chip was a `<span>` that led nowhere, and read "dev · apply".**
  Reported directly. Two separate faults. It was a marker with no destination,
  so there was no way to switch tier or turn it off without editing `.env` and
  waiting for a reload. And **"apply" is the tier's name** (the three are
  See it / Edge / Apply) — lowercase, beside a row of nav links, it reads as a
  verb, i.e. as a button that submits an application. It is now a link to
  `/dev` reading `dev mode · Apply plan`; the word "plan" is what stops the
  misreading, and the label was never going to be fixed by shortening it.
- [x] **Dev mode now unlocks with a password at `/dev`, not only an env var.**
  `DEV_PASSWORD` in `.env` (fails closed when unset — no password, no unlock,
  and the page says so rather than accepting attempts against a secret that
  does not exist). The page takes the password and a tier, and afterwards
  offers a tier switcher and a turn-off.
  _**A signed cookie, not a plain one.** `instela_dev_tier` carries the tier plus
  an HMAC of it keyed on the password itself — stored plain,
  `instela_dev_tier=apply` would be a paywall anyone edits past in devtools, which
  would make the password decorative. Keying on the password rather than a
  separate signing secret means **rotating the password revokes every cookie
  already issued**, which is the cheapest possible revocation. Password
  comparison is `timingSafeEqual` over two sha256 digests, so neither length
  nor an early mismatch is observable through timing, and one message is
  returned for every failure. `httpOnly` — it is a privilege marker and no
  client code has a reason to read it. **`switchTierAction` re-checks that the
  caller is already unlocked**, because a Server Action is a public POST
  endpoint and the page rendering the button is not a gate — the same rule
  every `/admin` action follows._

  _**Unlike `DEV_TIER`, the password path is allowed to work in a production
  build**, and the distinction is the point: `DEV_TIER` grants the tier to
  every request with no secret at all, so it is refused outright when
  `NODE_ENV=production`; a password grants nothing to someone who does not know
  it. The nav chip only renders when `DEV_PASSWORD` is configured, so a normal
  deployment shows no "dev login" link to invite attempts._

  _Verified live in a real browser: wrong password refused with no cookie set;
  correct password → 50 rows, 0 bucketed labels, "showing 50 of 3,788 ranked
  matches", nav reading `dev mode · Apply plan`; switch to Edge and turn-off
  both update the nav and the feed together. **Forgery tested by hand over
  curl** — `apply`, `apply.deadbeef`, an empty value, and (the real attack)
  `free`'s valid signature pasted in front of `apply` all fall back to 20 rows
  and 40 buckets, while the correctly-signed cookie gives 50 and 0._
- [ ] **`/dev` has no rate limiting and one shared static password.** Nothing
  slows down guessing, and there is no lockout, no attempt log and no second
  factor. Accepted for what this grants — a pricing tier on a product with no
  billing wired up, worth exactly the revenue that does not exist yet — and
  deliberately **not** the shape used for `/admin`, which can take listings
  down and read every report and is still `ADMIN_EMAILS` plus a real Supabase
  session. Revisit if `DEV_PASSWORD` is ever set on a deployment that matters,
  and prefer not setting it there at all.
- [ ] **`DEV_TIER` and `DEV_PASSWORD` are a deliberate hole in the enforcement
  audit above, and belong in it.** Every "genuinely server-enforced" row in that table resolves
  its tier through `getUserTier`, so all of them are overridden at once when
  dev mode is on. That is the intended behaviour and the reason it is one
  function rather than twenty, but it means the audit's guarantees read
  "…unless dev mode is unlocked for this browser". Nothing to fix; listed so
  the table is not read as unconditional.

---

### Session 6 - search that ranks, and two plans instead of three

- [x] **Search filtered but never ranked, so the top hit was routinely
  irrelevant.** Reported as "the search engine needs to be much better".
  Measured against the live corpus first: **"engineering" returned 396 rows led
  by "National Garden Clubs Inc. Scholarship"**, and "nursing" returned 15 led
  by "Reno Rodeo Foundation Scholarship". Both genuinely contain the term - the
  garden club's eligibility prose mentions engineering - so **the filter was
  right and the ordering was the entire bug**: `getFeed` pushed an
  AND-of-substrings into SQL and then sorted the survivors by *fit score*, so
  the query decided membership and had no say at all in position.

  _Fixed with `score/relevance.ts` plus a comparator that puts relevance first
  whenever the student typed something. Since every row reaching the ranker
  already contains every term, relevance cannot be about *whether* it matched -
  it scores **where**: title beats sponsor beats eligibility, a whole word
  beats a substring inside a longer one (the boundary lesson `law`
  matching "Delaware" already taught this project), leading the title beats
  appearing later in it, and the query as a contiguous phrase beats its words
  scattered._

  _**Relevance-first, not blended with fit**, because a blend still lets a
  high-fit near-miss outrank an exact title match - the same failure wearing a
  smaller number. Fit is the immediate tiebreaker instead, so among rows that
  match the query equally well the student still sees the ones that suit them
  first: the query decides what the list is about, the profile orders within
  it. Measured after - "engineering" to *Engineering Internship Program 2026*,
  "nursing" to *Mildred Nutting Nursing Scholarship*, "computer science" to
  *Computer Science Internship*, "STEM" to *STEM Teachers for America's
  Future*. Nine tests pin the behaviours including the two live regressions._
- [x] **Pricing collapsed from three tiers to two.** Free + **Apply at
  $5.99/mo**, replacing Edge ($6.99) and Apply ($14.99); the single paid plan
  takes everything both had, browser-extension autofill included. `tiers.ts`
  was already the one definition, so this was mechanical: the `edge` column
  came out of all 21 feature limit records and the paid plan kept the `apply`
  values. **The type system found every call site** - 10 of them - which is the
  argument for that file existing.

  _Two decisions worth keeping. **A legacy `edge` row in the database maps UP
  to Apply, not down to free** (`getUserTier`, with the digest and saved-search
  SQL agreeing): failing closed is right when it stops someone getting access
  they did not buy, and wrong when it would silently downgrade a subscriber.
  **`DEV_TIER=edge` does the opposite and is refused**, because that is a
  hand-edited env var naming a plan that does not exist, not an entitlement
  someone already held. And seven user-facing strings hardcoded "Edge" - an
  upgrade prompt naming a plan that no longer exists - now read
  `TIER_LABELS.apply`, which is what tiers.ts's own rule said all along._
- [x] **Free depth cut from 20 to 10.** Made honest by the search fix: twenty
  was chosen when a query could only filter, so depth was the only way a free
  user found anything specific. With results ordered by relevance, ten
  well-matched rows beat twenty mediocre ones.
- [ ] **Search still has no typo tolerance and cannot see structured facts.**
  Measured: `"software enginer"` returns **0 rows** and `"$5000"` returns 0
  despite `amount_min`/`amount_max` being columns. Both belong in the SQL
  filter, not the ranker - a ranker scoring on a different notion of "match"
  than the filter would order rows by a rule the result set was never selected
  under. Trigram (`pg_trgm`) is the route for the first; the second is parsing
  an amount out of the query and applying it as a range. Also worth knowing why
  search sees so little: **only 59 of 1,879 open scholarships carry any
  eligibility text and 0 carry a description**, so search is effectively
  title-and-sponsor only. That is an ingestion gap, not a search one.

## 6. Deliberately not built — revisit only if asked

Recorded so they are not rediscovered as gaps. Each was a decision with a
reason, not an omission.

- [ ] **DOCX resume import and export.** Both refused for the same reason: a
  document-generation dependency. Print-to-PDF produces real selectable text so
  the ATS case is covered. Worth adding only if students actually ask.
- [ ] **Auto-submit applications.** Decided against 2026-08-14 — see the Phase
  05 roadmap line for the three reasons. The autofill half was built instead.
  _Re-asked 2026-08-19 ("I genuinely want it to be a one click application
  through our website… autofill your info and send an application"), and this
  time the answer is a measured constraint rather than a judgement.
  **Every destination in the corpus requires the employer's own credentials to
  submit programmatically**, verified that day against the live corpus:
  SmartRecruiters (1,056 open rows) needs OAuth with
  `candidate_applications_manage`; Greenhouse (537) needs Basic Auth with that
  employer's Job Board API key; Lever and Ashby (292) are the same shape;
  USAJobs (21) needs the applicant's own login.gov session; and the 1,882
  scholarship rows are ~311 bespoke sites of which 1,559 are scholarships.com
  listing pages carrying no form at all. Reading is public — `GET` on a
  SmartRecruiters posting answers 200 unauthenticated, which is how ingest
  works — but submitting is authenticated everywhere. There are also **zero
  `mailto:` apply links**, so there is no email-submission route either. So
  server-side one-click is not one feature, it is ~500 employer permissions.
  The owner chose the extension instead; see the entry below._
- [x] **Browser-extension autofill.** The route back in for the auto-apply
  request: fills the real Greenhouse/Lever/Workday form **in the student's own
  browser**, with them reviewing and clicking submit. Same time saved, human
  still on the attestations. First thing that would live outside this repo.
  _Built 2026-08-19, and **kept inside this repo** rather than outside it —
  the shared logic is the whole point. `extension/` is an MV3 Chrome extension;
  `npm run build:extension` compiles `lib/apply/autofill.ts` and
  `lib/apply/apply-url.ts` into `extension/vendor/` (gitignored) so the
  field-matching rules have one tested definition rather than a JavaScript
  reimplementation waiting to drift. Covers Greenhouse (US+EU), Lever, Ashby and
  SmartRecruiters — every ATS family in the corpus except USAJobs, whose
  login.gov session is the student's alone._

  _**Matching is signature-based, not per-ATS selector tables.** It reads each
  field's label, name, id, placeholder and `autocomplete` and decides what it is
  asking for; five tables would be five things to keep correct, and this
  degrades to "leave it alone" rather than to "fill it wrong". Verified against
  the corpus: `findPostingByUrl` resolved 16/16 real postings across all four
  ATS families and all four URL shapes a student's address bar actually shows
  (bare, `/apply`, `/application`, and with `?utm_*&gh_src=#app`), with a
  non-corpus URL correctly resolving to null._

  _**Running it over two live forms found four bugs no test would have.** On
  Greenhouse: the reCAPTCHA response textarea carries no label of its own, so
  the label search walked up the DOM, returned an unrelated "First Name\*", and
  the matcher offered to type the student's first name into the field holding
  the captcha token — which corrupts the submission rather than merely wasting a
  value. "Is your university able to provide an internship agreement?" matched
  `school` on the word "university", offering to answer a yes/no box with a
  school name. And "By clicking 'Yes' below, you agree to the following
  Application Consent" was not blocked, despite being exactly the kind of
  declaration the packet's attestation rule exists for. On Lever: it renders one
  link box per purpose, and a bare `url` rule claimed "Transcripts (if applying
  for Co-op/Internship) URL" and "Other URL" for the portfolio. Fixed with an
  infrastructure blocklist read from `name`/`id` (never the label, which is the
  untrustworthy part for these), a yes/no-question rule that declines any label
  opening with an auxiliary verb while deliberately still filling wh-questions
  like "What is your email address?", consent/agreement wording added to the
  attestation blocklist, and a link rule that requires a field to say what kind
  of link it wants. All four are pinned by tests naming the live form that
  produced them._

  _**The safety invariants are tested, not merely commented.**
  `extension-invariants.test.ts` reads the extension source and asserts there is
  no `.click()`, `.submit()` or `requestSubmit` anywhere in it — the line the
  whole design rests on — that linkedin.com appears nowhere in the manifest,
  that no host pattern is broad enough to read every page the student visits,
  and that the only two permissions declared are `activeTab` and `storage`. The
  attestation guarantee is doubled: the API never sends attestation *values* at
  all (labels only), and the blocklist would refuse them anyway, so two
  independent things would have to fail rather than one._

  _**Discoverability was handled at the same time**, per §5's own lesson: the
  extension is a `/extension` page and an entry in `lib/tools.ts`, so it appears
  in the nav's tools menu and the signed-out feed tease without adding a
  top-level nav link. The page leads with *why you still press submit*, because
  a student who does not understand the constraint reads this as a
  half-finished auto-applier rather than as the honest maximum._
- [x] **Autofilling inside an embedded frame, so the student never leaves the
  site — measured and built 2026-08-20.** Asked as "can we build the browser
  extension to auto fill applications without leaving the site". The answer is a
  partial yes and the numbers decided the shape of it. **Shipped for Greenhouse
  only — 537 open rows.** Lever was built and then deliberately pulled back out
  before commit (see below); SmartRecruiters and Ashby cannot be embedded at
  all. All three still apply through their own tab exactly as before, and the
  hand-off step says which of the two reasons applies to which.

  _**An `<iframe>` alone cannot do it, and that is not a header problem.**
  Greenhouse (both hosts) and Lever send no `X-Frame-Options` and no
  `frame-ancestors`, and both apply forms were confirmed to render fully inside
  a page served from our own origin — no JS framebusting, `load` fired, the
  Lever "SUBMIT YOUR APPLICATION" form and the Greenhouse posting both painted.
  But `iframe.contentDocument` came back **`null` on both**: the frame is
  cross-origin, so our page's JavaScript cannot read or write a single field in
  it. Embedding gets a form the student can look at and we cannot fill —
  strictly worse than a new tab, because it looks like we can._

  _**Only the extension can reach inside, via `all_frames: true`.** A content
  script is injected into subframes as well as top frames, so the fill would
  happen inside the embedded form; the parent page can trigger it by
  `postMessage` to `iframe.contentWindow`, which is the one cross-origin channel
  that does work. That would need the content script to verify both
  `event.source === window.parent` **and** `event.origin` against the same
  allowlist `EXTENSION_ORIGINS` already fails closed on — without it, any site
  could frame Greenhouse and trigger a fill with someone else's facts. So this
  removes the tab switch, **not** the extension install._

  _**Coverage is 702 of 1,890 open internships (37%), and 0% of scholarships.**
  Measured by apply host: Greenhouse 537 (400 + 105 + 30 + 2) and Lever 165 are
  frameable; **SmartRecruiters 1,056 sends `X-Frame-Options: SAMEORIGIN` and
  Ashby 127 sends `DENY`** — sampled four employers each, unanimous — so the
  single largest internship source is the one that cannot be embedded at all.
  USAJobs (21) is the student's own login.gov session. The 1,882 scholarships
  are bespoke sites, 1,559 of them scholarships.com pages carrying no form._

  _**The captcha risk was the gate, and it tested clean.** Both framed forms
  load bot detection — reCAPTCHA Enterprise on Greenhouse, hCaptcha on Lever —
  and both can see they are framed (`window.top !== window.self`). Rather than
  submit a real application to a real employer, which is not a test worth
  running, each captcha was asked to mint a token directly, framed vs
  top-level, same browser, seconds apart. **Greenhouse: `TOKEN OK, length
  2382` framed and `2382` top-level, identical.** Lever's invisible hCaptcha
  cannot be executed without a genuine submit gesture — it timed out in **both**
  contexts, so that hang is the harness, not the framing — and was measured at
  the initialisation layer instead: `checksiteconfig` answered `200 pass:true`
  with a valid `req` JWT, 2 challenge frames and the response field present,
  **identical framed and top-level**. So: Greenhouse is proven end to end;
  Lever shows no framing-attributable difference but its token was never
  minted, which is the residual and is recorded in §3._

  _**Lever is therefore withheld, not embedded — the finding was allowed to
  decide the code.** The first cut of this shipped Lever on the strength of its
  headers and its initialisation parity, which is permission plus a suggestive
  measurement, and not the measurement that matters. `EMBED_WITHHELD_HOSTS`
  now holds it: a separate list from `FRAMEABLE_ATS_HOSTS`, with a test
  asserting no host can appear in both, since a name in both lists would make
  the withholding silently do nothing. **The two lists are deliberately not
  collapsed into one boolean**, because the student-facing sentence differs —
  "this employer's board cannot be embedded" is true of SmartRecruiters and a
  lie about Lever, whose board permits framing and whose absence is our own
  caution. The hand-off step picks between the two sentences off `embedStatus`.
  Promoting Lever is a one-line move between the lists **and** a claim that
  someone watched a real submission land._

  _**Two false alarms along the way, both from my own harness.** reCAPTCHA is
  **lazy-loaded on first interaction**, so an early probe reported "never loads
  in a frame" when in truth nobody had touched the form; after typing one
  character the framed form had the enterprise API, the token field and one
  reCAPTCHA iframe, exactly like top-level. Worth remembering the general
  shape: measuring a lazily-initialised third party before interacting with it
  reads as a hard failure._

  _**The remaining cost is accepted rather than solved.** An embedded form hides
  the employer's address bar at exactly the moment a student is putting their
  name on a legal document. `EmbeddedApplyFrame` answers it by printing the real
  host above the frame ("you are filling in **job-boards.greenhouse.io** · the
  employer's own form") with an "open in a tab" escape hatch beside it, which is
  the same instinct as every other honesty marker here — but it is our word for
  the padlock, and that is strictly weaker than the padlock._

  _**What was built.** `isFrameableApplyUrl` / `FRAMEABLE_ATS_HOSTS` /
  `applyUrlHost` in `lib/apply/apply-url.ts`, beside the existing URL rules and
  pinned by tests that record the observed header for each host, so a change in
  someone else's policy gets argued about rather than silently absorbed. The
  extension's content script gains `all_frames: true` and a `postMessage`
  bridge; the wizard's hand-off step embeds for frameable hosts and keeps the
  tab flow otherwise. **The bridge's origin check is the new attack surface and
  is asserted by test, not by comment:** without it any site could frame the
  same Greenhouse form and shout "fill" at it, pulling a signed-in student's
  real facts into a document that site controls. Three conditions must hold —
  sender is `window.parent`, that parent is `window.top`, and its origin is a
  configured Instela origin — and `extension-invariants.test.ts` now also asserts
  the script never replies to a `"*"` target and still contains exactly one
  `fill` routine, so the embedded path cannot grow a second filler that drifts
  from `matchFieldKey`. **The parent page never handles the student's facts**:
  it posts a verb, and the values travel the existing service-worker → Instela API
  path into the frame._

  _**A real bug found by running it, which no test would have caught.** With no
  extension installed the "fill this form" button stayed **enabled** and the
  "you need the extension" note stayed hidden — the exact wrong way round. Two
  independent causes: the iframe finishes loading before the client component
  hydrates, so an `onLoad` handler attached during hydration never fires at
  all; and the content script is injected at `document_idle`, so even a
  correctly-timed single ping can arrive before anything is listening. Replaced
  with a poll that asks for ~4s before concluding absence, because concluding
  too early is the expensive direction — it tells a student whose extension
  works to go and install it. Verified after the fix: button disabled and the
  note shown at 2s and still at 7s, banner naming the host, escape hatch
  present, 24 form fields live in the frame._
- [ ] **Peer reviews** — the last Phase 06 item still open, deferred to Phase
  07 on the recommendation in section 1: it needs users and a moderation rule
  before the first review is written. Everything else in Phase 06 has shipped.
- [ ] **Points for applying, and referrals** — refused and deferred
  respectively. Both reasons are in the gamification entry in section 1.

---

## 7. Housekeeping

- [ ] **`GITHUB_TOKEN` would also help the link checker's neighbours.** Not
  required — the link checker does not call GitHub — but noted so the two
  rate-limit stories are not confused with each other.

- [ ] **CI installs with `npm install`, not `npm ci`, because the lockfile is
  generated on Windows and is incomplete for Linux.** Found 2026-08-23 when the
  first real `ingest-fast` run on GitHub failed before polling anything:
  `Missing: @emnapi/runtime@1.11.3 from lock file`.

  _Not a stale lockfile, and **not** the Node version — that was my first
  diagnosis and it was wrong; the second run used Node 24 and failed
  identically. The actual cause: `@tailwindcss/oxide-wasm32-wasi` and
  `@img/sharp-wasm32` are optional packages that declare
  `@emnapi/core ^1.11.1` / `@emnapi/runtime ^1.11.1`, and the only @emnapi
  entries the lock carries are **1.10.0**, nested under an unrelated package.
  On Windows npm installs the native `win32` bindings and never materialises
  those wasm subtrees, so it never writes their dependencies into the lock;
  on Linux `npm ci` validates the whole tree, finds the hole, and refuses.
  Regenerating on Windows cannot fix it — Windows npm will never expand a
  subtree it does not need._

  _Worked around by switching all seven workflows to
  `npm install --no-audit --no-fund`, with the reasoning written at the top of
  each file. **The cost, stated plainly: CI no longer installs byte-identical
  dependencies to the lock.** That is acceptable for these workflows
  specifically — none builds the app or runs the test suite; every one runs a
  `tsx` script needing dotenv, drizzle and postgres — and would not be
  acceptable for a build or release job._

  _**To close:** regenerate `package-lock.json` once on Linux (any x64 box, a
  WSL distro, or a container) and commit it, then put `npm ci` back in the
  seven workflows. Neither WSL (present, no distro) nor Docker is installed on
  the dev machine, which is why this was not simply fixed at the source._
- [ ] **Nothing has been pushed.** `master` is well ahead of `origin/master` —
  everything since `49f1981` is committed but has never left this machine.
  Check with `git status -sb` before assuming a number.
- [ ] **No real students have used any of this.** Phase 02's end-to-end line is
  `[~]` for that reason: automated browser walkthroughs pass, no human has run
  the loop. Phase 07 is where that changes.
- [x] **`.mcp.json` was pointing two servers at npm names that npm has since
  seized.** Found 2026-08-23 while wiring keyless MCP tools. The `fetch` entry
  ran `npx -y mcp-server-fetch` and the `git` entry ran `npx -y mcp-server-git`;
  both names now resolve to `0.0.1-security`, npm's **"security holding
  package"** placeholder — the marker npm leaves after taking a package down —
  and both are flagged upstream as canary/honeypot packages published to
  `github.com/theinfosecguy/npx-canary`. A holding package carries no
  executable, so whatever those entries were doing lately was failing rather
  than running, but they had been configured to `npx -y` an arbitrary name on
  every session start, which is the shape of the problem rather than the
  version of it. _Replaced with maintained equivalents that verify against real
  npm metadata: `mcp-fetch` (matiasngf, repo + homepage) and
  `@cyanheads/git-mcp-server` (cyanheads, repo + homepage)._
- [ ] **Two `.mcp.json` entries are low-confidence and were left alone.**
  `time-mcp-server` publishes **no repository and no homepage** and has one
  maintainer — it resolves and it is probably fine, but nothing about it is
  checkable, which is exactly the profile the entry above turned out to have.
  And `parse` (`https://api.parse.bot/mcp`) is **not keyless** — it is the
  metered Parse scraping API this project already tracks a credit balance for
  (section 1), so it does not belong in a "free tools" set and should not be
  assumed usable without checking that balance. Neither was removed, because
  removing a working tool on suspicion is its own cost; recorded so the next
  person does not read the file as uniformly verified.
