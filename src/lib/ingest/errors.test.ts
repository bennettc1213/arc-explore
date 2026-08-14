import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeError } from "./errors";

/** Shaped like the `PostgresError` postgres.js throws. */
function pgError(message: string, fields: Record<string, string>): Error {
  return Object.assign(new Error(message), fields);
}

describe("describeError", () => {
  it("keeps an ordinary message intact", () => {
    assert.equal(describeError(new Error("boom")), "boom");
  });

  it("handles values that are not errors", () => {
    assert.equal(describeError("plain string"), "plain string");
    assert.equal(describeError(null), "unknown error");
    assert.equal(describeError(undefined), "unknown error");
  });

  // The failure that motivated this file: the real cause was on `.cause`,
  // and only `.message` was being recorded.
  it("surfaces the Postgres cause behind a Drizzle wrapper", () => {
    const cause = pgError('duplicate key value violates unique constraint "posting_canonical_unique"', {
      code: "23505",
      constraint: "posting_canonical_unique",
      table: "postings",
    });
    const wrapper = new Error(
      `Failed query: insert into "postings" ("id", "kind") values ($1, $2) params: ${"x".repeat(50_000)}`,
      { cause },
    );

    const described = describeError(wrapper);
    assert.match(described, /duplicate key value violates unique constraint/);
    assert.match(described, /code=23505/);
    assert.match(described, /constraint=posting_canonical_unique/);
    assert.match(described, /insert into "postings"/);
  });

  // Params can run to hundreds of kilobytes and may hold user data.
  it("drops bound parameters and bounds the total length", () => {
    const wrapper = new Error(
      `Failed query: insert into "postings" values ($1) params: ${"secret".repeat(10_000)}`,
    );

    const described = describeError(wrapper);
    assert.ok(described.length <= 400, `too long: ${described.length}`);
    assert.ok(!described.includes("secret"), "bound parameters must not be recorded");
  });

  it("records network failures that carry no Postgres fields", () => {
    const described = describeError(
      new Error("write CONNECTION_CLOSED aws-0-us-west-2.pooler.supabase.com:6543"),
    );
    assert.equal(described, "write CONNECTION_CLOSED aws-0-us-west-2.pooler.supabase.com:6543");
  });

  it("walks a multi-link chain without looping on a cycle", () => {
    const inner: Error = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    inner.cause = outer; // cycle

    const described = describeError(outer);
    assert.equal(described, "outer ← inner");
  });
});
