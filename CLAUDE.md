# Project Memory — Scholarship & Internship Platform

@AGENTS.md

@HANDOFF.md is the orientation document — where the project stands, what to build next, the design doctrines, and the landmines. Read it first if you are new to this repo or returning after a break.

Read @scholarship-platform-roadmap.md before starting any work. It is the full phase-by-phase build plan and checklist for this project.

@FIXES.md is the running list of what is broken, missing, or blocked. The roadmap is *what to build*; FIXES.md is *what is wrong with what exists*.

## Rules

- Work through phases in the order they appear in the roadmap. Do not start a phase until the previous one is functional.
- When a checklist item is finished, edit its line in scholarship-platform-roadmap.md from `- [ ]` to `- [x]` in the same commit that completes it.
- When you find something broken, missing, or blocked that you are deliberately not stopping to fix, add it to FIXES.md in the same commit — then **say so at the end of that session**, naming what you added. Do not silently accumulate entries. Fixing an item means editing its line to `- [x]`, in the commit that fixes it.
- The Smart Resume converter task (Phase 03) is blocked on resume-structuring logic that has not been supplied yet. Do not invent a structure for it — leave it unchecked and flag it if asked to work on Phase 03.
- The LinkedIn checker only scores text a student pastes in. Never add a live fetch against linkedin.com in any form — no scraping, no unofficial API, no logged-in automation.
- The GitHub audit may call GitHub's public REST/GraphQL API directly. No auth is required for public data.
- Never embed an ATS's apply form in-frame until a real-browser test confirms its captcha mints a token there. Currently: Greenhouse minted one in-frame (2382 chars, identical to top-level) but has not been driven end to end with the extension loaded; **Lever was never observed minting one — unproven, not failed.** Its headers permit framing and it matched top-level on every initialisation measure; invisible hCaptcha only executes on a real submit gesture, so it timed out top-level too and the measurement was simply never made. Do not route Lever through the embedded path until someone watches a real submission land — and do not read this line as "Lever is broken", because that would retire 165 open rows that are one observation away.
- The extension bridge's origin check (sender is window.parent, that parent is window.top, origin matches a configured Instela origin) is a hard invariant — never relax it, never reply to a "*" target, keep exactly one fill routine.
- Extension-installed detection must poll (~4s), never rely on a single event or ping. A false "not installed" reading is worse than a slightly slower confirmed one.
- Submission-detection is per ATS platform, not a shared function — Greenhouse's confirmation pattern is not Lever's. Build and test each one individually.
