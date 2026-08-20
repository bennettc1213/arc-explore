"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  markAppliedAction,
  saveApplyFieldAction,
  type ApplyActionState,
} from "@/app/listing/[id]/apply/actions";
import type { PacketField } from "@/lib/apply/packet";
import {
  planApplySteps,
  progressLabel,
  progressOf,
  promptForField,
  type ApplyPlan,
  type PromptTarget,
} from "@/lib/apply/wizard";

/* ------------------------------------------------------------------ *
 * What the server hands us
 * ------------------------------------------------------------------ */

export interface WizardBoot {
  postingId: string;
  postingTitle: string;
  postingUrl: string;
  kind: string;
  /** The packet's fact fields, for the review step. */
  fields: PacketField[];
  attestations: PacketField[];
  letterState: "none" | "slots" | "ready";
  /** The profile fields the wizard can write back, current values — so the
   *  prompt inputs open pre-filled rather than blank. */
  current: Record<string, string>;
}

const IDLE: ApplyActionState = { status: "idle" };

/* ------------------------------------------------------------------ *
 * The wizard
 * ------------------------------------------------------------------ */

/**
 * One-button apply, as an animated modal on the listing page.
 *
 * A progress bar advances through the step plan and PAUSES wherever the plan
 * says the student must act — answer a gap, confirm an attestation, fill a
 * letter's slots. The bar is a map of what is done, never a spinner: it moves
 * only when a step is actually completed, which is the difference between
 * "the application is being filled out" and "you are being asked the three
 * things only you know."
 *
 * Motion language matches the rest of the app: square corners, pixel-stepped
 * bar segments, the one accent, and a 1px press on buttons. The entrance is
 * the app's standard ease-out; everything collapses to instant under
 * prefers-reduced-motion via the global rule.
 */
