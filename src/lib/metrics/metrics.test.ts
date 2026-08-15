import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitize } from "../analytics/props";
import {
  CITABLE_FLOOR,
  EMPTY_COUNTS,
  buildMetrics,
  isCitable,
  rate,
  type MetricCounts,
} from "./types";

const counts = (over: Partial<MetricCounts> = {}): MetricCounts => ({ ...EMPTY_COUNTS, ...over });

describe("citability", () => {
  it("withholds a number too small to mean anything", () => {
    // The same rule the tracker follows for response rate, and for the same
    // reason: a fraction over a tiny base reads as a rate and is not one.
    assert.equal(isCitable(CITABLE_FLOOR - 1), false);
    assert.equal(isCitable(CITABLE_FLOOR), true);
  });

  it("marks a fresh install as citing nothing", () => {
    const metrics = buildMetrics(EMPTY_COUNTS);
    assert.equal(metrics.some((m) => m.citable), false);
  });

  it("rate returns null rather than a flattering fraction", () => {
    assert.equal(rate(3, 5), null, "3 of 5 is not 60%");
    assert.equal(rate(6, 12), 50);
    assert.equal(rate(0, 0), null);
  });
});

describe("every metric states what it is", () => {
  const metrics = buildMetrics(counts());

  it("gives each one a definition", () => {
    for (const m of metrics) {
      assert.equal(m.definition.length > 20, true, `${m.key} has no real definition`);
    }
  });

  it("names the blind spot rather than estimating it", () => {
    // The LinkedIn checker and essay reviewer run entirely in the browser and
    // both pages promise that. Instrumenting them would need a network call on
    // a page that makes none, so their absence is stated, not filled in.
    const gh = metrics.find((m) => m.key === "githubAudits");
    assert.match(gh?.caveat ?? "", /LinkedIn checker and the essay reviewer are NOT counted/);
  });

  it("does not call filtered feed requests “searches run”", () => {
    const m = metrics.find((m) => m.key === "filteredFeedRequests");
    assert.equal(m?.label, "filtered feed requests");
    assert.match(m?.definition ?? "", /counts requests/);
    assert.match(m?.caveat ?? "", /upper bound/);
  });

  it("warns that tracked is not applied, and applied is self-reported", () => {
    assert.match(
      metrics.find((m) => m.key === "applicationsTracked")?.caveat ?? "",
      /saving something is not applying/,
    );
    assert.match(
      metrics.find((m) => m.key === "applicationsSubmitted")?.caveat ?? "",
      /self-reported/,
    );
  });

  it("passes values through and flags each independently", () => {
    const m = buildMetrics(counts({ signups: 40, savedSearches: 2 }));
    const signups = m.find((x) => x.key === "signups");
    const searches = m.find((x) => x.key === "savedSearches");
    assert.equal(signups?.value, 40);
    assert.equal(signups?.citable, true);
    assert.equal(searches?.value, 2);
    assert.equal(searches?.citable, false);
  });
});

/**
 * The event log's privacy rule, enforced rather than documented.
 *
 * `sanitize` is the boundary. A caller that hands over a search query — by
 * mistake, or because someone later thought it would be useful — must not be
 * able to put it in the table.
 */
describe("sanitize", () => {
  it("drops a long string, which is what user-typed text looks like", () => {
    const out = sanitize({ q: "software engineering internship summer 2027 remote new york" });
    assert.deepEqual(out, {});
  });

  it("keeps short low-cardinality labels", () => {
    assert.deepEqual(sanitize({ results: "few", empty: true, n: 3 }), {
      results: "few",
      empty: true,
      n: 3,
    });
  });

  it("keeps a filter-key array but drops long entries from it", () => {
    const out = sanitize({
      filters: ["kind", "category", "a query the user typed that is far too long to be a filter key"],
    });
    assert.deepEqual(out.filters, ["kind", "category"]);
  });

  it("drops nested objects entirely", () => {
    // The shape most likely to smuggle something in: a whole filters object,
    // or a profile, passed where a label was expected.
    assert.deepEqual(sanitize({ profile: { major: "CS", gpa: 3.9 } }), {});
    assert.deepEqual(sanitize({ nested: [{ a: 1 }] }), {});
  });

  it("drops null and undefined rather than storing them", () => {
    assert.deepEqual(sanitize({ a: null, b: undefined, c: true }), { c: true });
  });

  it("caps how many keys can be recorded at all", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, true]));
    assert.equal(Object.keys(sanitize(many)).length <= 8, true);
  });

  it("survives no props", () => {
    assert.deepEqual(sanitize(undefined), {});
  });

  it("does not hash what it drops", () => {
    // A hash of a query is still a stable identifier for that query, and
    // storing one invites joining it back to something later.
    const out = sanitize({ q: "a very long query string that will not be stored anywhere at all" });
    assert.equal(JSON.stringify(out).includes("q"), false);
  });
});
