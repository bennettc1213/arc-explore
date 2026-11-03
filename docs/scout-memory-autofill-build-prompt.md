# Build Prompt: Scout + Application Memory + Safe Autofill

You are working in the Instela Next.js app at `C:\Users\benne\OneDrive\Desktop\internshipscholarship`.

Read `AGENTS.md`, `HANDOFF.md`, `FIXES.md`, `docs/scoring-system-v2-plan.md`, and the relevant Next.js 16 docs in `node_modules/next/dist/docs/` before changing code. This app uses a newer Next version with changed conventions, and `AGENTS.md` explicitly requires checking those local docs before writing code.

## Product Direction

Instela should stop presenting Pro as "more rows from the same ranked database."

The new paid core is:

> **Scout + Application Memory + Safe Autofill**

Free users can still search verified internships and scholarships, open listings, see their top ranked opportunities, save a few items, and see basic fit/trust warnings. Pro should feel like Instela is actively working on a student's behalf:

1. **Scout** finds specific, niche opportunities for a student's exact interests.
2. **Application Memory** turns past answers, essays, bios, and profile facts into reusable blocks.
3. **Safe Autofill / Prep Packet** helps fill official applications while leaving legal attestations and unsupported answers for the student.

This first build should establish the Scout experience and leave clean extension points for Application Memory and Autofill. Do not try to solve all crawler infrastructure in one pass.

## North Star UX

From the signed-in portal, the student should see a strong primary action:

> **Start a Scout**

When clicked, it opens a guided Scout setup flow that asks what they want Instela to find:

- Opportunity type: internships, scholarships, or both
- Target fields or majors
- Location / remote preference
- School or college context for scholarships
- Graduation year / class year
- Work authorization when internships are included
- GPA / enrollment / residency when scholarships are included
- What feels most valuable right now:
  - newly opened roles
  - niche scholarships
  - local awards
  - direct official applications
  - fast applications
  - high-value stretches
  - opportunities that reuse an existing essay

After saving preferences, the student presses one "Go" / "Run Scout" button. Instela shows a 10-12 second visual search sequence:

- A central node labeled **Your Scout**
- A map/grid/radar surface around it
- Source categories pop in one by one:
  - employer ATS boards
  - state DOTs
  - city public works pages
  - university scholarship pages
  - ASCE / SAME chapters
  - community foundations
  - government internships
  - sponsor pages
- Each source draws a green connection line/tube into **Your Scout**
- The connection turns green once the source is "connected"
- More sources continue appearing for the duration so the student feels the system is searching beyond obvious mega-databases

Then the animation resolves into results grouped by confidence and intent, not by one giant score-only list:

- **Just found**
- **Niche scholarships**
- **Official direct-apply pages**
- **Local + under-the-radar**
- **Closing soon**
- **Strong internship matches**
- **High-value stretches**

Put the Cards/swipe deck aside for this flow. The Scout results should be browsable rows or compact listing panels.

## Critical Honesty Rule

The Scout animation is allowed to be a delightful visualization, but it must not lie.

Do:

- Show generic source-category names during the animation.
- Use copy like "Checking source types," "Matching against verified listings," and "Building your Scout results."
- Render green connections as visual progress through local matching steps.
- Use real freshness text from existing listing data after results load: `confirmed live 2h ago`, `checked Nov 2`, `found today`, etc.

Do not:

- Claim Instela connected to ASCE, a DOT, Greenhouse, or any named source in that exact moment unless a real request happened.
- Display "posted 1 minute ago" unless the row has a truthful `postedAt` or `firstSeenAt` timestamp that supports it.
- Say "low competition" unless the system has a real applicant-count signal.
- Say "better odds," "higher chance to win," "guaranteed match," or anything equivalent.
- Animate fake named databases as if the app just queried them live.

If a label is inferred from Instela's own data, name it honestly:

- "New to Instela today"
- "Confirmed on the employer's board"
- "Checked at the scholarship source"
- "Less seen on Instela this week" only after internal top-10 exposure tracking exists

## Suggested Scope For This Build

### 1. Portal Entry Point

Update the portal so "Start a Scout" is the main action, not a secondary tile.

Add a route:

- `/scout`

This route owns:

- Scout setup
- Scout launch animation
- Scout results

Keep the existing Explore page intact. Do not delete list or deck behavior in this pass.

### 2. Scout Preference Model

Add a small server-validated preference shape. The first pass can store preferences in the URL for guests and in a table for signed-in users if the migration cost is acceptable.

Preferred signed-in table:

```ts
scouts
  id uuid pk
  user_id uuid not null references profiles(id)
  name text not null
  filters jsonb not null
  priorities text[] not null default '{}'
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
  last_run_at timestamptz
```

