# Opportunity data connections — 2026-11-04

The owner's order is **connections first, scheduling later**. These changes are
manual connection/import commands. No workflow, n8n trigger, production site,
or scheduled source list was changed. New employer organizations are held at
manual cadence and their listings use `periodic_check`.

## Connections exercised against live sources

| Source | Connection and scope | Distinct listings linked to source |
| --- | --- | ---: |
| Workday | Public employer careers search; broad import and recovery passes | 10,186 linked listings |
| Oracle Recruiting Cloud | 53 discovered boards checked; 52 readable after pagination recovery | 1,491 linked listings |
| Taleo | 4 boards; discovered public job pages, not a full-board crawl | 14 linked listings |
| Rippling | 14 boards checked; 13 readable, with careers-page pagination | 27 linked listings |
| Jobvite | 6 public customer boards | 28 linked listings |
| Community Foundation of Broward | Foundation's own administered scholarship page | 5 programs; 3 accepting applications |
| USAJobs | Existing local credentials verified; 168 student-scope announcements fetched | 86 linked listings after title filtering and refresh |

These are distinct postings linked to each source, **not a sum of new postings
added globally**. Existing canonical deduplication can merge observations from
different boards, aliases or sources. In particular, older per-board
`inserted` counters describe a reconciliation plan and can overcount global
inserts. The final database snapshot is saved to
`.local/source-connections/database-summary-2026-11-04.json`.

The completed snapshot at 2026-11-04 18:59 UTC contains **11,751 distinct
opportunities linked to the six newly connected source families**, including
11,749 open rows and two Broward programs explicitly marked closed by the
foundation. This total excludes the separately refreshed USAJobs source.
CVS's large one-time read completed across 235 pages: 3,942 internship
observations became 2,885 canonical listings. No source was activated on a
schedule. All 430 newly connected employer organizations have manual cadence.

The first Workday import connected Mizuho and Magna. Subsequent passes covered
more than 440 discovered boards, including public `myworkdaysite.com` aliases.
Some readable boards currently have no matching internships. Successful access
does not imply that every employer has an internship or that search recall is
complete.

### Discovery feeds, separate from verified listings

- **Arbeitnow:** 600 public API rows checked across two pages; 121 distinct
  employer hints stored in `discovery_candidates`.
- **Remote OK:** 99 API rows checked; 90 distinct employer hints stored.
- **The Muse:** one allowed test page returned 20 internship listings from ten
  employers. Nothing was imported into the live feed. Registration is needed
  for use beyond testing.

Arbeitnow and Remote OK have `discovery_only` authority and paused source
registry rows. Their hints cannot become verified job listings through these
commands. Source URLs and attribution requirements are retained. The Muse
command refuses `--apply` without `THEMUSE_API_KEY`.

## Repeatable manual commands

All commands are read-only unless `--apply` is supplied. They do not enable
scheduled polling.

```powershell
npm run sources:connect:workday -- --limit 500 --details 0 --max-pages 20 --concurrency 3 --apply --report .local/source-connections/workday.json
npm run sources:connect:workday -- --retry-report .local/source-connections/workday.json --limit 100 --details 0 --max-pages 50 --apply --report .local/source-connections/workday-retry.json
npm run sources:connect:employers -- --source oracle --limit 500 --apply --report .local/source-connections/oracle.json
npm run sources:connect:employers -- --source taleo --apply
npm run sources:connect:employers -- --source rippling --apply
npm run sources:connect:employers -- --source jobvite --apply
npm run sources:connect:scholarships -- --source cfbroward --apply
npm run sources:connect:usajobs -- --apply
npm run sources:connect:discovery -- --source arbeitnow --pages 2 --apply
npm run sources:connect:discovery -- --source remoteok --pages 1 --apply
npm run sources:connect:discovery -- --source themuse --pages 1
```

Reports are generated locally under the git-ignored
`.local/source-connections/` directory. They contain public employer coverage
and aggregate import results, not credentials or applicant data. Do not use
these reports as a license to fetch providers recorded below as restricted.

## Remaining connection holds

