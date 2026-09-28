/**
 * Activation — the moment a student is both complete enough to score and
 * engaged enough to have saved something.
 *
 * R9 defines activation as: all four fit-score fields filled in (major,
 * graduation year, state/work-location preference, work authorization) and at
 * least one posting saved. The `profiles.activated_at` column is the durable
 * record; `profile_activated` is the event emitted the first time it is set.
 */

import { and, count, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { applications, profiles } from "@/db/schema";
import { recordEvent } from "@/lib/analytics/record";

import { isProfileReadyForFit, type ReadyForFitFields } from "./types";

/**
 * Records activation if this user has crossed the threshold for the first time.
 *
 * Idempotent by checking `profiles.activated_at`: the event is emitted once,
 * the column is set once, and neither is moved on later saves.
 */
export async function maybeRecordActivation(userId: string): Promise<void> {
  const [profile] = await db
    .select({
      major: profiles.major,
      gradYear: profiles.gradYear,
      workAuth: profiles.workAuth,
      targetLocations: profiles.targetLocations,
      activatedAt: profiles.activatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  if (!profile) return;
  if (profile.activatedAt) return;

  const readyFields: ReadyForFitFields = {
    major: profile.major,
    gradYear: profile.gradYear,
    workAuth: profile.workAuth,
    targetLocations: profile.targetLocations as string[],
  };
  if (!isProfileReadyForFit(readyFields)) return;

  const [{ n }] = await db
    .select({ n: count() })
    .from(applications)
    .where(eq(applications.userId, userId))
    .limit(1);
  if (n === 0) return;

  const now = new Date();
  await db
    .update(profiles)
    .set({ activatedAt: now })
    .where(eq(profiles.id, userId));

  void recordEvent("profile_activated", {});
}

/**
 * Whether a user has already activated. Used when a caller needs the answer
 * without side effects.
 */
export async function isActivated(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ activatedAt: profiles.activatedAt })
    .from(profiles)
    .where(and(eq(profiles.id, userId), isNotNull(profiles.activatedAt)))
    .limit(1);
  return Boolean(row);
}

/**
 * Raw count of activated profiles. Mirrors the SQL in `metrics/store.ts` so
 * callers can ask the question without reconstructing the join.
 */
export async function countActivatedProfiles(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(profiles)
    .where(isNotNull(profiles.activatedAt));
  return row?.n ?? 0;
}
