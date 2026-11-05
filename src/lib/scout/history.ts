import { scoutSchema, type ScoutPreferences } from "./types";

/** A recent Scout is always validated before it is written or shown again. */
export function coerceScoutPreferences(value: unknown): ScoutPreferences | null {
  const parsed = scoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Zod returns keys in schema order, making this safe to use for deduplication. */
export function scoutFingerprint(prefs: ScoutPreferences): string {
  return JSON.stringify(prefs);
}

export function describeScout(prefs: ScoutPreferences): string {
  const kind = prefs.merit
    ? "Merit awards"
    : prefs.kind === "both"
      ? "Internships + scholarships"
      : prefs.kind === "internship"
        ? "Internships"
        : "Scholarships";
  const details = [prefs.field || null, prefs.remote ? "Remote only" : prefs.location || null].filter(Boolean);
  return [kind, ...details].join(" · ");
}