If a DB migration is too much for the first build, create the pure model and keep persistence as a documented follow-up. The UI can run one ephemeral Scout from submitted form values.

Use existing filter types where possible:

- `FeedFilters`
- `ScoreProfile`
- `filtersFromParams`
- `filtersToQuery`
- profile conversion helpers in `src/lib/profile/*`

Do not add another ad hoc filter grammar if `FeedFilters` can be extended.

### 3. Scout Setup UI

Build a guided setup component with 4-5 concise steps:

1. **What should Scout find?**
   - Internships
   - Scholarships
   - Both

2. **What field are you aiming at?**
   - Use existing profile interest options.
   - Include custom text for niche searches like "civil engineering internships" or "water resources scholarships."

3. **Where should Scout look?**
   - Remote
   - Near me / a location text input
   - School-specific scholarships

4. **What matters most?**
   - Newly opened
   - Local + niche
   - Direct official applications
   - Fast to finish
   - High dollar
   - Reusable essays

5. **Personal details that improve matching**
   - Show only fields relevant to the chosen opportunity type.
   - Internships: graduation year, work authorization, target locations.
   - Scholarships: school, GPA, GPA scale, enrollment level/status, residency.

Design notes:

- Make it feel like a tool, not a marketing quiz.
- Avoid a giant hero.
- Use segmented controls, toggles, and icon buttons.
- Show a small editable summary before running.
- Preserve values in the URL when possible so a guest can refresh without losing everything.

### 4. Scout Launch Animation

Build a client component:

- `src/components/scout/ScoutRunAnimation.tsx`

Behavior:

- Duration: 10-12 seconds.
- Emits `onComplete` once.
- Reduced motion: skip to results after 600-900ms and show a simple progress list instead of moving tubes.
- Visual: central "Your Scout" node, surrounding source nodes, green connection paths.
- Source nodes should be categories, not fake named providers:
  - Employer ATS boards
  - University award pages
  - Community foundations
  - Government roles
  - Engineering societies
  - Direct sponsor pages
  - Public agency boards
  - Scholarship portals

Implementation suggestion:

- Use HTML/CSS/React state; canvas is acceptable if it is easier to animate connection lines.
- Avoid Three.js for this 2D UI.
- Keep the animation deterministic so visual tests are stable.

Copy examples:

- "Checking official sources"
- "Matching hard requirements"
- "Separating lottery-style awards"
- "Finding direct application pages"
- "Grouping your Scout results"

Do not show "Connected to Colorado DOT" or similar unless that source was really queried.

### 5. Scout Result Categories

Add a pure module:

- `src/lib/scout/results.ts`

Inputs:

- `FeedItem[]`
- Scout preferences
- profile readiness
- current date

Output:

```ts
type ScoutSectionId =
  | "just_found"
  | "niche_scholarships"
  | "official_direct"
  | "local_under_radar"
  | "closing_soon"
  | "internship_matches"
  | "high_value";

interface ScoutSection {
  id: ScoutSectionId;
  title: string;
  subtitle: string;
  items: FeedItem[];
  evidence: string;
}
```

Selection rules should be honest and based on available data:

- `just_found`: `firstSeenAt` within the last 24 hours.
- `closing_soon`: deadline in the next 14 days and not already closed.
- `official_direct`: exclude known aggregator listing hosts, especially `scholarships.com`, because those rows can point to an index page rather than an application.
- `niche_scholarships`: scholarship rows whose field/title/eligibility matches the Scout query strongly. If the current taxonomy cannot prove this, hide the section.
- `high_value`: confirmed per-recipient amount above a threshold. Reuse `confirmedAmount` from `src/lib/scholarships/plan.ts`; do not rank program totals as individual awards.
- `local_under_radar`: only render after there is a stored local/state/source-scope signal. Hide with an internal reason until then.
- `internship_matches`: internship rows with non-blocked fit.

Reuse:

- `getFeed`
- `presentFit`
- `formatAward`
- `toDiscoveryCard` if its shape is useful, but do not render the swipe deck.

### 6. Scout Results UI

Build:

- `src/components/scout/ScoutResults.tsx`
- `src/components/scout/ScoutResultRow.tsx`

Each row/panel should show:

- Title
- Organization/sponsor
- Kind
- Real freshness label
- Deadline label
- Award or compensation when known
- Eligibility/fit badge
- Trust warning if present
- "Official source" / source host
- Primary action:
  - Scholarship: `Prepare application`
  - Internship: `Open prep packet`

Make the sections feel curated:

- If a section is empty, hide it.
- If all high-intent sections are empty, fall back to a general "Best matches" section from the ranked feed.
- Do not show a "Niche scholarships" section just because the student asked for niche scholarships; it needs actual qualifying rows.

