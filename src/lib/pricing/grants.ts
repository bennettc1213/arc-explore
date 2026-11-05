/**
 * Recurring tool allowances — the database half.
 *
 * The policy lives in `allowance.ts` and is pure. This module loads a user's
 * grant rows for one feature, asks the policy what to do, and writes the
 * answer inside a transaction holding a per-(user, feature) advisory lock, so
 * two simultaneous requests at a Free user's last unit cannot both take it.
 * Our connection is the table owner and bypasses RLS; every query here scopes
 * by `userId`.
 */

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { featureGrants, toolRequestLog } from "@/db/schema";

import {
  accessAfterUse,
  allowanceStatus,
  decide,
  type AllowanceFeature,
  type AllowanceStatus,
  type GrantRow,
} from "./allowance";
import type { FeatureAccess, TierId } from "./tiers";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lock(tx: Tx, userId: string, feature: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${feature}`}, 0))`);
}

async function loadRows(exec: Tx | typeof db, userId: string, feature: AllowanceFeature): Promise<GrantRow[]> {
  const rows = await exec
    .select({
      id: featureGrants.id,
      key: featureGrants.grantKey,
      periodStart: featureGrants.periodStart,
      grantedAt: featureGrants.grantedAt,
      expiresAt: featureGrants.expiresAt,
      status: featureGrants.status,
    })
    .from(featureGrants)
    .where(and(eq(featureGrants.userId, userId), eq(featureGrants.feature, feature)));
  return rows;
}

/** Read-only: what this viewer may do now, and whether `keys` is already earned. */
export async function readAllowance(
  userId: string,
  tier: TierId,
  feature: AllowanceFeature,
  keys: readonly string[] = [],
  now = new Date(),
): Promise<AllowanceStatus & { earned: GrantRow | null }> {
  const rows = await loadRows(db, userId, feature);
  const d = decide(tier, feature, rows, keys, now);
  return { ...allowanceStatus(tier, feature, rows, now), earned: d.kind === "replay" ? d.grant : null };
}

export type BeginResult =
  | { outcome: "replay"; access: FeatureAccess; renewsAt: Date | null }
  | { outcome: "reserved"; grantId: string; access: FeatureAccess; renewsAt: Date | null }
  | { outcome: "in_flight"; access: FeatureAccess; renewsAt: Date | null }
  | { outcome: "blocked"; access: FeatureAccess; renewsAt: Date | null };

/**
 * Reserve one use, or recognise a replay. Never charges on its own: a
 * reservation becomes a use only through `confirmUse`.
 */
export async function beginUse(args: {
  userId: string;
  tier: TierId;
  feature: AllowanceFeature;
  /** keys[0] is recorded; the rest are replay aliases. */
  keys: readonly string[];
  /** For browser-local workflows: how long the earned session stays open. */
  expiresInMs?: number;
  now?: Date;
}): Promise<BeginResult> {
  const now = args.now ?? new Date();
  return db.transaction(async (tx) => {
    await lock(tx, args.userId, args.feature);
    const rows = await loadRows(tx, args.userId, args.feature);
    const d = decide(args.tier, args.feature, rows, args.keys, now);

    if (d.kind === "replay") return { outcome: "replay", access: { ...d.status.access, usable: true, reason: "ok" }, renewsAt: d.status.renewsAt };
    if (d.kind === "in_flight") return { outcome: "in_flight", access: d.status.access, renewsAt: d.status.renewsAt };
    if (d.kind === "blocked") return { outcome: "blocked", access: d.status.access, renewsAt: d.status.renewsAt };

    const [row] = await tx
      .insert(featureGrants)
      .values({
        userId: args.userId,
        feature: args.feature,
        grantKey: args.keys[0],
        periodStart: d.periodStart,
        grantedAt: now,
        expiresAt: args.expiresInMs ? new Date(now.getTime() + args.expiresInMs) : null,
        status: "reserved",
      })
      .returning({ id: featureGrants.id });
    return { outcome: "reserved", grantId: row.id, access: accessAfterUse(d.status), renewsAt: d.status.renewsAt };
  });
}

