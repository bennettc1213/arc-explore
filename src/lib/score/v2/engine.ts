import { fieldsForProfile, type FitResult, type ScoreProfile } from "../fit";
import { estimateEffort } from "@/lib/scholarships/effort";
import { normalizeSchool } from "./requirements";
import { SCORING_VERSION, type Criterion, type EligibilityCheck, type EligibilityResult, type FitFactor, type OpportunityFacts, type RequirementRule, type ScoringAssessment, type SourceEvidence } from "./types";

function unique(values: string[]): string[] { return [...new Set(values)]; }
const profileLabels = { gpa: "Your GPA", school: "Your college", workAuth: "Your work authorization", educationLevel: "Your education level", enrollmentStatus: "Your enrollment/admission status", residency: "Your state of residence" };

function checkCriterion(rule: Criterion, profile: ScoreProfile): EligibilityCheck {
  const base = { id: rule.id, field: rule.field, label: rule.label, evidence: rule.evidence };
  const unknown = (explanation: string, missingField = profileLabels[rule.field]): EligibilityCheck => ({ ...base, state: "unknown", explanation, missingField });
  if (rule.evidence.status === "conflicting") return unknown("The source evidence conflicts; confirm the current requirement.", "Conflicting source requirements");
  if (rule.field === "gpa") {
    if (profile.gpa == null) return unknown("Add your GPA to check the published minimum.");
    if (!rule.scale) return unknown("The source does not state the GPA scale. A numerical comparison would be a guess.", "Published GPA scale");
    if (!profile.gpaScale) return unknown("Confirm your GPA scale before comparing it with the source.", "Your GPA scale");
    if (profile.gpaScale !== rule.scale) return unknown(`Your ${profile.gpaScale}-point GPA and the source's ${rule.scale}-point scale are not directly comparable.`, "Comparable GPA scales");
    if (profile.gpa > profile.gpaScale || rule.minimum == null) return unknown("Check the GPA value and the source threshold.");
    const pass = profile.gpa >= rule.minimum;
    return { ...base, state: pass ? "pass" : "fail", explanation: `Your GPA ${profile.gpa} ${pass ? "meets" : "is below"} the stated ${rule.minimum}/${rule.scale} minimum. Meeting a minimum does not guarantee selection.` };
  }
  const raw = profile[rule.field];
  if (raw == null || String(raw).trim() === "") return unknown(`Add ${profileLabels[rule.field].toLowerCase()} to check this requirement.`);
  if (rule.field === "school") {
    if (!profile.enrollmentStatus) return unknown("A school name alone does not confirm current enrollment or admission.", "Your enrollment/admission status");
    const mine = normalizeSchool(String(raw));
    const wanted = (rule.values ?? []).map(normalizeSchool);
    if (wanted.includes(mine)) return { ...base, state: "pass", explanation: "Your declared college matches the source's named institution." };
    // Abbreviations and overlapping campus names are not safe mismatch evidence.
    const words = (v: string) => v.split(" ").filter(w => !["university", "college", "of", "the", "at", "in", "state", "school", "institute"].includes(w));
    if (mine.split(" ").length < 2 || wanted.some(s => words(s).some(w => words(mine).includes(w)))) return unknown("The institution names may be aliases or related campuses. Confirm the exact eligible institution.", "Exact college/campus match");
    return { ...base, state: "fail", explanation: "Your declared college does not match the institution named by this requirement." };
  }
  const normalized = String(raw).trim().toLowerCase();
  if (rule.field === "workAuth" && !["us_citizen", "permanent_resident", "needs_sponsorship"].includes(normalized)) return unknown("Confirm your work authorization using a supported profile value.");
  if (rule.field === "residency" && normalized.length <= 3) return unknown("Use the full state/region name so an abbreviation is not mistaken for a mismatch.", "Full state of residence");
  const pass = (rule.values ?? []).some(v => v.toLowerCase() === normalized);
  return { ...base, state: pass ? "pass" : "fail", explanation: pass ? "Your declared information meets this stated requirement." : "Your declared information conflicts with this mandatory requirement." };
}

