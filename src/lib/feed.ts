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
import { escapeLike, parseSearchQuery, type DeadlineFilter } from "./feed-search";
import { trimWithReservation } from "./feed-trim";
import { isFlaggedDead } from "./ingest/linkcheck";
import {
  fieldsForPosting,
  NEUTRAL_PRIOR,
  rankingScore,
  scoreFit,
  type FieldKey,
  type ScoreProfile,
  type FitResult,
} from "./score/fit";
import { dayIndex, rotationRank } from "./score/rotation";
import { scholarshipFields, scoreScholarshipFit } from "./score/scholarship-fit";
import {
  describeTiming,
  rankingTiming,
  scoreTiming,
  type TimingDisplay,
  type TimingResult,
} from "./score/timing";

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
  /**
   * Employer-stated posting date, when the source publishes one.
   *
   * Believed only inside `POSTED_PLAUSIBLE_DAYS` — see `score/timing.ts`. The
   * row renders it through `describeTiming`, which omits it entirely rather
   * than showing a date we do not stand behind.
   */
  postedAt: Date | null;
  /** Scholarship dollar bounds. Null means "amount varies" or unstated. */
  amountMin: number | null;
  amountMax: number | null;
  amountNeedsReview: boolean;
  /**
   * The apply URL answered 404/410 on two consecutive checks.
   *
   * A warning, never a closure — see lib/ingest/linkcheck.ts. The row stays in
   * the feed because we would rather show a student a link we are unsure about,
   * labelled, than hide an opportunity on the strength of two HTTP responses.
   */
  applyLinkDead: boolean;
  /**
   * Consecutive observations that this page's headers permit framing.
   *
   * Carried so the apply wizard can decide whether to embed the employer's
   * form without a second query — see `lib/apply/frame-headers.ts`.
   */
  frameAllowStrikes: number;
  /** Raw eligibility bullets, as the source stated them. */
  eligibility: string[];
  isContentMarketing: boolean;
  /** How strong the freshness claim on this row may be — see schema. */
  freshnessTier: FreshnessTier;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  /**
   * Fields this posting is in, from the same taxonomy the Fit Score matches
   * against. Empty means the source stated nothing we could classify — the
   * common case for scholarships — never that it matched nothing.
   */
  fields: FieldKey[];
  fit: FitResult;
  timing: TimingResult;
  /**
   * The three date phrases a row renders — verified / posted / closes.
   *
   * Built here rather than in the component because `describeTiming` needs
   * `now`, and React's purity rule rejects `Date.now()` during render (the
   * same reason `newSinceFromDays` lives in this module). It also means every
   * row in one response dates itself against a single instant, so a long feed
   * cannot straddle midnight and report two different "today"s.
   */
  dates: TimingDisplay;
}

/** "set" = any stated upcoming deadline; "30"/"60"/"90" = closing within N days. */
// Defined in feed-search.ts, which is free of database imports, so the
// saved-search schema can validate against it without opening a connection.
export { DEADLINE_FILTERS, type DeadlineFilter } from "./feed-search";

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
  /** Free-text search over title, org/sponsor and eligibility. */
  q?: string | null;
  /** Only postings our field taxonomy places in this category. */
  category?: FieldKey | null;
  /** Hide roles the profile is hard-blocked from. */
  hideBlocked?: boolean;
  /** Drop scholarship "awards" that are really sponsor content marketing. */
  excludeMarketing?: boolean;
  /**
   * Only postings we first saw after this moment.
   *
   * Drives the saved-search alert job: "new since we last told you" is
   * `first_seen_at`, not `posted_at`. An employer's stated posting date is
   * usually absent and, when present, is a claim rather than an observation —
   * the moment we first saw a row is the only thing we can stand behind.
   */
  newSince?: Date | null;
  /** Max rows to return. Applied AFTER ranking, so the list is never
   *  truncated in a way that silently drops one kind. */
  limit?: number;
  /**
   * Guarantee at least this many slots to each kind before `limit` trims.
   *
   * Only meaningful on a genuinely short list, which is why the full feed
   * does not set it. See `trimWithReservation` for why a short list needs it
   * and a long one does not.
   */
  reservePerKind?: number;
  /**
   * How far timing may move a posting in the ranking, in points on the fit
   * scale. The paid entitlement — pass `TIMING_PRIORITY_POINTS[tier]`.
   * Defaults to 0, which is byte-for-byte the ranking that existed before this
   * was added.
   */
  timingPoints?: number;
}


