import assert from "node:assert/strict";
import { test } from "node:test";

import { composeAlert } from "./email";
import {
  EMPTY_FILTERS,
  coerceFilters,
  defaultName,
  describeFilters,
  filtersFromParams,
  filtersToQuery,
  isEmptyFilters,
  type SavedFilters,
} from "./types";

function filters(over: Partial<SavedFilters> = {}): SavedFilters {
  return { ...EMPTY_FILTERS, ...over };
}

/* ------------------------------------------------------------------ *
 * Validation — the boundary where untrusted input stops
 * ------------------------------------------------------------------ */

test("only known filter keys survive a URL", () => {
  /*
   * The `filters` column is jsonb and its values come from a query string.
   * Anything not in the schema must contribute nothing at all.
   */
  const f = filtersFromParams({
    q: "data",
    kind: "scholarship",
    remote: "1",
    // None of these are saveable filters.
    limit: "99999",
    includeClosed: "1",
    evil: "'; drop table postings; --",
    hideBlocked: "1",
  });
  assert.equal(f.q, "data");
  assert.equal(f.kind, "scholarship");
  assert.equal(f.remoteOnly, true);
  assert.equal(Object.keys(f).sort().join(","), Object.keys(EMPTY_FILTERS).sort().join(","));
  assert.equal((f as Record<string, unknown>).evil, undefined);
});

test("a value the feed does not offer is dropped, not stored", () => {
  // Falling back to null rather than throwing: a bad param should give a
  // slightly broader search, never an error page.
  assert.equal(filtersFromParams({ kind: "nonsense" }).kind, null);
  assert.equal(filtersFromParams({ deadline: "999" }).deadline, null);
  assert.equal(filtersFromParams({ category: "underwater-basketweaving" }).category, null);
  // The real ones do survive.
  assert.equal(filtersFromParams({ deadline: "30" }).deadline, "30");
  assert.equal(filtersFromParams({ category: "software" }).category, "software");
});

test("a stored row from an older shape degrades rather than throwing", () => {
  // Same discipline as resumes.parsed: this is read on a page someone just
  // wanted to look at, so it must be total.
  assert.deepEqual(coerceFilters(null), EMPTY_FILTERS);
  assert.deepEqual(coerceFilters("not an object"), EMPTY_FILTERS);
  assert.equal(coerceFilters({ q: "go", kind: "removed_kind" }).q, "go");
  assert.equal(coerceFilters({ q: "go", kind: "removed_kind" }).kind, null);
});

test("a negative or absurd minimum amount is ignored", () => {
  assert.equal(filtersFromParams({ minAmount: "-500" }).minAmount, null);
  assert.equal(filtersFromParams({ minAmount: "abc" }).minAmount, null);
  assert.equal(filtersFromParams({ minAmount: "1000" }).minAmount, 1000);
});

/* ------------------------------------------------------------------ *
 * Round-trip
 * ------------------------------------------------------------------ */

test("filters round-trip through a query string unchanged", () => {
  const original = filters({
    q: "machine learning",
    kind: "internship",
    deadline: "30",
    minAmount: 2500,
    location: "Chicago",
    term: "Summer 2027",
    category: "data_ai",
    remoteOnly: true,
  });
  const back = filtersFromParams(
    Object.fromEntries(new URLSearchParams(filtersToQuery(original))),
  );
  assert.deepEqual(back, original);
});

test("an empty search produces an empty query and is recognised as empty", () => {
  assert.equal(filtersToQuery(EMPTY_FILTERS), "");
  assert.equal(isEmptyFilters(EMPTY_FILTERS), true);
  assert.equal(isEmptyFilters(filters({ q: "x" })), false);
  assert.equal(isEmptyFilters(filters({ remoteOnly: true })), false);
  // minAmount of 0 is not a filter — it excludes nothing.
  assert.equal(isEmptyFilters(filters({ minAmount: 0 })), false);
});

/* ------------------------------------------------------------------ *
 * Describing
 * ------------------------------------------------------------------ */

test("a description is built from what is set, never a template with blanks", () => {
  assert.equal(describeFilters(EMPTY_FILTERS), "everything");
  assert.equal(
    describeFilters(filters({ kind: "scholarship", minAmount: 5000, deadline: "30" })),
    "scholarships · $5,000+ · closing within 30 days",
  );
  assert.equal(
    describeFilters(filters({ q: "python", kind: "internship", remoteOnly: true })),
    "“python” · internships · remote only",
  );
  // No stray separators or empty segments anywhere.
  for (const f of [EMPTY_FILTERS, filters({ q: "x" }), filters({ location: "NYC" })]) {
    const d = describeFilters(f);
    assert.equal(d.includes("··"), false, d);
    assert.equal(d.trim(), d, d);
  }
});

test("a default name is only a fallback and fits the column", () => {
  const long = filters({ q: "x".repeat(200), location: "y".repeat(200) });
  assert.ok(defaultName(long).length <= 80);
});

/* ------------------------------------------------------------------ *
 * The email
 * ------------------------------------------------------------------ */

const MATCHES = [
  { id: "1", title: "Data Science Intern", company: "Acme", kind: "internship", deadlineAt: null },
  {
    id: "2",
    title: "Rural Scholars Award",
    company: "Foundation",
    kind: "scholarship",
    deadlineAt: new Date("2026-11-01T00:00:00Z"),
  },
];

test("the subject states the count and the search name", () => {
  // "3 new for scholarships closing within 30 days" is a decision a student can
  // make in the inbox. "New matches" makes every one of these worth opening
  // exactly once.
  const email = composeAlert({
    email: "a@b.com",
    searchId: "s1",
    searchName: "data internships",
    feedQuery: "kind=internship",
    matches: MATCHES,
    unsubscribeToken: "tok",
  });
  assert.equal(email.subject, "2 new matches — data internships");
  assert.equal(email.to, "a@b.com");
});

test("one match is singular", () => {
  const email = composeAlert({
    email: "a@b.com",
    searchId: "s1",
    searchName: "x",
    feedQuery: "",
    matches: MATCHES.slice(0, 1),
    unsubscribeToken: "tok",
  });
  assert.match(email.subject, /^1 new match —/);
});

test("every alert carries a per-search opt-out and an opt-out of all", () => {
  const email = composeAlert({
    email: "a@b.com",
    searchId: "s1",
    searchName: "x",
    feedQuery: "",
    matches: MATCHES,
    unsubscribeToken: "tok-123",
  });
  assert.match(email.text, /token=tok-123&search=s1/);
  assert.match(email.text, /searches=all/);
  // The List-Unsubscribe header points at the per-search opt-out, so one-click
  // unsubscribe does what the person expects: stop this one.
  assert.match(email.unsubscribeUrl, /search=s1/);
});

test("the body says what “new” actually means", () => {
  // A new match is new to us, not necessarily newly posted. We can stand behind
  // when we first saw a row; we cannot stand behind an employer's posting date.
  const email = composeAlert({
    email: "a@b.com",
    searchId: "s1",
    searchName: "x",
    feedQuery: "",
    matches: MATCHES,
    unsubscribeToken: "tok",
  });
  assert.match(email.text, /we first saw it since the last time we wrote to you/);
});

test("a long list is truncated in the body with an honest count", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    title: `Role ${i}`,
    company: "Acme",
    kind: "internship",
    deadlineAt: null,
  }));
  const email = composeAlert({
    email: "a@b.com",
    searchId: "s1",
    searchName: "x",
    feedQuery: "",
    matches: many,
    unsubscribeToken: "tok",
  });
  assert.match(email.text, /and 12 more/);
  assert.match(email.subject, /^20 new matches/);
});