### 7. Application Memory Foundation

Do not build the whole answer bank yet, but reserve the right model and UI hooks.

Add a route stub or component behind a clear "coming soon" / disabled state:

- `/memory` or a portal panel labeled **Application Memory**

The model should eventually store:

```ts
memory_blocks
  id
  user_id
  kind: "bio" | "career_goal" | "leadership" | "adversity" | "financial_need" | "project" | "community" | "other"
  title
  text
  source: "typed" | "essay" | "resume" | "cover_letter"
  tags text[]
  created_at
  updated_at

application_answers
  id
  user_id
  posting_id nullable
  prompt_text
  answer_text
  word_limit nullable
  source_memory_block_id nullable
  created_at
  updated_at
```

Do not run an LLM in this pass. Do not generate personal essays from scratch. The first useful version can let students save and tag their own answer blocks.

### 8. Safe Autofill / Prep Packet Foundation

Instela already has apply/autofill code and extension routes. This build should add Scout result actions that point toward a prep packet, not duplicate autofill logic.

Rules:

- Instela never submits an application for the student.
- Legal attestations, demographic declarations, disability/veteran/race/gender questions, and unsupported form fields must be left for the student.
- The UI should say what was filled, what was reused, what was drafted, and what was left alone.

For now:

- "Prepare application" may deep-link to the existing listing detail or apply page.
- If a packet route exists for the listing, use it.
- Otherwise link to `/listing/[id]` with a clear next action.

## Copy Direction

Use these words:

- "Scout"
- "official source"
- "checked"
- "confirmed live"
- "new to Instela"
- "direct application"
- "likely eligible"
- "check eligibility"
- "reusable answer"
- "left for you to review"

Avoid these words/claims:

- "guaranteed"
- "low competition" unless real applicant counts exist
- "better odds"
- "win probability"
- "we connected to X" during the animation unless X was actually queried
- "posted 1 minute ago" unless the timestamp proves it

## Routing Recommendation

Keep:

- `/explore` for search/list/deck/legacy browsing
- `/portal` as the signed-in command center
- `/listing/[id]` and existing apply surfaces

Add:

- `/scout`

Optional later:

- `/scout/[id]` for saved Scouts
- `/memory`

## Visual Direction

This should feel energetic and precise, not like a marketing landing page.

- Use a full-width tool surface, not nested cards.
- Use Instela's orange as an accent; avoid a one-note orange/brown palette.
- Green should mean verified/connected/progress.
- Warnings use the existing caution/error colors.
- The Scout animation can be dark, gridded, and kinetic, but keep text readable.
- Avoid huge decorative blobs or static SVG hero art.
- Use `lucide-react` or the existing `Icon` abstraction for controls.

Mobile:

- The setup wizard must be easy at 390px wide.
- The animation must fit without horizontal scroll.
- Results should stack cleanly.
- No bottom-sheet swipe deck for this flow.

## Implementation Order

1. Read the existing portal, feed, pricing, application, and scholarship plan code.
2. Add pure Scout preference/result modules with unit tests.
3. Add `/scout` with a working setup form.
4. Add `ScoutRunAnimation` with reduced-motion support.
5. Add categorized Scout results from `getFeed`.
6. Add a primary "Start a Scout" button to `/portal`.
7. Wire result actions to existing listing/apply routes.
8. Add empty-state and honesty copy for categories that cannot be proven yet.
9. Add focused tests for categorization:
   - just-found uses `firstSeenAt`, not fake posted dates
   - high-value ignores estimated program totals
   - official-direct excludes scholarship aggregators
   - closed and lottery rows are not promoted into primary sections
   - local/under-radar hides until source scope exists
10. Run `npm run typecheck`, `npm run lint`, and `npm test`.

## Non-Goals

Do not build these in the first Scout pass:

- A general web crawler that accepts arbitrary student URLs
- LLM-generated essays
- Mass auto-submit
- Official applicant-count or win-probability claims
- Employer/sponsor inbound matching
- A replacement for the existing Explore list
- A "low competition" filter
- A fake real-time crawler visualization with named sources

## Acceptance Criteria

- A signed-in student can start a Scout from `/portal`.
- The Scout setup flow produces a valid feed query and profile context.
- The launch animation runs once, lasts roughly 10-12 seconds by default, and respects reduced motion.
- Results render in honest sections using existing verified listing data.
- No section claims unsupported certainty.
- "Just found" and freshness labels are backed by real timestamps.
- The old `/explore` flow still works.
- Free/pro gating continues to come from `src/lib/pricing/tiers.ts`.
- The build has unit coverage for Scout category selection.
- The full local check passes or every failure is explained precisely.
