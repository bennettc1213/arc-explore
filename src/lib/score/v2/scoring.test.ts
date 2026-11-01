import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScoreProfile } from "../fit";
import { presentFit } from "@/lib/pricing/tiers";
import { extractOpportunityFacts } from "./requirements";
import { evaluateEligibility, evaluateRule, scoreOpportunity, eligibilityOrder, type OpportunityScoringInput } from "./engine";
import { toScoringProfile, withScoringPreferences, scoringQueryFrom } from "./profile";
import { EMPTY_PROFILE_INPUT } from "@/lib/profile/types";
import { discoveryCardSchema, savedSnapshot, readGuestSaves } from "@/lib/discovery/cards";
import type { Criterion, RequirementRule } from "./types";
import { diversifyWithinGroups } from "./diversity";

const URL = "https://example.edu/opportunity";
const DATE = "2026-10-27T12:00:00.000Z";
const NOW = new Date(DATE);
const profile: ScoreProfile = {
  major: "Computer Science", school: "Example University", gpa: 3.7, gpaScale: 4,
  enrollmentStatus: "enrolled", workAuth: "us_citizen", targetLocations: ["New York"], openToRemote: true,
  educationLevel: "undergraduate", skills: ["Python", "SQL"], experienceSkills: ["Python"],
};
function facts(criteria: string[] = [], workAuth?: string, structuredRubric?: unknown) {
  return extractOpportunityFacts({ title: "Software opportunity", criteria, url: URL, observedAt: DATE, workAuth, structuredRubric });
}
function opportunity(overrides: Partial<OpportunityScoringInput> = {}): OpportunityScoringInput {
  return { kind: "internship", title: "Software Engineering Intern", fieldKeys: ["software"], skills: ["Python", "SQL"], locations: ["New York"], isRemote: false,
    facts: facts(["Applicants must be U.S. citizens."]), url: URL, observedAt: DATE, ...overrides };
}
function requirement(field: Criterion["field"], values: string[]): Criterion {
  return { type: "criterion", id: field + values.join("-"), label: field, field, values, evidence: { quote: "Explicit source requirement", url: URL, observedAt: DATE, field: "test", status: "stated" } };
}

