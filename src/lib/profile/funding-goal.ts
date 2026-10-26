/**
 * The student's funding goal — "how much do you need to cover?".
 *
 * WHY THIS IS RAW SQL AND NOT A COLUMN ON `profiles` IN `db/schema.ts`.
 * The migration that adds `profiles.funding_goal` (0027) is held back until
 * 0025/0026 reach production (FIXES.md §7) — `db:migrate` applies in journal
 * order — and local `.env` points at that same database, so applying it from a
 * dev machine would be a production migration. `getProfile` does `select()` with every
 * declared column, so declaring this one in the schema before it exists would
 * turn every signed-in page into `42703 column does not exist`.
 *
 * So the column is read and written here, by name, and a missing column is a
 * state rather than an error: `available: false`, and the UI hides the goal
 * prompt instead of asking a question it cannot save the answer to. Once 0027
 * is applied, declare the column in `profiles` and fold this into the store.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

export interface FundingGoalState {
  /** False until migration 0027 has been applied to this database. */
  available: boolean;
  goal: number | null;
}

const MAX_CAUSE_DEPTH = 5;

/** Postgres "undefined_column" anywhere in the cause chain. */
export function isMissingColumn(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < MAX_CAUSE_DEPTH && cur && typeof cur === "object"; i++) {
    if ((cur as { code?: unknown }).code === "42703") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export async function getFundingGoal(userId: string): Promise<FundingGoalState> {
  try {
    const rows = await db.execute<{ funding_goal: number | null }>(
      sql`select funding_goal from profiles where id = ${userId} limit 1`,
    );
    const raw = rows[0]?.funding_goal ?? null;
    return { available: true, goal: typeof raw === "number" && raw > 0 ? raw : null };
  } catch (err) {
    if (isMissingColumn(err)) return { available: false, goal: null };
    throw err;
  }
}

/** Scoped to the session's own id by the caller — never an id from the form. */
export async function saveFundingGoal(userId: string, goal: number): Promise<boolean> {
  try {
    await db.execute(sql`update profiles set funding_goal = ${goal} where id = ${userId}`);
    return true;
  } catch (err) {
    if (isMissingColumn(err)) return false;
    throw err;
  }
}
