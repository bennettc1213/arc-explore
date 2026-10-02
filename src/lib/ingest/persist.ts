/**
 * Turns a ReconcilePlan into database writes.
 *
 * Kept separate from reconcile.ts on purpose: reconcile() is a pure function
 * over plain objects, testable with zero I/O. This module is the only place
 * that touches Postgres, so a schema or driver change never risks the
 * (already heavily tested) matching/dedup logic above it.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { timestamptz } from "@/db/fragments";
import {
  organizations,
  pollRunMarks,
  postingLifecycleEvents,
  postingSources,
  postings,
  sources,
  type AtsType,
  type FreshnessTier,
  type LifecycleEvent,
} from "@/db/schema";
import { detectWorkAuth } from "./normalize";
import { extractSkills } from "../score/skills";
import {
  reconcile,
  termUpdateForReopen,
  termUpdateFromDescription,
  termUpdateForTouch,
  type ExistingPosting,
  type PreparedPosting,
} from "./reconcile";
import type { SourceName, SourcePosting } from "./types";
import {
  isAuthoritativeObservation,
  publicationStateFor,
  type PublicationRequest,
  type SourceFacts,
} from "./publication-gate";
import { recordEvent } from "../analytics/record";

/** Order-insensitive equality for the `text[]` columns we compare. */
function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/** The stored columns a touch compares, in the shape `wouldTouchChange` needs. */
type StoredTouchRow = {
  title: string;
  url: string;
  locations: string[] | null;
  isRemote: boolean | null;
  descriptionText: string | null;
  workAuth: string | null;
  skills: string[] | null;
  postedAt: Date | null;
  deadlineAt: Date | null;
  term: PreparedPosting["term"];
  termSource: PreparedPosting["termSource"];
  termSeason: PreparedPosting["termSeason"];
  termYear: PreparedPosting["termYear"];
  termRaw: PreparedPosting["termRaw"];
  termEndedFlagAt: PreparedPosting["termEndedFlagAt"];
};

/** `Date | null` equality by instant; either side missing compares unequal. */
function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.getTime() === b.getTime();
}

/**
 * Whether the ended-term flag would change, mirroring the COALESCE in
 * `touchPostings`: a re-detected ended term keeps the first stamp, so the flag
 * only changes when it flips between set and unset. Comparing timestamps here
 * instead is what made every ended-term listing count as updated on every
 * poll — each detection carries a fresh `now`.
 */
function endedFlagWouldChange(incoming: Date | null, stored: Date | null): boolean {
  return Boolean(incoming) !== Boolean(stored);
}

/**
 * Would touching this row write anything? True means changed.
 *
 * Mirrors the conditional spreads in `touchPostings` field for field, and the
 * mirroring is the point: if the two ever disagree, the run's `updated` and
 * `unchanged` counts both become lies while the database is written correctly,
 * which is the worst kind of bug to have — nothing downstream breaks, the
 * operator is simply told the wrong thing. So every spread there has a clause
 * here, and the staging rehearsal in `scripts/rehearse-ins-013.ts` asserts the
 * two agree on a real description change.
 *
 * The asymmetric tests (`!incoming.x ||`) encode the same rule the touch path
 * uses: a later poll that lacks a value cannot erase one we already have, so
 * its absence is not a change.
 *
 * Every clause compares a value, never merely asks "would we write anything".
 * Asking that question is what made an explicit term report a change on every
 * poll forever: `termUpdateForTouch` returns the term columns whenever the term
 * was explicit, regardless of whether they differ from what is stored, and
 * since most internships state their term outright, that alone made every
 * listing permanently "updated" and `unchanged` unreachable in practice.
 */
export function wouldTouchChange(row: StoredTouchRow, incoming: PreparedPosting): boolean {
  if (incoming.title !== row.title) return true;
  if (incoming.url !== row.url) return true;
  if (!sameArray(incoming.locations, row.locations ?? [])) return true;
  if (Boolean(incoming.isRemote) !== Boolean(row.isRemote)) return true;
  if (incoming.descriptionText && incoming.descriptionText !== row.descriptionText) return true;
  if (incoming.workAuth && incoming.workAuth !== row.workAuth) return true;
  if (incoming.skills.length > 0 && !sameArray(incoming.skills, row.skills ?? [])) return true;
  if (incoming.postedAt && !sameInstant(incoming.postedAt, row.postedAt)) return true;
  if (incoming.deadlineAt && !sameInstant(incoming.deadlineAt, row.deadlineAt)) return true;
  // `termUpdateForTouch` is the single authority on which terms may overwrite
  // which (an inferred parse must not clobber an explicit one). Its output is
  // then compared value by value, because "we will write these columns" is not
  // the same question as "these columns will differ".
  for (const [column, value] of Object.entries(termUpdateForTouch(incoming))) {
    if (column === "termEndedFlagAt") {
      if (endedFlagWouldChange(value as Date | null, row.termEndedFlagAt)) return true;
      continue;
    }
    if (value !== row[column as keyof StoredTouchRow]) return true;
  }
  return false;
}

