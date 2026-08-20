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
- [ ] **`RESEND_API_KEY` + `REMINDER_FROM_EMAIL`.** All three email features —
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
- [ ] **Adzuna app id/key.** Phase 01 line is blocked, not merely unstarted —
  there is nothing to build against until one is registered. Free tier.
- [ ] **Parse credit balance.** ScholarshipPortal's ~3,666 rows have **never
  persisted** across three attempts. Both bugs those attempts exposed are
  fixed; what is unproven is the multi-batch path at that scale. Free tier is
  **200 credits/month**, one crawl is ~19. Check the balance *before*
  re-running `npm run ingest:scholarships -- --source scholarshipportal`.
- [ ] **Smart Resume structuring logic (Phase 03).** The roadmap line says "the
  logic you provide" and it has not landed. Do not invent a structure for it.
- [ ] **`DATABASE_URL` repo secret.** The `ingest-fast` / `ingest-daily`
  workflows need it to run in CI.
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
- [ ] **A scholarship can score 100 with full confidence; an internship
  essentially cannot.** Found by the first live digest dry run, which returned
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
- [ ] **Sponsor company names are read as degree language.**
  `scholarshipFields` feeds title + **sponsor name** + eligibility through
  `fieldsFromDegreeLanguage`, so *who pays for* an award is treated as evidence
  about *what you must study*. Live examples from the digest's own top picks:
  "Mendoza Law Firm" and "Red Egg Marketing" both classified **business** — the
  first two recommendations in the email — on the strength of the sponsor's
  line of work alone. Neither scholarship states a field. It needs a judgement
  rather than a patch, because the same field sometimes carries real signal:
  "American Society of Mechanical Engineers" as sponsor genuinely does mean
  hardware. Options are to drop sponsor from field derivation, or to exclude
  commercial-entity names (`LLC`, `PLLC`, `Law Firm`, `Agency`, `Marketing`)
  while keeping societies and foundations. It also lands hardest on exactly the
  rows the scoring is meant to down-rank, since law firms and marketing
  agencies are what sponsor content-marketing awards.
  _Partly addressed:_ the unbounded-substring half of this **is fixed** — see
  the boundary fix below. The remaining issue is that `\blaw\b` legitimately
  matches "Law Firm", and the sponsor should probably not have been read at all.
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

---

## 3. Never verified with a real signed-in session

Auth is **magic-link only**, so every signed-in page below has been verified by
unit test, by accessibility snapshot, or through a temporary preview route —
never driven end to end with a real session. This is one login away from being
closed out and is the largest untested surface in the project.

- [ ] `/resume` — the editor renders, decode logic is tested, never driven.
- [ ] `/profile` — including the new presence prompt, the two link fields, and
  the new email-preferences panel (its action is separate from the profile
  form's, and that separation has never been exercised with a real session).
- [ ] `/listing/[id]/apply` — the application packet.
- [ ] **The apply wizard on `/listing/[id]`** ("apply with arc explorer" button).
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

## 6. Deliberately not built — revisit only if asked

Recorded so they are not rediscovered as gaps. Each was a decision with a
reason, not an omission.

- [ ] **DOCX resume import and export.** Both refused for the same reason: a
  document-generation dependency. Print-to-PDF produces real selectable text so
  the ATS case is covered. Worth adding only if students actually ask.
- [ ] **Auto-submit applications.** Decided against 2026-08-14 — see the Phase
  05 roadmap line for the three reasons. The autofill half was built instead.
- [ ] **Browser-extension autofill.** The route back in for the auto-apply
  request: fills the real Greenhouse/Lever/Workday form **in the student's own
  browser**, with them reviewing and clicking submit. Same time saved, human
  still on the attestations. First thing that would live outside this repo.
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

- [ ] **Nothing has been pushed.** `master` is well ahead of `origin/master` —
  everything since `49f1981` is committed but has never left this machine.
  Check with `git status -sb` before assuming a number.
- [ ] **No real students have used any of this.** Phase 02's end-to-end line is
  `[~]` for that reason: automated browser walkthroughs pass, no human has run
  the loop. Phase 07 is where that changes.
