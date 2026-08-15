/**
 * LinkedIn profile text, as the student pastes it in.
 *
 * THE RULE THAT GOVERNS THIS ENTIRE MODULE, from CLAUDE.md, verbatim: *the
 * LinkedIn checker only scores text a student pastes in. Never add a live fetch
 * against linkedin.com in any form — no scraping, no unofficial API, no
 * logged-in automation.*
 *
 * That is not caution for its own sake. LinkedIn sued Proxycurl in N.D. Cal.
 * and it shut down in July 2026; a fetch here is the single thing that could
 * end this project. So there is no network code anywhere in `lib/linkedin/`,
 * and there is no field below that could hold a URL we would go and load. If a
 * future change needs one, the answer is no.
 *
 * The consequence is worth stating plainly rather than hiding: this scores what
 * a student typed, so it can be wrong about their profile in a way the GitHub
 * audit cannot be about theirs. The UI says so.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ *
 * LinkedIn's own limits
 * ------------------------------------------------------------------ */

/** LinkedIn caps the headline at 220 characters. */
export const HEADLINE_MAX = 220;

/** And the About section at 2,600. */
export const ABOUT_MAX = 2600;

/**
 * Roughly what shows above the "…see more" fold on the About section.
 *
 * Approximate on purpose — it varies with viewport, and we say "roughly the
 * first three lines" rather than asserting a character count LinkedIn has never
 * published.
 */
export const ABOUT_FOLD = 250;

/** LinkedIn allows 50 skills on a profile. */
export const SKILLS_MAX = 50;

export const EXPERIENCE_MAX = 8000;

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

export interface LinkedInInput {
  headline: string;
  about: string;
  /** Experience bullets, one per line, as pasted. */
  experience: string;
  /** Comma- or newline-separated, as pasted. */
  skills: string;
  /** Null when the student did not say, which is different from zero. */
  recommendations: number | null;
}

const text = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= max, { message: `that is longer than LinkedIn allows (${max})` });

export const linkedInInputSchema = z.object({
  headline: text(HEADLINE_MAX * 2),
  about: text(ABOUT_MAX * 2),
  experience: text(EXPERIENCE_MAX),
  skills: text(2000),
  recommendations: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : v.trim()))
    .transform((v) => (v === "" ? null : Number(v)))
    .nullable()
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 999), {
      message: "recommendations should be a whole number",
    }),
});

export const EMPTY_LINKEDIN_INPUT: LinkedInInput = {
  headline: "",
  about: "",
  experience: "",
  skills: "",
  recommendations: null,
};

/*
 * The schemas above accept twice LinkedIn's own cap rather than rejecting at
 * it. Someone pasting a headline they have not trimmed yet should be told it is
 * too long by the checker, in the same panel as everything else — not stopped
 * by a validation error that loses what they typed.
 */

/** Split a pasted skills field on commas, newlines, bullets or pipes. */
export function parseSkillList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n|·•;]+/)) {
    const t = part.trim().replace(/^[-*•]\s*/, "");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Split pasted experience text into bullets, one per non-empty line. */
export function parseBulletLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•‣◦⁃]\s*/, "").trim())
    .filter(Boolean);
}
