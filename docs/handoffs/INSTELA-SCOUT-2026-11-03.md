# INSTELA-SCOUT-2026-11-03

## Transfer Instructions

This is a Git handoff ID, not a ChatGPT conversation or prompt retrieval ID.

Repository: https://github.com/bennettc1213/arc-explore

Branch: `codex/scout-handoff-2026-11-03`

The branch starts from remote master at `e31680f` and contains the Scout changes plus the dependencies needed for the cursor treatment. It excludes unrelated local auth/session changes, private environment files, editor configuration, screenshots, and browser test artifacts.

## Prompt For The Coding Agent On The Other Computer

```text
Apply Instela handoff INSTELA-SCOUT-2026-11-03 to this project's local folder.

1. Read AGENTS.md and inspect the current branch, git status, and remotes.
   Preserve all local edits and environment files. Do not reset, clean, or
   overwrite uncommitted work.
2. Fetch origin. The requested changes are on:
   origin/codex/scout-handoff-2026-11-03
   in https://github.com/bennettc1213/arc-explore.
3. Read docs/handoffs/INSTELA-SCOUT-2026-11-03.md from that branch. Use the
   existing checkout when it is already on the handoff branch. Otherwise,
   switch to a tracking branch when the tree is clean, or integrate the
   handoff into an isolated worktree if local changes prevent a clean switch.
   If this project must remain on master, merge the handoff branch without
   discarding newer master changes. Resolve ordinary conflicts carefully.
4. Run npm ci using the project's required Node version (Node 24 or newer),
   then npm run check and npm run build. Read the local Next.js guides before
   making any fixes. Fix regressions caused by the handoff and report any
   unrelated failures precisely.
5. Reuse this computer's existing local environment configuration. Do not
   copy credentials from Git or expose secret values. This handoff adds no
   database migrations and needs no database writes to initialize Scout.
6. Verify /portal, /scout, and /memory locally on desktop and mobile.
   Check cursor visibility, the orange Scout center, twenty source paths,
   gray-to-flashing-green-to-solid-green states, four centered result tabs,
   real freshness labels, result links, and saved answer editing.
7. Start the local server on an available port and provide its URL. Report
   the checked-out commit, checks performed, and any deployment blockers.
   Prepare the updated project for my production deployment; this transfer
   prompt alone does not authorize a production deployment or database migration.

Do not recreate Scout from a description. Use the implementation already
committed on the handoff branch.
```

## What Is Included

- A primary Start a Scout action in the portal.
- `/scout`: guided preferences, saved browser preferences, real feed search,
  twenty-source animated preview, an orange center, and centered result filters.
- For you, Just found, Scholarship finds, and Internship openings filters.
- Source observation summaries, distinct recent/older/unverified indicators,
  and first-discovery labels based on stored timestamps.
- A Show results action once the actual query finishes.
- Browser bookmarks and links into existing application packets.
- `/memory`: create, edit, copy, delete, and locally retain reusable answers.
- The magnetic hover treatment with the native pointer kept visible.
- Focused result retention, eligibility, and freshness tests.

## Scope And Known Limits

Scout queries the existing opportunity index. The named network is a visual
preview of discovery destinations; it does not perform live requests against
each illustrated provider. Source dates come from real stored observations.

Application Memory, Scout preferences, and bookmarks are browser-local.
They do not transfer between computers through Git and are not account-synced.

Result actions reuse existing prep packet and autofill routes. Feeding memory
answers into autofill, new source discovery, and scheduled Scouts remain future
work. Existing free/Pro entitlements continue to apply.

No production deployment or database migration was performed for this handoff.

## Verification On The Authoring Computer

The app passed type checking, lint (with two existing unrelated warnings),
and the full test suite: 1,110 passed and two skipped. The seven Scout tests
are included. Desktop and mobile
browser checks covered native pointer visibility, connection animation,
four result tabs, real results, no horizontal overflow, and no page errors.

The exact committed snapshot was also checked in an isolated checkout with
`next build --webpack`: compilation and TypeScript passed. Page-data collection
then failed in the pre-existing `/api/stripe/checkout` route because this
computer does not have `STRIPE_SECRET_KEY` configured. Verify the receiving
computer's existing billing environment before production deployment. Do not
invent a key, disable billing checks, or commit secrets to bypass this failure.

Run checks again on the receiving computer, including the production build.
