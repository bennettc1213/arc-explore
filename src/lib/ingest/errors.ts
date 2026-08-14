/**
 * Turning a thrown value into something an operator can act on.
 *
 * Written because a real failure was undiagnosable. The ScholarshipPortal run
 * on 2026-08-14 recorded ~300KB into `ingest_runs.detail` and none of it said
 * what went wrong: a Drizzle query failure's `message` is the entire SQL
 * statement followed by every bound parameter, while the actual Postgres error
 * — the constraint name, the SQLSTATE, the offending key — is on `err.cause`.
 * Storing `err.message` alone throws away the only part worth keeping and
 * keeps the part that fills the column.
 *
 * So this walks the cause chain, pulls the structured fields off any Postgres
 * error it finds, and bounds the whole thing to a length a human will read and
 * a text column will hold.
 */

/** Longest single error string we will record. */
const MAX_LENGTH = 400;

/** Longest fragment of a failing SQL statement worth keeping — enough to name
 *  the operation and the table, nowhere near enough to include the params. */
const MAX_QUERY_FRAGMENT = 120;

/** Cause chains are usually 2 links. Bounded so a self-referential `cause`
 *  cannot spin forever. */
const MAX_DEPTH = 4;

function collapse(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Drizzle formats failures as `Failed query: <sql> params: <every value>`.
 *
 * The params are what make these messages enormous — one bulk insert carries
 * thousands of them — and they are also the half most likely to contain a
 * student's data, so they are dropped rather than truncated.
 */
function summarizeMessage(message: string): string {
  const failed = /^Failed query:\s*([\s\S]*)$/.exec(message);
  if (!failed) return collapse(message, MAX_LENGTH);

  const withoutParams = failed[1].split(/\bparams:/)[0];
  return collapse(withoutParams, MAX_QUERY_FRAGMENT);
}

/** The fields postgres.js hangs off a `PostgresError`. All optional — a
 *  network-level failure carries none of them. */
const PG_FIELDS = ["code", "constraint", "table", "column"] as const;

function pgAnnotations(err: object): string[] {
  const out: string[] = [];
  for (const field of PG_FIELDS) {
    const value = (err as Record<string, unknown>)[field];
    if (typeof value === "string" && value) out.push(`${field}=${value}`);
  }

  // `detail` names the actual offending value ("Key (canonical_hash)=(…)
  // already exists"), which is the single most useful line when a constraint
  // trips — but it can also restate a whole row, so it is capped hard.
  const detail = (err as Record<string, unknown>).detail;
  if (typeof detail === "string" && detail) out.push(`detail=${collapse(detail, 120)}`);

  return out;
}

/**
 * A bounded, single-line description of a thrown value and its causes.
 *
 * Links are joined newest-first with `←`, so the wrapper reads first and the
 * root cause — the part that says `duplicate key value violates unique
 * constraint` — reads last.
 */
export function describeError(err: unknown): string {
  const links: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  for (let depth = 0; current != null && depth < MAX_DEPTH; depth++) {
    // A cause that points back at an ancestor would otherwise loop.
    if (seen.has(current)) break;
    seen.add(current);

    if (current instanceof Error) {
      const annotations = pgAnnotations(current);
      const summary = summarizeMessage(current.message);
      links.push(annotations.length > 0 ? `${summary} [${annotations.join(" ")}]` : summary);
      current = current.cause;
    } else {
      links.push(collapse(String(current), MAX_LENGTH));
      break;
    }
  }

  if (links.length === 0) return "unknown error";
  return collapse(links.join(" ← "), MAX_LENGTH);
}
