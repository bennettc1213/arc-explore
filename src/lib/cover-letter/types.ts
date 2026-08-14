/**
 * Cover letter shapes: paragraph roles, validation, and the honest-slot rule.
 *
 * Free of network and database imports so every rule here is unit-testable
 * without an API key — the same discipline as `lib/resume/types.ts`.
 *
 * THE RULE THIS FILE SERVES: a generated letter asserts only facts the parsed
 * resume or profile actually contain (see `lib/resume/types.ts`). When a
 * letter needs a specific detail the generator does not have, it emits a
 * literal placeholder — `[YOUR SPECIFIC DETAIL: what is needed]` — instead of
 * inventing one. `slotsFromText` finds those placeholders, so an unfilled slot
 * is a *visible* gap in the letter, not a quietly fabricated fact. A student
 * can never send a letter believing a claim the generator made up.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Paragraphs
 * ------------------------------------------------------------------ */

/**
 * The four roles a body paragraph can have.
 *
 * Greeting and sign-off are deliberately NOT roles: they are rendered as fixed
 * chrome ("Dear Hiring Team," / "Dear Scholarship Committee," / "Sincerely," +
 * name) because we never know the reader's name, and a generator asked to guess
 * a greeting would do exactly the fabrication this module forbids.
 */
export const LETTER_ROLES = ["opening", "why", "evidence", "closing"] as const;
export type LetterRole = (typeof LETTER_ROLES)[number];

export const LETTER_ROLE_LABELS: Record<LetterRole, string> = {
  opening: "opening — who you are and why you are writing",
  why: "why this role — grounded in the posting's own facts",
  evidence: "evidence — specifics from your resume",
  closing: "closing — thanks and next step",
};

export interface LetterParagraph {
  id: string;
  role: LetterRole;
  text: string;
}

export const MAX_PARAGRAPH_CHARS = 4000;
export const MIN_PARAGRAPHS = 3;
export const MAX_PARAGRAPHS = 6;

/**
 * The ceiling for a *stored* slot label. Detection is more generous — the
 * model writes long placeholders — but the gap list on the page must stay
 * scannable, so anything longer is truncated at derivation time.
 */
export const MAX_SLOT_CHARS = 200;

const letterParagraphSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(LETTER_ROLES),
  text: z.string().trim().min(1).max(MAX_PARAGRAPH_CHARS),
});

export const coverLetterSchema = z.object({
  paragraphs: z.array(letterParagraphSchema).min(MIN_PARAGRAPHS).max(MAX_PARAGRAPHS),
  unfilledSlots: z.array(z.string().trim().min(1).max(MAX_SLOT_CHARS)).max(20),
});

export type CoverLetterDraft = z.infer<typeof coverLetterSchema>;

/* ------------------------------------------------------------------ *
 * Unfilled slots
 * ------------------------------------------------------------------ */

/** What a placeholder looks like: "[YOUR SPECIFIC DETAIL: portfolio link]". */
export function slotMarker(spec: string): string {
  return `[YOUR SPECIFIC DETAIL: ${spec}]`;
}

const SLOT_RE = /\[[A-Z][^\]\n]{2,300}\]/g;

/**
 * Every placeholder in a letter's text, deduped in first-seen order.
 *
 * This is the backstop that keeps the no-fabrication rule *enforceable*: even
 * a model that ignores the instruction to return `unfilledSlots` still leaves
 * the markers in the text, and this scan turns them into the honest gap list
 * the page surfaces to the student before they send anything.
 */
export function slotsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(SLOT_RE)) {
    const slot = match[0].trim();
    if (seen.has(slot)) continue;
    seen.add(slot);
    out.push(slot);
  }
  return out;
}

function truncateSlot(slot: string): string {
  if (slot.length <= MAX_SLOT_CHARS) return slot;
  return `${slot.slice(0, MAX_SLOT_CHARS - 4).trimEnd()}…]`;
}

/* ------------------------------------------------------------------ *
 * Read + normalize
 * ------------------------------------------------------------------ */

/**
 * Read a stored `cover_letters.paragraphs` / `unfilled_slots` value back into
 * a usable draft.
 *
 * The columns are jsonb/text[] on purpose — an older shape must degrade to
 * null (treat the letter as not existing) rather than crash the page. A letter
 * whose paragraphs fail validation is not something we can safely show or
 * regenerate from, so we return null and the page offers a fresh draft.
 */
export function coerceCoverLetter(value: unknown): CoverLetterDraft | null {
  const result = coverLetterSchema.safeParse(value);
  return result.success ? result.data : null;
}

export class CoverLetterValidationError extends Error {}

/**
 * Validate and normalise editor-supplied paragraphs.
 *
 * Used by the save action, where the client owns the text. Trims every
 * paragraph, rejects empty or oversized text and unknown roles, ensures the
 * required opening/closing roles exist, then derives `unfilledSlots` from the
 * text. Throws `CoverLetterValidationError` on anything the UI should treat
 * as a friendly "please fix" rather than a crash.
 */
export function normalizeDraft(input: unknown): CoverLetterDraft {
  if (!input || typeof input !== "object") {
    throw new CoverLetterValidationError("the letter had no body to save");
  }

  const raw = input as { paragraphs?: unknown };
  if (!Array.isArray(raw.paragraphs)) {
    throw new CoverLetterValidationError("the letter had no body to save");
  }

  const paragraphs: LetterParagraph[] = [];
  for (const p of raw.paragraphs) {
    if (!p || typeof p !== "object") throw new CoverLetterValidationError("a paragraph was empty");
    const entry = p as { id?: unknown; role?: unknown; text?: unknown };
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (text.length === 0) throw new CoverLetterValidationError("a paragraph was empty");
    if (text.length > MAX_PARAGRAPH_CHARS) {
      throw new CoverLetterValidationError("a paragraph is too long to save");
    }
    const role = entry.role;
    if (!LETTER_ROLES.includes(role as LetterRole)) {
      throw new CoverLetterValidationError("a paragraph had an unrecognised role");
    }
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : newId();
    paragraphs.push({ id, role: role as LetterRole, text });
  }

  if (paragraphs.length < MIN_PARAGRAPHS || paragraphs.length > MAX_PARAGRAPHS) {
    throw new CoverLetterValidationError(`a letter needs ${MIN_PARAGRAPHS} to ${MAX_PARAGRAPHS} paragraphs`);
  }
  if (!paragraphs.some((p) => p.role === "opening")) {
    throw new CoverLetterValidationError("the letter is missing its opening paragraph");
  }
  if (!paragraphs.some((p) => p.role === "closing")) {
    throw new CoverLetterValidationError("the letter is missing its closing paragraph");
  }

  // Duplicate ids would make per-paragraph regeneration ambiguous.
  const seen = new Set<string>();
  for (const p of paragraphs) {
    if (seen.has(p.id)) p.id = newId();
    seen.add(p.id);
  }

  const unfilledSlots = [
    ...new Set(paragraphs.flatMap((p) => slotsFromText(p.text).map(truncateSlot))),
  ].slice(0, 20);

  return { paragraphs, unfilledSlots };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
