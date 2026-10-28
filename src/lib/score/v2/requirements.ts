import { z } from "zod";
import { extractSkills } from "../skills";
import type { Criterion, OpportunityFacts, RequirementRule, SourceEvidence } from "./types";

const rubricSchema = z.object({
  sourceUrl: z.string().url(), quote: z.string().trim().min(10),
  gpaScale: z.number().min(1).max(5), maxPoints: z.number().positive().max(1000),
  rows: z.array(z.object({ minimumGpa: z.number().nonnegative(), points: z.number().nonnegative() })).min(1).max(30),
}).superRefine((rubric, ctx) => {
  if (rubric.rows.some(row => row.minimumGpa > rubric.gpaScale || row.points > rubric.maxPoints)) ctx.addIssue({ code: "custom", message: "Rubric values exceed the published scales" });
  const sorted = [...rubric.rows].sort((a, b) => a.minimumGpa - b.minimumGpa);
  if (new Set(sorted.map(row => row.minimumGpa)).size !== sorted.length || sorted.some((row, i) => i > 0 && row.points < sorted[i - 1].points)) ctx.addIssue({ code: "custom", message: "Ambiguous or non-monotonic rubric" });
});

export function normalizeSchool(value: string): string {
  return value.toLowerCase().normalize("NFKC").replace(/[’']/g, "").replace(/[.,]/g, " ").replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
}

function count(text: string, subject: "essay" | "letter"): number | null {
  const noun = subject === "essay" ? "essays?|personal statements?" : "(?:recommendation |reference )?letters?(?: of recommendation| of reference)?";
  if (new RegExp(`\\bno (?:${noun})(?: (?:are |is )?required)?\\b`, "i").test(text)) return 0;
  const match = text.match(new RegExp(`\\b(\\d{1,2}|one|two|three|four|five)\\s+(?:${noun})\\b`, "i"));
  if (!match) return null;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  return words[match[1].toLowerCase()] ?? Number(match[1]);
}

/** Conservative, read-time extraction. Unparsed prose remains a manual check. */
export function extractOpportunityFacts(input: {
  title: string; criteria: string[]; url: string; observedAt: string; workAuth?: string | null; structuredRubric?: unknown;
}): OpportunityFacts {
  const rules: RequirementRule[] = [];
  const evidence: SourceEvidence[] = [];
  const requiredSkills = new Set<string>(), preferredSkills = new Set<string>();
  const source = input.criteria.slice(0, 60).map(line => line.slice(0, 12000));

  for (const [index, quote] of source.entries()) {
    const proof: SourceEvidence = { quote, url: input.url, observedAt: input.observedAt, field: `eligibility.criteria[${index}]`, status: "stated" };
    evidence.push(proof);
    const id = `criterion-${index}`;
    const found: Criterion[] = [];
    const add = (rule: Omit<Criterion, "type" | "id" | "evidence">) => found.push({ ...rule, type: "criterion", id: `${id}-${found.length}`, evidence: proof });
    const optional = /\b(preferred|recommended|encouraged|optional|not required)\b/i.test(quote);
    const mandatory = !optional && /\b(must|required|minimum|at least|no less than|only|open to|available to|eligible applicants|applicants? (?:should|need|are)|enrolled|GPA)\b/i.test(quote);
    const skills = extractSkills(quote);
    if (/\b(required|requirements|must (?:know|have|demonstrate))\b/i.test(quote) && !optional) skills.forEach(skill => requiredSkills.add(skill));
    if (optional) skills.forEach(skill => preferredSkills.add(skill));

    const gpa = quote.match(/(?:minimum\s+|at least\s+|no less than\s+)?(\d(?:\.\d{1,2})?)\s*(?:\/\s*\d(?:\.\d+)?)?\s*(?:cumulative\s+)?GPA\b/i)
      ?? quote.match(/\bGPA\s*(?:of\s*|[:=]\s*|(?:at least|minimum(?: of)?|no less than)\s*)?(\d(?:\.\d{1,2})?)/i);
    const scale = quote.match(/(?:\/\s*|(?:on a|on the|out of)\s+)([345](?:\.\d+)?)\s*(?:point\s*)?(?:scale)?/i);
    const minimumGpa = /\b(minimum|at least|no less than|or higher|or above)\b|GPA\s*(?:>=|≥)/i.test(quote) && !/\b(maximum|at most|no higher than|below)\b/i.test(quote);
    if (mandatory && minimumGpa && gpa && Number(gpa[1]) <= 5) add({ field: "gpa", label: `Minimum GPA ${gpa[1]}`, minimum: Number(gpa[1]), scale: scale ? Number(scale[1]) : null });

    const school = quote.match(/\b(?:enrolled|attending|admitted|accepted)\s+(?:(?:as (?:a |an )?(?:student|undergraduate|graduate)|(?:full|part)[- ]time)\s+)?(?:at|to|in)\s+(.+?)(?:[.;]|,?\s+(?:and|with|who|for|by|having)\b|$)/i);
    if (mandatory && school && /\b(university|college|institute|school)\b/i.test(school[1]) && !/\b(any|accredited|eligible|participating|a |an |or equivalent)\b/i.test(school[1])) {
      const values = school[1].split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
      add({ field: "school", label: "Required college or university", values });
      add({ field: "enrollmentStatus", label: "Enrollment or admission status", values: /enrolled|attending/i.test(school[0]) ? ["enrolled"] : ["admitted", "enrolled", "incoming"] });
    }
    if (mandatory && /\b(?:must be|open to|only|restricted to|eligible applicants are)\s+(?:an?\s+)?(?:U\.?S\.?|United States) citizens?\b/i.test(quote)) add({ field: "workAuth", label: "U.S. citizenship required", values: ["us_citizen"] });
    if (mandatory && /\b(?:must|open to|only|restricted to)\b/i.test(quote)) {
      const levels: string[] = [];
      if (/\bhigh school (?:students?|seniors?)\b/i.test(quote)) levels.push("high_school");
      if (/\bundergraduate(?: students?)?\b/i.test(quote)) levels.push("undergraduate");
      if (/(?<!under)\bgraduate students?\b/i.test(quote)) levels.push("graduate");
      if (levels.length) add({ field: "educationLevel", label: "Required education level", values: levels });
    }
    const residence = quote.match(/\bmust be (?:a |an )?resident(?:s)? of ([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?:[.,;]|$)/);
    if (residence) add({ field: "residency", label: `Residency in ${residence[1]}`, values: [residence[1]] });

    // Cross-field OR cannot be flattened into AND. Keep the complete sentence unknown.
    const knownSchoolAlternatives = school?.[1].includes(" or ") && found.length === 2 && found.every(rule => rule.field === "school" || rule.field === "enrollmentStatus");
    const knownLevelAlternatives = found.length === 1 && found[0].field === "educationLevel" && /undergraduate(?: students?)? or graduate students?/i.test(quote);
    const crossFieldOr = /\bor\b/i.test(quote) && !/\bor (?:higher|above|greater)\b/i.test(quote) && !knownSchoolAlternatives && !knownLevelAlternatives;
    const hasNegation = /\b(?:not eligible|must not|except|unless|excluding)\b/i.test(quote);
    if (crossFieldOr || hasNegation) {
      rules.push({ type: "manual", id, label: "Review this eligibility condition", evidence: proof });
      continue;
    }
    rules.push(...found);
    // Additional prose or compound conditions may carry requirements we did not parse.
    let residual = quote;
    if (school && found.some(rule => rule.field === "school")) residual = residual.replace(school[0], " ");
    if (residence) residual = residual.replace(residence[0], " ");
    if (found.some(rule => rule.field === "workAuth")) residual = residual.replace(/(?:U\.?S\.?|United States) citizens?/gi, " ");
    if (found.some(rule => rule.field === "educationLevel")) residual = residual.replace(/high school (?:students?|seniors?)|undergraduate(?: students?)?|graduate students?/gi, " ");
    const grammar = new Set(["applicant", "applicants", "student", "students", "you", "must", "should", "need", "be", "have", "maintain", "a", "an", "the", "minimum", "cumulative", "overall", "gpa", "of", "at", "least", "on", "out", "scale", "point", "or", "higher", "above", "no", "less", "than", "is", "are", "required", "currently", "only", "open", "available", "to", "eligible"]);
    const unparsed = residual.replace(/\b[0-5](?:\.\d+)?\b/g, " ").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).some(word => !grammar.has(word));
    const additional = /\b(and|also|financial need|leadership|community service|first[- ]generation|renewal|renewable)\b/i.test(quote);
    if (!found.length || additional || unparsed) rules.push({ type: "manual", id: `${id}-review`, label: "Review the full source requirement", evidence: proof });
  }
  if (input.workAuth === "citizenship_required" || input.workAuth === "no_sponsorship") {
    const proof: SourceEvidence = { quote: null, url: input.url, observedAt: input.observedAt, field: "workAuth", status: "normalized" };
    evidence.push(proof);
    rules.push({ type: "criterion", id: "source-work-auth", field: "workAuth", label: input.workAuth === "citizenship_required" ? "U.S. citizenship required" : "Visa sponsorship not offered", values: input.workAuth === "citizenship_required" ? ["us_citizen"] : ["us_citizen", "permanent_resident"], evidence: proof });
  }
  if (source.length === 0) rules.push({ type: "manual", id: "source-coverage", label: "Full eligibility requirements need a source check", evidence: { quote: null, url: input.url, observedAt: input.observedAt, field: "eligibility", status: "normalized" } });
  const criteria = rules.filter((rule): rule is Criterion => rule.type === "criterion");
  for (const rule of criteria) {
    for (const other of criteria) {
      if (rule === other || rule.field !== other.field) continue;
      const scaleConflict = rule.field === "gpa" && rule.scale && other.scale && rule.scale !== other.scale;
      const valuesConflict = rule.values && other.values && !rule.values.some(v => other.values?.some(w => normalizeSchool(v) === normalizeSchool(w)));
      if (scaleConflict || valuesConflict) { rule.evidence.status = "conflicting"; other.evidence.status = "conflicting"; }
    }
  }
  const rubric = rubricSchema.safeParse(input.structuredRubric);
  const meritRubric = rubric.success && rubric.data.sourceUrl === input.url ? rubric.data : null;
  const text = source.join("\n");
  return {
    rules: { type: "all", id: "eligibility", label: "Stated eligibility", children: rules }, evidence,
    requiredSkills: [...requiredSkills], preferredSkills: [...preferredSkills],
    essays: count(text, "essay"), letters: count(text, "letter"),
    extraDocuments: text ? ["transcript", "portfolio"].filter(word => new RegExp(`\\b${word}\\b`, "i").test(text)).length : null,
    automaticConsideration: /automatically considered|automatic consideration/i.test(text) ? true : /separate application (?:is )?required/i.test(text) ? false : null,
    meritRubric,
  };
}