test("eligibility preserves explicit AND/OR groups", () => {
  const rule: RequirementRule = { type: "all", id: "root", label: "Requirements", children: [requirement("school", ["Example University"]), { type: "any", id: "status", label: "Enrolled or admitted", children: [requirement("enrollmentStatus", ["enrolled"]), requirement("enrollmentStatus", ["admitted"])] }] };
  assert.equal(evaluateRule(rule, profile).state, "pass");
  assert.equal(evaluateRule(rule, { ...profile, enrollmentStatus: "admitted" }).state, "pass");
  assert.equal(evaluateRule(rule, { ...profile, enrollmentStatus: undefined }).state, "unknown");
  assert.equal(evaluateRule(rule, { ...profile, enrollmentStatus: "transfer" }).state, "fail");
});
test("an empty group is unknown rather than automatically eligible", () => {
  assert.equal(evaluateRule({ type: "all", id: "empty", label: "Missing", children: [] }, profile).state, "unknown");
});
test("a confirmed authorization failure overrides perfect skills and a huge award", () => {
  const scored = scoreOpportunity({ ...profile, workAuth: "needs_sponsorship" }, opportunity({ amountMin: 1_000_000, amountStatus: "exact" }), NOW);
  assert.equal(scored.blocked, true); assert.equal(scored.score, null); assert.equal(scored.assessment?.eligibility.state, "fail");
  assert.equal(eligibilityOrder(scored.assessment), 2);
});
test("unknown authorization is not a mismatch", () => {
  const scored = scoreOpportunity({ ...profile, workAuth: null }, opportunity(), NOW);
  assert.equal(scored.blocked, false); assert.equal(scored.assessment?.eligibility.state, "unknown");
});
test("location preferences are not eligibility requirements", () => {
  const scored = scoreOpportunity(profile, opportunity({ locations: ["San Francisco"] }), NOW);
  assert.equal(scored.blocked, false); assert.equal(scored.assessment?.eligibility.state, "pass");
  assert.equal(scored.assessment?.factors.find(factor => factor.id === "preferences")?.value, .2);
});
test("GPA checks require comparable, explicitly stated scales", () => {
  const rule = facts(["Minimum GPA of 3.5 on a 4.0 scale."]).rules;
  assert.equal(evaluateEligibility(rule, profile).state, "pass");
  assert.equal(evaluateEligibility(rule, { ...profile, gpa: 3.1 }).state, "fail");
  assert.equal(evaluateEligibility(rule, { ...profile, gpaScale: 4.5 }).state, "unknown");
  assert.equal(evaluateEligibility(rule, { ...profile, gpaScale: null }).state, "unknown");
  assert.equal(evaluateEligibility(facts(["Minimum GPA of 3.5."]).rules, profile).state, "unknown");
});
test("school requirements need enrollment evidence, and aliases are not invented", () => {
  const rule = facts(["Must be enrolled at Example University."]).rules;
  assert.equal(evaluateEligibility(rule, profile).state, "pass");
  assert.equal(evaluateEligibility(rule, { ...profile, school: "Different University" }).state, "fail");
  assert.equal(evaluateEligibility(rule, { ...profile, school: "EU" }).state, "unknown");
  assert.equal(evaluateEligibility(rule, { ...profile, enrollmentStatus: null }).state, "unknown");
});
test("an OR alternative the parser cannot understand does not become a hard GPA failure", () => {
  const rule = facts(["Minimum GPA of 3.5 on a 4.0 scale or an exceptional portfolio."]).rules;
  assert.equal(evaluateEligibility(rule, { ...profile, gpa: 2 }).state, "unknown");
});
test("a maximum GPA is not incorrectly interpreted as a minimum", () => {
  const rule = facts(["Applicants must have a maximum GPA of 3.0 on a 4.0 scale."]).rules;
  assert.equal(evaluateEligibility(rule, { ...profile, gpa: 2 }).state, "unknown");
});
test("unparsed requirements and additional sentences prevent a claim of complete eligibility", () => {
  for (const text of ["Minimum GPA of 3.0 on a 4.0 scale. Full time enrollment is required.", "Minimum GPA of 3.0 on a 4.0 scale and demonstrated financial need."]) {
    assert.equal(evaluateEligibility(facts([text]).rules, profile).state, "unknown");
  }
});
test("conflicting institution requirements are reported as uncertain source evidence", () => {
  const result = evaluateEligibility(facts(["Must be enrolled at Example University.", "Must be enrolled at Different University."]).rules, profile);
  assert.equal(result.state, "unknown"); assert(result.missing.includes("Conflicting source requirements"));
});
test("a low evidence score stays hidden rather than presenting a speculative 100", () => {
  const result = scoreOpportunity({ major: "Computer Science" }, opportunity({ skills: [] }), NOW);
  assert.equal(result.assessment?.rawFit, 100); assert.equal(result.score, null);
  assert.equal(result.assessment?.confidence.coverage, 20); assert.equal(result.assessment?.confidence.level, "low");
});
test("the displayed fit can be reconstructed from known weighted factors", () => {
  const result = scoreOpportunity(profile, opportunity(), NOW);
  const known = result.assessment!.factors.filter(factor => factor.value !== null);
  const expected = Math.round(known.reduce((sum, factor) => sum + factor.weight * factor.value!, 0) / known.reduce((sum, factor) => sum + factor.weight, 0) * 100);
  assert.equal(result.score, expected); assert.equal(result.assessment?.confidence.coverage, 100);
});
test("improving a comparable named skill cannot lower fit", () => {
  const a = scoreOpportunity({ ...profile, skills: ["Python"] }, opportunity(), NOW);
  const b = scoreOpportunity({ ...profile, skills: ["Python", "SQL"] }, opportunity(), NOW);
  assert(b.score! >= a.score!);
});
test("resume skill claims alone are not project/experience evidence", () => {
  const result = scoreOpportunity({ ...profile, experienceSkills: [] }, opportunity(), NOW);
  assert.equal(result.assessment?.factors.find(factor => factor.id === "experience")?.value, null);
});
test("skills and project corroboration cannot masquerade as two independent opportunity signals", () => {
  const result = scoreOpportunity({ skills: ["Python"], experienceSkills: ["Python"] }, opportunity({ fieldKeys: [], skills: ["Python"], locations: [] }), NOW);
  assert.equal(result.assessment?.confidence.known, 2);
  assert.equal(result.assessment?.confidence.independent, 1);
  assert.equal(result.score, null);
});
test("explicit required skills carry more weight than preferred ones", () => {
  const input = opportunity({ facts: facts(["Required skills: Python.", "Preferred skills: SQL."]) });
  const required = scoreOpportunity({ ...profile, skills: ["Python"] }, input, NOW).assessment!.factors.find(f => f.id === "skills")!;
  const preferred = scoreOpportunity({ ...profile, skills: ["SQL"] }, input, NOW).assessment!.factors.find(f => f.id === "skills")!;
  assert(required.value! > preferred.value!);
});
test("award size and award count never inflate personal fit", () => {
  const input = opportunity({ kind: "scholarship", title: "Computer Science Scholarship", facts: facts(["Minimum GPA of 3.5 on a 4.0 scale."]) });
  const a = scoreOpportunity(profile, { ...input, amountMin: 100, amountStatus: "exact" }, NOW);
  const b = scoreOpportunity(profile, { ...input, amountMin: 100_000, amountStatus: "exact" }, NOW);
  assert.equal(a.score, b.score); assert.equal(a.assessment?.rawFit, b.assessment?.rawFit); assert.equal(a.assessment?.priority.rank, b.assessment?.priority.rank);
});
test("award preference changes priority while preserving fit", () => {
  const input = opportunity({ kind: "scholarship", title: "Computer Science Scholarship", amountMin: 5000, amountStatus: "exact" });
  const a = scoreOpportunity(profile, input, NOW);
  const b = scoreOpportunity({ ...profile, priority: "award" }, input, NOW);
  assert.equal(a.score, b.score); assert(b.assessment!.priority.rank > a.assessment!.priority.rank);
});
test("unknown workload is not assigned an easy-application boost", () => {
  const a = scoreOpportunity(profile, opportunity(), NOW);
  const b = scoreOpportunity({ ...profile, priority: "effort" }, opportunity(), NOW);
  assert.equal(b.assessment?.priority.estimatedHours, null); assert.equal(a.assessment?.priority.rank, b.assessment?.priority.rank);
});
test("explicit zero essay/letter requirements produce a labeled effort estimate", () => {
  const result = scoreOpportunity({ ...profile, priority: "effort" }, opportunity({ facts: facts(["No essay required. No recommendation letters required."]) }), NOW);
  assert.equal(result.assessment?.priority.estimatedHours, .5);
});
test("merit awards have no numerical formula when no source rubric exists", () => {
  const result = scoreOpportunity(profile, opportunity({ kind: "scholarship", title: "University Merit Scholarship", facts: facts(["Minimum GPA of 3.5 on a 4.0 scale."]) }), NOW);
  assert.equal(result.score, null); assert.equal(result.assessment?.model, "college-merit"); assert.match(result.assessment!.scoreNote!, /No usable published/);
});
test("a published, source-matched GPA point table is evaluated without inventing points", () => {
  const rubric = { sourceUrl: URL, quote: "GPA 3.5 or above receives 80 points; GPA 3.9 or above receives 100 points.", gpaScale: 4, maxPoints: 100, rows: [{ minimumGpa: 3.5, points: 80 }, { minimumGpa: 3.9, points: 100 }] };
  const input = opportunity({ kind: "scholarship", title: "University Merit Scholarship", facts: facts(["Minimum GPA of 3.5 on a 4.0 scale."], undefined, rubric) });
  assert.equal(scoreOpportunity(profile, input, NOW).score, 80);
  assert.equal(scoreOpportunity({ ...profile, gpa: 3.95 }, input, NOW).score, 100);
  assert.equal(scoreOpportunity({ ...profile, gpaScale: 4.5 }, input, NOW).score, null);
  const bad = { ...rubric, sourceUrl: "https://unrelated.example/" };
  assert.equal(facts([], undefined, bad).meritRubric, null);
});
test("a malformed or contradictory published point table is rejected", () => {
  const rubric = { sourceUrl: URL, quote: "Supposed published GPA points table.", gpaScale: 4, maxPoints: 100, rows: [{ minimumGpa: 3.5, points: 90 }, { minimumGpa: 3.9, points: 20 }] };
  assert.equal(facts([], undefined, rubric).meritRubric, null);
});
test("free presentation cannot expose raw fit, rank, or numerical factor contributions", () => {
  const fit = scoreOpportunity(profile, opportunity(), NOW);
  const free = presentFit(fit, "free", { profileReady: true });
  assert.equal(free.score, null); assert.deepEqual(free.assessment?.factors, []); assert.deepEqual(free.reasons, []);
  assert.equal("rawFit" in free.assessment!, false); assert.equal("rank" in free.assessment!.priority, false);
  assert.equal(presentFit(fit, "apply", { profileReady: false }).score, fit.score);
});
test("profile names and irrelevant identity fields cannot affect fit", () => {
  const a = scoreOpportunity({ ...profile, displayName: "Alex" } as ScoreProfile, opportunity(), NOW);
  const b = scoreOpportunity({ ...profile, displayName: "Jordan" } as ScoreProfile, opportunity(), NOW);
  assert.deepEqual(a, b);
});
test("the v2 bridge uses only saved academic fields and actual resume evidence", () => {
  const stored = { ...EMPTY_PROFILE_INPUT, id: "student", displayName: "Do not score this name", school: "Example University", gpa: 3.7 };
  const mapped = toScoringProfile(stored, ["Python"], { skills: ["SQL"], projects: [{ name: "Python project", description: "Built a Python application", link: null }] });
  assert.equal(mapped.school, "Example University"); assert.equal(mapped.gpa, 3.7); assert.equal(mapped.gpaScale, undefined);
  assert(mapped.experienceSkills?.includes("Python")); assert(!mapped.experienceSkills?.includes("SQL"));
  assert.equal("displayName" in mapped, false);
});
test("per-search scoring context is validated and cannot overwrite saved GPA/school", () => {
  const params = { school: "Forged School", gpa: "4.5", gpaScale: "4", educationLevel: "undergraduate", enrollmentStatus: "enrolled", priority: "award", residency: "Nevada" };
  const context = withScoringPreferences(profile, params, false);
  assert.equal(context.school, profile.school); assert.equal(context.gpa, profile.gpa); assert.equal(context.priority, "award");
  assert.equal(withScoringPreferences({}, { gpa: "abc", gpaScale: "200", priority: "evil" }, true).gpa, null);
  assert.equal(withScoringPreferences({}, { gpaScale: "200" }, true).gpaScale, null);
  assert.equal(new URLSearchParams(scoringQueryFrom({ ...params, evil: "no", targetVerticals: ["software", "data_ai"] })).has("evil"), false);
});
test("persisted browser snapshots strip assessment and profile query context", () => {
  const card = discoveryCardSchema.parse({ id: "example", kind: "internship", title: "Software Intern", company: "Example", url: URL, locations: [], remote: false, term: null,
    award: null, awardsCount: null, deadline: null, closes: null, verified: "checked today", posted: null, score: 99, bucketLabel: null, scoreKnown: 4, scoreTotal: 4, scoreLocked: false,
    reasons: [], eligibility: [], skills: ["Python"], matchedSkills: ["Python"], missingSkills: ["SQL"], timing: null, timingLabel: "unknown", timingKnown: 0, timingTotal: 3,
    warnings: ["Check eligibility: your profile may conflict with a stated requirement.", "U.S. citizenship required."], closed: false, profileReady: true, assessment: presentFit(scoreOpportunity(profile, opportunity(), NOW), "apply", { profileReady: true }).assessment,
    detailsHref: "/listing/example?gpa=3.7",
  });
  const snapshot = savedSnapshot(card);
  assert.deepEqual(snapshot.warnings, ["U.S. citizenship required."]);
  assert.equal(snapshot.assessment, undefined); assert.equal(snapshot.detailsHref, undefined); assert.equal(snapshot.score, null);
  const restored = readGuestSaves(JSON.stringify([card]));
  assert.equal(restored[0].assessment, undefined); assert.equal(restored[0].score, null);
});

test("closed application cycles cannot outrank available eligible opportunities", () => {
  const closed = scoreOpportunity(profile, opportunity({ closed: true }), NOW);
  const open = scoreOpportunity(profile, opportunity(), NOW);
  assert.equal(closed.score, null); assert.equal(closed.blocked, true);
  assert(eligibilityOrder(closed.assessment) > eligibilityOrder(open.assessment));
});
test("sponsor diversity stays within the same eligibility/relevance/priority group", () => {
  const rows = [
    { id: "A1", sponsor: "A", group: "eligible:90" }, { id: "A2", sponsor: "A", group: "eligible:90" },
    { id: "A3", sponsor: "A", group: "eligible:90" }, { id: "B1", sponsor: "B", group: "eligible:90" },
    { id: "C1", sponsor: "C", group: "unknown:60" }, { id: "D1", sponsor: "D", group: "ineligible:100" },
  ];
  const diversified = diversifyWithinGroups(rows, row => row.group, row => row.sponsor);
  assert.deepEqual(diversified.map(row => row.id), ["A1", "A2", "B1", "A3", "C1", "D1"]);
  assert.deepEqual(rows.map(row => row.id), ["A1", "A2", "A3", "B1", "C1", "D1"]);
});
