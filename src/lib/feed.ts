/**
 * Feed query: pull open postings and score them for a profile.
 *
 * Server-side only. Scoring runs here rather than in the database so the
 * reason strings — which the UI renders beside every score — come from the same
 * tested code path as the numbers.
 *
 * One list for both kinds: the roadmap's design intent is a combined feed, so
 * the query no longer scopes to `kind = 'internship'`. Internships are scored
 * with `scoreFit` and scholarships with `scoreScholarshipFit` — two different
 * scorers reading the same row's different facts, never one scorer forced to
 * read the other's columns.
 */

import { desc, eq, isNull, and, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { organizations, postings, type FreshnessTier, type PostingKind } from "@/db/schema";
import {
  rankingScore,
  scoreFit,
  type ScoreProfile,
  type FitResult,
} from "./score/fit";
import { scoreScholarshipFit } from "./score/scholarship-fit";
import { scoreTiming, type TimingResult } from "./score/timing";

export interface FeedItem {
  id: string;
  kind: PostingKind;
  title: string;
  company: string;
  url: string;
  locations: string[];
  isRemote: boolean;
  term: string | null;
  workAuth: string | null;
  /** Canonical skill names named by the posting, derived at ingest. */
  skills: string[];
  /** Employer-stated application deadline, when the source publishes one. */
  deadlineAt: Date | null;
  /** Scholarship dollar bounds. Null means "amount varies" or unstated. */
  amountMin: number | null;
  amountMax: number | null;
  amountNeedsReview: boolean;
  /** Raw eligibility bullets, as the source stated them. */
  eligibility: string[];
  isContentMarketing: boolean;
  /** How strong the freshness claim on this row may be — see schema. */
  freshnessTier: FreshnessTier;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  fit: FitResult;
  timing: TimingResult;
}

/** "set" = any stated upcoming deadline; "30"/"60"/"90" = closing within N days. */
export type DeadlineFilter = "set" | "30" | "60" | "90";

export interface FeedFilters {
  /** Include postings that have closed. Off by default. */
  includeClosed?: boolean;
  /** Only postings whose term matches exactly. */
  term?: string | null;
  /** Only remote roles. */
  remoteOnly?: boolean;
  /** Only internships, only scholarships, or both (the default). */
  kind?: PostingKind | null;
  /** A stated deadline, or one closing within the next N days. */
  deadline?: DeadlineFilter | null;
  /** Only rows whose stated award/pay meets this lower bound. */
  minAmount?: number | null;
  /** Free-text match against a posting's listed locations. */
  location?: string | null;
  /** Hide roles the profile is hard-blocked from. */
  hideBlocked?: boolean;
  /** Max rows to return. Applied AFTER ranking, so the list is never
   *  truncated in a way that silently drops one kind. */
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
 * than being hidden. This is also what keeps the two kinds comparable in one
 * list: `rankingScore` shrinks toward a neutral prior by how many dimensions
 * a score rests on, so a confident internship match and a field-matched
 * scholarship rank against each other on the same yardstick.
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

/** The `{ criteria: string[] }` blob persist writes is all the schema has. */
function criteriaFrom(eligibility: unknown): string[] {
  if (eligibility && typeof eligibility === "object") {
    const criteria = (eligibility as { criteria?: unknown }).criteria;
    if (Array.isArray(criteria)) {
      return criteria.filter((c): c is string => typeof c === "string");
    }
  }
  return [];
}

/** The columns both `getFeed` and `getPosting` load, so a single posting scores
 *  through the exact same code path as a feed row. */
const FEED_SELECT = {
  id: postings.id,
  kind: postings.kind,
  title: postings.title,
  // Scholarship rows can have no orgId (see schema.ts) — coalesce to the
  // sponsor name scraped off the source page instead of dropping the row.
  company: sql<string>`coalesce(${organizations.name}, ${postings.sponsorName})`,
  url: postings.url,
  sponsorName: postings.sponsorName,
  locations: postings.locations,
  isRemote: postings.isRemote,
  term: postings.term,
  workAuth: postings.workAuth,
  skills: postings.skills,
  deadlineAt: postings.deadlineAt,
  amountMin: postings.amountMin,
  amountMax: postings.amountMax,
  amountNeedsReview: postings.amountNeedsReview,
  eligibility: postings.eligibility,
  isContentMarketing: postings.isContentMarketing,
  freshnessTier: postings.freshnessTier,
  // descriptionText is deliberately NOT selected. It is the largest column
  // in the table and the only thing that read it — skill extraction — now
  // happens at ingest. Shipping ~2MB of job-description text per feed
  // render to derive nothing is pure latency.
  firstSeenAt: postings.firstSeenAt,
  lastSeenAt: postings.lastSeenAt,
  closedAt: postings.closedAt,
} as const;

/** Shape of a `FEED_SELECT` row after the join — shared by feed and detail. */
interface FeedRow {
  id: string;
  kind: PostingKind;
  title: string;
  company: string;
  url: string;
  sponsorName: string | null;
  locations: string[];
  isRemote: boolean;
  term: string | null;
  workAuth: string | null;
  skills: string[];
  deadlineAt: Date | null;
  amountMin: number | null;
  amountMax: number | null;
  amountNeedsReview: boolean;
  eligibility: unknown;
  isContentMarketing: boolean;
  freshnessTier: FreshnessTier;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
}

function buildFeedItem(profile: ScoreProfile, r: FeedRow, now: Date): FeedItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    company: r.company,
    url: r.url,
    locations: r.locations,
    isRemote: r.isRemote,
    term: r.term,
    workAuth: r.workAuth,
    skills: r.skills,
    deadlineAt: r.deadlineAt,
    amountMin: r.amountMin,
    amountMax: r.amountMax,
    amountNeedsReview: r.amountNeedsReview,
    eligibility: criteriaFrom(r.eligibility),
    isContentMarketing: r.isContentMarketing,
    freshnessTier: r.freshnessTier,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    closedAt: r.closedAt,
    fit:
      r.kind === "scholarship"
        ? scoreScholarshipFit(profile, {
            title: r.title,
            sponsorName: r.sponsorName,
            amountMin: r.amountMin,
            amountMax: r.amountMax,
            isContentMarketing: r.isContentMarketing,
            eligibility: criteriaFrom(r.eligibility),
          })
        : scoreFit(profile, {
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
  };
}

export async function getFeed(
  profile: ScoreProfile,
  filters: FeedFilters = {},
): Promise<FeedItem[]> {
  const conditions = [];
  if (!filters.includeClosed) conditions.push(isNull(postings.closedAt));
  if (filters.term) conditions.push(eq(postings.term, filters.term));
  if (filters.remoteOnly) conditions.push(eq(postings.isRemote, true));
  if (filters.kind) conditions.push(eq(postings.kind, filters.kind));

  if (filters.deadline) {
    conditions.push(isNotNull(postings.deadlineAt));
    if (filters.deadline !== "set") {
      const days = Number(filters.deadline);
      const nowIso = new Date().toISOString();
      const cutoffIso = new Date(Date.now() + days * 86_400_000).toISOString();
      conditions.push(sql`${postings.deadlineAt} > ${nowIso}::timestamptz`);
      conditions.push(sql`${postings.deadlineAt} <= ${cutoffIso}::timestamptz`);
    }
  }

  if (filters.minAmount) {
    conditions.push(
      sql`coalesce(${postings.amountMin}, ${postings.amountMax}) >= ${filters.minAmount}`,
    );
  }

  if (filters.location) {
    const pattern = `%${filters.location}%`;
    conditions.push(
      sql`exists (select 1 from unnest(${postings.locations}) as l where l ilike ${pattern})`,
    );
  }

  // No SQL limit: ranking is in-memory (see the module comment), and a
  // pre-rank `limit` would let whichever kind was ingested last crowd the
  // other out of the top N entirely — the exact "one list" this feed exists
  // to be. Rows are ranked, then trimmed. If the corpus outgrows scoring
  // every row per request, the ranking has to move into SQL, not a LIMIT.
  const rows = await db
    .select(FEED_SELECT)
    .from(postings)
    .leftJoin(organizations, eq(postings.orgId, organizations.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(postings.firstSeenAt));

  const now = new Date();
  const items: FeedItem[] = rows.map((r) => buildFeedItem(profile, r, now));

  const filtered = filters.hideBlocked ? items.filter((i) => !i.fit.blocked) : items;
  filtered.sort(rank);
  return filtered.slice(0, filters.limit ?? 500);
}

/**
 * A single posting, scored through the same path as a feed row.
 *
 * Used by the listing page, which needs the posting's match data to ground a
 * cover letter. Returns null for an id we do not hold — the page 404s rather
 * than inventing a role.
 */
export async function getPosting(id: string, profile: ScoreProfile): Promise<FeedItem | null> {
  const [row] = await db
    .select(FEED_SELECT)
    .from(postings)
    .leftJoin(organizations, eq(postings.orgId, organizations.id))
    .where(eq(postings.id, id));

  return row ? buildFeedItem(profile, row, new Date()) : null;
}

/** Corpus counts. Kind-scoped when a kind filter is active, else the whole table. */
export async function getFeedStats(kind?: PostingKind | null): Promise<FeedStats> {
  // Serialized explicitly: the driver cannot bind a JS Date inside a raw `sql`
  // template, and silently fails with ERR_INVALID_ARG_TYPE at query time.
  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const conditions = kind ? [eq(postings.kind, kind)] : [];

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${postings.closedAt} is null)::int`,
      newToday: sql<number>`count(*) filter (where ${postings.firstSeenAt} > ${dayAgo}::timestamptz)::int`,
      withUnknownTerm: sql<number>`count(*) filter (where ${postings.term} is null)::int`,
    })
    .from(postings)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return row;
}

/** Distinct terms present in the corpus, for the filter control. */
export async function getAvailableTerms(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ term: postings.term })
    .from(postings)
    .where(isNull(postings.closedAt));
  return rows.map((r) => r.term).filter((t): t is string => Boolean(t)).sort();
}
