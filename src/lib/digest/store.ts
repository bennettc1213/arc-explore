import { eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import type { TierId } from "@/lib/pricing/tiers";

/**
 * Reads and writes for the weekly digest.
 *
 * Runs from the scheduled job, which connects as the table owner and therefore
 * bypasses RLS — every query here is responsible for its own scoping.
 */

export interface DigestCandidate {
  userId: string;
  email: string;
  displayName: string | null;
  lastDigestAt: Date;
  unsubscribeToken: string;
  /** Their plan, so the digest ranks on the same timing weight their feed
   *  does. Two surfaces recommending from one corpus must not disagree about
   *  what "best" means. */
  plan: TierId;
}

/**
 * A row exactly as `db.execute` hands it back.
 *
 * `last_digest_iso` is a string and named so on purpose: `db.execute` returns
 * what the driver parsed, and casts to the type parameter without checking, so
 * a field typed `Date` compiles and then throws `getTime is not a function` on
 * the first real row. The deadline reminders learned that on live data; both
 * this and the alert job format the timestamp in SQL instead.
 */
interface RawDigestRow extends Record<string, unknown> {
  user_id: string;
  email: string;
  display_name: string | null;
  last_digest_iso: string;
  unsubscribe_token: string;
  plan: string;
}

/**
 * Everyone who could receive a digest.
 *
 * Opted in, and with an address `auth.users` says is **confirmed** — the same
 * rule the reminders and the alerts follow. `auth.users` holds unconfirmed
 * addresses for signups that never completed, and mailing one sends a student's
 * recommendations to a typo'd address.
 *
 * Whether each of these is actually *due* is decided by `digestDue`, in the
 * pure module, rather than by a `now() - interval '7 days'` here. The cadence
 * rule is the substance of a weekly email and belongs somewhere it can be
 * tested without a database.
 */
export async function digestCandidates(limit = 1000): Promise<DigestCandidate[]> {
  const rows = await db.execute<RawDigestRow>(sql`
    select
      p.id                as user_id,
      u.email             as email,
      p.display_name      as display_name,
      to_char(p.last_digest_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_digest_iso,
      p.unsubscribe_token as unsubscribe_token,
      p.plan              as plan
    from profiles p
      join auth.users u on u.id = p.id
    where p.weekly_digest_enabled
      and u.email is not null
      and u.email_confirmed_at is not null
      -- The weekly digest is an Edge+ entitlement (src/lib/pricing/tiers.ts,
      -- "weekly_digest"). Free-tier profiles still default weekly_digest_enabled
      -- to true (see schema.ts) since that default predates pricing tiers, so
      -- this filter — not the column — is what actually keeps free accounts
      -- off the send list.
      and p.plan in ('edge', 'apply')
    order by p.last_digest_at asc
    limit ${limit}`);

  return rows.flatMap((r) => {
    const lastDigestAt = new Date(r.last_digest_iso);
    // NaN compares false against everything, so an unparseable stamp would make
    // the profile silently never due rather than failing where it can be seen.
    if (Number.isNaN(lastDigestAt.getTime())) return [];
    return [
      {
        userId: r.user_id,
        email: r.email,
        displayName: r.display_name,
        lastDigestAt,
        unsubscribeToken: r.unsubscribe_token,
        // The SQL above already restricts to edge/apply; this parse is the
        // same fail-closed reading `getUserTier` does, so an unexpected value
        // degrades to the least capable tier rather than throwing.
        plan: r.plan === "apply" ? "apply" : r.plan === "edge" ? "edge" : "free",
      },
    ];
  });
}

/**
 * Move the watermark.
 *
 * Only after a send succeeds, for the reason the alert job states: moving it
 * first lets a failed send silently swallow the postings it was going to
 * report, and nothing records that it happened.
 */
export async function markDigested(userId: string, at: Date): Promise<void> {
  await db.update(profiles).set({ lastDigestAt: at }).where(eq(profiles.id, userId));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn the digest off from an email link.
 *
 * The shape check is not decoration: comparing text against a `uuid` column
 * raises `invalid input syntax` in Postgres, which 500s the page — the worst
 * possible response to someone trying to make our email stop.
 *
 * Narrow, like every other unsubscribe here. This stops the digest and nothing
 * else; deadline reminders and saved-search alerts are separate subscriptions
 * with separate links.
 */
export async function unsubscribeDigest(token: string): Promise<boolean> {
  if (!UUID_RE.test(token)) return false;

  const updated = await db
    .update(profiles)
    .set({ weeklyDigestEnabled: false })
    .where(eq(profiles.unsubscribeToken, token))
    .returning({ id: profiles.id });

  return updated.length > 0;
}
