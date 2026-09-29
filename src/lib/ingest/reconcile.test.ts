import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preparePosting, reconcile, termUpdateForReopen, termUpdateForTouch, termUpdateFromDescription, type ExistingPosting } from "./reconcile";
import type { SourcePosting } from "./types";

function existingRow(
  canonicalHash: string,
  overrides: Partial<ExistingPosting> = {},
): ExistingPosting {
  return {
    canonicalHash,
    closedAt: null,
    missingStrikes: 0,
    missingSince: null,
    ...overrides,
  };
}

function posting(overrides: Partial<SourcePosting> = {}): SourcePosting {
  return {
    source: "greenhouse",
    sourceId: "1",
    companyName: "Stripe",
    title: "Software Engineer Intern",
    url: "https://stripe.com/jobs?gh_jid=1",
    locations: ["San Francisco, CA"],
    isRemote: false,
    postedAt: null,
    deadlineAt: null,
    descriptionText: null,
    employmentHint: null,
    raw: {},
    ...overrides,
  };
}

describe("preparePosting", () => {
  it("normalizes and classifies in one pass", () => {
    const p = preparePosting(
      posting({ title: "Software Engineer Intern (Summer 2027)", companyName: "Stripe, Inc." }),
    );
    assert.equal(p.kind, "internship");
    assert.equal(p.term, "Summer 2027");
    assert.equal(p.normalizedCompanyName, "stripe");
    assert.equal(p.normalizedTitle, "software engineer intern");
  });

  it("leaves unknown fields null rather than guessing", () => {
    const p = preparePosting(posting());
    assert.equal(p.term, null);
    assert.equal(p.workAuth, null);
    assert.equal(p.postedAt, null);
    assert.equal(p.deadlineAt, null);
  });

  it("derives work auth from description text", () => {
    const p = preparePosting(
      posting({ descriptionText: "Applicants must be a U.S. citizen for this role." }),
    );
    assert.equal(p.workAuth, "citizenship_required");
  });
});

describe("reconcile", () => {
  it("detects a brand-new posting", () => {
    const plan = reconcile({ incoming: [posting()], existing: [], totalOnBoard: 50 });
    assert.equal(plan.toInsert.length, 1);
    assert.equal(plan.toTouch.length, 0);
    assert.equal(plan.toClose.length, 0);
  });

  it("touches a posting it already knows", () => {
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [existingRow(p.canonicalHash)];
    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });
    assert.equal(plan.toInsert.length, 0);
    assert.equal(plan.toTouch.length, 1);
  });

  it("does not close on a single absence — only increments a strike", () => {
    // The two-observation rule: one scrape that loses a row is as flaky as a
    // single 404 on the apply URL (linkcheck.ts). The posting is not closed;
    // it is given a strike so a second consecutive absence can close it.
    const gone = preparePosting(posting({ title: "Data Science Intern", sourceId: "2" }));
    const stillThere = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(gone.canonicalHash),
      existingRow(stillThere.canonicalHash),
    ];

    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });

    assert.deepEqual(plan.toClose, []);
    assert.deepEqual(
      plan.toIncrementMissing.map((c) => c.canonicalHash),
      [gone.canonicalHash],
    );
    assert.equal(plan.toTouch.length, 1);
  });

  it("does not re-close something already closed", () => {
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { closedAt: new Date("2026-01-01") }),
    ];
    const plan = reconcile({ incoming: [], existing, totalOnBoard: 50 });
    assert.equal(plan.toClose.length, 0);
  });

  it("reopens a reposted role instead of duplicating it", () => {
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { closedAt: new Date("2026-01-01") }),
    ];
    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });
    assert.equal(plan.toReopen.length, 1);
    assert.equal(plan.toInsert.length, 0);
  });

  it("SUPPRESSES closing when the board returned nothing at all", () => {
    // A board answering with zero total postings is far more likely to be an
    // upstream hiccup or a renamed slug than every job vanishing at once.
    // Wiping the user's view on that signal would be the worst possible bug.
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [existingRow(p.canonicalHash)];

    const plan = reconcile({ incoming: [], existing, totalOnBoard: 0 });

    assert.equal(plan.closeSuppressed, true);
    assert.equal(plan.toClose.length, 0);
  });

  it("DOES close on the second consecutive absence", () => {
    // The legitimate case: the company still lists 50 jobs, none early-career,
    // and this is the *second* scrape in a row that omits a row we hold. A
    // single absence only increments; only the second consecutive one closes.
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { missingStrikes: 1, missingSince: new Date("2026-03-01") }),
    ];

    const plan = reconcile({ incoming: [], existing, totalOnBoard: 50 });

    assert.equal(plan.closeSuppressed, false);
    assert.deepEqual(plan.toClose, [p.canonicalHash]);
  });

  it("filters out non-early-career roles", () => {
    const plan = reconcile({
      incoming: [posting({ title: "Staff Backend Engineer" }), posting()],
      existing: [],
      totalOnBoard: 50,
    });
    assert.equal(plan.filteredOut, 1);
    assert.equal(plan.toInsert.length, 1);
  });

  it("collapses two source rows that normalize to the same posting", () => {
    // Same role, two feeds describing it differently — must not double-insert.
    const plan = reconcile({
      incoming: [
        posting({ sourceId: "a", title: "Software Engineer Intern (Summer 2027)" }),
        posting({ sourceId: "b", title: "Software Engineer Intern - Summer 2027" }),
      ],
      existing: [],
      totalOnBoard: 50,
    });
    assert.equal(plan.toInsert.length, 1);
  });

  it("recovers: a return after one strike clears the counter", () => {
    // Posting was absent last scrape (strike 1), is present this scrape — it
    // touched and its strike must be cleared rather than carried forward.
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { missingStrikes: 1, missingSince: new Date() }),
    ];

    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });

    assert.equal(plan.toTouch.length, 1);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
    assert.deepEqual(
      plan.toResetMissing.map((c) => c.canonicalHash),
      [p.canonicalHash],
    );
  });

  it("does not re-strike a posting that is already closed", () => {
    // A closed posting is out of the liveness engine; re-appearing reopens it.
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { closedAt: new Date("2026-01-01") }),
    ];

    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });

    assert.equal(plan.toReopen.length, 1);
    assert.equal(plan.toIncrementMissing.length, 0);
  });

  it("suppresses strikes too, not just closes, when the board is empty", () => {
    // The liveness guard protects the whole close path — including the
    // increment — so a hiccup that returns zero postings never advances a
    // strike toward a closing that should not happen.
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { missingStrikes: 1, missingSince: new Date() }),
    ];

    const plan = reconcile({ incoming: [], existing, totalOnBoard: 0 });

    assert.equal(plan.closeSuppressed, true);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
  });

  it("does not advance misses on a failed poll", () => {
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      existingRow(p.canonicalHash, { missingStrikes: 1, missingSince: new Date() }),
    ];

    const plan = reconcile({
      incoming: [],
      existing,
      totalOnBoard: 50,
      successfulComplete: false,
    });

    assert.equal(plan.closeSuppressed, true);
    assert.equal(plan.toClose.length, 0);
    assert.equal(plan.toIncrementMissing.length, 0);
  });
});

