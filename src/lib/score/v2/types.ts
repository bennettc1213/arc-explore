export const SCORING_VERSION = "instela-fit-v2.0";

export type CheckState = "pass" | "fail" | "unknown";
export type RequirementField = "gpa" | "school" | "workAuth" | "educationLevel" | "enrollmentStatus" | "residency";
export interface SourceEvidence {
  quote: string | null;
  url: string;
  observedAt: string;
  field: string;
  status: "stated" | "normalized" | "conflicting";
}
export interface Criterion {
  type: "criterion";
  id: string;
  field: RequirementField;
  label: string;
  values?: string[];
  minimum?: number;
  scale?: number | null;
  evidence: SourceEvidence;
}
export interface RuleGroup {
  type: "all" | "any";
  id: string;
  label: string;
  children: RequirementRule[];
}
export interface ManualRule { type: "manual"; id: string; label: string; evidence: SourceEvidence }
export type RequirementRule = Criterion | RuleGroup | ManualRule;
export interface EligibilityCheck {
  field?: RequirementField;
  id: string;
  label: string;
  state: CheckState;
  explanation: string;
  evidence: SourceEvidence | null;
  missingField?: string;
  children?: EligibilityCheck[];
}
export interface EligibilityResult {
  state: CheckState;
  label: string;
  checks: EligibilityCheck[];
  missing: string[];
}
export type FactorId = "skills" | "experience" | "field" | "preferences" | "achievement" | "education";
export interface FitFactor {
  id: FactorId;
  label: string;
  weight: number;
  value: number | null;
  earned: number | null;
  explanation: string;
  evidence: SourceEvidence[];
}
export interface MeritRubric {
  sourceUrl: string;
  quote: string;
  gpaScale: number;
  maxPoints: number;
  rows: Array<{ minimumGpa: number; points: number }>;
}
export interface OpportunityFacts {
  rules: RequirementRule;
  evidence: SourceEvidence[];
  requiredSkills: string[];
  preferredSkills: string[];
  essays: number | null;
  letters: number | null;
  extraDocuments: number | null;
  automaticConsideration: boolean | null;
  meritRubric: MeritRubric | null;
}
export interface ScoringAssessment {
  version: string;
  model: "internship" | "scholarship" | "college-merit";
  hasProfile: boolean;
  eligibility: EligibilityResult;
  factors: FitFactor[];
  rawFit: number | null;
  displayFit: number | null;
  confidence: { level: "low" | "medium" | "high"; coverage: number; known: number; total: number; independent: number };
  scoreNote: string | null;
  priority: { mode: "fit" | "deadline" | "award" | "effort"; rank: number; reasons: string[]; estimatedHours: number | null };
}
/** This is the ONLY v2 shape allowed into browser payloads. No hidden raw fit or rank. */
export interface PresentedAssessment {
  version: string;
  model: ScoringAssessment["model"];
  hasProfile: boolean;
  eligibility: EligibilityResult;
  confidence: ScoringAssessment["confidence"];
  scoreNote: string | null;
  factors: FitFactor[];
  breakdownLocked: boolean;
  priority: { mode: ScoringAssessment["priority"]["mode"]; reasons: string[]; estimatedHours: number | null };
}
