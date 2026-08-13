import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see .env");
}

/**
 * Single pooled connection, reused across the process.
 *
 * `prepare: false` is required against Supabase's Transaction Pooler — it
 * multiplexes connections across clients, so a prepared statement can outlive
 * the physical connection it was created on.
 */
const queryClient = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
});

export const db = drizzle(queryClient, { schema });

/**
 * Close the pool.
 *
 * Long-lived servers never call this — the pool is meant to outlive a request.
 * One-shot scripts must: postgres.js keeps its sockets open, and an open handle
 * keeps Node alive forever. A cron job that finishes its work in six seconds
 * and then sits there until the runner's timeout kills it looks, from CI, like
 * a job that failed.
 */
export async function closeDb(): Promise<void> {
  await queryClient.end();
}