export interface PollOutcome {
  orgId: string;
  inserted: number;
  touched: number;
  updated: number;
  unchanged: number;
  missing1: number;
  closed: number;
  reopened: number;
  rejected: number;
  filteredOut: number;
  closeSuppressed: boolean;
  totalOnBoard: number;
  /** True when the board returned 304 and nothing was re-examined. */
  notModified?: boolean;
  /** Reason the close was suppressed, in the case where we want to log it. */
  closeSuppressedReason?: "poll_incomplete" | "empty_scrape";
  /** True when this call was a replay of a run already applied to this org. */
  replayed?: boolean;
}

/**
 * Reconcile one org's poll result against the DB and apply the plan.
 *
 * Runs in a transaction so a failure partway through never leaves closed and
 * inserted postings out of sync with each other.
 */
export interface PersistPollOptions {
  /**
   * How strong a freshness claim these rows may carry. Defaults to
   * `live_polled`, which is only true for Tier A: those boards are re-fetched
   * every 20 minutes, so "confirmed live" is a statement we can back. A source
   * reconciled through this same path on a slower loop must say so — see
   * `scripts/ingest-usajobs.ts`, which runs daily and passes `periodic_check`.
   */
  freshnessTier?: FreshnessTier;
  /**
   * True only when the poll completed successfully enough for absence to be
   * meaningful. Failed or partial polls must not advance misses or close rows.
   *
   * Defaults to true, which is why adapters must set it deliberately rather than
   * inherit it: an adapter that forgets is indistinguishable from one that
   * checked. See `contract.ts` for the pagination helpers that make the honest
   * answer easy to produce.
   */
  successfulComplete?: boolean;
  /**
   * The ingest run this poll belongs to, stamped on every lifecycle event so a
   * change can be traced to the run that made it.
   *
   * It is also the idempotency key. A retried, overlapped, or manually
   * re-triggered poll carrying a `runId` that has already been applied to this
   * org is a no-op. Without that, replaying one successful poll advances
   * `missing_strikes` 0 -> 1 -> 2 and closes a listing that only went missing
   * once, which is the exact failure the two-miss rule exists to prevent.
   *
   * There is deliberately no "already applied" flag for callers to pass. The
   * guard's entire job is to answer that question from the database, and a
   * caller-set flag would just be a way for it to be answered wrongly.
   */
  runId?: string;
  /** Rows the adapter dropped for failing minimum validation. */
  rejectedByValidation?: number;
}

/** Every counter a poll must report, per INS-013 requirement 9. */
export interface PollCounts {
  inserted: number;
  /** Known and still present; bumped `last_seen_at`. */
  updated: number;
  /** Known, still present, and byte-for-byte unchanged. */
  unchanged: number;
  /** Absent for the first consecutive poll. */
  missing1: number;
  /** Absent on the second consecutive poll and therefore closed. */
  closed: number;
  reopened: number;
  /** Dropped by the early-career filter, or failed minimum validation. */
  rejected: number;
  error: number;
}