export interface FeedResult {
  items: FeedItem[];
  /**
   * Rows an active category filter dropped because we could derive no field
   * for them at all.
   *
   * Reported separately because the two exclusions mean opposite things. A
   * posting we classified as business and filtered out of software is a true
   * negative. A posting that states no field is a gap in what the source told
   * us, and at ~90% of open scholarships it is most of the corpus — a student
   * who picks a category and sees five results has to know the other 1,600
   * were unreadable, not irrelevant.
   */
  categoryUnclassified: number;
  /**
   * How many rows matched, before `limit` trimmed them for display.
   *
   * Reported because the feed now renders a page rather than everything, and
   * "showing 50" without "of 3,788" is the kind of number that quietly lies —
   * a student would read the page size as the size of the corpus. `items`
   * says what is on screen; this says what the filters actually matched.
   */
  total: number;
}

export interface FeedStats {
  total: number;
  open: number;
  newToday: number;
  withUnknownTerm: number;
}

/** One posting's position on the ranking scale — see `makeRank` below. */
function sortKey(item: FeedItem, timingPoints: number): number {
  // Confidence-weighted, not the raw score — see rankingScore. Sorting on the
  // displayed number puts the postings we understand *least* at the top.
  const fit = rankingScore(item.fit);

  /*
   * A posting we cannot score at all keeps its sentinel and sorts below
   * everything scored. Giving it a timing bonus would let a listing we know
   * nothing about climb over one we understand purely for closing soon — and
   * "closes in 3 days" is not a reason to recommend something that may not fit
   * at all. Unknown stays unknown; it does not borrow confidence from a
   * different dimension.
   */
  if (fit < 0 || timingPoints === 0) return fit;

  /*
   * Centred on the neutral prior, so average timing is worth nothing and the
   * bonus is genuinely a bonus rather than a rescaling. `rankingTiming` has
   * already shrunk toward that same prior by its own confidence, so a row
   * whose timing rests on 1 of 3 signals cannot claim the full swing.
   *
   * Bounded at ±`timingPoints` by construction: `rankingTiming` is 0–100 and
   * the prior is its midpoint.
   */
  const bonus = (timingPoints * (rankingTiming(item.timing) - NEUTRAL_PRIOR)) / NEUTRAL_PRIOR;
  return fit + bonus;
}

/**
 * Ranks by blocked status, then the fit/timing blend, then timing.
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
 *
 * `timingPoints` is the paid entitlement (`TIMING_PRIORITY_POINTS`) — how far
 * timing may move a posting, in points on the fit scale. **At 0 — the free
 * tier, and every caller that does not ask — this function is exactly what it
 * was before the entitlement existed**, timing included as the tiebreaker it
 * always was. Paid plans add a bounded bonus to the primary key instead, so
 * what is still worth acting on rises among comparable matches without
 * anything unsuitable being promoted past them.
 */
