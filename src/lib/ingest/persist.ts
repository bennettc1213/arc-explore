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
import {
  organizations,
  postingSources,
  postings,
  type AtsType,
  type FreshnessTier,
} from "@/db/schema";
import { detectTerm, detectWorkAuth } from "./normalize";
import { extractSkills } from "../score/skills";
import { reconcile, type ExistingPosting, type PreparedPosting } from "./reconcile";
import type { SourceName, SourcePosting } from "./types";

export interface PollOutcome {
  orgId: string;
  inserted: number;
  touched: number;
  closed: number;
  reopened: number;
  filteredOut: number;
  closeSuppressed: boolean;
  totalOnBoard: number;
  /** True when the board returned 304 and nothing was re-examined. */
  notModified?: boolean;
}

/**
 * Reconcile one org's poll result against the DB and apply the plan.
 *
 * Runs in a transaction so a failure partway through never leaves closed and
 * inserted postings out of sync with each other.
 */
export async function persistPoll(
  orgId: string,
  incoming: SourcePosting[],
  totalOnBoard: number,
  etag?: string | null,
  /**
   * How strong a freshness claim these rows may carry. Defaults to
   * `live_polled`, which is only true for Tier A: those boards are re-fetched
   * every 20 minutes, so "confirmed live" is a statement we can back. A source
   * reconciled through this same path on a slower loop must say so — see
   * `scripts/ingest-usajobs.ts`, which runs daily and passes `periodic_check`.
   */
  opts?: { freshnessTier?: FreshnessTier },
): Promise<PollOutcome> {
  return db.transaction(async (tx) => {
    const existingRows = await tx
      .select({
        canonicalHash: postings.canonicalHash,
        closedAt: postings.closedAt,
        missingStrikes: postings.missingStrikes,
      })
      .from(postings)
      .where(eq(postings.orgId, orgId));

    const existing: ExistingPosting[] = existingRows.map((r) => ({
      canonicalHash: r.canonicalHash,
      closedAt: r.closedAt ?? null,
      missingStrikes: Number(r.missingStrikes ?? 0),
    }));

    const plan = reconcile({ incoming, existing, totalOnBoard });
    const now = new Date();

    if (plan.toInsert.length > 0) {
      await insertPostings(tx, orgId, plan.toInsert, now, opts?.freshnessTier);
    }

    if (plan.toTouch.length > 0) {
      await touchPostings(tx, plan.toTouch, now);
    }

    if (plan.toReopen.length > 0) {
      await reopenPostings(tx, plan.toReopen, now);
    }

    if (plan.toResetMissing.length > 0) {
      await tx
        .update(postings)
        .set({ missingStrikes: 0, missingSince: null })
        .where(inArray(postings.canonicalHash, plan.toResetMissing));
    }

    if (plan.toClose.length > 0) {
      /*
       * Stamp missingSince on the crossing observation and never move it again,
       * mirroring urlDeadSince in linkcheck.ts: "dead since we first had enough
       * evidence", not "since last night". closedAt is the employer telling us
       * it's gone, so the strike bookkeeping is moot once it's set.
       */
      await tx
        .update(postings)
        .set({
          closedAt: now,
          missingStrikes: 0,
          missingSince: sql`COALESCE(${postings.missingSince}, ${now})`,
        })
        .where(inArray(postings.canonicalHash, plan.toClose));
    }

    if (plan.toIncrementMissing.length > 0) {
      await tx
        .update(postings)
        .set({ missingStrikes: sql`${postings.missingStrikes} + 1` })
        .where(inArray(postings.canonicalHash, plan.toIncrementMissing));
    }

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

    return {
      orgId,
      inserted: plan.toInsert.length,
      touched: plan.toTouch.length,
      closed: plan.toClose.length,
      reopened: plan.toReopen.length,
      filteredOut: plan.filteredOut,
      closeSuppressed: plan.closeSuppressed,
      totalOnBoard,
    };
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertPostings(
  tx: Tx,
  orgId: string,
  prepared: PreparedPosting[],
  now: Date,
  freshnessTier: FreshnessTier = "live_polled",
) {
  for (const p of prepared) {
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
        workAuth: p.workAuth,
        skills: p.skills,
        descriptionText: p.descriptionText,
        firstSeenAt: now,
        lastSeenAt: now,
        postedAt: p.postedAt,
        deadlineAt: p.deadlineAt,
      })
      .onConflictDoUpdate({
        target: postings.canonicalHash,
        set: { lastSeenAt: now, closedAt: null },
      })
      .returning({ id: postings.id });

    await upsertSource(tx, row.id, p, now);
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
async function touchPostings(tx: Tx, prepared: PreparedPosting[], now: Date) {
  const hashes = prepared.map((p) => p.canonicalHash);

  const rows = await tx
    .select({ id: postings.id, canonicalHash: postings.canonicalHash })
    .from(postings)
    .where(inArray(postings.canonicalHash, hashes));
  const idByHash = new Map(rows.map((r) => [r.canonicalHash, r.id]));

  for (const p of prepared) {
    const id = idByHash.get(p.canonicalHash);
    if (!id) continue;

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
        ...(p.term ? { term: p.term } : {}),
        ...(p.postedAt ? { postedAt: p.postedAt } : {}),
        ...(p.deadlineAt ? { deadlineAt: p.deadlineAt } : {}),
      })
      .where(eq(postings.id, id));

    await upsertSource(tx, id, p, now);
  }
}

async function reopenPostings(tx: Tx, prepared: PreparedPosting[], now: Date) {
  const hashes = prepared.map((p) => p.canonicalHash);
  await tx
    .update(postings)
    .set({ closedAt: null, lastSeenAt: now })
    .where(inArray(postings.canonicalHash, hashes));

  const rows = await tx
    .select({ id: postings.id, canonicalHash: postings.canonicalHash })
    .from(postings)
    .where(inArray(postings.canonicalHash, hashes));
  const idByHash = new Map(rows.map((r) => [r.canonicalHash, r.id]));

  for (const p of prepared) {
    const id = idByHash.get(p.canonicalHash);
    if (id) await upsertSource(tx, id, p, now);
  }
}

async function upsertSource(tx: Tx, postingId: string, p: PreparedPosting, now: Date) {
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
    })
    .onConflictDoUpdate({
      target: [postingSources.source, postingSources.sourceId],
      set: { lastSeenAt: now },
    });
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
  const term = detectTerm(title, text);
  const skills = extractSkills(title, text);

  await db
    .update(postings)
    .set({
      descriptionText: text,
      ...(workAuth ? { workAuth } : {}),
      ...(term ? { term } : {}),
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
