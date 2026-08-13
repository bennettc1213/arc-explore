import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preparePosting, reconcile, type ExistingPosting } from "./reconcile";
import type { SourcePosting } from "./types";

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
    const existing: ExistingPosting[] = [{ canonicalHash: p.canonicalHash, closedAt: null }];
    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });
    assert.equal(plan.toInsert.length, 0);
    assert.equal(plan.toTouch.length, 1);
  });

  it("closes a posting that vanished from the board", () => {
    // The headline behaviour: snapshot a feed, remove an entry, reconcile,
    // and the missing posting is marked closed. This is our "already filled"
    // signal, and no upstream source provides it.
    const gone = preparePosting(posting({ title: "Data Science Intern", sourceId: "2" }));
    const stillThere = preparePosting(posting());
    const existing: ExistingPosting[] = [
      { canonicalHash: gone.canonicalHash, closedAt: null },
      { canonicalHash: stillThere.canonicalHash, closedAt: null },
    ];

    const plan = reconcile({ incoming: [posting()], existing, totalOnBoard: 50 });

    assert.deepEqual(plan.toClose, [gone.canonicalHash]);
    assert.equal(plan.toTouch.length, 1);
  });

  it("does not re-close something already closed", () => {
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      { canonicalHash: p.canonicalHash, closedAt: new Date("2026-01-01") },
    ];
    const plan = reconcile({ incoming: [], existing, totalOnBoard: 50 });
    assert.equal(plan.toClose.length, 0);
  });

  it("reopens a reposted role instead of duplicating it", () => {
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [
      { canonicalHash: p.canonicalHash, closedAt: new Date("2026-01-01") },
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
    const existing: ExistingPosting[] = [{ canonicalHash: p.canonicalHash, closedAt: null }];

    const plan = reconcile({ incoming: [], existing, totalOnBoard: 0 });

    assert.equal(plan.closeSuppressed, true);
    assert.equal(plan.toClose.length, 0);
  });

  it("DOES close when the board is alive but has no internships left", () => {
    // The legitimate case: the company still lists 50 jobs, none early-career.
    const p = preparePosting(posting());
    const existing: ExistingPosting[] = [{ canonicalHash: p.canonicalHash, closedAt: null }];

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
});