export function evaluateRule(rule: RequirementRule, profile: ScoreProfile): EligibilityCheck {
  if (rule.type === "criterion") return checkCriterion(rule, profile);
  if (rule.type === "manual") return { id: rule.id, label: rule.label, state: "unknown", explanation: "This requirement needs your review at the source; it has not been verified automatically.", evidence: rule.evidence, missingField: "Source eligibility review" };
  const children = rule.children.map(child => evaluateRule(child, profile));
  const state = !children.length ? "unknown" : rule.type === "all"
    ? children.some(child => child.state === "fail") ? "fail" : children.every(child => child.state === "pass") ? "pass" : "unknown"
    : children.some(child => child.state === "pass") ? "pass" : children.every(child => child.state === "fail") ? "fail" : "unknown";
  return { id: rule.id, label: rule.label, state, explanation: rule.type === "all" ? "All stated conditions must be met." : "At least one of these alternatives must be met.", evidence: null, children };
}
function flatten(check: EligibilityCheck): EligibilityCheck[] { return check.children ? check.children.flatMap(flatten) : [check]; }
export function evaluateEligibility(rule: RequirementRule, profile: ScoreProfile): EligibilityResult {
  const root = evaluateRule(rule, profile);
  return { state: root.state, label: root.state === "pass" ? "Meets stated requirements" : root.state === "fail" ? "Not eligible for a stated requirement" : "Check eligibility", checks: root.children ?? [root], missing: unique(flatten(root).flatMap(check => check.missingField ? [check.missingField] : [])) };
}

export interface OpportunityScoringInput {
  kind: "internship" | "scholarship";
  title: string;
  fieldKeys: string[];
  skills: string[];
  locations: string[];
  isRemote: boolean;
  facts: OpportunityFacts;
  url: string;
  observedAt: string;
  deadlineAt?: Date | null;
  amountMin?: number | null;
  amountMax?: number | null;
  amountStatus?: string;
  closed?: boolean;
  meritOnly?: boolean;
}
function factor(id: FitFactor["id"], label: string, weight: number, value: number | null, explanation: string, evidence: SourceEvidence[] = []): FitFactor {
  return { id, label, weight, value, earned: value === null ? null : Math.round(weight * value * 100) / 100, explanation, evidence };
}
function skillMatch(mine: string[], required: string[], preferred: string[], named: string[]) {
  const normalize = (v: string) => v.toLowerCase().trim();
  const owned = new Set(mine.map(normalize));
  const requiredSet = new Set(required.map(normalize));
  const targets = unique([...required, ...preferred, ...named].map(normalize));
  const total = targets.reduce((sum, skill) => sum + (requiredSet.has(skill) ? 2 : 1), 0);
  const matched = targets.filter(skill => owned.has(skill));
  const earned = matched.reduce((sum, skill) => sum + (requiredSet.has(skill) ? 2 : 1), 0);
  return { value: !mine.length || !total ? null : earned / total, matched, missing: targets.filter(skill => !owned.has(skill)) };
}
export function profileHasScoringEvidence(profile: ScoreProfile): boolean {
  return Boolean(profile.major?.trim() || profile.school?.trim() || profile.gpa != null || profile.gradYear || profile.workAuth || profile.educationLevel || profile.enrollmentStatus || profile.residency?.trim() || profile.skills?.length || profile.targetVerticals?.length || profile.targetLocations?.length);
}

