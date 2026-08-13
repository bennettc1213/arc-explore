import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import { SATURATION } from "./skills";

/**
 * How a resume stands against the whole corpus, not one listing.
 *
 * The per-listing keyword gap tells a student what one employer wants. This
 * answers the question they actually have: *what should I go learn next?* — by
 * counting which skills appear most often across open roles they do not
 * already have.
 *
 * Cheap because `postings.skills` is derived at ingest. Aggregating this from
 * raw description text would mean scanning every JD in the corpus on every
 * profile page load.
 */

export interface Competitiveness {
  /** Open postings that name at least one recognisable skill. */
  scoreablePostings: number;
  /** Of those, how many name at least one skill the resume shows. */
  postingsWithOverlap: number;
  /** Of those, how many the resume covers to the saturation point. */
  postingsStronglyMatched: number;
  /**
   * Skills appearing most often in postings the resume does not cover.
   *
   * Ordered by how many additional postings learning each would put in reach —
   * the only ranking that answers "what next" rather than just "what is
   * popular".
   */
  topGaps: Array<{ skill: string; postings: number }>;
  /** The user's skills the corpus asks for most. */
  strongest: Array<{ skill: string; postings: number }>;
}

/**
 * Render a JS array as a single Postgres array literal.
 *
 * Drizzle's `sql` template spreads a JS array into one placeholder per element,
 * so `${skills}::text[]` compiles to `($1,$2,$3)::text[]` — a row constructor,
 * which Postgres rejects. Passing one literal keeps it a single bound
 * parameter, so this is still parameterised, not interpolated.
 */
function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}

interface CountRow extends Record<string, unknown> {
  skill: string;
  n: string | number;
}

export async function resumeCompetitiveness(
  resumeSkills: readonly string[],
): Promise<Competitiveness | null> {
  if (resumeSkills.length === 0) return null;

  const mine = pgTextArray(resumeSkills);

  const totals = await db.execute<{
    scoreable: string | number;
    overlap: string | number;
    strong: string | number;
  }>(sql`
    select
      count(*)::int as scoreable,
      count(*) filter (where skills && ${mine}::text[])::int as overlap,
      count(*) filter (
        where cardinality(
                array(select unnest(skills) intersect select unnest(${mine}::text[]))
              ) >= least(cardinality(skills), ${SATURATION})
      )::int as strong
    from postings
    where closed_at is null and cardinality(skills) > 0`);

  const gaps = await db.execute<CountRow>(sql`
    select s as skill, count(*)::int as n
    from postings, unnest(skills) as s
    where closed_at is null and not (s = any(${mine}::text[]))
    group by s order by n desc limit 6`);

  const strongest = await db.execute<CountRow>(sql`
    select s as skill, count(*)::int as n
    from postings, unnest(skills) as s
    where closed_at is null and s = any(${mine}::text[])
    group by s order by n desc limit 6`);

  const row = totals[0];

  return {
    scoreablePostings: Number(row?.scoreable ?? 0),
    postingsWithOverlap: Number(row?.overlap ?? 0),
    postingsStronglyMatched: Number(row?.strong ?? 0),
    topGaps: gaps.map((r) => ({ skill: r.skill, postings: Number(r.n) })),
    strongest: strongest.map((r) => ({ skill: r.skill, postings: Number(r.n) })),
  };
}
