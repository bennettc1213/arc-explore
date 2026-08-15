import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { applications, events, profiles, savedSearches } from "@/db/schema";

import { isProfileUsable, type UsableProfileFields } from "../profile/types";
import type { MetricCounts } from "./types";

/**
 * The raw counts behind the metrics.
 *
 * NEARLY NONE OF THIS COMES FROM THE EVENT LOG, WHICH IS THE DESIGN. Signups,
 * applications, resumes, cover letters, saved searches and reports are all
 * facts about tables that already exist because a feature needed them. Counting
 * them from an event stream instead would mean maintaining a second, lossier
 * copy of something the database already knows exactly — and it would mean
 * every one of those numbers silently started at zero on the day analytics
 * shipped, rather than covering the whole history. The `events` table exists
 * only for the three things that genuinely leave no other trace.
 */
export async function metricCounts(): Promise<MetricCounts> {
  const [accounts, activation, output, usage, corpus] = await Promise.all([
    /* --------------------------------------------------------- reach */
    db.execute<{ signups: number; confirmed: number }>(sql`
      select
        count(*)::int                                          as signups,
        count(*) filter (where u.email_confirmed_at is not null)::int as confirmed
      from profiles p
        left join auth.users u on u.id = p.id`),

    /* ---------------------------------------------------- activation */
    // The five columns `isProfileUsable` reads, for every profile — because it
    // is a TypeScript function and restating its four-way OR in SQL would be a
    // second copy to drift, the same argument the feed's category filter makes.
    // Profiles is the smallest table here and will be for a long time; if that
    // stops being true this is the query to move, not the rule to duplicate.
    db
      .select({
        major: profiles.major,
        gradYear: profiles.gradYear,
        workAuth: profiles.workAuth,
        targetVerticals: profiles.targetVerticals,
        targetLocations: profiles.targetLocations,
      })
      .from(profiles),

    db.execute<{
      with_resume: number;
      with_application: number;
      tracked: number;
      submitted: number;
      letters: number;
      searches: number;
      reports: number;
      reminders: number;
    }>(sql`
      select
        (select count(distinct user_id) from resumes)::int      as with_resume,
        (select count(distinct user_id) from applications)::int as with_application,
        (select count(*) from applications)::int                as tracked,
        (select count(*) from applications where applied_at is not null)::int as submitted,
        (select count(*) from cover_letters)::int               as letters,
        (select count(*) from saved_searches)::int              as searches,
        (select count(*) from listing_reports)::int             as reports,
        (select count(*) from deadline_reminders)::int          as reminders`),

    /* --------------------------------------------------------- usage */
    db
      .select({
        name: events.name,
        n: sql<number>`count(*)::int`,
        // The zero-result share is read off the property rather than a second
        // event name, so a search that returned nothing is still one search.
        empty: sql<number>`count(*) filter (where ${events.props} ->> 'empty' = 'true')::int`,
      })
      .from(events)
      .groupBy(events.name),

    /* -------------------------------------------------------- corpus */
    db.execute<{ open: number; with_deadline: number; boards: number }>(sql`
      select
        (select count(*) from postings where closed_at is null and hidden_at is null)::int as open,
        (select count(*) from postings
           where closed_at is null and hidden_at is null
             and deadline_at is not null and deadline_at > now())::int as with_deadline,
        (select count(*) from organizations
           where ats_type <> 'unknown' and ats_slug is not null)::int as boards`),
  ]);

  const byName = new Map(usage.map((r) => [r.name, r]));
  const search = byName.get("search_run");

  return {
    signups: accounts[0].signups,
    confirmedSignups: accounts[0].confirmed,
    usableProfiles: activation.filter((row) =>
      isProfileUsable({
        ...row,
        // Narrowed here, the same way the profile store narrows on read: the
        // column is free text so an older value never becomes unreadable.
        workAuth: row.workAuth as UsableProfileFields["workAuth"],
        targetVerticals: row.targetVerticals as UsableProfileFields["targetVerticals"],
      }),
    ).length,
    withResume: output[0].with_resume,
    withTrackedApplication: output[0].with_application,
    applicationsTracked: output[0].tracked,
    applicationsSubmitted: output[0].submitted,
    coverLettersDrafted: output[0].letters,
    savedSearches: output[0].searches,
    reportsFiled: output[0].reports,
    remindersSent: output[0].reminders,
    filteredFeedRequests: search?.n ?? 0,
    zeroResultSearches: search?.empty ?? 0,
    listingViews: byName.get("listing_viewed")?.n ?? 0,
    githubAudits: byName.get("github_audited")?.n ?? 0,
    openPostings: corpus[0].open,
    postingsWithDeadline: corpus[0].with_deadline,
    companiesPolled: corpus[0].boards,
  };
}

/**
 * Counts for the last N days, for the handful of things worth trending.
 *
 * Only tables carrying a creation timestamp are here, which is why
 * `applications.created_at` was added in migration 0014 — without it, "tracked
 * this week" was unanswerable, since a row saved in March and re-read today
 * looked exactly like one saved this morning.
 */
export async function recentCounts(days = 7): Promise<{
  signups: number;
  applicationsTracked: number;
  filteredFeedRequests: number;
  savedSearches: number;
}> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [[signups], [tracked], [searches], [feed]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(profiles)
      .where(gt(profiles.createdAt, since)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(applications)
      .where(gt(applications.createdAt, since)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(savedSearches)
      .where(gt(savedSearches.createdAt, since)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.name, "search_run"), gt(events.at, since))),
  ]);

  return {
    signups: signups.n,
    applicationsTracked: tracked.n,
    savedSearches: searches.n,
    filteredFeedRequests: feed.n,
  };
}

/**
 * Which filters students actually use.
 *
 * The one thing the event log knows that no other table does, and the reason
 * `props` records filter *keys*: it answers "is the category filter worth the
 * taxonomy work" with evidence instead of an opinion. No query text is stored,
 * so this can say a search had a text term and never what it was.
 */
export async function filterUsage(): Promise<Array<{ filter: string; n: number }>> {
  const rows = await db.execute<{ filter: string; n: number }>(sql`
    select f as filter, count(*)::int as n
    from ${events}, jsonb_array_elements_text(coalesce(props -> 'filters', '[]'::jsonb)) as f
    where name = 'search_run'
    group by f
    order by n desc`);

  return [...rows];
}
