# Phase 1 Trust Gate — Manual Samples

**Generated:** 2026-09-27T18:24:14.087Z  
**Command:** npx tsx scripts/gate-phase-1-samples.ts

All queries are read-only. Identifiers are UUIDs; titles are quoted only to make the sample reviewable. No personal profile fields (name, email, school, GPA, portfolio) are included.

---

## 1. Term correctness across source types (n=20)

| # | Kind | Source | Title | Term | Source label | Visible? |
|---|---|---|---|---|---|---|
| 1 | internship | ashby | Forward Deployed Engineer, New Grad | Summer 2027 | inferred | visible |
| 2 | internship | ashby | Mechanical Engineer Intern (Spring-Summer 2026) | Summer 2026 | explicit | quarantined |
| 3 | internship | ashby | Marketing Associate Intern | Summer 2027 | inferred | visible |
| 4 | internship | greenhouse | Winter 2027 Intern, Motion Planning | Winter 2027 | explicit | visible |
| 5 | internship | greenhouse | Summer 2027 Investment Operations Intern | Summer 2027 | explicit | visible |
| 6 | internship | greenhouse | Mechanical Engineering Intern | Summer 2027 | inferred | visible |
| 7 | scholarship | iup | Pennsylvania’s State System of Higher Education Foundation Scholarships | Summer 2027 | inferred | visible |
| 8 | scholarship | iup | Kadzai Law Group First-Generation College Student Scholarship | Summer 2027 | inferred | visible |
| 9 | scholarship | iup | Emerging Entrepreneurs Scholarship | Summer 2027 | inferred | visible |
| 10 | internship | lever | Construction Management Intern | Summer 2027 | inferred | visible |
| 11 | internship | lever | Articling Student - Bar of Quebec - Internship \| Stagiaire en droit - Barreau du Québec - Stage | Summer 2027 | inferred | visible |
| 12 | internship | lever | Software Engineer, Internship - Infrastructure | Summer 2027 | inferred | visible |
| 13 | scholarship | scholarshipportal | Rose Marie and “Bus” James Endowment Fund | Summer 2027 | inferred | visible |
| 14 | scholarship | scholarshipportal | Håkan Rosengren & Katherine Powers Endowed Scholarship for Clarinet | Summer 2027 | inferred | visible |
| 15 | scholarship | scholarshipscom | Mike Rowe Work Ethic Scholarship | Summer 2027 | inferred | visible |
| 16 | scholarship | scholarshipscom | Inspiring More Minds Paradise Scholarship | Summer 2027 | inferred | visible |
| 17 | scholarship | scholarshipscom | Good Tidings Community Service Scholarship | Summer 2027 | inferred | visible |
| 18 | internship | smartrecruiters | [EMC] Intern for Admin / Training Support | Summer 2027 | inferred | visible |
| 19 | internship | smartrecruiters | Digital Marketing Internship | Summer 2027 | inferred | visible |
| 20 | internship | smartrecruiters | Contract Support COOP | Summer 2027 | inferred | visible |

Sample method: stratified random sample, up to 3 rows per distinct source, limited to rows with a non-empty term.

## 2. Scholarship amount statuses (n=20)

| # | Title | Status | Min | Max | Program total | Awards count | Estimated? |
|---|---|---|---|---|---|---|---|
| 1 | Tomasik Kotin Kasserman, LLC | exact | 2000 | 2000 | — | — | false |
| 2 | The Impact of Emerging Technologies on Road Safety and Personal Injury Law Scholarship | exact | 1000 | 1000 | — | — | false |
| 3 | ROI CX Solutions Scholarship Program | exact | 2500 | 2500 | — | — | false |
| 4 | Houston Scholarship | exact | 1000 | 1000 | — | — | false |
| 5 | Road to Recovery Scholarship | exact | 1000 | 1000 | — | — | false |
| 6 | Young Legal Professionals Scholarship | exact | 1000 | 1000 | — | — | false |
| 7 | Volunteer for Vets Scholarship | exact | 1000 | 1000 | — | — | false |
| 8 | RMD Law Scholarship | exact | 2500 | 2500 | — | — | false |
| 9 | National Italian American Foundation Scholarships | range | 2500 | 12000 | — | — | false |
| 10 | Reno Rodeo Foundation Scholarship | range | 1000 | 2500 | — | — | false |
| 11 | Baloo Living Dream Builder Grant | range | 250 | 1000 | — | — | false |
| 12 | Daughters of Cincinnati Scholarship | range | 16000 | 20000 | — | — | false |
| 13 | Burress Injury Law Underdog Scholarship | range | 2500 | 5000 | — | — | false |
| 14 | Brooks Law Group Truck Accident Scholarship | range | 250 | 1000 | — | — | false |
| 15 | Hispanic Scholarship Fund (multiple options) | range | 500 | 5000 | — | — | false |
| 16 | Life & Health Insurance Foundation For Education (LIFE) Scholarship | range | 2000 | 15000 | — | — | false |
| 17 | North American Van Lines | unparseable | — | — | — | — | false |
| 18 | C&B Law Group Scholarship | unparseable | — | — | — | — | false |
| 19 | Clarity Credit Union Mary M. Jones Scholarship | varies | — | — | — | — | false |
| 20 | Matthew Tobin Cappetta Archaeological Scholarship | varies | — | — | — | — | false |

