/**
 * The application packet — every field a form is about to ask for, filled from
 * what we already hold.
 *
 * Free of network and database imports so the rules are unit-testable.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. It is a student's own data,
 * assembled so they stop retyping it for the fortieth time. It is not an
 * auto-applier: nothing here submits anything, and nothing here answers a
 * question the student has not already answered somewhere. Every value carries
 * the source it came from, so a student can see at a glance whether a field is
 * something they told us or something we could not find.
 *
 * THE ATTESTATION RULE. Applications mix two kinds of question, and conflating
 * them is how this feature would do real harm. Most are facts a student has
 * already stated — name, school, graduation year. A few are *legal
 * attestations*: work authorization, citizenship, veteran and disability
 * status, demographic questions. Getting one of those wrong is not a typo, it
 * is a false statement on a form the student signs.
 *
 * So attestations are separated out and never pre-filled with a guess. Where
 * we hold the answer because the student typed it into their own profile, it
 * is shown as *theirs to confirm*, not as ours to assert. Where we do not hold
 * it, we say so and leave it alone — we never infer someone's demographics
 * from anything.
 */

import type { ParsedResume } from "../resume/types";
import { WORK_AUTH_OPTIONS, type UserProfile } from "../profile/types";

/** Where a value came from. Rendered beside every field. */
export type FieldSource = "profile" | "resume" | "account" | "missing";

export interface PacketField {
  key: string;
  label: string;
  /** Null means we genuinely do not hold it. Never an empty string. */
  value: string | null;
  source: FieldSource;
  /** Shown when the value is missing, or when it needs a second look. */
  note?: string;
  /**
   * Both sources hold this field and they disagree.
   *
   * Surfaced rather than silently resolved. A resume claiming a 3.7 GPA and a
   * profile claiming 3.5 means one of them is going onto an application
   * wrong, and the student is the only one who can say which.
   */
  conflict?: { profile: string; resume: string };
}

export interface ApplicationPacket {
  /** Ordinary facts, safe to copy straight into a form. */
  fields: PacketField[];
  /**
   * Questions the student must answer themselves. Never pre-filled by us,
   * even when we could guess — see the attestation rule above.
   */
  attestations: PacketField[];
  known: number;
  total: number;
}

function pick(
  profileValue: string | null,
  resumeValue: string | null,
): { value: string | null; source: FieldSource; conflict?: { profile: string; resume: string } } {
  const p = profileValue?.trim() || null;
  const r = resumeValue?.trim() || null;

  if (p && r && p.toLowerCase() !== r.toLowerCase()) {
    // Profile wins: it is what the student typed most recently and directly,
    // rather than what an extractor read off a document. The disagreement is
    // still reported.
    return { value: p, source: "profile", conflict: { profile: p, resume: r } };
  }

  if (p) return { value: p, source: "profile" };
  if (r) return { value: r, source: "resume" };
  return { value: null, source: "missing" };
}

const str = (v: string | number | null | undefined): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

export interface PacketInput {
  profile: UserProfile | null;
  resume: ParsedResume | null;
  /** The address the student signs in with — the one address we always hold. */
  accountEmail: string | null;
}

export function buildApplicationPacket(input: PacketInput): ApplicationPacket {
  const { profile, resume, accountEmail } = input;
  const p = profile;
  const r = resume;

  const name = pick(str(p?.displayName), str(r?.name));
  const school = pick(str(p?.school), str(r?.school));
  const major = pick(str(p?.major), str(r?.major));
  const gradYear = pick(str(p?.gradYear), str(r?.gradYear));
  const gpa = pick(str(p?.gpa), str(r?.gpa));

  // Email is the one field we can always answer: magic-link auth means the
  // account address is proven to work, which a résumé's printed address is
  // not. The resume's is preferred only when it is the same person's choice
  // of contact address and we have nothing else.
  const resumeEmail = str(r?.email);
  const email: PacketField = accountEmail
    ? {
        key: "email",
        label: "email",
        value: accountEmail,
        source: "account",
        note:
          resumeEmail && resumeEmail.toLowerCase() !== accountEmail.toLowerCase()
            ? `your resume prints ${resumeEmail} — use whichever you actually check`
            : undefined,
      }
    : {
        key: "email",
        label: "email",
        value: resumeEmail,
        source: resumeEmail ? "resume" : "missing",
      };

  const links = [
    ...(r?.links ?? []),
    ...(p?.portfolioUrl ? [p.portfolioUrl] : []),
  ]
    .map((l) => l.trim())
    .filter(Boolean);
  const uniqueLinks = [...new Set(links.map((l) => l.toLowerCase()))].map(
    (lower) => links.find((l) => l.toLowerCase() === lower)!,
  );

  const fields: PacketField[] = [
    { key: "name", label: "full name", ...name, note: name.value ? undefined : "add it to your profile or resume" },
    email,
    {
      key: "phone",
      label: "phone",
      value: str(r?.phone),
      source: r?.phone ? "resume" : "missing",
      note: r?.phone ? undefined : "not on your resume — applications usually require one",
    },
    { key: "school", label: "school", ...school, note: school.value ? undefined : "add it to your profile" },
    { key: "major", label: "major", ...major, note: major.value ? undefined : "add it to your profile" },
    {
      key: "gradYear",
      label: "graduation year",
      ...gradYear,
      note: gradYear.value ? undefined : "add it to your profile",
    },
    {
      key: "gpa",
      label: "GPA",
      ...gpa,
      // Not every application asks, and not stating one is a legitimate
      // choice — so a blank here is not a gap to nag about.
      note: gpa.value ? undefined : "not stated — only fill this in if the form requires it",
    },
    {
      key: "links",
      label: "portfolio / GitHub / LinkedIn",
      value: uniqueLinks.length > 0 ? uniqueLinks.join("  ·  ") : null,
      source: uniqueLinks.length > 0 ? "resume" : "missing",
      note: uniqueLinks.length > 0 ? undefined : "no links on your resume or profile",
    },
    {
      key: "locations",
      label: "preferred locations",
      value: (p?.targetLocations ?? []).length > 0 ? (p?.targetLocations ?? []).join(", ") : null,
      source: (p?.targetLocations ?? []).length > 0 ? "profile" : "missing",
    },
  ];

  const workAuthLabel = p?.workAuth
    ? WORK_AUTH_OPTIONS.find((o) => o.value === p.workAuth)?.label ?? p.workAuth
    : null;

  const attestations: PacketField[] = [
    {
      key: "workAuth",
      label: "work authorization",
      value: workAuthLabel,
      source: workAuthLabel ? "profile" : "missing",
      note: workAuthLabel
        ? "you told us this — confirm it is still true before you submit, it is a legal declaration"
        : "we do not hold this, and we will not guess at a legal declaration",
    },
    {
      key: "sponsorship",
      label: "will you require sponsorship?",
      value: null,
      source: "missing",
      note: "answer this yourself — it follows from your work authorization, and getting it wrong is a false statement",
    },
    {
      key: "demographics",
      label: "race, gender, veteran and disability questions",
      value: null,
      source: "missing",
      note: "we never store or infer these. they are voluntary on every US application, and they are yours alone to answer",
    },
  ];

  const known = fields.filter((f) => f.value !== null).length;

  return { fields, attestations, known, total: fields.length };
}