export function scoreOpportunity(profile: ScoreProfile, input: OpportunityScoringInput, now = new Date()): FitResult {
  const eligibility = evaluateEligibility(input.facts.rules, profile);
  if (input.closed) {
    eligibility.state = "fail"; eligibility.label = "Application cycle is closed";
    eligibility.checks.push({ id: "closed-cycle", label: "Current application availability", state: "fail", explanation: "This source listing is closed. Check the official page for a new cycle.", evidence: { quote: null, url: input.url, observedAt: input.observedAt, field: "closedAt", status: "normalized" } });
  }
  const mine = fieldsForProfile(profile);
  const fieldKnown = mine.length > 0 && input.fieldKeys.length > 0;
  const fieldValue = fieldKnown ? input.fieldKeys.some(field => mine.includes(field as typeof mine[number])) ? 1 : 0 : null;
  const proof: SourceEvidence = { quote: input.title, url: input.url, observedAt: input.observedAt, field: "title", status: "stated" };
  const skills = skillMatch(profile.skills ?? [], input.facts.requiredSkills, input.facts.preferredSkills, input.skills);
  const experience = skillMatch(profile.experienceSkills ?? [], input.facts.requiredSkills, input.facts.preferredSkills, input.skills);
  const sourceSkills: SourceEvidence = { quote: null, url: input.url, observedAt: input.observedAt, field: "skills", status: "normalized" };
  const targets = profile.targetLocations ?? [];
  const locationKnown = targets.length > 0 && (input.locations.length > 0 || input.isRemote);
  const locationHit = input.isRemote && profile.openToRemote !== false || input.locations.some(location => targets.some(target => location.toLowerCase().includes(target.toLowerCase()) || target.toLowerCase().includes(location.toLowerCase())));
  const preferenceValue = locationKnown ? locationHit ? 1 : .2 : null;
  const checks = eligibility.checks.flatMap(flatten);
  const knownChecks = (fields: string[]) => checks.filter(check => check.field && fields.includes(check.field) && check.state !== "unknown");
  const gradeChecks = knownChecks(["gpa"]);
  const schoolChecks = knownChecks(["school", "educationLevel", "enrollmentStatus"]);
  const checkValue = (rows: EligibilityCheck[]) => rows.length ? rows.filter(row => row.state === "pass").length / rows.length : null;
  const fieldFactor = factor("field", input.kind === "internship" ? "Role and field alignment" : "Field and mission alignment", input.kind === "internship" ? 20 : 35, fieldValue,
    fieldValue === null ? "A recognized field is needed on both the profile and the opportunity." : fieldValue === 1 ? "The source's field aligns with your stated major or interests." : "The source's field differs from your major/interests; this is a fit preference, not an eligibility failure.", [proof, ...input.facts.evidence]);
  const preference = factor("preferences", "Location and work-style preferences", 15, preferenceValue,
    preferenceValue === null ? "Location preferences or source location details are missing." : locationHit ? "The location or remote arrangement matches your preferences." : "This location is outside your preferences. That does not make you ineligible.", [{ ...proof, quote: null, field: "locations / isRemote", status: "normalized" }]);
  let factors = input.kind === "internship" ? [
    factor("skills", "Named skill alignment", 40, skills.value, skills.value === null ? "Add resume skills; the opportunity must also name skills." : `${skills.matched.length} of ${skills.matched.length + skills.missing.length} named skills appear on your resume. Explicitly required skills carry twice the weight of preferred or unclassified skills.`, [sourceSkills]),
    factor("experience", "Project and experience evidence", 25, experience.value, experience.value === null ? "No comparable project/role skill evidence is available. A skills-section claim alone does not establish experience." : `${experience.matched.length} named skills are supported by project or experience text in your resume. This does not infer years of experience.`, [sourceSkills]),
    fieldFactor, preference,
  ] : [
    fieldFactor,
    factor("achievement", "Published academic requirements", 30, checkValue(gradeChecks), gradeChecks.length ? "Checks only whether you meet a published academic threshold; higher GPA does not imply better winning odds." : "No comparable published achievement criterion is available. GPA without a stated requirement earns no points.", gradeChecks.flatMap(check => check.evidence ? [check.evidence] : [])),
    factor("education", "College and program alignment", 20, checkValue(schoolChecks), schoolChecks.length ? "Compares your declared institution/enrollment with the source's named requirements." : "The source or profile does not provide comparable institution/enrollment requirements.", schoolChecks.flatMap(check => check.evidence ? [check.evidence] : [])),
    preference,
  ];

  const merit = input.kind === "scholarship" && (input.meritOnly || profile.collegeMerit || /\bmerit\b/i.test(input.title));
  const rubric = input.facts.meritRubric;
  const usableRubric = Boolean(merit && rubric && profile.gpa != null && profile.gpaScale === rubric.gpaScale && profile.gpa <= profile.gpaScale);
  let rubricScore: number | null = null;
  if (usableRubric && rubric) {
    const row = [...rubric.rows].sort((a, b) => b.minimumGpa - a.minimumGpa).find(band => (profile.gpa as number) >= band.minimumGpa);
    // A student below the lowest published band has no published result, not zero points.
    if (row) {
      rubricScore = Math.round(row.points / rubric.maxPoints * 100);
      factors = [factor("achievement", "Published institution rubric", 100, row.points / rubric.maxPoints, `${row.points} of ${rubric.maxPoints} source-published points for the matching GPA band. This is not a guaranteed award.`, [{ quote: rubric.quote, url: rubric.sourceUrl, observedAt: input.observedAt, field: "meritRubric", status: "stated" }])];
    }
  }
  const known = factors.filter(value => value.value !== null);
  const knownWeight = known.reduce((sum, value) => sum + value.weight, 0);
  const totalWeight = factors.reduce((sum, value) => sum + value.weight, 0);
  const coverage = totalWeight ? Math.round(knownWeight / totalWeight * 100) : 0;
  const rawFit = knownWeight ? Math.round(known.reduce((sum, value) => sum + value.weight * (value.value as number), 0) / knownWeight * 100) : null;
  // Skill-list overlap and project support share one opportunity-side signal.
  const independent = new Set(known.map(value => value.id === "skills" || value.id === "experience" ? "skill-evidence" : value.id)).size;
  const enough = rubricScore !== null || independent >= 2 && coverage >= 50;
  const hasProfile = profileHasScoringEvidence(profile);
  const scoreNote = !hasProfile ? "Add relevant profile details to start matching." : merit && rubricScore === null ? "No usable published merit scoring rubric is available. Review the eligibility checks; no university award formula has been invented." : !enough ? "More independent evidence is needed before showing a numerical fit." : null;
  const displayFit = hasProfile && enough && (!merit || rubricScore !== null) && eligibility.state !== "fail" ? rubricScore ?? rawFit : null;
  const confidence = { level: rubricScore !== null || coverage >= 80 && independent >= 3 ? "high" : coverage >= 50 && independent >= 2 ? "medium" : "low", coverage, known: known.length, total: factors.length, independent } as const;
  const effort = estimateEffort({ essays: input.facts.essays, letters: input.facts.letters, extraDocuments: input.facts.extraDocuments });
  const mode = profile.priority ?? "fit";
  let rank = rawFit === null ? 50 : 50 + coverage / 100 * (rawFit - 50);
  const priorityReasons: string[] = ["Personal fit is adjusted for the amount of supporting evidence."];
  if (mode === "deadline" && input.deadlineAt) {
    const days = (input.deadlineAt.getTime() - now.getTime()) / 86_400_000;
    if (days >= 0) { rank += 10 * Math.max(0, 1 - days / 60); priorityReasons.push("Your deadline preference adds a bounded priority boost. It does not change fit."); }
    if (effort && days * 24 < effort.hours) { rank -= 10; priorityReasons.push("The remaining time is shorter than the estimated application workload."); }
  }
  const award = input.amountStatus === "exact" || input.amountStatus === "range" ? input.amountMin ?? input.amountMax : null;
  if (mode === "award" && award != null && Number.isFinite(award) && award >= 0 && input.kind === "scholarship") { rank += Math.min(10, Math.log10(1 + award) * 2); priorityReasons.push("Your award-value preference affects priority, not personal fit or winning odds."); }
  if (mode === "effort") {
    if (effort) { rank += 10 / (1 + effort.hours); priorityReasons.push("Estimated workload is used for your lower-effort preference."); }
    else priorityReasons.push("Essay/recommendation counts are unknown, so this application is not assumed to be easy.");
  }
  if (input.closed) { rank -= 25; priorityReasons.push("This listing is closed; confirm a new application cycle at the source."); }
  const assessment: ScoringAssessment = { version: SCORING_VERSION, model: merit ? "college-merit" : input.kind, hasProfile, eligibility, factors, rawFit, displayFit, confidence, scoreNote, priority: { mode, rank, reasons: priorityReasons, estimatedHours: effort?.hours ?? null } };
  return {
    score: displayFit, blocked: eligibility.state === "fail", knownDimensions: known.length, totalDimensions: factors.length,
    reasons: factors.map(value => ({ label: value.value === null ? `${value.label}: unknown` : value.value >= .7 ? value.label : `${value.label}: partial match`, dimension: value.id === "field" ? "field" : value.id === "skills" || value.id === "experience" ? "skills" : value.id === "preferences" ? "location" : "field", kind: value.value === null ? "unknown" : value.value >= .7 ? "good" : "bad", detail: value.explanation })),
    skills: { matched: skills.matched, missing: skills.missing }, assessment,
  };
}

export function eligibilityOrder(assessment?: ScoringAssessment): number { return !assessment ? 1 : assessment.eligibility.state === "pass" ? 0 : assessment.eligibility.state === "fail" ? 2 : 1; }