describe("term provenance is monotonic on touch and reopen", () => {
  // Regression: Greenhouse and SmartRecruiters omit descriptions from their
  // list endpoints, so a list-only poll re-derives the term from `first_seen`
  // and produces an `inferred` term. Before this rule, that inferred term
  // overwrote the stored explicit term AND cleared `termEndedFlagAt`, so a
  // cheaper poll could silently un-quarantine a listing whose term had ended
  // and put it back in the feed.
  // The flag is stamped with the poll time, so assert it is present rather than
  // pinning a date.
  function explicitPosting() {
    return preparePosting(
      posting({ title: "Software Engineer Intern (Summer 2027)", descriptionText: "Summer 2027." }),
    );
  }

  function inferredListPosting() {
    // A list endpoint gives no description, so the term can only be inferred
    // from when the poll saw it - `now`, which for a brand-new listing is its
    // first-seen date. (Anchoring at the listing's own postedAt was the
    // 2026-09-28 defect: a 2023 posting came in as an unflagged
    // "Summer 2023" listing.)
    const p = preparePosting(
      posting({ title: "Software Engineer Intern" }),
      new Date("2026-09-28T20:00:00.000Z"),
    );
    assert.equal(p.termSource, "inferred");
    return p;
  }

  describe("termUpdateForTouch", () => {
    it("keeps stored term data when the poll only inferred a term", () => {
      const p = inferredListPosting();
      assert.equal(p.termSource, "inferred");

      assert.deepEqual(termUpdateForTouch(p), {});
    });
    it("writes term data when the poll saw the term in the source", () => {
      const p = explicitPosting();
      assert.equal(p.termSource, "explicit");
      assert.equal(p.term, "Summer 2027");
      assert.equal(p.termSeason, "summer");
      assert.equal(p.termYear, 2027);

      assert.deepEqual(termUpdateForTouch(p), {
        term: "Summer 2027",
        termSource: "explicit",
        termSeason: "summer",
        termYear: 2027,
        termRaw: p.termRaw,
        termEndedFlagAt: null,
      });
    });

    it("never lets a touch clear an ended-term flag via a weaker term", () => {
      const p = inferredListPosting();
      // A null flag on the incoming inferred term must not be spread over an
      // existing flag; the update is empty, so the stored flag is untouched.
      const update = termUpdateForTouch(p);
      assert.equal("termEndedFlagAt" in update, false);
    });

    it("carries a fresh ended-term flag when the source states an ended term", () => {
      const p = preparePosting(
        posting({
          title: "Software Engineer Intern (Spring 2025)",
          descriptionText: "Spring 2025 cohort.",
        }),
      );

      assert.equal(p.termSource, "explicit");
      assert.ok(p.termEndedFlagAt instanceof Date, "expected an ended-term flag");
      const update = termUpdateForTouch(p);
      assert.deepEqual(update.termEndedFlagAt, p.termEndedFlagAt);
      assert.equal(update.term, "Spring 2025");
    });
  });

  describe("termUpdateForReopen", () => {
    it("keeps stored term data when the reopen only inferred a term", () => {
      const p = inferredListPosting();
      assert.deepEqual(termUpdateForReopen(p, { termSource: "explicit" }), {});
    });

    it("upgrades a weaker stored term when the reopen saw the term", () => {
      const p = explicitPosting();
      assert.equal(p.termSource, "explicit");
      assert.equal(termUpdateForReopen(p, { termSource: "inferred" }).termSource, "explicit");
    });

    it("leaves an already-explicit term alone rather than churn", () => {
      const p = explicitPosting();
      assert.deepEqual(termUpdateForReopen(p, { termSource: "explicit" }), {});
    });

    it("handles a reopen with no stored provenance", () => {
      const p = explicitPosting();
      assert.equal(termUpdateForReopen(p, undefined).termSource, "explicit");
      assert.equal(termUpdateForReopen(p, { termSource: null }).termSource, "explicit");
    });
  });

  describe("term anchoring (2026-09-28 regression)", () => {
    it("flags an explicit ended term at poll time even when the listing was posted before the term ended", () => {
      // Found on production: a "Spring 2025" listing posted in early 2025 was
      // touched with the flag evaluated at postedAt - where it was not yet
      // ended - so the touch wrote null over a correctly-set quarantine flag.
      const now = new Date("2026-09-28T20:00:00.000Z");
      const p = preparePosting(
        posting({
          title: "Spring 2025 Paid Undergraduate/Graduate Intern",
          postedAt: new Date("2025-01-15T00:00:00.000Z"),
        }),
        now,
      );

      assert.equal(p.term, "Spring 2025");
      assert.equal(p.termSource, "explicit");
      assert.ok(p.termEndedFlagAt instanceof Date, "expected an ended-term flag at poll time");
      assert.deepEqual(termUpdateForTouch(p).termEndedFlagAt, p.termEndedFlagAt);
    });

    it("anchors inference at the poll date, never the listing's posted date", () => {
      // Found on production: a Palantir listing posted in 2023 was inferred as
      // an unflagged "Summer 2023" listing because the fallback anchored the
      // inference at postedAt. first-seen (= poll time for a new listing) is
      // the documented anchor, and it also matches backfill-terms.ts.
      const now = new Date("2026-09-28T20:00:00.000Z");
      const p = preparePosting(
        posting({
          title: "Information Security Engineer, Internship",
          postedAt: new Date("2023-05-01T00:00:00.000Z"),
        }),
        now,
      );

      assert.equal(p.term, "Summer 2027");
      assert.equal(p.termSource, "inferred");
      assert.equal(p.termEndedFlagAt, null);
    });

    it("flags an ended explicit term found by a description fetch, and does not flag a current one", () => {
      const now = new Date("2026-09-28T20:00:00.000Z");

      const ended = termUpdateFromDescription(
        "Spring 2025 Paid Intern",
        "Join the Spring 2025 cohort.",
        now,
      );
      assert.equal(ended.term, "Spring 2025");
      assert.ok(ended.termEndedFlagAt instanceof Date);

      const current = termUpdateFromDescription(
        "Software Engineer Intern (Summer 2027)",
        "Join us in Summer 2027.",
        now,
      );
      assert.equal(current.term, "Summer 2027");
      assert.equal(current.termEndedFlagAt, null);
    });

    it("writes nothing from a description with no explicit term - it must not erase a stored term or its quarantine flag", () => {
      // The pre-fix applyDescription spread an inferred-from-now term over the
      // stored columns, erasing both a stored explicit term and its flag when
      // the fetched description simply did not mention a term.
      const update = termUpdateFromDescription(
        "Software Engineer Intern",
        "Great team. No term mentioned anywhere.",
        new Date("2026-09-28T20:00:00.000Z"),
      );
      assert.deepEqual(update, {});
    });
  });
});