export async function persistPoll(
  orgId: string,
  incoming: SourcePosting[],
  totalOnBoard: number,
  etag?: string | null,
  opts?: PersistPollOptions,
): Promise<PollOutcome> {
  return db.transaction(async (tx) => {
    /*
     * Replay guard, checked first and under the same transaction as the writes.
     *
     * Re-running one poll must be a no-op. It is not, by default: the first
     * application takes a missing row 0 -> 1 strikes, and the replay takes it
     * 1 -> 2 and closes it, so a single flaky absence becomes a closure after
     * one retry instead of two real polls. That defeats the entire two-miss
     * rule, so the run that already applied this org is remembered and the
     * second attempt returns the stored outcome rather than re-applying it.
     *
     * The lock is not optional. Merely reading the mark inside a transaction is
     * not enough: under READ COMMITTED two overlapping polls both see an empty
     * mark, both proceed, and the loser's `ON CONFLICT DO NOTHING` on the mark
     * only discards the marker — its absence-strikes are already committed. The
     * serialization has to come from blocking on the org row, so the second
     * poll cannot read the mark until the first has finished writing it.
     */
    if (opts?.runId) {
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for("update");

      const already = await tx
        .select({ appliedAt: pollRunMarks.appliedAt, outcome: pollRunMarks.outcome })
        .from(pollRunMarks)
        .where(
          and(
            eq(pollRunMarks.orgId, orgId),
            eq(pollRunMarks.runId, opts.runId),
          ),
        )
        .limit(1);
      if (already.length > 0) {
        return { ...(already[0].outcome as PollOutcome), orgId, replayed: true };
      }
    }

    const existingRows = await tx
      .select({
        id: postings.id,
        canonicalHash: postings.canonicalHash,
        closedAt: postings.closedAt,
        missingStrikes: postings.missingStrikes,
        missingSince: postings.missingSince,
        title: postings.title,
        url: postings.url,
        locations: postings.locations,
        isRemote: postings.isRemote,
        descriptionText: postings.descriptionText,
        workAuth: postings.workAuth,
        skills: postings.skills,
        postedAt: postings.postedAt,
        deadlineAt: postings.deadlineAt,
        term: postings.term,
        termSource: postings.termSource,
        termSeason: postings.termSeason,
        termYear: postings.termYear,
        termRaw: postings.termRaw,
        termEndedFlagAt: postings.termEndedFlagAt,
      })
      .from(postings)
      .where(eq(postings.orgId, orgId));

    /*
     * Build the "would this write anything?" predicate over the row we already
     * fetched. Mirrors the conditional spreads in `touchPostings` exactly: a
     * field is only rewritten when the incoming row has a value, so an incoming
     * null is never a change.
     */
    const existing: ExistingPosting[] = existingRows.map((r) => {
      const row = r;
      return {
        canonicalHash: row.canonicalHash,
        closedAt: row.closedAt ?? null,
        missingStrikes: Number(row.missingStrikes ?? 0),
        missingSince: row.missingSince ?? null,
        termSource: (row.termSource ?? null) as ExistingPosting["termSource"],
        changedBy: (incoming) => wouldTouchChange(row, incoming),
      };
    });

    // `now` is created before the plan and threaded into it: every term the
    // poll derives - inference, and the ended-term flag - must be anchored at
    // when we looked. Before this, the plan ran without `now`, so
    // `preparePosting` fell back to each listing's own postedAt: a posting
    // from 2023 was inferred as an unflagged "Summer 2023" listing, and a
    // "Spring 2025" touch wrote `termEndedFlagAt: null` over a correctly-set
    // quarantine flag.
    const now = new Date();
    const plan = reconcile({
      incoming,
      existing,
      totalOnBoard,
      successfulComplete: opts?.successfulComplete ?? true,
      now,
    });

    /*
     * Resolve the registry row for this org once per poll.
     *
     * It supplies the three facts the publication gate needs, and it is the only
     * place the ingest path should learn them from: the gate is a pure function
     * over (source facts, poll complete), and feeding it anything else — an
     * adapter name, a hardcoded list — would let the two drift apart silently.
     */
    const sourceRow = await resolveSourceForOrg(tx, orgId);

    if (plan.toInsert.length > 0) {
      await insertPostings(tx, orgId, plan.toInsert, now, opts?.freshnessTier, sourceRow, opts);
    }

    if (plan.toTouch.length > 0) {
      await touchPostings(tx, plan.toTouch, now, sourceRow, opts);
    }

    if (plan.toReopen.length > 0) {
      await reopenPostings(tx, plan.toReopen, now, sourceRow, opts);
    }

    /*
     * The two-miss bookkeeping.
     *
     * These are the writes that actually move the lifecycle. `computeLifecycleTransitions`
     * decides *which* rows move, but a decision nothing writes to is a decision that
     * never happened — so each list below is applied exactly as the plan describes it.
     *
     * `missingSince` is stamped once, on the first miss, and left alone after
     * that. It is the start of the absence, and reusing it later would silently
     * move the window on which the second decision was made.
     */
    if (plan.toResetMissing.length > 0) {
      // A row is back: its absence is over, so the strikes must not carry into
      // the next one. Otherwise a listing that flickered once per month would
      // eventually accumulate two strikes across two months and close while
      // present.
      await tx
        .update(postings)
        .set({ missingStrikes: 0, missingSince: null })
        .where(
          inArray(
            postings.canonicalHash,
            plan.toResetMissing.map((c) => c.canonicalHash),
          ),
        );
    }

    if (plan.toIncrementMissing.length > 0) {
      await tx
        .update(postings)
        .set({
          missingStrikes: sql`${postings.missingStrikes} + 1`,
          missingSince: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
        })
        .where(
          inArray(
            postings.canonicalHash,
            plan.toIncrementMissing.map((c) => c.canonicalHash),
          ),
        );
    }

    if (plan.toClose.length > 0) {
      /*
       * `closedAt` is the first-miss time, not the current poll time, so a fund
       * that dropped off the board a week ago does not read as having closed
       * today. The strike bookkeeping is moot once closedAt is set.
       */
      await tx
        .update(postings)
        .set({
          closedAt: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
          missingStrikes: 0,
          missingSince: null,
        })
        .where(inArray(postings.canonicalHash, plan.toClose));
    }

    /*
     * Lifecycle events, written next to the state change they describe.
     *
     * The two-miss lifecycle was previously only observable by reading the
     * `missing_strikes` counter before and after. That makes "why did this
     * listing close?" unanswerable, and it means a replay that double-counted a
     * strike left no trace. The unique index on (posting, run, event) is what
     * makes writing these idempotent, so the writes are attempted unconditionally
     * and the database is the thing that refuses a duplicate.
     */
    await recordLifecycleEvents(tx, {
      runId: opts?.runId,
      sourceId: sourceRow?.id,
      missing1: plan.toIncrementMissing,
      closed: plan.toClose,
      now,
    });

    await tx
      .update(organizations)
      .set({
        lastPolledAt: now,
        lastPollOk: true,
        lastPollError: null,
        consecutiveFailures: 0,
        // A board that recovered goes straight back to full cadence.
        pollIntervalSec: DEFAULT_POLL_INTERVAL_SEC,
        // Stored so the next poll can send If-None-Match. Without this the
        // conditional-request path never activates and we re-download every
        // board in full on every cycle.
        ...(etag !== undefined ? { etag } : {}),
      })
      .where(eq(organizations.id, orgId));

    /*
     * A board's last *complete* poll, which is the claim the registry supports.
     * An incomplete read is explicitly not one: `lastCompletePollAt` is what
     * makes "we hold everything this source published" answerable, and letting a
     * truncated read advance it would be a lie in the one place the word
     * "complete" appears.
     */
    if (sourceRow && (opts?.successfulComplete ?? true)) {
      await tx
        .update(sources)
        .set({ lastCompletePollAt: now })
        .where(eq(sources.id, sourceRow.id));
    }

    const outcome: PollOutcome = {
      orgId,
      inserted: plan.toInsert.length,
      touched: plan.toTouch.length,
      // `updated` is touch minus unchanged: the count of rows this poll actually
      // rewrote, which is what an operator means by "updated".
      updated: plan.toTouch.length - plan.unchanged.length,
      unchanged: plan.unchanged.length,
      missing1: plan.toIncrementMissing.length,
      closed: plan.toClose.length,
      reopened: plan.toReopen.length,
      rejected: plan.filteredOut + (opts?.rejectedByValidation ?? 0),
      filteredOut: plan.filteredOut,
      closeSuppressed: plan.closeSuppressed,
      closeSuppressedReason: plan.closeSuppressedReason,
      totalOnBoard,
    };

    /*
     * Claim this (org, run) last, inside the same transaction as the writes it
     * describes. Ordering matters: if the mark were written first, a crash after
     * the mark but before the writes would leave the poll recorded as applied
     * when it never was, and the retry would skip real work.
     */
    if (opts?.runId) {
      await tx
        .insert(pollRunMarks)
        .values({ orgId, runId: opts.runId, appliedAt: now, outcome: outcome as object })
        .onConflictDoNothing();
    }

    return outcome;
  });
}

