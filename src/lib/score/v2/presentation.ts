import type { PresentedAssessment, ScoringAssessment } from "./types";

export function presentAssessment(value: ScoringAssessment, showBreakdown: boolean): PresentedAssessment {
  return {
    version: value.version, model: value.model, hasProfile: value.hasProfile,
    eligibility: value.eligibility, confidence: value.confidence, scoreNote: value.scoreNote,
    factors: showBreakdown ? value.factors : [], breakdownLocked: !showBreakdown,
    priority: { mode: value.priority.mode, reasons: value.priority.reasons, estimatedHours: value.priority.estimatedHours },
  };
}
