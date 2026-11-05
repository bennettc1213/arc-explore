# Workday ingestion

Added 2026-11-04 in the local Scout branch. The adapter has not been published
to the scheduled runner on master. The existing live cron is unchanged.

The owner subsequently clarified that all accessible data connections come
first, and scheduling will be designed separately. The initial two-board
verification below was expanded into a broad manual import. Current results
and limitations are recorded in `docs/source-connections-2026-11-04.md` and
the per-board JSON reports in `.local/source-connections/`.

## Connection and live verification

`src/lib/ingest/sources/workday.ts` reads employers' public CXS careers search.
Discovery recognizes `tenant.wdN.myworkdayjobs.com/{locale?}/{site}/job/...`,
preserving shard and case-sensitive site. No migration or new key is needed.
Discovery found 444 active boards on 2026-11-04.

The initial import stored 43 open listings: Mizuho Securities USA (15), Magna
(28 after canonical deduplication of 29 observations). All have descriptions.
A second import inserted zero rows, refreshed all 43, and produced no closures
or missing strikes. These are stored in the configured shared database.

Rows carry `periodic_check`. Their organizations have an explicit manual
interval of 315360000 seconds and a non-null last-polled timestamp, keeping
them out of the old cron until it supports Workday. The source-health catalogue
matches `workday-manual` run records and labels the manual cadence.

```powershell
# Read-only discovery and employer requests
npx tsx scripts/connect-workday.ts --limit 3

# Import/refresh the initial two boards; retain manual cadence
npx tsx scripts/connect-workday.ts --limit 2 --apply

# Choose other employers by name; dry-run unless --apply is provided
npx tsx scripts/connect-workday.ts --match Magna --limit 1
```

## Observed behavior and bounds

- The public careers UI uses `POST /wday/cxs/{tenant}/{site}/jobs` with
  `searchText: "intern"`. Requests page at 20 rows, capped at ten pages.
- Search is fuzzy/relevance ordered and includes "International" roles. The
  shared internship classifier filters results; a page without internships
  ends the sweep. This deliberately trades recall for bounded host load.
- Only offset zero reliably supplies the total. Later pages report `total: 0`
  while still containing 20 jobs. Preserve the first-page total.
- Completion describes the bounded search policy, not a board mirror. Every
  result sets `absenceAuthoritative: false`. Observed jobs can be verified, but
  omitted jobs cannot accrue missing strikes or close. Search results also
  cannot advance `sources.last_complete_poll_at`. Suppression logs say
  `search_scope` rather than pretending a successful search failed.
- Requisition identity includes tenant and site. Dates use ISO fields only;
  relative "Posted 30+ Days Ago" text never becomes an invented exact date.
- At most 40 job details per board are requested, at concurrency two. Remaining
  descriptions stay null and need a later enrichment path.
- HP's `EXTEU-AC-CareerSite` reached the ten-page ceiling (40 internship
  observations among 200 results). The manual importer held it out and did not
  enroll an HP organization from that capped response.
- Robots are checked per board and for detail paths. Disallowed boards and
  access failures are skipped without login or anti-bot workarounds. This
  check does not claim that every employer's reuse terms were reviewed.

## Manual connection work

Manual batch imports accept `--details`, `--max-pages`, `--concurrency`, and
`--report`. `--retry-report` retries failed companies from a previous report
and checks boards newly discovered since that report. Page bounds default to
10 and may be explicitly raised up to 250 for a large one-time connection;
network concurrency is at most four boards. Bulk metadata imports can set
`--details 0`, retaining unknown descriptions for later enrichment. Hidden
identifier-only job placeholders are rejected, not invented as listings.

Discovery also recognizes Workday's `wdN.myworkdaysite.com/recruiting/...`
aliases and lowercase locale prefixes. Stable source-id lookup keeps optional
enrichment from creating a second identity for an already stored listing.
No source is automatically enabled for scheduled polling by these commands.

The old runner must not encounter due Workday organizations before it has the
adapter. No production app deployment or database migration was done here.

The existing link checker flags hard-dead URLs, but HTTP 200 careers shells
cannot prove an individual job is still open. Workday-specific closed-job
detail checks and description enrichment beyond 40 rows remain future work.
