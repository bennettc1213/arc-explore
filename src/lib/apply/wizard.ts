/**
 * The apply wizard's step plan.
 *
 * Free of network and database imports so the whole flow — which steps appear,
 * in what order, and which ones pause the progress bar — is unit-testable
 * without a connection. The React component renders this plan; it computes
 * none of it.
 *
 * WHAT THE WIZARD IS. One button on the listing page walks the student through
 * assembling an application: the facts we already hold, the facts we still
 * need, the attestations only they can answer, the cover letter, and finally
 * the hand-off to the employer's real form. A progress bar advances through
 * the steps and PAUSES wherever the student must answer or confirm something.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not submit anything — the final
 * step opens the employer's form in a new tab, and the student sends their own
 * application. That is the same refusal the packet page documents: an employer
 * form asks questions no stored profile answers, and getting a legal
 * attestation wrong is a false statement under the student's own name. The
 * wizard's job is to make sure that by the time they reach the form, every
 * fact it will ask for is already on screen with its source attached.
 *
 * THE PAUSE RULE. A step pauses the bar only when the student has to act —
 * answer a gap, confirm an attestation, or review a letter that is still full
 * of slots. A step we can complete for them (copying a fact we hold, opening
 * the letter editor) never blocks: the bar flows through it. This is the
 * difference between "the application is being filled out for you" and "you
 * are being asked the three things only you know."
 */

import type { ApplicationPacket, PacketField } from "./packet";

/* ------------------------------------------------------------------ *
 * Profile-field prompts
 * ------------------------------------------------------------------ */

/**
 * The profile fields a gap can be written back to.
 *
 * Only fields that exist on the profile form are listed. A gap that maps to
 * resume-only data (phone, links) is prompted as "add to your resume" — the
 * wizard cannot write it back to the profile because the profile has no such
 * column, and inventing one for the wizard would split the data model in two.
 */
export type PromptTarget = {
  /** The packet field key this prompt answers. */
  fieldKey: string;
  /** The profile column the answer is saved to, or null when it is resume-only. */
  profileField:
    | "displayName"
    | "school"
    | "major"
    | "gradYear"
    | "gpa"
    | "workAuth"
    | "targetLocations"
    | null;
  /** How to ask. Short, concrete, and says where it will be used. */
  prompt: string;
  /** Free text vs. a constrained choice. */
  input: "text" | "number" | "locations" | "workAuth";
};

/**
 * Maps a packet field that came back missing to the prompt that fills it.
 *
 * Returns null for fields we never prompt for: the email falls back to the
 * proven account address, and a missing GPA is a legitimate choice rather
 * than a gap (the packet says so itself). Links and phone are resume-only,
 * so they prompt a resume nudge instead of a profile write-back.
 */
