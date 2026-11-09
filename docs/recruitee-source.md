# Recruitee connection — November 5, 2026

Recruitee is connected to the configured shared database through its documented
Careers Site API. This is a manual connection/import; scheduling remains deferred.
No production app deployment or database migration was needed. The ATS schema
change adds a TypeScript value to an existing text column.

## Verified database results

The live snapshot at 2026-11-06 00:10 UTC (November 5 in Denver) contains:

- 15 employer boards connected; ten currently yield matching opportunities.
- 48 distinct source-linked listings, all open, all with descriptions and
  `periodic_check` freshness. These include US and international locations.
- All 48 observations map to explicit per-employer source registry rows.
- 12 listings have a complete, source-stated USD hourly/yearly pay range.
- All 15 organizations retain manual cadence (315360000 seconds).

| Employer board | Distinct linked listings |
| --- | ---: |
| TransPerfect | 12 |
| Black Diamond Networks | 11 |
| Lomography | 11 |
| Eight Advisory | 7 |
| Cain Watters & Associates | 2 |
| DeepHealth | 1 |
| Greener Power Solutions | 1 |
| SkyGeo | 1 |
| Affidea Greece | 1 |
| MultiMinds | 1 |

Wilcox + Flegel, Sustainable Comfort, McDugald Steele, Student Medicover and
Framestore returned readable boards but no listings matching the shared
title/structured employment classifier. Description mentions of internships do
not qualify an otherwise unrelated role. KCH Transportation's indexed board
returned HTTP 404 from the API; it was not imported or retained in default seeds.

## Repeatable commands

```powershell
# Read-only live validation of the seeded employer boards
npm run sources:connect:recruitee -- --report .local/source-connections/recruitee-dry.json

# Import/refresh without enabling scheduled polling
npm run sources:connect:recruitee -- --apply --report .local/source-connections/recruitee-import.json

# Validate or import one explicitly selected employer
npm run sources:connect:recruitee -- --board cainwattersassociates
npm run sources:connect:recruitee -- --match TransPerfect --apply
```

Seeds are public employer board coordinates in
`src/lib/ingest/sources/recruitee-boards.ts`, discovered from employers' careers
pages. This is a bounded initial connection, not a claim of all Recruitee
employers. Automatic daily discovery and the scheduled runner were not changed.

## Access and data limits

- [Recruitee's collection endpoint](https://docs.recruitee.com/reference/offers)
  returns the published jobs collection. Each board's robots file and matching
  job paths are checked. Malformed responses, duplicate IDs, access denials
  and HTTP failures hold that employer's import.
- [The authentication documentation](https://docs.recruitee.com/reference/authentication-1)
  requires employer-specific Careers API tokens from **February 10, 2027**.
  These manual connections currently work without tokens. The connector fails
  on authentication errors; ongoing access after the transition requires an
  authorized employer-specific integration. It does not obtain or guess keys.
- Employer-specific reuse terms are recorded as `not_reviewed`, not blanket
  approval. Sources use `hash_only` payload retention. Application form
  questions, mailbox addresses and candidate endpoints are not ingested.
- Every import sets `absenceAuthoritative: false`: an omitted job cannot gain
  missing strikes or close. A complete API read does not enable that authority.
- Stable identity is board slug plus numeric offer ID. Public board-hosted job
  URLs avoid custom `careers_url` values observed pointing to an employer's
  general website rather than the job.
- Explicit UTC timestamps are normalized. Missing dates remain unknown.
  Foreign currencies, monthly amounts and incomplete pay ranges remain null
  in the shared USD compensation columns. Multiple offered work models do
  not become an invented single arrangement.

## Validation

`npm run check` passed: TypeScript, lint (two existing unused-variable warnings),
1,281 tests passing and four skipped. New tests cover response validity, identity,
classification, compensation, UTC dates, mixed work models, robots and 401 holds.

The initial import encountered the existing database constraint requiring both
compensation bounds. The affected employer transactions rolled back. The adapter
now leaves one-sided ranges null; the recovery import completed all 15 boards
with no errors. Across the initial and recovery imports, 48 source-linked
listings were added. Reports and the database snapshot are under the git-ignored
`.local/source-connections/recruitee-*.json` paths.

A full repeat import completed all 15 boards with zero errors, refreshed the
same 48 listings, added zero source-linked listings and closed zero postings.
