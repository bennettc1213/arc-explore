# Phase 1 Trust Gate — Manual Samples

**Generated:** 2026-09-28T20:04:59.628Z  
**Command:** npx tsx scripts/gate-phase-1-samples.ts

All queries are read-only. Identifiers are UUIDs; titles are quoted only to make the sample reviewable. No personal profile fields (name, email, school, GPA, portfolio) are included.

---

## 1. Term correctness across source types (n=20)

| # | Kind | Source | Title | Term | Source label | Visible? |
|---|---|---|---|---|---|---|
| 1 | internship | ashby | Machine Learning Research Intern 2027 | Summer 2027 | inferred | visible |
| 2 | internship | ashby | Software engineering Intern | Summer 2027 | inferred | visible |
| 3 | internship | ashby | Analytics Intern | Summer 2027 | inferred | visible |
| 4 | internship | greenhouse | Entry-Level Geotechnical Engineer - Rail | Summer 2027 | inferred | visible |
| 5 | internship | greenhouse | Software Engineering Intern | Summer 2027 | inferred | visible |
| 6 | internship | greenhouse | Data Science Internship, Summer 2027 | Summer 2027 | explicit | visible |
| 7 | scholarship | iup | Dick Hannah Dealership Scholarship | Summer 2027 | inferred | visible |
| 8 | scholarship | iup | Attorney Ambitions Scholarship | Summer 2027 | inferred | visible |
| 9 | scholarship | iup | Saving Smiles Scholarship | Summer 2027 | inferred | visible |
| 10 | internship | lever | Engineering / Characterization Lab Intern – Materials Science / Mechanical / Electrical / Aerospace / Chemistry / Physics | Summer 2027 | inferred | visible |
| 11 | internship | lever | Product Management, Intern | Summer 2027 | inferred | visible |
| 12 | internship | lever | Inference Optimization Intern – Performance Modeling | Summer 2027 | inferred | visible |
| 13 | scholarship | scholarshipportal | Rose Marie and “Bus” James Endowment Fund | Summer 2027 | inferred | visible |
| 14 | scholarship | scholarshipportal | Håkan Rosengren & Katherine Powers Endowed Scholarship for Clarinet | Summer 2027 | inferred | visible |
| 15 | scholarship | scholarshipscom | James T. and Rose M. Perryman Family Foundation Scholarships | Summer 2027 | inferred | visible |
| 16 | scholarship | scholarshipscom | HOLA at Microsoft Scholarship | Summer 2027 | inferred | visible |
| 17 | scholarship | scholarshipscom | Antioch Garden Club Community Scholarship | Summer 2027 | inferred | visible |
| 18 | internship | smartrecruiters | HEDIS Specialist | Summer 2027 | inferred | visible |
| 19 | internship | smartrecruiters | [EMC] Intern for Admin Intern - Training Support (HN) (Japanese Speaking) | Summer 2027 | inferred | visible |
| 20 | internship | smartrecruiters | Environmental Health & Safety Intern - Summer 2027 | Summer 2027 | explicit | visible |

Sample method: stratified random sample, up to 3 rows per distinct source, limited to rows with a non-empty term.

## 2. Scholarship amount statuses (n=20)

