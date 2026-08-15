# Project Memory — Scholarship & Internship Platform

@AGENTS.md

Read @scholarship-platform-roadmap.md before starting any work. It is the full phase-by-phase build plan and checklist for this project.

@FIXES.md is the running list of what is broken, missing, or blocked. The roadmap is *what to build*; FIXES.md is *what is wrong with what exists*.

## Rules

- Work through phases in the order they appear in the roadmap. Do not start a phase until the previous one is functional.
- When a checklist item is finished, edit its line in scholarship-platform-roadmap.md from `- [ ]` to `- [x]` in the same commit that completes it.
- When you find something broken, missing, or blocked that you are deliberately not stopping to fix, add it to FIXES.md in the same commit — then **say so at the end of that session**, naming what you added. Do not silently accumulate entries. Fixing an item means editing its line to `- [x]`, in the commit that fixes it.
- The Smart Resume converter task (Phase 03) is blocked on resume-structuring logic that has not been supplied yet. Do not invent a structure for it — leave it unchecked and flag it if asked to work on Phase 03.
- The LinkedIn checker only scores text a student pastes in. Never add a live fetch against linkedin.com in any form — no scraping, no unofficial API, no logged-in automation.
- The GitHub audit may call GitHub's public REST/GraphQL API directly. No auth is required for public data.
