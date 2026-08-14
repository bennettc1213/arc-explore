/**
 * Reads and writes for deadline reminders.
 *
 * Runs from the scheduled job, which connects as the table owner and therefore
 * bypasses RLS — see the note at the top of `profile/store.ts`. Every query
 * here is responsible for its own scoping.
 */

import { and, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { deadlineReminders, postings, profiles } from "@/db/schema";
import type { ReminderWindow } from "./select";

/**
 * A row exactly as `db.execute` hands it back.
 *
 * `deadlineAtIso` is a string and is named so on purpose. Drizzle's query
 * builder converts a timestamptz to a `Date`, but `db.execute` returns what
 * the driver parsed — for raw SQL that is the text `2027-05-31 00:00:00+00` —
 * and `db.execute<T>()` casts to `T` without checking, so a field typed as
 * `Date` here compiles perfectly and then throws `getTime is not a function`
 * on the first row that ever reaches it. It did: the dry run passed for days
 * because no candidate had a deadline, and the first one that did crashed the
 * job. The type now says what the driver actually returns.
 */
interface RawReminderRow extends Record<string, unknown> {
  userId: string;
  postingId: string;
  deadlineAtIso: string;
  email: string;
  displayName: string | null;
  unsubscribeToken: string;
  title: string;
  company: string | null;
  url: string;
  kind: string;
}

/**
 * The same row with a real `Date`.
 *
 * Spelled out rather than derived with `Omit<RawReminderRow, …>`: `Omit` is
 * `Pick<T, Exclude<keyof T, K>>`, and `keyof` a type carrying an index
 * signature is `string | number` — so the named properties vanish and what
 * survives is a bare index signature that satisfies almost nothing.
 */
export interface ReminderRow {
  userId: string;
  postingId: string;
  deadlineAt: Date;
  email: string;
  displayName: string | null;
  unsubscribeToken: string;
  title: string;
  company: string | null;
  url: string;
  kind: string;
}

/**
 * Everything a reminder could be sent about.
 *
 * The filters here are the substance of the feature, so they are worth stating
 * plainly:
 *
 *  - **`status = 'saved'` only.** The tracker's later states mean the student
 *    already submitted; reminding someone to apply to a job they are
 *    interviewing for is noise that teaches them to ignore us.
 *  - **Open postings only.** A closed row's deadline is irrelevant.
 *  - **A deadline in the future.** Selection re-checks this, but there is no
 *    reason to haul rows across the wire to discard them.
 *  - **Opted in.** Unsubscribing has to actually stop the mail.
 *  - **A confirmed email.** `auth.users` holds unconfirmed addresses for
 *    signups that never completed; mailing one sends a student's saved
 *    opportunities to an address nobody proved they own.
 *
 * The email comes from `auth.users` because that is where magic-link auth
 * keeps it — `profiles` deliberately holds no copy, so there is no second
 * address to drift out of sync with the one that can actually sign in.
 */
export async function reminderCandidates(): Promise<ReminderRow[]> {
  const rows = await db.execute<RawReminderRow>(sql`
    select
      a.user_id                                        as "userId",
      a.posting_id                                     as "postingId",
      -- Formatted in SQL rather than parsed from the driver's default text.
      -- Postgres emits "2027-05-31 00:00:00+00", which has a space instead of
      -- a T and a two-digit offset; Date can be talked into reading it, but
      -- only by leaning on engine leniency for a value that decides when a
      -- student is told their deadline is. This form is unambiguous.
      to_char(p.deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                                                       as "deadlineAtIso",
      u.email                                          as "email",
      pr.display_name                                  as "displayName",
      pr.unsubscribe_token                             as "unsubscribeToken",
      p.title                                          as "title",
      coalesce(o.name, p.sponsor_name)                 as "company",
      p.url                                            as "url",
      p.kind                                           as "kind"
    from applications a
      join postings p       on p.id = a.posting_id
      join profiles pr      on pr.id = a.user_id
      join auth.users u     on u.id = a.user_id
      left join organizations o on o.id = p.org_id
    where a.status = 'saved'
      and p.closed_at is null
      and p.deadline_at is not null
      and p.deadline_at > now()
      and pr.deadline_reminders_enabled
      and u.email is not null
      and u.email_confirmed_at is not null
  `);

  return rows.flatMap((row) => {
    const deadlineAt = new Date(row.deadlineAtIso);
    // An unparseable date would become NaN, and every comparison against NaN
    // is false — so the row would silently never be due rather than failing
    // loudly. Dropped here, where it can at least be counted.
    if (Number.isNaN(deadlineAt.getTime())) return [];

    return [
      {
        userId: row.userId,
        postingId: row.postingId,
        deadlineAt,
        email: row.email,
        displayName: row.displayName,
        unsubscribeToken: row.unsubscribeToken,
        title: row.title,
        company: row.company,
        url: row.url,
        kind: row.kind,
      },
    ];
  });
}

/** Keys of every reminder already sent, for the windows still in play. */
export async function sentReminderKeys(): Promise<Set<string>> {
  const rows = await db
    .select({
      userId: deadlineReminders.userId,
      postingId: deadlineReminders.postingId,
      daysBefore: deadlineReminders.daysBefore,
      deadlineAt: deadlineReminders.deadlineAt,
    })
    .from(deadlineReminders);

  return new Set(
    rows.map((r) => `${r.userId}:${r.postingId}:${r.daysBefore}:${r.deadlineAt.toISOString()}`),
  );
}

/**
 * Record that a reminder went out.
 *
 * `onConflictDoNothing` against the unique index, so two overlapping runs of
 * the job cannot produce a second send — the row is the receipt, and a
 * duplicate is simply not written.
 */
export async function recordReminderSent(
  userId: string,
  postingId: string,
  daysBefore: ReminderWindow,
  deadlineAt: Date,
): Promise<void> {
  await db
    .insert(deadlineReminders)
    .values({ userId, postingId, daysBefore, deadlineAt })
    .onConflictDoNothing();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn reminders off for whoever holds this token.
 *
 * Returns false for a token we do not recognise rather than throwing, so the
 * page can say plainly that the link did not work.
 *
 * The shape check is not decoration. `unsubscribe_token` is a `uuid` column,
 * and comparing it against text Postgres cannot parse as a uuid raises
 * `invalid input syntax` — which surfaced as a 500 on
 * `/unsubscribe?token=whatever`. An error page is a bad response to anyone;
 * it is a genuinely awful one to somebody who is trying to make our email
 * stop, since their remaining option is to report us as spam.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!UUID_RE.test(token)) return false;

  const updated = await db
    .update(profiles)
    .set({ deadlineRemindersEnabled: false })
    .where(eq(profiles.unsubscribeToken, token))
    .returning({ id: profiles.id });

  return updated.length > 0;
}

/** Open postings carrying a future deadline — the ceiling on what reminders
 *  could ever cover. Reported by the job so a run of zero is legible. */
export async function remindablePostingCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postings)
    .where(and(isNull(postings.closedAt), gte(postings.deadlineAt, new Date())));

  return row?.n ?? 0;
}