function makeRank(timingPoints: number, day: number) {
  return function rank(a: FeedItem, b: FeedItem): number {
    if (a.fit.blocked !== b.fit.blocked) return a.fit.blocked ? 1 : -1;

    const ak = sortKey(a, timingPoints);
    const bk = sortKey(b, timingPoints);
    if (bk !== ak) return bk - ak;

    // Still the tiebreaker at every weight, including 0 — two postings whose
    // fit we understand identically are separated by which one is closing.
    const byTiming = b.timing.score - a.timing.score;
    // Guarded rather than returned outright: an unscored timing yields NaN
    // here, and returning NaN to `sort` makes the whole ordering undefined.
    // Falling through to the rotation is both defined and more useful.
    if (byTiming) return byTiming;

    /*
     * FULLY TIED — and that is the common case, not an edge one. 1,529 rows
     * of the live corpus share one sort key, and 37 of the first 50 ranks sit
     * in a tie group. Without this the tie resolved to V8's stable sort, i.e.
     * to Postgres row order, i.e. to the same feed every day forever.
     *
     * Rotating is not a preference we are inventing — a tie means we hold no
     * evidence to prefer either row, so any fixed order is equally arbitrary
     * and merely staler. See score/rotation.ts.
     */
    return rotationRank(a.id, day) - rotationRank(b.id, day);
  };
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
  // Selected so the timing score can read it — it was previously left out
  // entirely, which is half of why that score had four distinct values across
  // the whole corpus. See score/timing.ts.
  postedAt: postings.postedAt,
  amountMin: postings.amountMin,
  amountMax: postings.amountMax,
  amountNeedsReview: postings.amountNeedsReview,
  urlDeadStrikes: postings.urlDeadStrikes,
  frameAllowStrikes: postings.frameAllowStrikes,
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
  postedAt: Date | null;
  amountMin: number | null;
  amountMax: number | null;
  amountNeedsReview: boolean;
  urlDeadStrikes: number;
  frameAllowStrikes: number;
  eligibility: unknown;
  isContentMarketing: boolean;
  freshnessTier: FreshnessTier;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
}

function buildFeedItem(profile: ScoreProfile, r: FeedRow, now: Date): FeedItem {
  const criteria = criteriaFrom(r.eligibility);

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
    postedAt: r.postedAt,
    amountMin: r.amountMin,
    amountMax: r.amountMax,
    amountNeedsReview: r.amountNeedsReview,
    applyLinkDead: isFlaggedDead({ urlDeadStrikes: r.urlDeadStrikes }),
    frameAllowStrikes: r.frameAllowStrikes,
    eligibility: criteria,
    isContentMarketing: r.isContentMarketing,
    freshnessTier: r.freshnessTier,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    closedAt: r.closedAt,
    // Same call the scorer makes, so the category filter and the "matches
    // software" chip can never disagree.
    fields:
      r.kind === "scholarship"
        ? scholarshipFields({ title: r.title, sponsorName: r.sponsorName, eligibility: criteria })
        : fieldsForPosting({ title: r.title }),
    fit:
      r.kind === "scholarship"
        ? scoreScholarshipFit(profile, {
            title: r.title,
            sponsorName: r.sponsorName,
            amountMin: r.amountMin,
            amountMax: r.amountMax,
            isContentMarketing: r.isContentMarketing,
            eligibility: criteria,
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
      postedAt: r.postedAt,
      now,
    }),
    dates: describeTiming(
      {
        lastSeenAt: r.lastSeenAt,
        postedAt: r.postedAt,
        deadlineAt: r.deadlineAt,
        closedAt: r.closedAt,
        freshnessTier: r.freshnessTier,
      },
      now,
    ),
  };
}

