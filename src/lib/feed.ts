/**
 * Feed query: pull open postings and score them for a profile.
 *
 * Server-side only. Scoring runs here rather than in the database so the
 * reason strings — which the UI renders beside every score — come from the same
 * tested code path as the numbers.
 */

import { desc, eq, isNull, and, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations, postings } from "@/db/schema";
import { rankingScore, scoreFit, type ScoreProfile, type FitResult } from "./score/fit";
import { scoreTiming, type TimingResult } from "./score/timing";

export interface FeedItem {
  id: string;
  title: string;
  company: string;
  url: string;
  locations: string[];
  isRemote: boolean;
  term: string | null;
  workAuth: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  fit: FitResult;
  timing: TimingResult;
}

export interface FeedFilters {
  /** Include postings that have closed. Off by default. */
  includeClosed?: boolean;
  /** Only postings whose term matches exactly. */
  term?: string | null;
  /** Only remote roles. */
  remoteOnly?: boolean;
  /** Hide roles the profile is hard-blocked from. */
  hideBlocked?: boolean;
  limit?: number;
}

export interface FeedStats {
  total: number;
  open: number;
  newToday: number;
  withUnknownTerm: number;
}

/**
 * Ranks by blocked status, then fit, then timing.
 *
 * Blocked postings sort last regardless of score. A role requiring U.S.
 * citizenship still scores well on term, field and location, so it can land a
 * fit in the 70s — which would put something the user *cannot apply to* above
 * roles they can. They stay visible (the employer's requirement is real
 * information, and requirements do change) but never outrank an actionable
 * posting.
 *
 * Postings we cannot score at all (null fit) sort below scored ones rather
 * than being hidden.
 */
function rank(a: FeedItem, b: FeedItem): number {
  if (a.fit.blocked !== b.fit.blocked) return a.fit.blocked ? 1 : -1;

  // Confidence-weighted, not the raw score — see rankingScore. Sorting on the
  // displayed number puts the postings we understand *least* at the top.
  const af = rankingScore(a.fit);
  const bf = rankingScore(b.fit);
  if (bf !== af) return bf - af;
  return b.timing.score - a.timing.score;
}

export async function getFeed(
  profile: ScoreProfile,
  filters: FeedFilters = {},
): Promise<FeedItem[]> {
  const conditions = [];
  if (!filters.includeClosed) conditions.push(isNull(postings.closedAt));
  if (filters.term) conditions.push(eq(postings.term, filters.term));
  if (filters.remoteOnly) conditions.push(eq(postings.isRemote, true));

  // Scholarship rows share this table but not this scorer — scoreFit reads
  // term/workAuth/degrees the way an internship posting fills them, and a
  // scholarship Fit Score does not exist yet. Scope this feed to internships
  // until it does, rather than mis-score whatever lands in `postings` next.
  conditions.push(eq(postings.kind, "internship"));

  const rows = await db
    .select({
      id: postings.id,
      title: postings.title,
      // Scholarship rows can have no orgId (see schema.ts) — coalesce to the
      // sponsor name scraped off the source page instead of dropping the row.
      company: sql<string>`coalesce(${organizations.name}, ${postings.sponsorName})`,
      url: postings.url,
      locations: postings.locations,
      isRemote: postings.isRemote,
      term: postings.term,
      workAuth: postings.workAuth,
      skills: postings.skills,
      // descriptionText is deliberately NOT selected. It is the largest column
      // in the table and the only thing that read it — skill extraction — now
      // happens at ingest. Shipping ~2MB of job-description text per feed
      // render to derive nothing is pure latency.
      firstSeenAt: postings.firstSeenAt,
      lastSeenAt: postings.lastSeenAt,
      closedAt: postings.closedAt,
      deadlineAt: postings.deadlineAt,
    })
    .from(postings)
    .leftJoin(organizations, eq(postings.orgId, organizations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(postings.firstSeenAt))
    .limit(filters.limit ?? 500);

  const now = new Date();

  const items: FeedItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    url: r.url,
    locations: r.locations,
    isRemote: r.isRemote,
    term: r.term,
    workAuth: r.workAuth,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    closedAt: r.closedAt,
    fit: scoreFit(profile, {
      title: r.title,
      term: r.term,
      locations: r.locations,
      isRemote: r.isRemote,
      workAuth: r.workAuth,
      // Precomputed at ingest — see postings.skills. Re-extracting here would
      // run ~70 patterns over every description for every visitor.
      skills: r.skills,
    }),
    timing: scoreTiming({
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      closedAt: r.closedAt,
      deadlineAt: r.deadlineAt,
      now,
    }),
  }));

  const filtered = filters.hideBlocked ? items.filter((i) => !i.fit.blocked) : items;
  return filtered.sort(rank);
}

export async function getFeedStats(): Promise<FeedStats> {
  // Serialized explicitly: the driver cannot bind a JS Date inside a raw `sql`
  // template, and silently fails with ERR_INVALID_ARG_TYPE at query time.
  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${postings.closedAt} is null)::int`,
      newToday: sql<number>`count(*) filter (where ${postings.firstSeenAt} > ${dayAgo}::timestamptz)::int`,
      withUnknownTerm: sql<number>`count(*) filter (where ${postings.term} is null)::int`,
    })
    .from(postings)
    .where(eq(postings.kind, "internship"));

  return row;
}

/** Distinct terms present in the corpus, for the filter control. */
export async function getAvailableTerms(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ term: postings.term })
    .from(postings)
    .where(and(isNull(postings.closedAt), eq(postings.kind, "internship")));
  return rows.map((r) => r.term).filter((t): t is string => Boolean(t)).sort();
}
