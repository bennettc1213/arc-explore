import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { scoutHistory } from "@/db/schema";

import { coerceScoutPreferences, scoutFingerprint } from "./history";
import type { ScoutPreferences } from "./types";

const HISTORY_LIMIT = 5;

export interface RecentScout {
  id: string;
  preferences: ScoutPreferences;
  updatedAt: string;
}

/** Read is scoped explicitly because the server database role bypasses RLS. */
export async function listRecentScouts(userId: string): Promise<RecentScout[]> {
  const rows = await db.select().from(scoutHistory)
    .where(eq(scoutHistory.userId, userId))
    .orderBy(desc(scoutHistory.updatedAt))
    .limit(HISTORY_LIMIT);
  return rows.flatMap(row => {
    const preferences = coerceScoutPreferences(row.filters);
    return preferences ? [{ id: row.id, preferences, updatedAt: row.updatedAt.toISOString() }] : [];
  });
}

/**
 * Refreshing an identical Scout moves it to the top instead of filling the
 * history with copies. Keep only a small recall list, never an activity log.
 */
export async function rememberScout(userId: string, preferences: ScoutPreferences): Promise<void> {
  const fingerprint = scoutFingerprint(preferences);
  await db.transaction(async tx => {
    await tx.insert(scoutHistory).values({ userId, filters: preferences, fingerprint })
      .onConflictDoUpdate({
        target: [scoutHistory.userId, scoutHistory.fingerprint],
        set: { filters: preferences, updatedAt: new Date() },
      });
    await tx.execute(sql`
      delete from scout_history
      where user_id = ${userId}
        and id in (
          select id from scout_history
          where user_id = ${userId}
          order by updated_at desc, created_at desc
          offset ${HISTORY_LIMIT}
        )
    `);
  });
}