| Source or board | Observed hold |
| --- | --- |
| Seven Workday boards | Castleton Commodities and Sallie Mae return HTTP 422; Charter Manufacturing, Zurn Elkay, Wawa, Huntington and Signet return HTTP 500. They were retried and remained held. |
| JPMorgan Chase on Oracle | Its robots endpoint returns HTTP 403. No bypass was attempted; that board was not imported. |
| Rippling's own company board | The old ATS URL redirects to a different careers product, so the structured ATS adapter does not claim success. Other Rippling customer boards work. |
| Arbeitnow UK | The public API responded during a probe, but robots review returns HTTP 403. Automated import remains held. |
| The Muse | Owner must register an app and supply its key before use beyond testing. |
| Adzuna | No app id/key configured locally. |
| CareerOneStop | No API credential configured locally. |
| ScholarshipPortal / Scholarships.com through Parse | Existing adapters remain. Parse MCP authenticates with the local key, but its available tools do not expose a credit balance. No metered scraper calls were made; the standing requirement to check credits first remains open. |
| BambooHR | Developer terms require written consent for crawling. No connector was activated. |
| Scholarship America | Current terms exclude automated collection and commercial reuse without permission. |
| Seattle Foundation / SVCF | Published personal/noncommercial reuse restrictions need permission before importing material. |
| Remotive | Public API redistribution conditions conflict with signup-gated display; no feed import was enabled. |

This inventory covers the sources investigated in this session. It is not a
claim that every public employer website or scholarship database on the
internet has been connected. Existing Greenhouse, Lever, Ashby, SmartRecruiters,
Workable and university scholarship adapters remain in place.

### Publisher references

- [Oracle Candidate Experience search contract](https://docs.oracle.com/en/cloud/saas/human-resources/farws/op-recruitingcejobrequisitions-searchid-get.html)
- [Jobvite guidance for job boards](https://careers.jobvite.com/careersite/source_tracking.html)
- [Arbeitnow public API](https://www.arbeitnow.com/blog/job-board-api), [API terms](https://www.arbeitnow.com/terms)
- [The Muse API documentation](https://www.themuse.com/developers/api/v2), [API terms](https://www.themuse.com/developers/api/v2/terms)
- [Remote OK API and attribution terms](https://remoteok.com/api)
- [BambooHR developer terms](https://www.bamboohr.com/legal/developer-terms-of-service)
- [Scholarship America terms](https://scholarshipamerica.org/terms-and-conditions/)
- [Seattle Foundation terms](https://www.seattlefoundation.org/terms/), [SVCF terms](https://www.svcf.org/terms-of-use)
- [Remotive public API conditions](https://remotive.com/remote-jobs/api)

## Validation and known data limitations

- `npm run check`: TypeScript and lint pass, 1,222 tests pass, four skip. Lint
  retains the two pre-existing unused-variable warnings.
- Additional targeted tests pass after the Taleo title-decoding adjustment.
- Repeat imports of Workday, Oracle/Tradeweb, Taleo/Textron and Broward create
  no duplicate rows in their exercised scopes. Rippling and Jobvite repeat
  checks also created zero new rows and are recorded in the local reports.
- Search completion is explicitly distinct from authority to infer absence.
  These manual imports cannot close an existing job or advance missing strikes.
- Workday returns `total: 0` after its first page and sometimes returns hidden,
  identifier-only placeholders. Oracle can return fewer than the requested
  page size while more rows remain. Both behaviors were observed live and
  covered by regression tests.
- Stable employer source ids take precedence over hashes of optional details,
  preventing later enrichment or missing descriptions from changing identity.
  One duplicate created during the initial probe was removed only after
  confirming no application/user references; its recovery backup is
  `.local/source-connections/duplicate-recovery.json`. The original remains.
- Many new Workday rows are metadata-only. Taleo currently supplies titles and
  source links, not descriptions. Missing pay, deadlines and descriptions stay
  unknown. No new scheduling, ranking, eligibility or notification policy was
  designed as part of this connection work.
- One concurrent Workday import encountered a database deadlock and rolled
  back; the subsequent KLA recovery import succeeded. Bulk-import throughput
  and contention still merit attention before future automation.
