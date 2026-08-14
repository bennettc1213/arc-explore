/**
 * Decoding an edited resume back into `ParsedResume`.
 *
 * Free of network and database imports, same as `types.ts`, so every rule here
 * is unit-testable.
 *
 * WHAT EDITING CHANGES ABOUT PROVENANCE — and what it deliberately does not.
 * `types.ts` says a parsed resume records only what the document says, because
 * the parser must never invent. That rule constrains *the model*, not the
 * student. Once a human edits this structure it holds what they assert about
 * themselves, which is a different and entirely legitimate source of truth: a
 * student adding a skill the PDF omitted is correcting our reading of their
 * life, not fabricating one.
 *
 * The downstream contract is unchanged and this is the point. The cover-letter
 * generator may still assert only what is present here — so the anti-
 * fabrication rule holds exactly as before, with the student rather than an
 * extractor vouching for the contents.
 *
 * Empty stays null. A student who clears a field is telling us the document
 * does not state it, and "" reaching the scorer would be a stated-but-blank
 * value rather than an absent one — the same distinction `amountNeedsReview`
 * draws on the scholarship side.
 */

import { parsedResumeSchema, type ParsedResume } from "./types";

/** Trim, then treat blank as absent. */
function orNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * A number a student typed, or null.
 *
 * Rejects rather than coerces: `Number("")` is 0 and `Number("n/a")` is NaN,
 * and a GPA silently stored as 0.0 would read as a real, terrible GPA.
 */
function numberOrNull(v: unknown): number | null {
  const s = typeof v === "string" ? v.trim() : v;
  if (s === "" || s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Skills as a student types them: one per line, or comma separated, or both.
 *
 * Deliberately permissive about the separator and strict about the result —
 * duplicates collapse case-insensitively (keeping the first spelling, which is
 * the one they chose) because a list containing both "Python" and "python"
 * looks like a mistake on a rendered resume.
 */
export function parseSkillsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const piece of raw.split(/[\n,;]+/)) {
    const skill = piece.trim();
    if (!skill) continue;

    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }

  return out;
}

/** Bullets as typed in a textarea: one per line, blank lines dropped. */
export function parseBulletsInput(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Decode an edited resume payload into the stored shape.
 *
 * Runs the same `parsedResumeSchema` the parser's output goes through, so an
 * edit cannot put anything in the column the parser could not have. That also
 * applies the schema's caps — 60 skills, 20 experiences, 12 bullets — which is
 * why they are enforced here rather than trusted from the client.
 *
 * Returns null when the payload is not a resume at all, which the caller
 * reports rather than silently writing an empty structure over real content.
 */
export function decodeResumeEdit(raw: unknown): ParsedResume | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const asRecords = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null) : [];

  const candidate = {
    name: orNull(input.name),
    email: orNull(input.email),
    phone: orNull(input.phone),
    school: orNull(input.school),
    major: orNull(input.major),
    gradYear: numberOrNull(input.gradYear),
    gpa: numberOrNull(input.gpa),
    skills: Array.isArray(input.skills)
      ? input.skills.filter((s): s is string => typeof s === "string").map((s) => s.trim()).filter(Boolean)
      : [],
    experiences: asRecords(input.experiences)
      .map((e) => ({
        organization: orNull(e.organization),
        role: orNull(e.role),
        dates: orNull(e.dates),
        location: orNull(e.location),
        bullets: Array.isArray(e.bullets)
          ? e.bullets.filter((b): b is string => typeof b === "string").map((b) => b.trim()).filter(Boolean)
          : [],
      }))
      // An entry with nothing in it is a row the student added and left
      // blank, not an experience. Dropped rather than stored as four nulls.
      .filter((e) => e.organization || e.role || e.dates || e.location || e.bullets.length > 0),
    projects: asRecords(input.projects)
      .map((p) => ({
        name: orNull(p.name),
        description: orNull(p.description),
        link: orNull(p.link),
      }))
      .filter((p) => p.name || p.description || p.link),
    links: Array.isArray(input.links)
      ? input.links.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean)
      : [],
  };

  const result = parsedResumeSchema.safeParse(candidate);
  return result.success ? result.data : null;
}
