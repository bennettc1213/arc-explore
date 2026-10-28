# Instela scoring system v2 — proposal for review

Status: initial implementation built locally on 2026-10-27 following approval. Not pushed or deployed. Existing plan entitlements remain enforced on the server.

## Initial implementation scope

- Version `instela-fit-v2.0` separates source-backed eligibility, personal fit, confidence, and application priority. Cards, listing details, and shared feed consumers use the same assessment. `INSTELA_SCORING_VERSION=legacy` retains the previous scorer for rollback.
- Existing eligibility passages are parsed conservatively at read time, preserving source quotations, URLs, observation dates, and conflicts. Unsupported conditions remain review items. No schema migrations, ingestion jobs, or student/listing writes were introduced.
- Numerical fit requires at least two independent evidence groups and 50% weighted coverage. Source-published complete merit rubrics are a separate supported case; without one, college merit shows eligibility information without inventing a university formula.
- Saved school/GPA and resume project/experience evidence are wired into scoring. Additional academic context (GPA scale, enrollment status, level, residence) currently belongs to the current search URL rather than persistent profile fields. Saved-search and digest runs cannot use context absent from their saved inputs.
- The read-only audit script `scripts/scoring-v2-audit.ts` compares synthetic and anonymous queues. Unit coverage includes ambiguous requirements, hard conflicts, missing scales, evidence thresholds, merit rubrics, tier projections, and saved snapshot privacy.
- Future expansion can persist structured criteria and supplemental profile fields, broaden criterion extraction, and add institution rubrics after source validation. The sections below retain the wider design proposal.

## Baseline before v2

- Internship fit combines work authorization, term, field, location, and resume skill overlap (`src/lib/score/fit.ts`). Unknown dimensions are omitted, and the UI reports how many dimensions are known.
- Scholarship fit combines field alignment, award value, and an institutional-versus-marketing/lottery distinction (`src/lib/score/scholarship-fit.ts`). The last two describe the opportunity rather than the individual applicant.
- The profile stores school and GPA, but the shared `ScoreProfile` does not currently supply them to the fit scorers. Matching college merit requirements therefore needs structured criteria and additional profile wiring.
- Ranking already adjusts for incomplete evidence. Timing, source checks, award estimates, and tier-dependent score presentation also exist. Reuse these foundations.
- Scholarship effort inputs are currently unknown. The effort estimator is a planning heuristic, not measured application time.

The central change: separate **eligibility**, **personal fit**, **evidence confidence**, and **application priority**. A valuable scholarship is not automatically a good personal fit, and institutional sponsorship is not evidence that competition is low.

## 1. Structure the facts before increasing score complexity

Store normalized requirements with the original source passage, source URL, observation date, and extraction status. Each fact must distinguish stated, inferred, conflicting, and unknown information.

Opportunity facts should cover:

- Eligible institutions, admission/enrollment/transfer status, academic year, field, graduation window, location, work authorization, and source-stated GPA or test thresholds.
- Required and preferred skills, experience, projects, portfolio requirements, schedule, and internship term.
- Per-recipient award amount, program total, award count, renewable years, renewal conditions, and whether an estimate was derived from a total. Do not infer annual values or multiply renewable awards into a guaranteed total.
- Separate admission, scholarship, and renewal deadlines; automatic consideration versus a separate scholarship application; required essays, recommendations, and documents when published.

Ask students only for fields relevant to the selected type. Internship matching may need work authorization; college merit matching may need admitted/enrolled colleges and GPA scale. Optional answers remain unknown, not failures. Let students verify resume-derived facts before they affect scoring.

Extraction may assist with structuring text, but the scorer should be deterministic. A model must not invent eligibility, application instructions, competitor counts, or an award probability.

## 2. Evaluate eligibility before fit

Represent rules as explicit comparisons and AND/OR groups. Example: enrollment at University X AND GPA at least 3.5 AND (incoming first-year OR transfer student).

For each criterion return:

- Pass: the requirement is stated, the student supplied the relevant fact, and it meets the rule.
- Fail: a source-stated mandatory rule is contradicted by a verified student fact.
- Unknown: either side is missing, ambiguous, stale, or contradictory.

Use “Meets the stated requirements” only when all identified mandatory criteria are satisfied and there is sufficient source coverage. Otherwise say “Check eligibility.” A confirmed failure must never be offset by a large award or a high skill score.

Separate requirements from preferences. A location outside a student's wishlist is a weaker preference match, not proof of ineligibility. A required work authorization conflict is a different kind of fact.

## 3. Compute personal fit with separate models

Initial weights below are design defaults to evaluate, not validated predictors.

| Internship factor | Starting weight |
| --- | ---: |
| Required/preferred skill alignment | 40 |
| Relevant projects and experience | 25 |
| Role, education, and field alignment | 20 |
| Explicit career and work-style preferences | 15 |

