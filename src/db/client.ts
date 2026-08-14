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
 *
 * `idle_timeout` matters for the same pooler: it drops connections that sit
 * idle past ~60s, and a slow crawl (the scholarship sources fetch for a
 * minute or two before their first write) leaves the pooled socket stale, so
 * the first post-fetch query dies with CONNECTION_CLOSED. Recycling idle
 * connections ourselves keeps the pooler's kill from ever being the thing we
 * hit.
 */
const queryClient = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
  idle_timeout: 55,
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
