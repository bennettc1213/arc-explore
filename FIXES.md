# Fixes & Open Items

Everything known to be broken, missing, or waiting on a decision. Kept separate
from `scholarship-platform-roadmap.md`: the roadmap is *what to build*, this is
*what is wrong with what exists* plus what is blocked on someone.

**Update rule:** anything discovered mid-build that we deliberately did not stop
for goes here in the same commit. Say so at the end of the session that adds it.

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
- [ ] **`RESEND_API_KEY` + `REMINDER_FROM_EMAIL`.** Deadline reminders are
  built and dry-run verified but deliberately inert. Needs the repo secret and
  a **verified sender domain**. Run `npm run reminders` first — with no
  `--send` it prints exactly what would go out. Worth knowing: 288 open
  postings carry a future deadline, but ATS internships almost never publish
  one, so reminders stay quiet until students save scholarships.
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
- [ ] **Gamification: points for *applying* is the wrong incentive — needs your
  call.** The Phase 06 line says "points for profile completion, applying, and
  referrals". Profile completion is fine and worth building: it is a real
  readiness signal and the score is already computable. **Points for applying
  rewards volume**, which this project has already decided against on the
  record — the auto-submit refusal (Phase 05) cites poor mass-apply response
  rates and employers filtering for exactly that behaviour. Paying students in
  points to do more of it contradicts that in the same product. Referrals need
  a referral system that does not exist. Recommendation: build the completion
  meter, drop the applying points, defer referrals.
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

- [ ] **The UNL crawl intermittently drops a row.** 263/263/264 across three
  consecutive scrapes. A dropped row **closes a live scholarship** until the
  next run picks it up again. The real fix is requiring absence from **two
  consecutive scrapes** before setting `closed_at` — not another sort key.
  Applies to every scholarship source, not just UNL. **There is now a working
  precedent to copy:** `lib/ingest/linkcheck.ts` implements exactly this
  two-observation rule (`urlDeadStrikes`, cleared by any contrary evidence,
  timestamp stamped once). The scholarship persist path should do the same
  with a `missing_strikes` column instead of closing on one absence.
- [ ] **`postings.category` is NULL on all 3,765 rows**, and
  `organizations.vertical` is equally empty. Both are dead columns. The
  category filter was deliberately built on the derived field taxonomy instead.
  Either backfill them or drop them — right now they are a trap for the next
  person who assumes a column with a name means something.
- [ ] **Two copies of the slot-marker regex.** `lib/github/readme.ts` and
  `lib/linkedin/build.ts` each define their own `SLOT_RE` for
  `[YOUR SPECIFIC DETAIL: …]`, and `lib/cover-letter/types.ts` has a third,
  looser one. The looser one cannot be shared (it matches markdown link labels)
  but the two strict copies should be one exported function.

---

## 3. Never verified with a real signed-in session

Auth is **magic-link only**, so every signed-in page below has been verified by
unit test, by accessibility snapshot, or through a temporary preview route —
never driven end to end with a real session. This is one login away from being
closed out and is the largest untested surface in the project.

- [ ] `/resume` — the editor renders, decode logic is tested, never driven.
- [ ] `/profile` — including the new presence prompt and the two link fields.
- [ ] `/listing/[id]/apply` — the application packet.
- [ ] `/github` signed in — the README generator filling from profile + resume,
  and the stored-handle fallback.
- [ ] `/linkedin` signed in — the builder filling from profile + resume.
- [ ] Saving a profile and confirming `github_username` / `linkedin_url`
  round-trip through the form.
- [ ] **`/admin` with a real admin session.** The page was rendered against
  real data by temporarily stubbing `requireAdmin`, and the guard was verified
  to 404 both with and without `ADMIN_EMAILS` set — but the two have never been
  exercised together. The hide / unhide / resolve actions have never been
  clicked.
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

- [ ] **Surface what is already built** from the feed, the tracker and the
  profile: cover letter builder, application packet, resume critique engine,
  keyword-gap view, deadline reminders.
- [ ] **The nav is over-full — fix this before the next page lands.** Seven
  links for an admin (github, linkedin, essay, tracker, resume, profile,
  admin), six for everyone else. `/essay` was added anyway this session rather
  than shipping a page nobody could find, which makes this the blocking item it
  was warned about. The three paste-in tools (github, linkedin, essay) share a
  shape and should collapse into one "tools" menu.

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
- [ ] **Peer reviews, gamification, saved-search alerts, comparison view,
  weekly digest** — all Phase 06, none started.

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
