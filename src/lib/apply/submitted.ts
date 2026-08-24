/**
 * Did the application actually land?
 *
 * PER PLATFORM, NOT ONE SHARED GUESS. CLAUDE.md states this outright and the
 * reason is that a confirmation is a piece of someone else's UI: Greenhouse
 * renders a thank-you panel in place, Lever navigates to a `/thanks` URL, and
 * a scholarship site does whatever its author felt like. A single "looks like
 * it worked" heuristic across all of them would be wrong in the direction that
 * costs the most — telling a student they applied when they did not, so they
 * stop tracking the role and miss the deadline.
 *
 * So each platform gets its own rule, each rule names what it actually looks
 * for, and **anything unrecognised returns `unknown`** rather than a cheerful
 * guess. `unknown` is not a failure: it means the student marks it applied
 * themselves, which is exactly what happens today.
 *
 * Pure — it takes a URL and a bit of page text, never a document — so every
 * platform's rule is testable without a browser. The content script is the
 * only thing that reads the DOM, and it does so inside the frame where Arc's
 * own JavaScript cannot reach.
 */

export type SubmissionVerdict = "submitted" | "unknown";

export interface SubmissionEvidence {
  /** The frame's own URL at the moment we looked. */
  url: string;
  /**
   * Visible text of the page, already lowercased and collapsed by the caller.
   *
   * Deliberately not the whole DOM: a confirmation is a short human sentence,
   * and matching against markup would find the word "submitted" in a hidden
   * template or an analytics payload.
   */
  text: string;
}

/** Normalise page text the way every rule below expects to receive it. */
export function normalizePageText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Greenhouse.
 *
 * It submits in place and swaps the form for a short confirmation, so there is
 * no URL change to key on — the text is the only signal. Both phrasings below
 * are Greenhouse's own; the application-confirmation copy has been stable
 * across their board versions.
 *
 * The phrases are deliberately specific. "thank you" alone appears on plenty of
 * job adverts before anyone submits anything, and "your application" appears in
 * the privacy notice under the form on every Greenhouse posting — matching
 * either on its own would report a submission for merely opening the page.
 */
const GREENHOUSE_CONFIRMATIONS = [
  "your application has been submitted",
  "thank you for applying",
  "application submitted",
];

function greenhouse(evidence: SubmissionEvidence): SubmissionVerdict {
  return GREENHOUSE_CONFIRMATIONS.some((p) => evidence.text.includes(p)) ? "submitted" : "unknown";
}

/**
 * The dispatch table. One entry per host family we have actually read.
 *
 * A host absent from here returns `unknown` forever, which is correct and not
 * a gap to be filled with a generic rule. Adding a platform means reading one
 * of its real confirmations first — the same discipline every ATS form in this
 * codebase was added under.
 */
const RULES: Array<{ hosts: readonly string[]; rule: (e: SubmissionEvidence) => SubmissionVerdict }> = [
  {
    hosts: [
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "boards.eu.greenhouse.io",
      "job-boards.eu.greenhouse.io",
    ],
    rule: greenhouse,
  },
];

export function detectSubmission(evidence: SubmissionEvidence): SubmissionVerdict {
  const host = hostOf(evidence.url);
  if (!host) return "unknown";

  for (const entry of RULES) {
    if (entry.hosts.includes(host)) return entry.rule(evidence);
  }
  return "unknown";
}

/** Which hosts have a submission rule at all — so the UI can say whether it
 *  will be watching, rather than silently not watching. */
export function hasSubmissionRule(url: string): boolean {
  const host = hostOf(url);
  return host !== null && RULES.some((r) => r.hosts.includes(host));
}
