import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { profiles, savedSearches } from "@/db/schema";
import type { TierId } from "@/lib/pricing/tiers";

import { coerceFilters, defaultName, type SavedFilters } from "./types";

/**
 * Saved searches: reads and writes.
 *
 * Our connection is the table owner and **bypasses RLS**, so every query here
 * scopes itself by `userId` explicitly. The policy in migration 0012 guards the
 * PostgREST door; these functions guard ours.
 */

export interface SavedSearch {
  id: string;
  name: string;
  filters: SavedFilters;
  notify: boolean;
  lastNotifiedAt: Date;
  freeAlertPickedAt: Date | null;
  createdAt: Date;
}

function toSaved(row: typeof savedSearches.$inferSelect): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    // Never trusted on read — see types.ts. An older shape degrades rather
    // than throwing on a page someone just wanted to look at.
    filters: coerceFilters(row.filters),
    notify: row.notify,
    lastNotifiedAt: row.lastNotifiedAt,
    freeAlertPickedAt: row.freeAlertPickedAt,
    createdAt: row.createdAt,
  };
}

export async function listSearches(userId: string): Promise<SavedSearch[]> {
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
  return rows.map(toSaved);
}

export type SaveResult = "saved" | "at_limit";

/**
 * Save a search.
 *
 * Capped at the plan's limit (`savedSearchLimit`: one on Free, an operational
 * ceiling on Pro). The cap is reported rather than silently dropping the save,
 * and it only refuses NEW searches — a downgraded account keeps every search
 * it already has.
 *
 * `lastNotifiedAt` defaults to now in the schema, so a brand-new search never
 * fires an alert containing every posting that already matched it.
 */
export async function saveSearch(
  userId: string,
  name: string | null,
  filters: SavedFilters,
  limit: number,
): Promise<SaveResult> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId));

  if (Number(n) >= limit) return "at_limit";

  await db.insert(savedSearches).values({
    userId,
    name: name ?? defaultName(filters),
    filters,
  });
  return "saved";
}

export async function deleteSearch(userId: string, id: string): Promise<void> {
  // Scoped by userId as well as id: our connection bypasses RLS, so an id
  // alone would let anyone who guessed a uuid delete someone else's search.
  await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}

export async function setNotify(userId: string, id: string, notify: boolean): Promise<void> {
  await db
    .update(savedSearches)
    .set({ notify })
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}

/** Make this the one search that alerts while the account is on Free. */
export async function pickFreeAlert(userId: string, id: string): Promise<void> {
  await db
    .update(savedSearches)
    .set({ freeAlertPickedAt: new Date(), notify: true })
    .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}

/* ------------------------------------------------------------------ *
 * The alert job
 * ------------------------------------------------------------------ */

export interface AlertCandidate {
  searchId: string;
  userId: string;
  name: string;
  filters: SavedFilters;
  lastNotifiedAt: Date;
  email: string;
  unsubscribeToken: string;
  /** Their plan, so an alert ranks on the same timing weight their feed does,
   *  and so the job can apply the plan's alert set and cadence. */
  plan: TierId;
  notify: boolean;
  createdAt: Date;
  freeAlertPickedAt: Date | null;
}

/**
 * Searches due an alert, with the address to send to.
 *
 * The email comes from `auth.users` and only when it is **confirmed** — the
 * same rule the deadline reminders follow. Mailing an unconfirmed address is
 * how you send someone else's saved searches to a typo'd address, and how you
 * get a domain marked as a spam source.
 *
 * `db.execute` returns timestamptz as a **string**, not a Date, and casts
 * blindly through its type parameter — the deadline reminders learned that the
 * hard way, with a field typed `Date` that compiled fine and threw
 * `getTime is not a function` on the first real candidate. So the timestamp is
 * formatted to an explicit ISO string in SQL and parsed here.
 */