| # | Title | Status | Min | Max | Program total | Awards count | Estimated? |
|---|---|---|---|---|---|---|---|
| 1 | Emerson Straw Injury Law Scholarship: Overcoming Adversity After an Injury | exact | 1000 | 1000 | — | — | false |
| 2 | PRINT IT Scholarship for Aspiring Content Creators | exact | 1000 | 1000 | — | — | false |
| 3 | Volunteer for Vets Scholarship | exact | 1000 | 1000 | — | — | false |
| 4 | Wounded First Responders Scholarship | exact | 1000 | 1000 | — | — | false |
| 5 | Justice in Family Law Scholarship | exact | 1000 | 1000 | — | — | false |
| 6 | Dick Hannah Dealership Scholarship | exact | 1000 | 1000 | — | — | false |
| 7 | Empowering Women in Tech – Essay Scholarship By Designli | exact | 3000 | 3000 | — | — | false |
| 8 | Salvado Law Dream Chaser Scholarship | exact | 1000 | 1000 | — | — | false |
| 9 | Burress Injury Law Underdog Scholarship | range | 2500 | 5000 | — | — | false |
| 10 | Reno Rodeo Foundation Scholarship | range | 1000 | 2500 | — | — | false |
| 11 | Daughters of Cincinnati Scholarship | range | 16000 | 20000 | — | — | false |
| 12 | Society of American Military Engineers (SAME) College Scholarship Program | range | 1000 | 4000 | — | — | false |
| 13 | National Catholic Committee on Scouting Scholarships | range | 2000 | 5000 | — | — | false |
| 14 | Marine Corps Scholarship Foundation Scholarships | range | 2500 | 10000 | — | — | false |
| 15 | National Italian American Foundation Scholarships | range | 2500 | 12000 | — | — | false |
| 16 | Brooks Law Group Truck Accident Scholarship | range | 250 | 1000 | — | — | false |
| 17 | North American Van Lines | unparseable | — | — | — | — | false |
| 18 | C&B Law Group Scholarship | unparseable | — | — | — | — | false |
| 19 | Dave Ledo Scholarship | varies | — | — | — | — | false |
| 20 | AASA Education Administration Scholarship | varies | — | — | — | — | false |

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
| a17f8fe2-dbdd-4857-81c3-478b5be64949 | information systems | 2030 | us_citizen | salt lake city, utah | complete |
| 531bb58b-9e59-48a3-ad1a-67f1a5063be2 | Computer Science | 2028 | us_citizen | Austin, New York | complete |
| ff79fec8-2193-4d95-9c3e-92dab04573b4 | — | — | — | — | empty |
| 19c9f6fb-a214-40f1-a129-4601c61336d4 | — | — | — | — | empty |
| a04cb318-0720-4e0a-8d39-6cc49b709be4 | — | — | — | — | empty |
| 9718a961-7533-41cb-b028-25592b1654f0 | Information Systems | 2027 | — | — | partial |
| 5fd7adf9-5909-4a71-b35b-b4c5b9913568 | Computer Science | 2028 | — | — | partial |
| e1a97dee-4206-47a1-a0fa-1fd4f721331b | Information Systems | 2027 | — | — | partial |

## 4. Default top-10 fit labels with an empty profile

Free-limit cap under test: 20.

| # | Kind | Title | Fit score | Known/Total dimensions | Blocked |
|---|---|---|---|---|---|---|---|
| 1 | scholarship | The Immigrant Journey: Hardship, Hope, and Resilience Scholarship | 100 | 2/3 | false |
| 2 | scholarship | American Indian Education Foundation Scholarship | 100 | 2/3 | false |
| 3 | scholarship | The Mensa Foundation Scholarship Program | 100 | 2/3 | false |
| 4 | scholarship | John Family Health Careers Scholarship | 92 | 2/3 | false |
| 5 | scholarship | “An Ideal Lawyer’s Portrait: Representation Matters” Scholarship | 84 | 2/3 | false |
| 6 | scholarship | Conquering Cancer Scholarship | 76 | 2/3 | false |
| 7 | scholarship | The Foray Hurst Firm United Voices Scholarship | 76 | 2/3 | false |
| 8 | scholarship | Pioneer Military Credit Military Spouse Scholarship | 100 | 1/3 | false |
| 9 | scholarship | Building Bridges Scholarship | 76 | 2/3 | false |
| 10 | scholarship | ROI CX Solutions Scholarship Program | 84 | 2/3 | false |

Expected: no "Strong Fit" or percentage-like score for an empty profile.

## 5. Lottery-style awards shelf (sample)

| # | Title | Lottery? | Reasons |
|---|---|---|---|


## 6. Open rows with ended terms (should be quarantined)

| # | Term | Flagged at |
|---|---|---|
| 1 | Fall 2025 | 2026-09-27T21:28:24.531Z |
| 2 | Spring 2025 | 2026-09-27T21:28:24.531Z |
| 3 | Spring 2025 | NOT FLAGGED |
| 4 | Summer 2025 | 2026-09-27T21:28:24.531Z |

Expected: every open row whose term has ended carries a non-null termEndedFlagAt and is therefore excluded from the default feed.
