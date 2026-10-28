import Link from "next/link";
import type { EligibilityCheck, PresentedAssessment } from "@/lib/score/v2/types";
import { Icon } from "@/components/ui/Icon";

function sourceField(field: string) { return field === "workAuth" ? "work authorization" : field === "skills" ? "named skills" : field.includes("location") ? "location and work arrangement" : field === "closedAt" ? "application availability" : "listing requirements"; }

function Check({ check }: { check: EligibilityCheck }) {
  return <li className={`scoring-check check-${check.state}`}>
    <div><span className="scoring-check-state">{check.state === "pass" ? "Meets" : check.state === "fail" ? "Conflict" : "Check"}</span><strong>{check.label}</strong></div>
    <p>{check.explanation}</p>
    {check.evidence && <details className="scoring-source"><summary>Source evidence</summary>{check.evidence.quote ? <blockquote>{check.evidence.quote}</blockquote> : <p>Based on the source&apos;s {sourceField(check.evidence.field)} details. Open the original page to confirm.</p>}<a href={check.evidence.url} target="_blank" rel="noopener noreferrer">Open original source<Icon name="external" size={11} /></a><span>Observed {check.evidence.observedAt.slice(0, 10)} · {check.evidence.status === "conflicting" ? "Conflicting information" : "Source-backed details"}</span></details>}
    {check.children && <ul>{check.children.map(child => <Check key={child.id} check={child} />)}</ul>}
  </li>;
}

export function ScoringDetails({ assessment }: { assessment: PresentedAssessment }) {
  return <div className="scoring-assessment" data-scoring-version={assessment.version}>
    <div className={`scoring-summary eligibility-${assessment.eligibility.state}`}><span><Icon name={assessment.eligibility.state === "pass" ? "check" : "info"} size={15} />{assessment.eligibility.label}</span><span>{assessment.confidence.level} fit evidence · {assessment.confidence.coverage}% coverage</span></div>
    {assessment.scoreNote && <p className="scoring-note">{assessment.scoreNote}</p>}
    <details className="scoring-breakdown"><summary>Why this match?<Icon name="chevron" size={14} /></summary>
      <div className="scoring-breakdown-body">
        <h3>Eligibility checks</h3><ul className="scoring-checks">{assessment.eligibility.checks.map(check => <Check key={check.id} check={check} />)}</ul>
        <h3>Personal fit</h3>
        {assessment.breakdownLocked ? <p className="scoring-note">Full numerical factor breakdowns are on the Apply plan. Eligibility and evidence coverage remain visible. <Link href="/pricing">View plans</Link></p> : <div className="scoring-factors">{assessment.factors.map(factor => <div key={factor.id} className="scoring-factor"><div><strong>{factor.label}</strong><span>{factor.value === null ? "Unknown" : `${factor.earned} / ${factor.weight} weighted points`}</span></div><p>{factor.explanation}</p>{factor.value !== null && <div className="scoring-factor-bar" aria-hidden="true"><span style={{ width: `${factor.value * 100}%` }} /></div>}{factor.evidence.length > 0 && <details className="scoring-source"><summary>Evidence for this factor</summary>{factor.evidence.slice(0, 5).map((evidence, index) => <div key={index}>{evidence.quote ? <blockquote>{evidence.quote}</blockquote> : <p>Normalized source field: {evidence.field}</p>}<a href={evidence.url} target="_blank" rel="noopener noreferrer">View source<Icon name="external" size={11} /></a></div>)}</details>}</div>)}</div>}
        {assessment.eligibility.missing.length > 0 && <><h3>Still needed to check requirements</h3><ul className="scoring-missing">{assessment.eligibility.missing.map(field => <li key={field}>{field}</li>)}</ul></>}
        <h3>Application priority</h3><p className="scoring-note">Preference: {assessment.priority.mode === "fit" ? "best supported fit" : assessment.priority.mode === "award" ? "award value" : assessment.priority.mode === "effort" ? "lower estimated workload" : "nearer deadlines"}. {assessment.priority.estimatedHours !== null ? `Estimated application workload: ~${assessment.priority.estimatedHours} hours.` : "Application workload is unknown."}</p><ul className="scoring-missing">{assessment.priority.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        <p className="scoring-version">Fit and priority are not probabilities of selection. Unknown requirements still need your review.</p>
      </div>
    </details>
  </div>;
}