interface RawAlertRow extends Record<string, unknown> {
  search_id: string;
  user_id: string;
  name: string;
  filters: unknown;
  last_notified_iso: string;
  email: string;
  unsubscribe_token: string;
  plan: string;
  created_iso: string;
  picked_iso: string | null;
  notify: boolean;
}

export async function alertCandidates(limit = 5000): Promise<AlertCandidate[]> {
  const rows = await db.execute<RawAlertRow>(sql`
    select
      s.id                 as search_id,
      s.user_id            as user_id,
      s.name               as name,
      s.filters            as filters,
      s.notify             as notify,
      to_char(s.last_notified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_notified_iso,
      u.email              as email,
      p.unsubscribe_token  as unsubscribe_token,
      p.plan               as plan,
      to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_iso,
      to_char(s.free_alert_picked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as picked_iso
    from saved_searches s
    join profiles p on p.id = s.user_id
    join auth.users u on u.id = s.user_id
    -- Every saved search, alerts on or off: a Free account's alert slot is
    -- chosen among all of them (lib/searches/alerting.ts), and a search with
    -- alerts off must still hold its slot rather than hand it to another.
    where u.email is not null
      and u.email_confirmed_at is not null
      -- No plan filter here, deliberately. Which of a student's searches alert,
      -- and how often, is decided in the job by lib/searches/alerting.ts, which
      -- reads the plan rules from tiers.ts. Restating them in SQL is how the
      -- feed and this job drifted apart before.
    order by s.last_notified_at asc
    limit ${limit}`);

  return rows.map((r) => ({
    searchId: r.search_id,
    userId: r.user_id,
    name: r.name,
    filters: coerceFilters(r.filters),
    lastNotifiedAt: new Date(r.last_notified_iso),
    email: r.email,
    unsubscribeToken: r.unsubscribe_token,
    // The same reading `getUserTier` does, including mapping the legacy
    // 'edge' string UP to Apply rather than down to free — see the note there.
    // The SQL above already restricts to those two, so this only guards
    // against a value nobody expected.
    plan: r.plan === "apply" || r.plan === "edge" ? "apply" : "free",
    notify: r.notify,
    createdAt: new Date(r.created_iso),
    freeAlertPickedAt: r.picked_iso ? new Date(r.picked_iso) : null,
  }));
}

/**
 * Move the watermark.
 *
 * Called only after a send actually succeeds. Moving it first would mean a
 * failed send silently swallows the postings it was going to report — a
 * student would never hear about them, and nothing would record that.
 */
export async function markNotified(searchId: string, at: Date): Promise<void> {
  await db.update(savedSearches).set({ lastNotifiedAt: at }).where(eq(savedSearches.id, searchId));
}

/**
 * Turn off one search's alerts from an email link.
 *
 * Keyed on the profile's unsubscribe token *and* the search id: the token
 * proves who the recipient is without a login, and the id scopes the change to
 * the one alert they clicked out of rather than silencing everything.
 */
export async function unsubscribeSearch(token: string, searchId: string): Promise<boolean> {
  // Comparing text to a uuid column raises `invalid input syntax` in Postgres,
  // which 500s the page — the worst possible response for someone trying to
  // make our email stop. Both ids are checked before they reach SQL.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token) || !UUID_RE.test(searchId)) return false;

  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.unsubscribeToken, token))
    .limit(1);
  if (!row) return false;

  const updated = await db
    .update(savedSearches)
    .set({ notify: false })
    .where(and(eq(savedSearches.id, searchId), eq(savedSearches.userId, row.id)))
    .returning({ id: savedSearches.id });

  return updated.length > 0;
}

/** Every alert off for this profile, for the "stop all of these" link. */
export async function unsubscribeAllSearches(token: string): Promise<boolean> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) return false;

  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.unsubscribeToken, token))
    .limit(1);
  if (!row) return false;

  await db.update(savedSearches).set({ notify: false }).where(eq(savedSearches.userId, row.id));
  return true;
}

/** Oldest-first ordering is the job's, not a caller's concern. */
export const ALERT_ORDER = asc(savedSearches.lastNotifiedAt);