/**
 * Marks an org as successfully polled without changing any posting data.
 *
 * Used for the 304 Not Modified path: the board is byte-identical to last
 * poll, so there is nothing to insert or close — but the timestamp must still
 * advance, or the org stays permanently "due" and gets re-polled in a loop.
 */
export async function markPolled(orgId: string, etag?: string | null): Promise<void> {
  await db
    .update(organizations)
    .set({
      lastPolledAt: new Date(),
      lastPollOk: true,
      lastPollError: null,
      consecutiveFailures: 0,
      pollIntervalSec: DEFAULT_POLL_INTERVAL_SEC,
      ...(etag !== undefined ? { etag } : {}),
    })
    .where(eq(organizations.id, orgId));
}

/** The cadence a healthy board is polled at. */
export const DEFAULT_POLL_INTERVAL_SEC = 1200;
/** Ceiling for a board that keeps failing — roughly once a day. */
const MAX_POLL_INTERVAL_SEC = 86_400;

/**
 * Records a poll failure and backs the board off.
 *
 * Boards die permanently: a company renames its slug, moves ATS, or shuts
 * down. Without backoff each of those keeps consuming a slot in every 20-minute
 * run forever, and since the run is capped by `limit`, dead boards steadily
 * crowd out live ones — the registry silently stops being polled from the
 * bottom up. Tripling the interval per failure retires a dead board to daily
 * within about four failures, while a board that 502s once barely notices.
 *
 * Reset to the default on the next success, in `persistPoll` / `markPolled`.
 */
export async function recordPollFailure(orgId: string, error: string): Promise<void> {
  await db
    .update(organizations)
    .set({
      lastPolledAt: new Date(),
      lastPollOk: false,
      lastPollError: error.slice(0, 500),
      consecutiveFailures: sql`${organizations.consecutiveFailures} + 1`,
      pollIntervalSec: sql`least(${organizations.pollIntervalSec} * 3, ${MAX_POLL_INTERVAL_SEC})`,
    })
    .where(eq(organizations.id, orgId));
}

/**
 * Record a poll that read some of a board but not all of it.
 *
 * Distinct from {@link recordPollFailure} in the only way that matters: the
 * backoff clock does **not** advance. A partial read is not a board in trouble —
 * it is usually one over-cap query on a very large SmartRecruiters board, and
 * tripling its interval to 12 hours over a query sweep would slow down a board
 * that is perfectly healthy.
 *
 * What it does record is the truth: `lastPollOk` false, so the run counts it as
 * an error, and the specific numbers, so "we hold 412 of 640" is answerable
 * without reproducing the poll.
 */