export function ApplyWizard({ boot }: { boot: WizardBoot }) {
  const [open, setOpen] = useState(false);

  // The plan is recomputed whenever the server re-renders with new data (a
  // gap answer revalidates the page, so a re-opened wizard sees the fill).
  const plan: ApplyPlan = useMemo(
    () =>
      planApplySteps(
        { fields: boot.fields, attestations: boot.attestations, known: 0, total: 0 },
        boot.letterState,
      ),
    [boot],
  );

  // completedKinds tracks which step indexes are done, in order. The bar
  // position is derived, never set directly — one source of truth.
  const [completed, setCompleted] = useState(0);
  const active = plan.steps[completed] ?? null;
  const waitingOn = active && active.pauses ? active : null;
  const done = completed >= plan.steps.length;

  // The confirmation draft arrives from markAppliedAction on the final step.
  const [applyState, applyAction] = useActionState(markAppliedAction, IDLE);
  const confirmation = applyState.confirmation ?? null;

  const advance = () => setCompleted((c) => Math.min(plan.steps.length, c + 1));

  // Close on Escape — the modal traps nothing and must not.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-primary press" onClick={() => setOpen(true)}>
        apply with arc explorer
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="apply with arc explorer"
          className="wizard-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="wizard-panel">
            <div className="flex items-baseline justify-between gap-4" style={{ marginBottom: 18 }}>
              <div>
                <div className="eyebrow chrome">apply with arc explorer</div>
                <div className="t-base" style={{ marginTop: 8, color: "var(--text)" }}>
                  {boot.postingTitle}
                </div>
              </div>
              <button type="button" className="mono press" onClick={() => setOpen(false)}
                style={{ color: "var(--faint-readable)", background: "none", border: "none", cursor: "pointer" }}>
                esc — close
              </button>
            </div>

            {/* The bar. Fills by completed-step fraction; the active segment
                carries the animated sheen so the eye lands on what's next. */}
            <div className="wizard-bar" role="progressbar"
              aria-valuenow={Math.round(progressOf(completed, plan.steps.length) * 100)}
              aria-valuemin={0} aria-valuemax={100}
              aria-label={progressLabel(completed, plan.steps, waitingOn)}>
              <div
                className={`wizard-bar-fill${waitingOn ? " is-waiting" : ""}`}
                style={{ width: `${progressOf(completed, plan.steps.length) * 100}%` }}
              />
            </div>
            <div className="mono" style={{ marginTop: 8, color: "var(--faint-readable)" }}>
              {progressLabel(completed, plan.steps, waitingOn)}
            </div>

            <div style={{ marginTop: 22 }}>
              {done ? (
                confirmation ? (
                  <ConfirmationView confirmation={confirmation} />
                ) : (
                  <SubmittedStep boot={boot} action={applyAction} state={applyState} />
                )
              ) : (
                <StepView step={active} boot={boot} onAdvance={advance} onClose={() => setOpen(false)} />
              )}
            </div>

            {/* The step map, so the pauses are visible ahead rather than a
                surprise. The one thing a progress bar owes the user. */}
            <div className="mono" style={{ marginTop: 24, color: "var(--faint)" }}>
              {plan.steps.map((s, i) => (
                <span key={i} style={{
                  color: i < completed ? "var(--accent-lite)" : i === completed ? "var(--text)" : "var(--faint)",
                  marginRight: 12,
                }}>
                  {i < completed ? "■" : "□"} {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Per-step bodies
 * ------------------------------------------------------------------ */

function StepView({
  step,
  boot,
  onAdvance,
  onClose,
}: {
  step: ReturnType<typeof planApplySteps>["steps"][number] | null;
  boot: WizardBoot;
  onAdvance: () => void;
  onClose: () => void;
}) {
  if (!step) return null;

  switch (step.kind) {
    case "gap":
      return <GapStep step={step} boot={boot} onAdvance={onAdvance} />;
    case "review":
      return <ReviewStep boot={boot} onAdvance={onAdvance} onClose={onClose} />;
    case "handoff":
      return <HandoffStep boot={boot} onAdvance={onAdvance} />;
  }
}

function ReviewStep({
  boot,
  onAdvance,
  onClose,
}: {
  boot: WizardBoot;
  onAdvance: () => void;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const held = boot.fields.filter((f) => f.value !== null);
  const notes = boot.fields
    .filter((f) => f.value === null)
    .map((f) => promptForField(f))
    .filter((p): p is PromptTarget => Boolean(p && p.profileField === null));

  const letter =
    boot.letterState === "ready"
      ? { status: "attached", cta: "review it" }
      : boot.letterState === "slots"
        ? { status: "attached · gaps to fill", cta: "fill the gaps" }
        : { status: "not attached yet", cta: "draft it" };

  return (
    <div>
      <div className="mono-strong" style={{ color: "var(--text)" }}>
        ready to apply
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "56ch" }}>
        Everything below is already assembled for you. Check it, then open the real application.
      </p>

      {/* What's attached — resume and cover letter. */}
      <div style={{ marginTop: 16 }}>
        <div className="mono chrome" style={{ marginBottom: 6 }}>attached to your application</div>
        <div className="flex flex-col gap-2">
          <a href="/resume" className="btn press"
            style={{ textDecoration: "none", display: "flex", justifyContent: "space-between" }}>
            <span>resume</span>
            <span className="mono" style={{ color: "var(--accent)" }}>view ↗</span>
          </a>
          <a href={`/listing/${boot.postingId}#cover-letter`} onClick={onClose} className="btn press"
            style={{ textDecoration: "none", display: "flex", justifyContent: "space-between" }}>
            <span>cover letter · {letter.status}</span>
            <span className="mono" style={{ color: "var(--accent)" }}>{letter.cta} →</span>
          </a>
        </div>
      </div>

      {/* Facts we fill. */}
      {held.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="mono chrome" style={{ marginBottom: 6 }}>we fill these from your profile</div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {held.map((f) => (
              <div key={f.key} className="flex items-baseline justify-between gap-4 border"
                style={{ borderColor: "var(--line)", padding: "8px 12px", marginBottom: 6 }}>
                <span className="mono chrome">{f.label}</span>
                <span className="t-sm" style={{ color: "var(--text)", textAlign: "right", wordBreak: "break-word" }}>
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume-only notes, folded in here rather than their own step. */}
      {notes.length > 0 && (
        <div className="slot" style={{ padding: "10px 12px", marginTop: 12 }}>
          <div className="mono chrome" style={{ marginBottom: 4 }}>worth adding to your resume</div>
          <ul className="t-sm" style={{ paddingLeft: 18, color: "var(--text)" }}>
            {notes.map((n) => (
              <li key={n.fieldKey}>{n.prompt}</li>
            ))}
          </ul>
        </div>
      )}

      {/* The legal declarations — read and confirmed once, here. */}
      {boot.attestations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="mono chrome" style={{ marginBottom: 6 }}>by submitting you confirm</div>
          <ul className="t-sm" style={{ paddingLeft: 18, color: "var(--text)" }}>
            {boot.attestations.map((a) => (
              <li key={a.key}>
                {a.label}
                {a.value != null ? `: ${a.value}` : " — answer this on the real form"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex items-center gap-2" style={{ marginTop: 16, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span className="t-sm" style={{ color: "var(--text)" }}>
          the statements above are true
        </span>
      </label>

      <button
        type="button"
        className="btn btn-primary press"
        disabled={!confirmed}
        onClick={onAdvance}
        style={{ marginTop: 14 }}
      >
        continue
      </button>
    </div>
  );
}

function GapStep({
  step,
  boot,
  onAdvance,
}: {
  step: ReturnType<typeof planApplySteps>["steps"][number];
  boot: WizardBoot;
  onAdvance: () => void;
}) {
  const prompt = step.prompt;
  const [state, formAction] = useActionState(saveApplyFieldAction, IDLE);
  const savedRef = useRef(false);

  // Advance once the save lands. The action revalidates the page, but the
  // wizard is client state — we move the bar ourselves on success.
  useEffect(() => {
    if (state.status === "saved" && !savedRef.current) {
      savedRef.current = true;
      onAdvance();
    }
  }, [state.status, onAdvance]);

  if (!prompt || prompt.profileField === null) {
    return <WizardContinue label="continue" onAdvance={onAdvance} />;
  }

  return (
    <div>
      <div className="mono-strong" style={{ color: "var(--text)" }}>{step.label}</div>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "56ch" }}>
        {prompt.prompt}
      </p>

      <form action={formAction} style={{ marginTop: 14 }}>
        <input type="hidden" name="postingId" value={boot.postingId} />
        <input type="hidden" name="field" value={prompt.profileField} />
        <GapInput input={prompt.input} current={boot.current[prompt.profileField] ?? ""} />
        {state.status === "error" && (
          <div className="mono" style={{ color: "var(--system-danger)", marginTop: 8 }}>
            {state.message}
          </div>
        )}
        <div className="flex items-center gap-3" style={{ marginTop: 14 }}>
          <SaveAndContinueButton />
          <button type="button" className="mono press" onClick={onAdvance}
            style={{ color: "var(--faint-readable)", background: "none", border: "none", cursor: "pointer" }}>
            skip for now
          </button>
        </div>
      </form>
    </div>
  );
}

function GapInput({ input, current }: { input: string; current: string }) {
  if (input === "workAuth") {
    return (
      <select name="value" className="field" defaultValue={current} required>
        <option value="" disabled>
          choose one
        </option>
        <option value="us_citizen">U.S. citizen</option>
        <option value="permanent_resident">permanent resident</option>
        <option value="needs_sponsorship">need sponsorship</option>
      </select>
    );
  }
  return (
    <input
      name="value"
      className="field"
      type={input === "number" ? "number" : "text"}
      defaultValue={current}
      required
      placeholder={input === "locations" ? "San Francisco, New York" : ""}
    />
  );
}

function HandoffStep({ boot, onAdvance }: { boot: WizardBoot; onAdvance: () => void }) {
  return (
    <div>
      <div className="mono-strong" style={{ color: "var(--text)" }}>the real application</div>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "56ch" }}>
        Everything above is on screen with its source attached. Open the employer&rsquo;s form, paste
        each field in, answer the attestations yourself, and send it — the application goes out
        under your name, so you are the one who submits it.
      </p>
      <div className="flex items-center gap-3" style={{ marginTop: 14 }}>
        <a href={boot.postingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary press"
          style={{ textDecoration: "none" }}>
          open the application ↗
        </a>
        <WizardContinue label="I sent it" onAdvance={onAdvance} />
      </div>
    </div>
  );
}

function SubmittedStep({
  boot,
  action,
  state,
}: {
  boot: WizardBoot;
  action: (formData: FormData) => void;
  state: ApplyActionState;
}) {
  return (
    <div>
      <div className="mono-strong" style={{ color: "var(--text)" }}>confirm it went out</div>
      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "56ch" }}>
        One click stamps your tracker and composes a confirmation of exactly what you submitted.
        The draft is shown for you to read — we do not email anything without you asking.
      </p>
      <form action={action} style={{ marginTop: 14 }}>
        <input type="hidden" name="postingId" value={boot.postingId} />
        <SubmitButton />
        {state.status === "error" && (
          <div className="mono" style={{ color: "var(--system-danger)", marginTop: 8 }}>
            {state.message}
          </div>
        )}
      </form>
    </div>
  );
}

function ConfirmationView({ confirmation }: { confirmation: { subject: string; text: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mono-strong" style={{ color: "var(--accent)" }}>tracked — here is your confirmation</div>
      <div className="border" style={{ borderColor: "var(--line)", padding: "14px 16px", marginTop: 12 }}>
        <div className="mono chrome">subject</div>
        <div className="t-sm" style={{ color: "var(--text)", marginTop: 4 }}>{confirmation.subject}</div>
        <div className="mono chrome" style={{ marginTop: 12 }}>body</div>
        <pre className="t-sm" style={{ color: "var(--text)", marginTop: 4, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
          {confirmation.text}
        </pre>
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 14 }}>
        <button type="button" className="btn press" onClick={async () => {
          try {
            await navigator.clipboard.writeText(`Subject: ${confirmation.subject}\n\n${confirmation.text}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch { /* clipboard can be refused; the text is on screen */ }
        }}>
          {copied ? "copied" : "copy the draft"}
        </button>
        <a href="/tracker" className="mono press" style={{ color: "var(--accent)" }}>
          see it on your tracker →
        </a>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Buttons — useFormStatus so pending states disable the right control
 * ------------------------------------------------------------------ */

function WizardContinue({ label, onAdvance }: { label: string; onAdvance: () => void }) {
  return (
    <button type="button" className="btn btn-primary press" onClick={onAdvance} style={{ marginTop: 14 }}>
      {label}
    </button>
  );
}

function SaveAndContinueButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary press" disabled={pending}>
      {pending ? "saving…" : "save & continue"}
    </button>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary press" disabled={pending}>
      {pending ? "recording…" : "yes — it's submitted"}
    </button>
  );
}
