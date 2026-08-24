# Instela — browser extension

Fills an internship or scholarship application with the facts the student
already gave Instela, **in their own browser, on the employer's real
form**, with them reviewing every field and pressing submit themselves.

---

## Why this exists rather than a server-side one-click submit

The obvious build is a button on our site that posts the application to the
employer. It is not possible, and the reason is worth writing down so nobody
spends a week rediscovering it.

Every destination in the corpus requires the **employer's own credentials** to
submit programmatically. Measured against the live corpus on 2026-08-19:

| Destination | Open rows | What submitting needs |
|---|---:|---|
| SmartRecruiters | 1,056 | OAuth with `candidate_applications_manage` — the employer's consent |
| Greenhouse | 537 | Basic Auth with that employer's Job Board API key |
| Lever · Ashby | 292 | Per-employer credentials, same shape |
| USAJobs | 21 | The applicant's own login.gov account |
| Scholarship pages | 1,882 | ~311 bespoke sites; 1,559 are listing pages carrying no form at all |

Reading these boards is public — `GET` on a SmartRecruiters posting answers 200
with no auth, which is how the ingest works. *Submitting* is authenticated
everywhere. There are also **zero `mailto:` apply links** in the corpus, so
there is no email-submission route either.

So "send the application for them" is not one feature; it is ~500 separate
employer permissions. The alternative — driving those forms from our own server
with a headless browser — breaks each platform's terms, is defeated by the bot
detection most of them run, and has a failure mode that lands on the student: a
button that says *applied* when the POST silently failed means they believe they
applied to something they did not, stop tracking it, and miss the deadline.

An extension has none of those problems. It is the student's browser, their
session, their click. It works on all 1,885 ATS internships today with nobody's
permission but theirs.

---

## Install (development)

```bash
npm run build:extension      # compiles the autofill rules into extension/vendor/
```

Then in Chrome:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` directory
3. Note the extension ID Chrome assigns it
4. Add that ID to `.env` so the API will answer it:

```
EXTENSION_ORIGINS=chrome-extension://<the id chrome showed you>
```

5. Restart `npm run dev`, and sign in to Instela in the same browser.

`npm run build:extension` is required and is not optional — `extension/vendor/`
is gitignored. The field-matching rules are compiled from
`src/lib/apply/autofill.ts`, which is unit-tested, rather than reimplemented in
JavaScript here. There is one definition of what is safe to fill.

### Pointing it at a deployed Instela

The popup has a **settings** link with one field: the Instela address. It defaults
to `http://localhost:3000`. Set it to the deployed origin and add that origin to
`host_permissions` in `manifest.json`.

---

## How it works

```
popup.js ── ARC_GET_PACKET ──▶ background.js ──▶ GET /api/extension/packet?url=…
                                                        │
   ◀───────────── posting + values ─────────────────────┘

popup.js ── ARC_FILL {values} ──▶ content.js ──▶ the employer's form
```

**The student's data never enters the employer's page context.** All fetching
happens in the background service worker, in the extension's own origin. The
content script receives only the specific values being typed, and only when the
student presses the button.

Authentication is the student's ordinary Instela session cookie — they are signed in
to the site in the same browser. The extension stores no token and no personal
data; `chrome.storage` holds exactly one thing, the Instela address.

---

## The rules this extension is built around

- **It never clicks submit.** There is no `.click()` or `.submit()` call in
  `content.js` and there must never be one. The student reads the form and
  presses the employer's own button. Everything else here is downstream of that.
- **It never fills a legal attestation.** Work authorization, sponsorship,
  citizenship, veteran and disability status, race and gender are refused by a
  blocklist that is checked before every other rule and beats even an explicit
  `autocomplete` attribute. They are highlighted in amber as *yours to answer*
  instead. The API reinforces this by never sending their values at all, so two
  independent things would have to fail rather than one.
- **It never overwrites a value the student typed.** A value we did not put
  there is one they chose.
- **It never touches linkedin.com.** Not in `host_permissions`, not in the
  content-script matches, and a test asserts the host list stays clean.
  `CLAUDE.md` says never a live fetch against LinkedIn in any form; a content
  script reading their DOM is that rule broken by a different mechanism.
- **It cannot attach a resume file.** Instela stores the *parsed structure* of a
  resume, not the original document — exactly as `/privacy` says. So the file
  input is skipped and the student attaches their own PDF. The cover letter,
  which we do hold as text, is filled where the form takes one.

## What it reports

The panel names what happened to every field, not just the flattering number:

```
filled 9 fields · 2 we hold nothing for · 1 you had already answered ·
3 only you can answer · 4 we did not recognise
```

A student told "filled 9" who then finds fourteen boxes has been given a number
that costs them trust in the whole tool.

## Supported boards

Greenhouse (`boards` / `job-boards`, US and EU), Lever, Ashby, SmartRecruiters.
Together these are every ATS family in the corpus except USAJobs, which requires
a login.gov session that is the student's alone.

Field matching is signature-based rather than per-ATS selector tables — it reads
each field's label, name, id, placeholder and `autocomplete` and decides what it
is asking for. Five selector tables would be five things to keep correct; a
signature reader is one, and it degrades to *leave it alone* rather than to
*fill it wrong*.
