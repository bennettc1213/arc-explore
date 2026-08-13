/**
 * Resume parsing: shapes, validation, and the mapping into a profile.
 *
 * Free of network and database imports so every rule here is unit-testable
 * without an API key.
 *
 * THE RULE THAT GOVERNS THIS FILE: a parsed resume records only what the
 * document actually says. Anything absent stays null. The cold-email generator
 * (M4) is allowed to assert facts from this structure and nothing else, so a
 * value invented here becomes a lie in an email that goes to a real recruiter.
 * That is the single worst failure this product can have.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Upload validation
 * ------------------------------------------------------------------ */

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** What we can actually read. PDF goes to the model as a document block; the
 *  text types are read directly. Word documents are a zip of XML we cannot
 *  extract without another dependency, so we say so instead of failing oddly. */
export const ACCEPTED_RESUME_TYPES = ["application/pdf", "text/plain", "text/markdown"] as const;

export type UploadKind = "pdf" | "text";

export interface UploadCheck {
  ok: boolean;
  kind?: UploadKind;
  error?: string;
}

/**
 * Decides whether an uploaded file is one we can parse.
 *
 * Extension is consulted as well as MIME type because browsers report
 * `application/octet-stream` for .md on some platforms, and Windows reports
 * nothing at all for extensionless files.
 */
export function checkUpload(file: { name: string; type: string; size: number }): UploadCheck {
  if (file.size === 0) return { ok: false, error: "that file is empty" };
  if (file.size > MAX_RESUME_BYTES) {
    return {
      ok: false,
      error: `that file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 5MB`,
    };
  }

  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  if (isPdf) return { ok: true, kind: "pdf" };

  const isText =
    file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");
  if (isText) return { ok: true, kind: "text" };

  if (name.endsWith(".doc") || name.endsWith(".docx")) {
    return { ok: false, error: "we cannot read Word files yet — export to PDF and try again" };
  }

  return { ok: false, error: "upload a PDF, .txt or .md file" };
}

/* ------------------------------------------------------------------ *
 * The parsed structure
 * ------------------------------------------------------------------ */

const nullableString = z.string().trim().min(1).nullable().catch(null);

export const parsedResumeSchema = z.object({
  name: nullableString,
  email: nullableString,
  phone: nullableString,
  school: nullableString,
  major: nullableString,
  /** Null unless the document states a graduation date. */
  gradYear: z.number().int().min(1950).max(2100).nullable().catch(null),
  /** Null unless a GPA is printed. We never infer one. */
  gpa: z.number().min(0).max(5).nullable().catch(null),
  skills: z.array(z.string().trim().min(1)).max(60).catch([]),
  experiences: z
    .array(
      z.object({
        organization: nullableString,
        role: nullableString,
        /** Verbatim from the document, e.g. "Jun 2025 – Aug 2025". */
        dates: nullableString,
        location: nullableString,
        /** The bullets as written — these are what M4 may quote. */
        bullets: z.array(z.string().trim().min(1)).max(12).catch([]),
      }),
    )
    .max(20)
    .catch([]),
  projects: z
    .array(
      z.object({
        name: nullableString,
        description: nullableString,
        link: nullableString,
      }),
    )
    .max(20)
    .catch([]),
  links: z.array(z.string().trim().min(1)).max(12).catch([]),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

/**
 * Read a `resumes.parsed` jsonb value back into the current shape.
 *
 * The column is `unknown` on purpose: it holds whatever the parser wrote on
 * the day it ran, which may predate a field we have since added. Every member
 * of the schema carries a `.catch`, so this is total — a row from an older
 * shape degrades field by field to null or `[]` instead of throwing on a page
 * the user simply wanted to look at.
 */
export function coerceParsedResume(value: unknown): ParsedResume {
  const result = parsedResumeSchema.safeParse(value);
  return result.success ? result.data : EMPTY_PARSED_RESUME;
}

export const EMPTY_PARSED_RESUME: ParsedResume = {
  name: null,
  email: null,
  phone: null,
  school: null,
  major: null,
  gradYear: null,
  gpa: null,
  skills: [],
  experiences: [],
  projects: [],
  links: [],
};

/* ------------------------------------------------------------------ *
 * Mapping into the profile form
 * ------------------------------------------------------------------ */

export interface ProfileSuggestions {
  displayName?: string;
  school?: string;
  major?: string;
  gradYear?: number;
  gpa?: number;
  portfolioUrl?: string;
}

/**
 * What a parsed resume can pre-fill.
 *
 * Only fields the document actually stated, and only ones the user has left
 * empty — a resume is evidence, not an override. The user confirms every value
 * by saving the form, so nothing derived here is stored without them seeing it.
 */
export function resumeToProfileSuggestions(
  parsed: ParsedResume,
  existing: {
    displayName?: string | null;
    school?: string | null;
    major?: string | null;
    gradYear?: number | null;
    gpa?: number | null;
    portfolioUrl?: string | null;
  },
): ProfileSuggestions {
  const out: ProfileSuggestions = {};

  if (!existing.displayName && parsed.name) out.displayName = parsed.name;
  if (!existing.school && parsed.school) out.school = parsed.school;
  if (!existing.major && parsed.major) out.major = parsed.major;
  if (existing.gradYear == null && parsed.gradYear != null) out.gradYear = parsed.gradYear;
  if (existing.gpa == null && parsed.gpa != null) out.gpa = parsed.gpa;

  if (!existing.portfolioUrl) {
    // Prefer a personal site over a profile on someone else's platform — it is
    // the link a cold email should carry.
    const url = pickPortfolioLink(parsed.links);
    if (url) out.portfolioUrl = url;
  }

  return out;
}

const PLATFORM_HOSTS = /(linkedin|github|gitlab|twitter|x\.com|instagram|facebook|medium)\./i;

export function pickPortfolioLink(links: string[]): string | null {
  const normalized = links
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`))
    .filter((l) => /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(l));

  return normalized.find((l) => !PLATFORM_HOSTS.test(l)) ?? null;
}
