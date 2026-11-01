# Merit aid pilot research — Stage 1

Research checked 2026-10-30. These are public-source drafts, **not owner verification**.
Every seed is `draft` with `verified_at: null`. Nothing is published, committed,
or imported into the live database by this stage. The catalog deliberately
contains no student data, credentials, raw HTML, logos, or screenshots.

## Drafts (7 schools, 57 tier alternatives)

| School | Rows | Exact scope / unresolved matters |
| --- | ---: | --- |
| Southern Utah | 3 | Unambiguous resident first-year Centurium, Deans', Fellow's. Founders omitted because admissions and renewal pages disagree; President's is competitive. Nonresident/transfer tables not yet drafted. |
| Alabama | 6 | Standard fixed-dollar nonresident first-year automatic matrix. Presidential Elite tuition/benefits package omitted. GPA basis and full continuation terms need review. |
| Kansas | 10 | Both domestic first-year GPA-only tables. Source does not label an award academic year; year remains null. Transfer/international-specific tables not drafted. |
| Boise State | 4 | Fixed-dollar nonresident Ridgeline/Summit, first-year and transfer. Approximate WUE savings excluded. Detailed program/major/renewal restrictions need review; linked NPC is historical. |
| Alabama in Huntsville | 22 | Entire inspected 2027–28 nonresident matrix, excluding Alabama/Tennessee. Distinct alternatives retain published GPA/test band endpoints in structured rules. GPA basis needs review. |
| Northern Arizona | 9 | Resident and nonresident first-year tuition-award levels. WUE and FAR award amounts coincide, but tuition differs. Core-GPA, housing/meal-plan and continuation conditions remain explicit review items. |
| Iowa State | 3 | Iowa-resident automatic recognition table only. The Utah-specific URL could not be read; no nonresident amounts were assumed. |

Sources, paraphrases (at most 200 characters per tier), check dates, calculator
links, and remaining review issues are in each school's JSON file. These are
scoped excerpts, not claims to cover every automatic award offered by a school.
The later public school page must disclose this scope; it must not label a
partial draft a school's complete table.

All COA fields are null. Inspected pages included tuition-only figures,
historical calculator data, or a different academic cycle. No tuition-only
value, calculator estimate, inferred full-tuition award, or four-year scholarship
total is substituted for annual whole-school cost of attendance.

Supporting official calculator-entry pages inspected:

- SUU: https://my.suu.edu/finaid/net-price-calculator
- Alabama: https://afford.ua.edu/toolkit/
- Kansas: https://financialaid.ku.edu/calculate-costs
- Boise State: https://www.boisestate.edu/financialaid/cost-and-budgeting/
- UAH: https://www.uah.edu/admissions/undergraduate/financial-aid/costs
- NAU: https://nau.edu/fees/upcoming-tuition/
- Iowa State: https://financialaid.iastate.edu/getting-started/cost/net-price-calculator/

The NAU and UAH calculators are JavaScript tools. Their links are retained as
referred by official school pages; no calculator output was read or used as a
cost source. Kansas's and Boise State's calculators identify historical cycles.

## Pilot schools held out (no seed file)

- **Utah State:** the official copyright/terms page restricts redistribution,
  commercial exploitation and storage on another site. Hold pending permission
  or an owner-resolved permitted-use basis. Terms: https://www.usu.edu/copyright/
- **Utah Valley:** the general terms limit downloading to personal,
  non-commercial use and restrict publishing/retransmission. Hold pending
  clarification/permission. Terms: https://www.uvu.edu/legal/
- **Utah Tech:** general terms restrict redistribution, external storage and
  linking without consent. Hold pending clarification/permission.
  Terms: https://utahtech.edu/terms-of-use/

These holds concern compliance with the user's source-use instruction, not a
claim that all scholarship facts are copyright-protected. No permission was
requested or inferred, and no held-out financial facts were written to seeds.

Stage 0 exclusions also remain: Weber State's linked image has an older-cycle
filename; University of Utah's hub and linked criteria disagree on cycle;
Arizona describes competitive awards; Kentucky explicitly limits awards by
available funding. They have no seed files.

## Source access method

Only individually selected public pages and their robots/terms were inspected;
no recursive crawling, account access, CAPTCHA bypass or recurring scraper.
Robots paths were checked at the official source origin. Where the browsing
tool could not retrieve robots.txt, an ordinary single HTTP GET succeeded.
The scholarship paths inspected were not disallowed. Terms that explicitly
restricted reuse caused holds above. No general reuse terms were located on
some inspected admissions pages; that is recorded as a review issue rather
than treated as permission. General copyright notices are not treated as a
license to reuse copyrighted prose or graphics; only facts/paraphrases are
retained in the unverified drafts.

## Decisions needed

1. Resolve held-out schools' permitted use before adding their seed files.
2. Resolve source discrepancies, missing year labels and detailed conditions
   before owner verification. `merit:verify` refuses files with review issues.
3. Review complete official COA for the relevant academic year if numerical
   cost-after-merit estimates are wanted; until then costs remain unknown.
4. Stage 2 still needs a production-safe per-IP rate-limit mechanism. Stage 3
   still needs E4 and typed-code auth; existing auth is magic-link based.