/** The work succeeded: the reservation becomes an earned, replayable use. */
export async function confirmUse(userId: string, grantId: string): Promise<void> {
  await db
    .update(featureGrants)
    .set({ status: "granted" })
    .where(and(eq(featureGrants.id, grantId), eq(featureGrants.userId, userId)));
}

/** The work failed: give the unit back. */
export async function releaseUse(userId: string, grantId: string): Promise<void> {
  await db
    .delete(featureGrants)
    .where(and(eq(featureGrants.id, grantId), eq(featureGrants.userId, userId), eq(featureGrants.status, "reserved")));
}

/**
 * Run `work` against the allowance: reserve, run, confirm on success, release
 * on any thrown error (which is rethrown). A replay runs `work` without
 * reserving anything.
 */
export async function withAllowance<T>(
  args: Parameters<typeof beginUse>[0],
  work: () => Promise<T>,
): Promise<{ begin: BeginResult; value: T | null }> {
  const begin = await beginUse(args);
  if (begin.outcome === "blocked" || begin.outcome === "in_flight") return { begin, value: null };
  if (begin.outcome === "replay") return { begin, value: await work() };
  try {
    const value = await work();
    await confirmUse(args.userId, begin.grantId);
    return { begin, value };
  } catch (err) {
    await releaseUse(args.userId, begin.grantId);
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * AI request throttle — an operational limit on every plan
 * ------------------------------------------------------------------ */

/** Disclosed in `FEATURES.cover_letter.description`. Change both together. */
export const AI_REQUESTS_PER_HOUR = 30;
/** A second request inside this window is treated as a double submit. */
export const AI_DUPLICATE_WINDOW_MS = 4_000;

export type ThrottleResult = "ok" | "duplicate" | "hourly_limit";

/** Record one AI request if the user is under the limits; refuse otherwise. */
export async function throttleAiRequest(userId: string, feature: string, now = new Date()): Promise<ThrottleResult> {
  return db.transaction(async (tx) => {
    await lock(tx, userId, `throttle:${feature}`);
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const recent = await tx
      .select({ createdAt: toolRequestLog.createdAt })
      .from(toolRequestLog)
      .where(and(eq(toolRequestLog.userId, userId), eq(toolRequestLog.feature, feature), gte(toolRequestLog.createdAt, hourAgo)));
    if (recent.some((r) => now.getTime() - r.createdAt.getTime() < AI_DUPLICATE_WINDOW_MS)) return "duplicate";
    if (recent.length >= AI_REQUESTS_PER_HOUR) return "hourly_limit";
    await tx.insert(toolRequestLog).values({ userId, feature, createdAt: now });
    return "ok";
  });
}

/* ------------------------------------------------------------------ *
 * Browser-local sessions (LinkedIn, essay)
 * ------------------------------------------------------------------ */

export type SessionGate =
  | { mode: "open"; expiresAt: Date | null; access: FeatureAccess }
  | { mode: "start"; access: FeatureAccess }
  | { mode: "blocked"; access: FeatureAccess; renewsAt: Date | null };

/**
 * Whether a page should render a browser-local tool for this viewer.
 * Read-only — opening a session is `startToolSessionAction`'s job.
 */
export async function sessionGate(
  userId: string,
  tier: TierId,
  feature: "linkedin_tools" | "essay_reviewer",
  now = new Date(),
): Promise<SessionGate> {
  const read = await readAllowance(userId, tier, feature, ["session"], now);
  if (read.access.reason === "coming_soon" || read.access.reason === "not_included") {
    return { mode: "blocked", access: read.access, renewsAt: null };
  }
  if (read.access.unlimited) return { mode: "open", expiresAt: null, access: read.access };
  if (read.earned) return { mode: "open", expiresAt: read.earned.expiresAt, access: read.access };
  if (read.access.usable) return { mode: "start", access: read.access };
  return { mode: "blocked", access: read.access, renewsAt: read.renewsAt };
}