Sample method: up to 5 random rows per amount status (exact, range, varies, unparseable).

## 3. Profile completeness (n=10)

| State | Count |
|---|---|
| Complete (all four fields) | 2 |
| Incomplete | 8 |
| Missing major | 3 |
| Missing grad year | 3 |
| Missing work auth | 8 |
| Missing state/locations | 8 |

### Representative profiles

| ID | Major | Grad year | Work auth | Locations | State |
|---|---|---|---|---|---|
| 531bb58b-9e59-48a3-ad1a-67f1a5063be2 | Computer Science | 2028 | us_citizen | Austin, New York | complete |
| a17f8fe2-dbdd-4857-81c3-478b5be64949 | information systems | 2030 | us_citizen | salt lake city, utah | complete |
| ff79fec8-2193-4d95-9c3e-92dab04573b4 | — | — | — | — | empty |
| 19c9f6fb-a214-40f1-a129-4601c61336d4 | — | — | — | — | empty |
| a04cb318-0720-4e0a-8d39-6cc49b709be4 | — | — | — | — | empty |
| 5fd7adf9-5909-4a71-b35b-b4c5b9913568 | Computer Science | 2028 | — | — | partial |
| 9d4985e6-3f36-436f-962b-5a55391f92b0 | Information Systems | 2027 | — | — | partial |
| 9718a961-7533-41cb-b028-25592b1654f0 | Information Systems | 2027 | — | — | partial |

## 4. Default top-10 fit labels with an empty profile

Free-limit cap under test: 20.

| # | Kind | Title | Fit score | Known/Total dimensions | Blocked |
|---|---|---|---|---|---|---|---|
| 1 | scholarship | The Immigrant Journey: Hardship, Hope, and Resilience Scholarship | 100 | 2/3 | false |
| 2 | scholarship | American Indian Education Foundation Scholarship | 100 | 2/3 | false |
| 3 | scholarship | The Mensa Foundation Scholarship Program | 100 | 2/3 | false |
| 4 | scholarship | “An Ideal Lawyer’s Portrait: Representation Matters” Scholarship | 84 | 2/3 | false |
| 5 | scholarship | John Family Health Careers Scholarship | 92 | 2/3 | false |
| 6 | scholarship | Conquering Cancer Scholarship | 76 | 2/3 | false |
| 7 | scholarship | The Foray Hurst Firm United Voices Scholarship | 76 | 2/3 | false |
| 8 | scholarship | ROI CX Solutions Scholarship Program | 84 | 2/3 | false |
| 9 | scholarship | Pioneer Military Credit Military Spouse Scholarship | 100 | 1/3 | false |
| 10 | scholarship | Building Bridges Scholarship | 76 | 2/3 | false |

Expected: no "Strong Fit" or percentage-like score for an empty profile.

## 5. Lottery-style awards shelf (sample)

| # | Title | Lottery? | Reasons |
|---|---|---|---|


## 6. Open rows with ended terms (should be quarantined)

| # | Term | Flagged at |
|---|---|---|
| 1 | Fall 2025 | 2026-09-27T18:09:27.649Z |
| 2 | Spring 2025 | 2026-09-27T18:09:27.649Z |
| 3 | Summer 2025 | 2026-09-27T18:09:27.649Z |

Expected: every open row whose term has ended carries a non-null termEndedFlagAt and is therefore excluded from the default feed.
