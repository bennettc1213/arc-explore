import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { timestamptz } from "./fragments";
import { postings } from "./schema";

/**
 * A drizzle instance that can build queries but never runs one. `toSQL()` is a
 * pure step, so a stub client is enough and the test needs no DATABASE_URL.
 *
 * The stub still carries an `options.parsers`/`options.serializers` table,
 * because `drizzle()` writes the date/time identity serializers into it at
 * construction time — the very behaviour this file exists to defend against.
 */
const db = drizzle(
  {
    options: { parsers: {}, serializers: {} },
    unsafe: () => {
      throw new Error("this test must not execute a query");
    },
  } as never,
  { schema: { postings } },
);

const now = new Date("2026-09-27T18:00:00.000Z");
const noIds = ["00000000-0000-0000-0000-000000000000"];

/**
 * The actual failure: drizzle replaces postgres.js's date/time serializers with
 * an identity function, so a raw `Date` that reaches the driver un-mapped makes
 * postgres.js call `Buffer.byteLength(date)` and throw ERR_INVALID_ARG_TYPE at
 * query time — aborting the whole transaction. See ./fragments for the detail.
 *
 * Building the query and inspecting its params catches that at build time.
 */
function assertNoRawDates(label: string, query: { sql: string; params: unknown[] }): void {
  const dates = query.params.filter((p): p is Date => p instanceof Date);
  assert.deepEqual(
    dates.map(String),
    [],
    `${label} passed ${dates.length} raw Date(s) to the driver: ${query.sql}`,
  );
}

describe("timestamptz", () => {
  it("binds ISO text, never a Date", () => {
    const built = db
      .select()
      .from(postings)
      .where(sql`${postings.closedAt} < ${timestamptz(now)}`)
      .toSQL();

    assertNoRawDates("timestamptz", built);
    assert.ok(
      built.params.some((p) => typeof p === "string" && p.includes("2026-09-27")),
      `expected an ISO string param, got ${JSON.stringify(built.params)}`,
    );
  });

  it("preserves sub-second precision through the cast", () => {
    const withMillis = new Date("2026-09-27T18:00:00.123Z");
    const built = db
      .select()
      .from(postings)
      .where(sql`${postings.closedAt} < ${timestamptz(withMillis)}`)
      .toSQL();

    assert.ok(built.params.some((p) => p === "2026-09-27T18:00:00.123Z"));
  });
});

describe("two-successful-miss writes bind no raw dates", () => {
  // These are the exact statements from the close lifecycle in
  // src/lib/ingest/persist.ts and src/lib/scholarships/persist.ts. Both threw
  // ERR_INVALID_ARG_TYPE before timestamptz() was introduced, which silently
  // broke miss-striking and closing for every board that had a stale listing.
  const byCanonicalHash = inArray(postings.canonicalHash, noIds);
  const byId = inArray(postings.id, noIds);

  it("incrementing a miss strike", () => {
    const built = db
      .update(postings)
      .set({
        missingStrikes: sql`${postings.missingStrikes} + 1`,
        missingSince: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
      })
      .where(byCanonicalHash)
      .toSQL();

    assertNoRawDates("increment miss strike", built);
  });

  it("closing on the second consecutive miss", () => {
    const built = db
      .update(postings)
      .set({
        closedAt: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
        missingStrikes: 0,
        missingSince: null,
      })
      .where(byCanonicalHash)
      .toSQL();

    assertNoRawDates("close on second miss", built);
  });

  it("the same close statement keyed by id (scholarship path)", () => {
    const built = db
      .update(postings)
      .set({
        closedAt: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})`,
        missingStrikes: 0,
        missingSince: null,
      })
      .where(byId)
      .toSQL();

    assertNoRawDates("close on second miss (by id)", built);
  });

  it("still produces the COALESCE and a timestamptz cast", () => {
    const built = db
      .update(postings)
      .set({ closedAt: sql`COALESCE(${postings.missingSince}, ${timestamptz(now)})` })
      .where(and(eq(postings.canonicalHash, noIds[0]!)))
      .toSQL();

    assert.match(built.sql, /COALESCE\("postings"\."missing_since", \$1::timestamptz\)/);
  });

  it("a typed Date column binding is still allowed", () => {
    // The mapper handles these, which is why only `sql` params were a problem.
    const built = db
      .update(postings)
      .set({ closedAt: now })
      .where(and(eq(postings.canonicalHash, noIds[0]!)))
      .toSQL();

    assert.match(built.sql, /"closed_at" = \$1/);
  });
});
