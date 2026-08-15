/**
 * What a usage event is allowed to carry.
 *
 * Free of database imports so the rule can be tested without a connection —
 * the same split `admin/allowlist.ts` and `feed-search.ts` already make, and
 * for a sharper reason here: this function is the boundary that keeps
 * identifying data out of the `events` table, and a boundary nobody can test is
 * not a boundary.
 *
 * THE RULE. An event property is a low-cardinality label — a filter key, a
 * result bucket, a score. Anything else is dropped. A caller that hands over a
 * search query, a profile object or a user id cannot get it into the table,
 * whether by mistake or because somebody later decided it would be useful.
 */

/** Property values we will store. Anything else is dropped. */
export type PropValue = string | number | boolean | string[];

/**
 * Values are capped hard.
 *
 * Anything longer than this is by definition not a label. It is far more likely
 * to be user-typed text that should never have been passed, so the cap is a
 * backstop for the rule above rather than a storage concern.
 */
export const MAX_VALUE_LENGTH = 40;
export const MAX_ARRAY_LENGTH = 12;
export const MAX_KEYS = 8;

export function sanitize(props: Record<string, unknown> | undefined): Record<string, PropValue> {
  if (!props) return {};

  const out: Record<string, PropValue> = {};

  for (const [key, value] of Object.entries(props)) {
    if (Object.keys(out).length >= MAX_KEYS) break;

    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      out[key] = value;
    } else if (typeof value === "string") {
      // Truncated, never hashed: a hash of a search query is still a stable
      // identifier for that query, and storing one invites joining it back to
      // something later.
      if (value.length <= MAX_VALUE_LENGTH) out[key] = value;
    } else if (Array.isArray(value)) {
      const clean = value
        .filter((v): v is string => typeof v === "string" && v.length <= MAX_VALUE_LENGTH)
        .slice(0, MAX_ARRAY_LENGTH);
      if (clean.length > 0) out[key] = clean;
    }
    // null, undefined, objects and functions fall through and are dropped.
  }

  return out;
}
