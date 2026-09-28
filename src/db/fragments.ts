import { sql } from "drizzle-orm";

/**
 * SQL fragments that are safe to interpolate into a `sql` template.
 *
 * ## Why a raw `Date` cannot be interpolated
 *
 * `drizzle-orm/pg-core/driver.js` overwrites postgres.js's date/time serializers
 * with an identity function the moment `drizzle()` is called:
 *
 * ```js
 * const transparentParser = (val) => val;
 * for (const type of ["1184", "1082", "1083", "1114", "1182", "1185", "1115", "1231"]) {
 *   client.options.parsers[type] = transparentParser;
 *   client.options.serializers[type] = transparentParser;
 * }
 * ```
 *
 * Drizzle does this because it expects column values to already be in driver
 * form: a typed binding like `.set({ closedAt: now })` is run through the
 * column's `mapToDriverValue` first, which yields a string, and the identity
 * serializer passes that string straight through.
 *
 * An untyped `sql` param is *not* mapped, because there is no column to read a
 * type from. postgres.js then calls the identity serializer, gets the original
 * `Date` back unchanged, and hands it to its byte writer, which calls
 * `Buffer.byteLength(date)` and throws:
 *
 * ```
 * TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must be of type string
 * or an instance of Buffer or ArrayBuffer. Received an instance of Date
 * ```
 *
 * The failure happens at query time, not build time, and it aborts the whole
 * surrounding transaction. That is how a single `COALESCE(col, ${now})` ended
 * up breaking ingestion for 350 of 1,261 boards: any board with one listing
 * missing long enough to earn a strike threw on every poll, rolled back, and
 * could never recover.
 *
 * ## The rule
 *
 * Serialize dates to ISO text inside the fragment. A string is not a date type,
 * so the identity serializer has nothing to undo.
 */
export const timestamptz = (value: Date) => sql`${value.toISOString()}::timestamptz`;