export async function recordIncompletePoll(
  orgId: string,
  reason: string,
  detail: {
    pagesFetched: number;
    claimedTotal: number | null;
    /** Rows the adapter handed back. */
    rowsHeld: number;
    /** Rows that actually landed — the held ones minus any the gate rejected. */
    rowsPersisted: number;
  },
): Promise<void> {
  const held =
    detail.claimedTotal !== null
      ? `${detail.rowsHeld}/${detail.claimedTotal}`
      : String(detail.rowsHeld);
  const message =
    `${reason} — held ${held} row(s) across ${detail.pagesFetched} page(s)` +
    `, persisted ${detail.rowsPersisted}`.slice(0, 500);

  await db
    .update(organizations)
    .set({
      lastPolledAt: new Date(),
      lastPollOk: false,
      lastPollError: message,
      // Consecutive failures still increments: this board is not fully readable,
      // so a persistent problem should widen the interval. What it does *not*
      // do is triple it on the spot — one capped query on an otherwise healthy
      // 600-role board must not slow that board to a 12-hour cadence.
      consecutiveFailures: sql`${organizations.consecutiveFailures} + 1`,
    })
    .where(eq(organizations.id, orgId));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ------------------------------------------------------------------ *
 * Registry resolution and the publication gate
 * ------------------------------------------------------------------ */

/**
 * The `sources` row backing one org, reduced to what the gate needs.
 *
 * Kept narrow on purpose: the gate takes `SourceFacts` and a poll-completeness
 * flag, and nothing else. Passing the whole row would let a caller reach around
 * the gate and make its own decision from, say, `pollTier`.
 */
export interface ResolvedSource {
  id: string;
  authority: "source_of_truth" | "discovery_only";
  state: "active" | "paused" | "blocked";
  termsReviewStatus: "approved" | "restricted" | "denied" | "not_reviewed";
  rawStorage: "full" | "hash_only" | "none";
}

/** The gate's input, assembled from a source row and this poll's completeness. */
export interface GateInput {
  sourceRow: ResolvedSource | null;
  request: PublicationRequest;
}

/**
 * Look up the registry row for an org.
 *
 * Returns null when the org predates the registry or was enrolled after the
 * backfill. That is a real state, not an error, and the caller decides what it
 * means — the ingest path treats a missing row as "we have no record saying
 * this source may publish", which the gate resolves to `unverified`.
 */
async function resolveSourceForOrg(tx: Tx, orgId: string): Promise<ResolvedSource | null> {
  const rows = await tx
    .select({
      id: sources.id,
      authority: sources.authority,
      state: sources.state,
      termsReviewStatus: sources.termsReviewStatus,
      rawStorage: sources.rawStorage,
    })
    .from(sources)
    .where(eq(sources.orgId, orgId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The facts a source with no registry row is treated as having.
 *
 * Deliberately pessimistic and deliberately not "approved". An unregistered
 * source gets `not_reviewed`, which the gate *allows* — so this does not halt
 * ingestion — while `state: active` keeps a row from being blocked by a
 * registry that simply has not been populated yet. What it does mean is that
 * nothing is stamped `verified` on the strength of a source nobody has
 * reviewed, and no `confirmedAt` clock advances, because
 * `isAuthoritativeObservation` requires the source itself to be a checked
 * source of truth.
 */
const UNREGISTERED_FACTS: Omit<ResolvedSource, "id"> = {
  authority: "source_of_truth",
  state: "active",
  termsReviewStatus: "not_reviewed",
  rawStorage: "full",
};

function gateFor(
  source: ResolvedSource | null | undefined,
  pollComplete: boolean,
): GateInput {
  const facts: SourceFacts = source
    ? {
        authority: source.authority,
        state: source.state,
        termsReviewStatus: source.termsReviewStatus,
      }
    : UNREGISTERED_FACTS;

  return { sourceRow: source ?? null, request: { source: facts, pollComplete } };
}

/* ------------------------------------------------------------------ *
 * Lifecycle events
 * ------------------------------------------------------------------ */

/**
 * Write one lifecycle event, ignoring a duplicate.
 *
 * `onConflictDoNothing` against `posting_lifecycle_run_event_unique` is what
 * makes replay safe at the row level. The alternative — checking for an existing
 * event first — is a TOCTOU race, and two concurrent pollers would both find
 * nothing and both write.
 */
async function recordEvent2(
  tx: Tx,
  postingId: string,
  event: LifecycleEvent,
  runId: string | null | undefined,
  sourceId: string | null | undefined,
  at: Date,
  detail?: Record<string, unknown>,
): Promise<void> {
  await tx
    .insert(postingLifecycleEvents)
    .values({
      postingId,
      event,
      at,
      runId: runId ?? null,
      sourceId: sourceId ?? null,
      detail: (detail ?? null) as object | null,
    })
    .onConflictDoNothing();
}

/**
 * Record the miss/close transitions a plan produced.
 *
 * `missing_1` and `closed` are the two that make the two-miss rule auditable:
 * together they are the evidence for "we did not close this on one flaky
 * absence", which is otherwise a claim about a counter nobody can reconstruct.
 *
 * Both are written unconditionally, relying on the unique index to reject a
 * replay. That is what lets a retry be attempted rather than pre-checked, and
 * the detail records the strike count as it stood when the decision was made.
 */
async function recordLifecycleEvents(
  tx: Tx,
  args: {
    runId: string | undefined;
    sourceId: string | undefined;
    missing1: Array<{ canonicalHash: string }>;
    closed: string[];
    now: Date;
  },
): Promise<void> {
  const hashes = [...args.missing1.map((c) => c.canonicalHash), ...args.closed];
  if (hashes.length === 0) return;

  const rows = await tx
    .select({ id: postings.id, canonicalHash: postings.canonicalHash })
    .from(postings)
    .where(inArray(postings.canonicalHash, hashes));
  const idByHash = new Map(rows.map((r) => [r.canonicalHash, r.id]));

  for (const c of args.missing1) {
    const id = idByHash.get(c.canonicalHash);
    if (!id) continue;
    await recordEvent2(tx, id, "missing_1", args.runId, args.sourceId, args.now, {
      // The strike this absence produced. 1 is the only value it can be, and
      // recording it makes the counter's monotonicity checkable.
      strikes: 1,
    });
  }

  for (const hash of args.closed) {
    const id = idByHash.get(hash);
    if (!id) continue;
    await recordEvent2(tx, id, "closed", args.runId, args.sourceId, args.now, {
      reason: "two_consecutive_complete_polls",
    });
  }
}

async function insertPostings(
  tx: Tx,
  orgId: string,
  prepared: PreparedPosting[],
  now: Date,
  freshnessTier: FreshnessTier = "live_polled",
  source: ResolvedSource | null = null,
  opts?: PersistPollOptions,
) {
  for (const p of prepared) {
    const gate = gateFor(source, opts?.successfulComplete ?? true);

    // ON CONFLICT guards a race: two orgs' polls resolving to the same
    // canonical_hash concurrently (e.g. a role double-listed under an alias).
    const [row] = await tx
      .insert(postings)
      .values({
        orgId,
        freshnessTier,
        canonicalHash: p.canonicalHash,
        title: p.title,
        normalizedTitle: p.normalizedTitle,
        url: p.url,
        locations: p.locations,
        isRemote: p.isRemote,
        term: p.term,
        termSource: p.termSource,
        termSeason: p.termSeason,
        termYear: p.termYear,
        termRaw: p.termRaw,
        termEndedFlagAt: p.termEndedFlagAt,
        workAuth: p.workAuth,
        skills: p.skills,
        descriptionText: p.descriptionText,
        firstSeenAt: now,
        lastSeenAt: now,
        postedAt: p.postedAt,
        deadlineAt: p.deadlineAt,
        /*
         * The publication decision, applied at insert.
         *
         * Before this the column took its `unverified` default, so every row
         * written by the poll path was born unverified and a read filter added
         * later would have emptied the feed. The gate's own rule: an active,
         * terms-approved source of truth with a complete poll publishes, and
         * anything else stops at a candidate. See `publication-gate.ts`.
         */
        publicationState: publicationStateFor(gate.request),
        // An authoritative observation is the only thing that may move
        // `confirmedAt`, so "confirmed live" stays a claim we can back.
        ...(isAuthoritativeObservation(gate.request)
          ? { confirmedAt: now, authoritativeSourceId: source?.id ?? null }
          : {}),
      })
      .onConflictDoUpdate({
        target: postings.canonicalHash,
        set: { lastSeenAt: now, closedAt: null },
      })
      .returning({ id: postings.id });

    await upsertSource(tx, row.id, p, now, gate);
    await recordEvent2(tx, row.id, "first_seen", opts?.runId, source?.id, now, {
      url: p.url,
      state: gate.request.source.authority,
    });
  }
}

/**
 * Refresh postings we already hold.
 *
 * Bumps `lastSeenAt` and also writes back any newly-derived content. A first
 * poll often lacks a description — Greenhouse omits it from the list endpoint,
 * and enrichment is capped per board — so later polls are where work-auth and
 * term usually arrive. Updating only `lastSeenAt` silently discarded all of it.
 *
 * Only non-null values are written, so a later poll that happens to lack a
 * description can never erase one we already have.
 */
async function touchPostings(
  tx: Tx,
  prepared: PreparedPosting[],
  now: Date,
  source: ResolvedSource | null = null,
  opts?: PersistPollOptions,
) {
  const hashes = prepared.map((p) => p.canonicalHash);

  const rows = await tx
    .select({
      id: postings.id,
      canonicalHash: postings.canonicalHash,
      // Needed so a listing that was born `candidate` (discovery source, or an
      // incomplete poll) can be promoted once a real observation arrives.
      publicationState: postings.publicationState,
    })
    .from(postings)
    .where(inArray(postings.canonicalHash, hashes));
  const idByHash = new Map(rows.map((r) => [r.canonicalHash, r.id]));
  const stateByHash = new Map(rows.map((r) => [r.canonicalHash, r.publicationState]));

  for (const p of prepared) {
    const id = idByHash.get(p.canonicalHash);
    if (!id) continue;

    const gate = gateFor(source, opts?.successfulComplete ?? true);
    const current = stateByHash.get(p.canonicalHash);
    /*
     * Promotion, one direction only.
     *
     * A row starts `unverified` or `candidate` and becomes `verified` the first
     * time an authoritative source observes it under a complete poll. It never
     * goes the other way here: downgrading would mean a single bad poll
     * un-publishing a listing a student may have already applied to, and
     * `quarantined` is a decision a person makes, not a side effect of a fetch.
     */
    const publicationState =
      current === "verified" || current === "quarantined"
        ? undefined
        : publicationStateFor(gate.request);

    // Only a term derived from real source text may change stored term data —
    // a list-endpoint poll with no description must not erase an ended-term
    // quarantine flag that came from a previous detail fetch.
    //
    // The ended-term flag is stamped once, on first detection, and left alone
    // after that — `missingSince`-style COALESCE. It records when we first saw
    // the term end; re-stamping it on every 20-minute poll would instead make
    // every ended-term listing report "updated" forever, which is exactly the
    // steady-state churn this state machine exists to distinguish. A null
    // flag (the source now states a *current* term) is written as null: the
    // listing genuinely moved on, and a stale flag must clear.
    const { termEndedFlagAt: incomingEndedFlag, ...explicitTermUpdate } =
      termUpdateForTouch(p);

    await tx
      .update(postings)
      .set({
        lastSeenAt: now,
        // Employer-editable fields, refreshed each poll.
        title: p.title,
        url: p.url,
        locations: p.locations,
        isRemote: p.isRemote,
        // Derived fields: only overwrite when we actually learned something.
        ...(p.descriptionText ? { descriptionText: p.descriptionText } : {}),
        ...(p.workAuth ? { workAuth: p.workAuth } : {}),
        ...(p.skills.length > 0 ? { skills: p.skills } : {}),
        ...explicitTermUpdate,
        ...(incomingEndedFlag !== undefined
          ? {
              termEndedFlagAt:
                incomingEndedFlag === null
                  ? null
                  : sql`COALESCE(${postings.termEndedFlagAt}, ${timestamptz(incomingEndedFlag)})`,
            }
          : {}),
        ...(p.postedAt ? { postedAt: p.postedAt } : {}),
        ...(p.deadlineAt ? { deadlineAt: p.deadlineAt } : {}),
        ...(publicationState ? { publicationState } : {}),
        // Only an authoritative observation advances the "confirmed live" clock.
        ...(isAuthoritativeObservation(gate.request)
          ? { confirmedAt: now, authoritativeSourceId: source?.id ?? null }
          : {}),
      })
      .where(eq(postings.id, id));

    await upsertSource(tx, id, p, now, gate);
    await recordEvent2(tx, id, "last_seen", opts?.runId, source?.id, now);
  }
}

async function reopenPostings(
  tx: Tx,
  prepared: PreparedPosting[],
  now: Date,
  source: ResolvedSource | null = null,
  opts?: PersistPollOptions,
) {
  const hashes = prepared.map((p) => p.canonicalHash);

  const rows = await tx
    .select({
      id: postings.id,
      canonicalHash: postings.canonicalHash,
      kind: postings.kind,
      term: postings.term,
      termSource: postings.termSource,
      termSeason: postings.termSeason,
      termYear: postings.termYear,
      termEndedFlagAt: postings.termEndedFlagAt,
    })
    .from(postings)
    .where(inArray(postings.canonicalHash, hashes));
  const idByHash = new Map(rows.map((r) => [r.canonicalHash, r.id]));
  const existingByHash = new Map(rows.map((r) => [r.canonicalHash, r]));

  for (const p of prepared) {
    const id = idByHash.get(p.canonicalHash);
    if (!id) continue;

    const existing = existingByHash.get(p.canonicalHash);
    // Reopen with the best term evidence we have. A list-endpoint-only poll
    // (inferred term) is not enough to drop an existing explicit term or its
    // ended-term quarantine flag.
    const termUpdate = termUpdateForReopen(p, existing);

    const gate = gateFor(source, opts?.successfulComplete ?? true);

    await tx
      .update(postings)
      .set({
        closedAt: null,
        lastSeenAt: now,
        missingStrikes: 0,
        missingSince: null,
        ...termUpdate,
        // A row is back on the board, so it is present again. Re-derive the
        // publication state rather than clearing it: a reopened listing that is
        // only visible to a discovery source must not read as verified.
        publicationState: publicationStateFor(gate.request),
        ...(isAuthoritativeObservation(gate.request)
          ? { confirmedAt: now, authoritativeSourceId: source?.id ?? null }
          : {}),
      })
      .where(eq(postings.id, id));
    await upsertSource(tx, id, p, now, gate);
    await recordEvent2(tx, id, "reopened", opts?.runId, source?.id, now, {
      url: p.url,
      kind: existing?.kind ?? "unknown",
    });
    void recordEvent("listing_reopened", {
      kind: existing?.kind ?? "unknown",
      source: p.source,
      hash: p.canonicalHash,
    });
  }
}

async function upsertSource(
  tx: Tx,
  postingId: string,
  p: PreparedPosting,
  now: Date,
  gate?: GateInput,
) {
  const authoritative = gate ? isAuthoritativeObservation(gate.request) : false;

  await tx
    .insert(postingSources)
    .values({
      postingId,
      source: p.source,
      sourceId: p.sourceId,
      sourceUrl: p.url,
      raw: p.raw as object,
      firstSeenAt: now,
      lastSeenAt: now,
      /*
       * Provenance, written on the observation rather than derived at read time.
       *
       * `registrySourceId` is the link that makes "which approved place did this
       * come from" answerable, and `isAuthoritativeObservation` is the claim that
       * this source's own feed listed the row — as opposed to merely mentioning
       * it. Both are denormalized so the gate is one indexed read on the hot
       * path rather than a join per posting.
       */
      registrySourceId: gate?.sourceRow?.id ?? null,
      authority: gate?.sourceRow?.authority ?? "source_of_truth",
      isAuthoritativeObservation: authoritative,
      payloadHash: await payloadHashOf(p.raw),
      adapterVersion: ADAPTER_VERSION,
      fetchedAt: now,
      rawStorage: gate?.sourceRow?.rawStorage ?? "full",
    })
    .onConflictDoUpdate({
      target: [postingSources.source, postingSources.sourceId],
      set: {
        lastSeenAt: now,
        // Re-linked on every observation: a board can move between registry
        // rows, and a stale link would keep pointing at a source that no longer
        // vouches for this listing.
        registrySourceId: gate?.sourceRow?.id ?? null,
        authority: gate?.sourceRow?.authority ?? "source_of_truth",
        isAuthoritativeObservation: authoritative,
        fetchedAt: now,
        payloadHash: await payloadHashOf(p.raw),
        adapterVersion: ADAPTER_VERSION,
      },
    });
}

/**
 * Bumped whenever the parsing or normalization rules change.
 *
 * Stored per observation so a stored value can be attributed to the code that
 * produced it. Without it, a silent parser change is indistinguishable from the
 * source having changed its data, and there is no way to tell which of the two
 * happened when a field looks wrong months later.
 */
const ADAPTER_VERSION = "ins-013-v1";

/** Stable hash of a raw payload, for detecting parser drift on re-fetch. */
async function payloadHashOf(raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null) return null;
  try {
    const json = JSON.stringify(raw);
    const bytes = new TextEncoder().encode(json);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // A payload that will not serialize is a payload we cannot hash. Not worth
    // failing an insert over; `raw` is still stored when policy allows it.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Description backfill support
 * ------------------------------------------------------------------ */

export interface MissingDescriptionRow {
  postingId: string;
  title: string;
  atsType: string;
  atsSlug: string | null;
  sourceId: string | null;
}

/**
 * Open postings that have no JD text yet, with the ATS coordinates needed to
 * go fetch it.
 */
export async function postingsMissingDescription(
  limit: number,
): Promise<MissingDescriptionRow[]> {
  return db
    .select({
      postingId: postings.id,
      title: postings.title,
      atsType: organizations.atsType,
      atsSlug: organizations.atsSlug,
      sourceId: postingSources.sourceId,
    })
    .from(postings)
    .innerJoin(organizations, eq(postings.orgId, organizations.id))
    .leftJoin(postingSources, eq(postingSources.postingId, postings.id))
    .where(
      and(
        isNull(postings.descriptionText),
        isNull(postings.closedAt),
        // The only two sources with a per-posting detail endpoint. Lever and
        // Ashby inline their descriptions, so anything of theirs still missing
        // text genuinely has none to fetch.
        inArray(organizations.atsType, ["greenhouse", "smartrecruiters"]),
      ),
    )
    .limit(limit);
}

/**
 * Store fetched JD text and re-derive anything that depends on it.
 *
 * Term and work-auth are recomputed here because both read the description,
 * and both were necessarily unknown when the posting was first stored.
 */
export async function applyDescription(
  postingId: string,
  text: string,
  title: string,
): Promise<void> {
  const workAuth = detectWorkAuth(text, title);
  const now = new Date();
  // Only a term parsed from the fetched text may change stored term data - the
  // same monotonic rule as `termUpdateForTouch`. An inferred parse writes
  // nothing, so a description without a term can no longer overwrite a stored
  // explicit term or erase its ended-term quarantine flag. The flag itself is
  // stamped once, on first detection: re-fetching the same ended-term
  // description must not re-stamp it.
  const { termEndedFlagAt: incomingEndedFlag, ...termUpdate } =
    termUpdateFromDescription(title, text, now);
  const skills = extractSkills(title, text);

  await db
    .update(postings)
    .set({
      descriptionText: text,
      ...(workAuth ? { workAuth } : {}),
      ...termUpdate,
      ...(incomingEndedFlag !== undefined
        ? {
            termEndedFlagAt:
              incomingEndedFlag === null
                ? null
                : sql`COALESCE(${postings.termEndedFlagAt}, ${timestamptz(incomingEndedFlag)})`,
          }
        : {}),
      ...(skills.length > 0 ? { skills } : {}),
    })
    .where(eq(postings.id, postingId));
}

/* ------------------------------------------------------------------ *
 * Registry helpers — Tier B discovery writes here
 * ------------------------------------------------------------------ */

export interface OrgUpsert {
  name: string;
  normalizedName: string;
  atsType: AtsType;
  atsSlug: string | null;
  discoveredVia: string;
}

/**
 * Enroll a discovered company. No-ops if the (atsType, atsSlug) pair exists.
 *
 * `atsSlug` is nullable, and Postgres unique indexes treat every NULL as
 * distinct from every other NULL — so a plain `eq(atsSlug, null)` comparison
 * (or comparing against a sentinel like "") would never match an existing
 * null-slug row, silently duplicating an org on every re-run of discovery.
 * `isNull` is required here.
 */
export async function upsertOrg(o: OrgUpsert): Promise<{ id: string; created: boolean }> {
  const slugMatch = o.atsSlug === null ? isNull(organizations.atsSlug) : eq(organizations.atsSlug, o.atsSlug);

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.atsType, o.atsType), slugMatch))
    .limit(1);

  if (existing.length > 0) return { id: existing[0].id, created: false };

  const [row] = await db
    .insert(organizations)
    .values({
      name: o.name,
      normalizedName: o.normalizedName,
      atsType: o.atsType,
      atsSlug: o.atsSlug,
      discoveredVia: o.discoveredVia,
    })
    .returning({ id: organizations.id });

  return { id: row.id, created: true };
}

/** Orgs whose next poll is due, oldest first. */
export async function orgsDueForPoll(limit: number) {
  return db
    .select()
    .from(organizations)
    .where(
      sql`${organizations.atsSlug} is not null and ${organizations.atsType} != 'unknown' and (
        ${organizations.lastPolledAt} is null
        or ${organizations.lastPolledAt} < now() - (${organizations.pollIntervalSec} || ' seconds')::interval
      )`,
    )
    .orderBy(sql`${organizations.lastPolledAt} asc nulls first`)
    .limit(limit);
}

export type { SourceName };
