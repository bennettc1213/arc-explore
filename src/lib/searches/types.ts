/**
 * Saved searches: the stored filter set, and its validation.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the `filters` column is jsonb, and the
 * values that go into it come from a URL. So it is validated against a fixed
 * schema on the way **in and on the way out** — nothing else may ever end up in
 * that column, and nothing already in it is trusted on read. An old row from a
 * shape we have since changed degrades field by field rather than throwing on a
 * page someone just wanted to look at, which is the same `.catch` discipline
 * `resumes.parsed` follows.
 *
 * Free of database imports so every rule here is unit-testable.
 */

import { z } from "zod";

import { POSTING_KINDS } from "@/db/schema";
import { DEADLINE_FILTERS } from "../feed-search";
import { FIELD_KEYS } from "../score/fit";

export const MAX_NAME_LENGTH = 80;
export const MAX_SAVED_SEARCHES = 20;

/**
 * The saveable subset of the feed's filters.
 *
 * `limit`, `includeClosed` and `hideBlocked` are deliberately not saveable.
 * The first two are view preferences rather than a search, and an alert about
 * *closed* postings is not a thing anyone wants. `hideBlocked` depends on the
 * profile, which changes independently of the search.
 *
 * Every field is optional and every field `.catch`es to null, so a row written
 * by an older version of this schema still reads.
 */
export const savedFiltersSchema = z.object({
  q: z.string().trim().max(200).nullable().catch(null),
  kind: z.enum(POSTING_KINDS).nullable().catch(null),
  deadline: z.enum(DEADLINE_FILTERS).nullable().catch(null),
  minAmount: z.number().int().min(0).max(1_000_000).nullable().catch(null),
  location: z.string().trim().max(120).nullable().catch(null),
  term: z.string().trim().max(80).nullable().catch(null),
  category: z.enum(FIELD_KEYS).nullable().catch(null),
  remoteOnly: z.boolean().catch(false),
});

export type SavedFilters = z.infer<typeof savedFiltersSchema>;

export const EMPTY_FILTERS: SavedFilters = {
  q: null,
  kind: null,
  deadline: null,
  minAmount: null,
  location: null,
  term: null,
  category: null,
  remoteOnly: false,
};

/** Read a stored `filters` value back into the current shape. Total. */
export function coerceFilters(value: unknown): SavedFilters {
  const result = savedFiltersSchema.safeParse(value);
  return result.success ? result.data : EMPTY_FILTERS;
}

/** True when nothing is actually being filtered on. */
export function isEmptyFilters(f: SavedFilters): boolean {
  return (
    !f.q && !f.kind && !f.deadline && f.minAmount === null && !f.location && !f.term &&
    !f.category && !f.remoteOnly
  );
}

/* ------------------------------------------------------------------ *
 * URL round-trip
 * ------------------------------------------------------------------ */

/**
 * Pull the saveable filters out of feed search params.
 *
 * Only known keys are read, so a URL carrying anything else contributes
 * nothing — this is the boundary where untrusted input stops.
 */
export function filtersFromParams(sp: Record<string, string | string[] | undefined>): SavedFilters {
  const one = (k: string): string | null => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    const t = s?.trim();
    return t ? t : null;
  };

  const amount = Number(one("minAmount"));

  return coerceFilters({
    q: one("q"),
    kind: one("kind"),
    deadline: one("deadline"),
    minAmount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null,
    location: one("location"),
    term: one("term"),
    category: one("category"),
    remoteOnly: one("remote") === "1",
  });
}

/** The feed URL that reproduces a saved search. */
export function filtersToQuery(f: SavedFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.kind) p.set("kind", f.kind);
  if (f.deadline) p.set("deadline", f.deadline);
  if (f.minAmount !== null) p.set("minAmount", String(f.minAmount));
  if (f.location) p.set("location", f.location);
  if (f.term) p.set("term", f.term);
  if (f.category) p.set("category", f.category);
  if (f.remoteOnly) p.set("remote", "1");
  return p.toString();
}

/**
 * A short human description, for the saved-search list and the email subject.
 *
 * Built from the filters actually set rather than from a template with blanks,
 * so it never reads "internships in  for ".
 */
export function describeFilters(f: SavedFilters): string {
  const bits: string[] = [];
  if (f.q) bits.push(`“${f.q}”`);
  bits.push(f.kind === "scholarship" ? "scholarships" : f.kind === "internship" ? "internships" : "everything");
  if (f.category) bits.push(`in ${f.category.replace(/_/g, " ")}`);
  if (f.location) bits.push(`near ${f.location}`);
  if (f.remoteOnly) bits.push("remote only");
  if (f.term) bits.push(f.term);
  if (f.minAmount !== null) bits.push(`$${f.minAmount.toLocaleString("en-US")}+`);
  if (f.deadline === "set") bits.push("with a stated deadline");
  else if (f.deadline) bits.push(`closing within ${f.deadline} days`);
  return bits.join(" · ");
}

/**
 * A default name, used only when the student does not type one.
 *
 * Their words win: we never rewrite a name they chose, and this is a
 * convenience for the common case of saving a search in one click.
 */
export function defaultName(f: SavedFilters): string {
  return describeFilters(f).slice(0, MAX_NAME_LENGTH);
}

export const saveSearchSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable(),
  filters: savedFiltersSchema,
});