Skill matching should distinguish required from preferred skills and evidence in a project or role from an unsupported keyword. Credit transferable projects and experience. Do not invent years of experience from a resume's word count or penalize a missing upload as a lack of ability.

| Scholarship factor | Starting weight |
| --- | ---: |
| Field and sponsor mission alignment | 35 |
| Evidence for source-stated achievement criteria | 30 |
| Education/program and student-goal alignment | 20 |
| Explicit opportunity preferences | 15 |

For college merit awards, use the institution's published rubric or award table when one exists and all required inputs are available. Otherwise show the eligibility match and what is missing. Do not manufacture a university's merit formula, infer a guaranteed award from GPA, or call a general fit score an admissions or scholarship prediction.

For known, applicable factors:

`Fit = 100 × sum(weight × match value) / sum(known applicable weights)`

Every contribution needs a reason, supporting evidence, and an identifiable rule version. Missing evidence is excluded from the denominator rather than treated as a failed match.

## 4. Make confidence visible and useful

Report weighted evidence coverage separately from fit. A score based on one weak fact must not look equivalent to one based on a complete, recent record.

- Factor confidence should reflect whether both sides are known, whether a requirement is explicit, and whether sources agree.
- Source freshness should be reported separately from the student's match; an older verification does not change a student's skills.
- As a starting display rule, require at least two independent applicable factors and 50% weighted coverage before showing a numerical fit. Validate this threshold before release; allow a published institution formula with complete inputs as a distinct case.
- Unknown mandatory requirements must remain prominent even when a numerical soft-fit score is available.

Example: “Fit 84/100 · Medium evidence · 3 of 5 factors known,” with “Why this score?” showing contributions and missing facts. This is not “84% likely to win.”

## 5. Rank by application priority without distorting fit

Rank in this order:

1. Eligibility state: confirmed mismatches cannot outrank eligible opportunities merely because they are valuable.
2. Personal fit adjusted for evidence coverage, building on the existing confidence-aware ranking.
3. Student-selected priorities, such as deadline feasibility, award value, desired experience, and application workload.
4. Stable diversity among similarly supported matches, avoiding a queue dominated by one employer or sponsor.

Keep award value, source trust, deadline urgency, and effort visible as their own signals. Estimated time must stay labeled as an estimate. Unknown essay or recommendation counts must not become “easy application.” Award count is not applicant count and cannot establish competition or winning odds.

## 6. Preserve privacy and clear user control

- Skip remains temporary navigation. Do not persist skipped IDs or use skip history to train personalization.
- Save and Apply retain their existing distinct meanings. Opening application steps or a source URL never marks the student as submitted.
- Use explicit preferences for personalization. Any future use of additional interaction history needs a separate product decision and clear user controls.
- Names and inferred demographic attributes must not influence generic fit. Restricted-award requirements, when relevant, must be explicit source rules checked against voluntarily supplied facts, with clear explanations.
- Keep numeric scores, explanations, and locked fields shaped on the server through the existing entitlement layer.

## 7. Validate before replacing the current scorer

Build reviewed fixtures spanning internships, general scholarships, and college merit awards. Include complete profiles, missing data, conflicting sources, unusual GPA scales, multiple eligible schools, automatic awards, expired cycles, unknown recipient counts, and renewable-award caveats.

Required checks:

- A confirmed eligibility failure cannot become a strong recommendation through a large award.
- Unknown information never becomes zero ability, guaranteed eligibility, zero competition, or low effort.
- Improving a relevant, verified match cannot lower that factor's fit score.
- Irrelevant changes, including a person's name, cannot alter fit.
- Displayed contributions reconstruct the reported fit; ranking adjustments remain separate.
- The card, detail page, saved search, and tracker agree for the same scorer version and profile.
- Server payloads retain tier restrictions; anonymous and authenticated flows work.

Compare old and new queues in a shadow evaluation before changing the user-facing ordering. Review examples and failure cases rather than optimizing solely for saves or clicks. Real outcome data may support later research, but a win-probability feature is outside this proposal and should not be implied by v2.

## Proposed delivery sequence

1. Approve the criterion library, profile fields, and source evidence contract.
2. Build normalized requirement extraction and institution-specific rule validation.
3. Implement eligibility, fit, confidence, and priority as separate versioned modules with fixtures.
4. Add the score breakdown, missing-information prompts, and college merit explanations to local cards.
5. Compare the old and new rankings in shadow evaluation and review edge cases.
6. Present a local preview for approval. Deploy only after approval, retaining the previous scorer behind a rollback flag.

The approved first build is local only. A schema migration, ingestion job, new telemetry, or production release still requires separate scope and authorization.