export async function getFeed(
  profile: ScoreProfile,
  filters: FeedFilters = {},
): Promise<FeedResult> {
  const conditions = [];
  /*
   * Hidden rows are gone from the feed unconditionally — `includeClosed` does
   * not bring them back. "Show closed" means "show me things that ended",
   * which is useful history; hidden means a person looked at this row and
   * decided it should not be in front of a student at all, and there is no
   * filter that should override that.
   */
  conditions.push(isNull(postings.hiddenAt));
  if (!filters.includeClosed) conditions.push(isNull(postings.closedAt));
  if (filters.newSince) {
    conditions.push(sql`${postings.firstSeenAt} > ${filters.newSince.toISOString()}::timestamptz`);
  }
  if (filters.term) conditions.push(eq(postings.term, filters.term));
  if (filters.remoteOnly) conditions.push(eq(postings.isRemote, true));
  if (filters.kind) conditions.push(eq(postings.kind, filters.kind));
  if (filters.excludeMarketing) conditions.push(eq(postings.isContentMarketing, false));

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
    const pattern = `%${escapeLike(filters.location)}%`;
    conditions.push(
      sql`exists (select 1 from unnest(${postings.locations}) as l where l ilike ${pattern})`,
    );
  }

  // Search runs in SQL rather than in memory, unlike the category filter
  // below: it is the one filter that can cut the row count by orders of
  // magnitude, and everything after this point pays per row — scoring, the
  // sort, and the JSON handed to the client.
  //
  // Fields searched are the ones a student is actually naming: the title, the
  // org or sponsor, and the eligibility text (where "must be a nursing
  // student" lives). `descriptionText` is deliberately excluded, for the same
  // reason it is absent from FEED_SELECT plus one more — a term like "python"
  // appears in the boilerplate of half our internship descriptions, so
  // including it would make search look broken by matching nearly everything.
  for (const term of parseSearchQuery(filters.q)) {
    const pattern = `%${escapeLike(term)}%`;
    conditions.push(
      sql`(
        ${postings.title} ilike ${pattern}
        or coalesce(${organizations.name}, ${postings.sponsorName}, '') ilike ${pattern}
        or coalesce(${postings.eligibility}::text, '') ilike ${pattern}
      )`,
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

  let filtered = filters.hideBlocked ? items.filter((i) => !i.fit.blocked) : items;

  // In memory, not SQL: the taxonomy is a set of regexes in `score/fit.ts`,
  // and the only way to run it in Postgres would be to restate every pattern
  // in SQL. Those two copies would drift, and the first symptom would be a
  // row showing a "matches software" chip while missing from the software
  // category. One taxonomy, one judgement — the cost is that the rows are
  // fetched and scored before being dropped, which the search filter above
  // already bounds.
  let categoryUnclassified = 0;
  if (filters.category) {
    const wanted = filters.category;
    filtered = filtered.filter((item) => {
      if (item.fields.length === 0) {
        categoryUnclassified++;
        return false;
      }
      return item.fields.includes(wanted);
    });
  }

  /*
   * One `day` for the whole request, computed here rather than inside the
   * comparator. Same reason `buildFeedItem` takes one `now`: a feed that
   * straddled midnight would otherwise be sorted against two different days
   * mid-comparison, which is not merely inconsistent but an incoherent
   * ordering — `sort` may do anything at all with a comparator that
   * contradicts itself.
   */
  filtered.sort(makeRank(filters.timingPoints ?? 0, dayIndex()));
  // Rank first, then trim — never a SQL LIMIT. See the comment on the query
  // above: trimming before ranking lets whichever kind was ingested last crowd
  // the other out of the top N entirely.
  return {
    items: trimWithReservation(filtered, filters.limit ?? 500, filters.reservePerKind ?? 0),
    categoryUnclassified,
    total: filtered.length,
  };
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
    // A hidden row 404s rather than rendering. Removing it from the feed while
    // leaving the direct link live would mean a saved bookmark or an old
    // reminder email still walks a student into the listing we took down.
    .where(and(eq(postings.id, id), isNull(postings.hiddenAt)));

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

/**
 * How many open postings each blank profile field would actually affect.
 *
 * Lives here rather than in `profile/store.ts` because it is a corpus
 * statistic, and corpus statistics are this module's job — `getFeedStats` is
 * its neighbour for the same reason.
 *
 * Four of the five counts are pure SQL over `postings` and cover internships,
 * since those four dimensions belong to `scoreFit` alone.
 *
 * THE FIFTH IS A SECOND QUERY, AND IT HAS TO BE. Field coverage is derived by
 * the taxonomy regexes, which cannot be restated in SQL without creating the
 * second copy the category filter already refuses to make — so the rows are
 * fetched and classified in memory, exactly as `getFeed` does on every render.
 * The alternative was to leave that item uncounted, and the first live run
 * showed why that fails: with no number it sorted last, so a brand-new profile
 * was told to add preferred locations before it was told to state a major.
 * Ranking around a missing measurement produced worse advice than measuring.
 */
export interface CompletionCorpusCounts {
  statesWorkAuth: number;
  statesTerm: number;
  statesLocation: number;
  namesSkills: number;
  statesField: number;
}

/**
 * A short in-process memo, because this measured 594ms against the live corpus
 * and it is the same answer for every visitor.
 *
 * A plain module-level cache rather than a framework caching API: the value is
 * a pure corpus statistic with no per-user component, it changes at most every
 * 20 minutes (the `ingest-fast` cadence), and a completion meter reading a
 * five-minute-old count is not wrong in any way a student could detect. Per
 * instance rather than shared, which is the right trade for a stale-tolerant
 * number — a cold instance pays once.
 */
const CORPUS_TTL_MS = 5 * 60_000;
let corpusMemo: { at: number; value: CompletionCorpusCounts } | null = null;

export async function getCompletionCorpus(): Promise<CompletionCorpusCounts> {
  if (corpusMemo && Date.now() - corpusMemo.at < CORPUS_TTL_MS) return corpusMemo.value;

  const openInternship = sql`${postings.kind} = 'internship' and ${postings.closedAt} is null and ${postings.hiddenAt} is null`;

  const [counts, fieldRows] = await Promise.all([
    db
      .select({
        statesWorkAuth: sql<number>`count(*) filter (where ${openInternship} and ${postings.workAuth} is not null)::int`,
        statesTerm: sql<number>`count(*) filter (where ${openInternship} and ${postings.term} is not null)::int`,
        // Non-remote only: a remote role already scores on location without a
        // stated preference, so counting it would overstate what this buys.
        statesLocation: sql<number>`count(*) filter (where ${openInternship} and ${postings.isRemote} = false and array_length(${postings.locations}, 1) > 0)::int`,
        namesSkills: sql<number>`count(*) filter (where ${openInternship} and array_length(${postings.skills}, 1) > 0)::int`,
      })
      .from(postings),
    // Both kinds: field is the one completion item a scholarship score reads.
    db
      .select({
        kind: postings.kind,
        title: postings.title,
        sponsorName: postings.sponsorName,
        eligibility: postings.eligibility,
      })
      .from(postings)
      .where(and(isNull(postings.closedAt), isNull(postings.hiddenAt))),
  ]);

  const statesField = fieldRows.reduce((n, r) => {
    const fields =
      r.kind === "scholarship"
        ? scholarshipFields({
            title: r.title,
            sponsorName: r.sponsorName,
            eligibility: criteriaFrom(r.eligibility),
          })
        : fieldsForPosting({ title: r.title });
    return fields.length > 0 ? n + 1 : n;
  }, 0);

  const value = { ...counts[0], statesField };
  corpusMemo = { at: Date.now(), value };
  return value;
}

/**
 * A cutoff `Date` N days before now.
 *
 * Lives here, not in the page: the page is a component and React's purity rule
 * rejects `Date.now()` during render, whereas this module already computes
 * dates inside its query builders. Keeps the impure call out of render.
 */
export function newSinceFromDays(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Distinct terms present in the corpus, for the filter control. */
export async function getAvailableTerms(): Promise<string[]> {  const rows = await db
    .selectDistinct({ term: postings.term })
    .from(postings)
    .where(isNull(postings.closedAt));
  return rows.map((r) => r.term).filter((t): t is string => Boolean(t)).sort();
}