export function promptForField(field: PacketField): PromptTarget | null {
  switch (field.key) {
    case "name":
      return {
        fieldKey: "name",
        profileField: "displayName",
        prompt: "Your full name, as it should appear on the application.",
        input: "text",
      };
    case "school":
      return {
        fieldKey: "school",
        profileField: "school",
        prompt: "Your school. Applications ask for it verbatim.",
        input: "text",
      };
    case "major":
      return {
        fieldKey: "major",
        profileField: "major",
        prompt: "Your major or program of study.",
        input: "text",
      };
    case "gradYear":
      return {
        fieldKey: "gradYear",
        profileField: "gradYear",
        prompt: "Your expected graduation year (e.g. 2028).",
        input: "number",
      };
    case "locations":
      return {
        fieldKey: "locations",
        profileField: "targetLocations",
        prompt:
          "Preferred locations, comma-separated. Scholarship forms often ask where you intend to study or work.",
        input: "locations",
      };
    case "workAuth":
      return {
        fieldKey: "workAuth",
        profileField: "workAuth",
        prompt:
          "Your work authorization. This is a legal declaration on the application — answer it as it is true today, and it is saved so you confirm rather than retype it next time.",
        input: "workAuth",
      };
    // Resume-only gaps: the profile has no column for these, so the prompt is
    // a pointer rather than a write-back.
    case "phone":
      return {
        fieldKey: "phone",
        profileField: null,
        prompt: "A phone number. Applications usually require one — add it to your resume.",
        input: "text",
      };
    case "links":
      return {
        fieldKey: "links",
        profileField: null,
        prompt:
          "A portfolio, GitHub or LinkedIn link. Add links to your resume and they appear here and on every application after this one.",
        input: "text",
      };
    default:
      // email (account address always answers it) and gpa (a legitimate
      // omission, per the packet's own note) are never prompted.
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * The step plan
 * ------------------------------------------------------------------ */

export type StepKind =
  | "gap" // a missing fact the student must answer; pauses until answered or skipped
  | "review" // the assembled application: facts, attachments, attestations — pauses on the one confirm
  | "handoff"; // open the employer's form; never pauses

export interface ApplyStep {
  kind: StepKind;
  /** Short label for the progress bar. */
  label: string;
  /** Present on gap and attestation steps. */
  prompt?: PromptTarget;
  /** The packet field this step is about, for rendering its current value. */
  field?: PacketField;
  /** True when this step blocks the progress bar until the student acts. */
  pauses: boolean;
}

export interface ApplyPlan {
  steps: ApplyStep[];
  /** Count of pausing steps — what the "N things only you can answer" line reports. */
  needsYou: number;
}

/**
 * Build the ordered plan for one application.
 *
 * The flow is deliberately short: only genuine gaps the student must answer
 * become their own step; everything else is folded into one review that shows
 * the assembled application (the facts we hold, the attached resume and cover
 * letter, and the attestations to confirm). Ending on the employer's real form
 * means the last thing they see before submitting is the destination, not our
 * UI — and they submit it themselves, never us.
 *
 * @param packet the assembled application packet
 * @param letterState "none" | "slots" | "ready" — whether a draft exists and
 *   whether it still has unfilled slots. The wizard does not read the letter
 *   itself; the page that already loaded it passes the summary down.
 */
export function planApplySteps(
  packet: ApplicationPacket,
  letterState: "none" | "slots" | "ready",
): ApplyPlan {
  void letterState; // the letter's state is shown on the review step, not a step of its own
  const steps: ApplyStep[] = [];

  // 1. Gaps — the only clarifying questions. One step per promptable missing
  // field; only a field that writes back to the profile pauses the bar.
  // Resume-only gaps (phone, links) have no profile column, so they are folded
  // into the review as a note rather than a step of their own.
  for (const field of packet.fields) {
    if (field.value !== null) continue;
    const prompt = promptForField(field);
    if (!prompt || prompt.profileField === null) continue;
    steps.push({ kind: "gap", label: field.label, prompt, field, pauses: true });
  }

  // 2. Review — the whole application on one screen: what we hold, what's
  // attached, and the legal declarations to confirm. Pauses on that one
  // confirmation so it is never skipped silently.
  steps.push({ kind: "review", label: "review your application", pauses: true });

  // 3. The hand-off. Never a pause — it is the destination.
  steps.push({ kind: "handoff", label: "open the real application", pauses: false });

  return { steps, needsYou: steps.filter((s) => s.pauses).length };
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

/**
 * Where the progress bar sits, as a 0–1 fraction.
 *
 * Counts completed steps, not time — the bar is a map of what is done, not a
 * spinner pretending work is happening. A step is "complete" once the student
 * has acted on it (or it never needed action). The hand-off step completes
 * when they confirm they submitted, which is also what stamps the tracker.
 */
export function progressOf(completed: number, total: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, completed / total));
}

/**
 * The label under the bar.
 *
 * Names the step the bar is paused on, in the student's terms — "2 of 6 ·
 * waiting on you: work authorization" — rather than a bare percentage, which
 * says nothing about what is holding the application up.
 */
export function progressLabel(
  completed: number,
  steps: ApplyStep[],
  waitingOn: ApplyStep | null,
): string {
  const base = `${completed} of ${steps.length}`;
  if (!waitingOn) return completed >= steps.length ? `${base} · done` : base;
  const what = waitingOn.kind === "gap" || waitingOn.kind === "review" ? waitingOn.label : null;
  return what ? `${base} · waiting on you: ${what}` : `${base} · waiting on you`;
}

/* ------------------------------------------------------------------ *
 * Confirmation draft
 * ------------------------------------------------------------------ */

export interface ConfirmationDraft {
  subject: string;
  text: string;
}

/**
 * The "you applied" confirmation email — composed as a DRAFT, never sent.
 *
 * Mirrors the reminders module's rule: only facts already on the posting and
 * the packet. No generated prose, no model call, and no claims we cannot
 * back — the email says what the student submitted *toward*, what we filled,
 * and what they answered themselves. "When you'll hear back" is included ONLY
 * when the posting actually states it (a deadline); otherwise the line is
 * omitted entirely rather than estimated — the same honest-slot rule as
 * everywhere else.
 *
 * The draft is shown in the wizard's final step for the student to read and
 * copy. Sending it requires Resend configuration, which is deliberately inert
 * in this project until the owner adds the key — so this composes and returns
 * the text, and the send path is a separate, explicit decision.
 */
export function composeConfirmation(input: {
  displayName: string | null;
  title: string;
  company: string | null;
  kind: string;
  url: string;
  deadlineAt: Date | null;
  /** Facts the wizard pre-filled, by label. */
  filled: string[];
  /** Facts the student answered during the flow, by label. */
  answered: string[];
  /** Attestations the student confirmed themselves, by label. */
  confirmed: string[];
}): ConfirmationDraft {
  const noun = input.kind === "scholarship" ? "scholarship" : "internship";
  const who = input.company ? ` (${input.company})` : "";
  const greeting = input.displayName ? `Hi ${input.displayName},` : "Hi,";

  const lines: string[] = [
    greeting,
    "",
    `You started an application to a ${noun} you found on Instela.`,
    "",
    `${input.title}${who}`,
    `Application: ${input.url}`,
  ];

  if (input.deadlineAt) {
    // ISO date, same rule as the reminder email: the recipient's timezone is
    // unknown, and a deadline that renders differently per reader is worse
    // than no date at all.
    lines.push(`Deadline: ${input.deadlineAt.toISOString().slice(0, 10)}`);
    lines.push(
      "If the sponsor states a response window, it will be on the application page above — we only know the deadline they published, not when they decide.",
    );
  }

  lines.push("");
  if (input.filled.length > 0) {
    lines.push(`We filled from your profile and resume: ${input.filled.join(", ")}.`);
  }
  if (input.answered.length > 0) {
    lines.push(`You answered during this application: ${input.answered.join(", ")}.`);
  }
  if (input.confirmed.length > 0) {
    lines.push(`You confirmed yourself: ${input.confirmed.join(", ")}.`);
  }
  lines.push(
    "",
    "We did not submit anything for you — you reviewed every field and sent the application yourself. That is deliberate: an application under your name should never contain a guess.",
  );

  return {
    subject: `Your application: ${input.title}${who}`,
    text: lines.join("\n"),
  };
}
