/**
 * "Since you last looked": when this student's previous feed visit started.
 *
 * TWO TIMESTAMPS, NO HISTORY. `last_feed_seen_at` is the start of the current
 * visit and `prev_feed_seen_at` the start of the one before. A new visit begins
 * after `VISIT_GAP_MINUTES` away. One column was not enough: every filter
 * change re-renders the feed, so overwriting a single "last seen" on render
 * would erase the banner on the student's first click.
 *
 * WHY RAW SQL, NOT A COLUMN IN `db/schema.ts`. Same reason as
 * `funding-goal.ts`: local `.env` points at the production database, migration
 * 0035 is applied by hand, and `getProfile` selects every declared column, so
 * declaring these before they exist would 500 every signed-in page. A missing
 * column is a state here (`null`), never an error. Once 0035 is applied,
 * declare both columns on `profiles`.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import { isMissingColumn } from "./funding-goal";
import { sinceLabel } from "./visit-label";

export const VISIT_GAP_MINUTES = 30;

const ISO = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS"Z"'`);

/**
 * Records this feed view and returns when the PREVIOUS visit started, or null
 * (first visit ever, or migration 0035 not applied yet). Scoped to the
 * session's own id by the caller.
 *
 * Writes only when a new visit begins, so re-renders inside one visit cost a
 * read, not a row rewrite.
 */
export async function touchFeedVisit(userId: string): Promise<Date | null> {
  try {
    const rows = await db.execute<{ prev: string | null }>(sql`
      with started as (
        update profiles set
          prev_feed_seen_at = last_feed_seen_at,
          last_feed_seen_at = now()
        where id = ${userId}
          and (last_feed_seen_at is null
               or last_feed_seen_at < now() - make_interval(mins => ${VISIT_GAP_MINUTES}))
        returning prev_feed_seen_at
      )
      select to_char(coalesce(
        (select prev_feed_seen_at from started),
        (select prev_feed_seen_at from profiles where id = ${userId} and not exists (select 1 from started))
      ) at time zone 'UTC', ${ISO}) as prev`);
    const prev = rows[0]?.prev ?? null;
    return prev ? new Date(prev) : null;
  } catch (err) {
    if (isMissingColumn(err)) return null;
    throw err;
  }
}

export interface PreviousVisit {
  at: Date;
  /** "since Tuesday", worded against this request's clock. */
  label: string;
  /** Whole days back to it, rounded up: the `?new=` filter that covers it. */
  days: number;
}

/** `touchFeedVisit` plus its wording, with `now` taken here and not in render. */
export async function previousFeedVisit(userId: string): Promise<PreviousVisit | null> {
  const at = await touchFeedVisit(userId);
  if (!at) return null;
  const now = new Date();
  return {
    at,
    label: sinceLabel(at, now),
    days: Math.max(1, Math.ceil((now.getTime() - at.getTime()) / 86_400_000)),
  };
}
