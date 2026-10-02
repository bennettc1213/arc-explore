import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { preparePosting, type PreparedPosting } from "./reconcile";
import type { SourcePosting } from "./types";

/*
 * `wouldTouchChange` lives in persist.ts, which imports the db client, whose
 * module guard throws at import time without DATABASE_URL. A dummy URL
 * satisfies the guard and nothing ever connects — the predicate is pure. The
 * import is dynamic because the CJS output hoists static imports above this
 * assignment.
 */
process.env.DATABASE_URL ??= "postgres://ins013-tests:no-query@127.0.0.1:5432/ins013_tests";
type WouldTouchChange = typeof import("./persist")["wouldTouchChange"];
type StoredRow = Parameters<WouldTouchChange>[0];

let wouldTouchChange: WouldTouchChange;
before(async () => {
  ({ wouldTouchChange } = await import("./persist"));
});

function source(overrides: Partial<SourcePosting> = {}): SourcePosting {
  return {
    source: "greenhouse",
    sourceId: "1",
    companyName: "Stripe",
    title: "Software Engineer Intern",
    url: "https://boards.greenhouse.io/stripe/jobs/1",
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

/** A stored row shaped exactly like a posting this same path once prepared. */
function storedRow(p: PreparedPosting, overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    title: p.title,
    url: p.url,
    locations: p.locations,
    isRemote: p.isRemote,
    descriptionText: p.descriptionText,
    workAuth: p.workAuth,
    skills: p.skills,
    postedAt: p.postedAt,
    deadlineAt: p.deadlineAt,
    term: p.term,
    termSource: p.termSource,
    termSeason: p.termSeason,
    termYear: p.termYear,
    termRaw: p.termRaw,
    termEndedFlagAt: p.termEndedFlagAt,
    ...overrides,
  };
}

// Two polls of the same board; `now` differs, which is the whole trap: a
// re-derived value that embeds `now` is never equal to the stored one.
const FIRST_POLL = new Date("2026-10-01T12:00:00.000Z");
const SECOND_POLL = new Date("2026-10-02T12:00:00.000Z");

describe("wouldTouchChange", () => {
  it("counts an identical current-term posting as unchanged", () => {
    // Regression: the check once asked only "would the touch write term
    // columns?" — and an explicit term always writes them, so every posting
    // that stated its term (most internships) counted as updated on every
    // poll, forever, even when every value was identical.
    const desc = "Join the Summer 2027 cohort.";
    const stored = storedRow(preparePosting(source({ descriptionText: desc }), FIRST_POLL));
    const again = preparePosting(source({ descriptionText: desc }), SECOND_POLL);
    assert.equal(wouldTouchChange(stored, again), false);
  });

  it("counts a changed description as changed", () => {
    const stored = storedRow(
      preparePosting(source({ descriptionText: "Join the Summer 2027 cohort." }), FIRST_POLL),
    );
    const refreshed = preparePosting(
      source({ descriptionText: "Join the Summer 2027 cohort. Now hybrid, and longer." }),
      SECOND_POLL,
    );
    assert.equal(wouldTouchChange(stored, refreshed), true);
  });

  it("does not re-stamp an ended-term flag that is already set", () => {
    // Regression: a re-detected ended term carried a fresh `now`, so the flag
    // differed from the stored one on every poll and an ended-term listing —
    // most of a past season's board — reported "updated" forever. The write
    // now keeps the first stamp (COALESCE), so re-detection is not a change.
    const desc = "Join the Summer 2026 cohort.";
    const stored = storedRow(preparePosting(source({ descriptionText: desc }), FIRST_POLL));
    assert.ok(stored.termEndedFlagAt, "fixture must state an ended term");
    const again = preparePosting(source({ descriptionText: desc }), SECOND_POLL);
    assert.notEqual(again.termEndedFlagAt?.getTime(), stored.termEndedFlagAt?.getTime());
    assert.equal(wouldTouchChange(stored, again), false);
  });

  it("counts the first detection of an ended term as a change", () => {
    // The row was stored while the term was still current, so it has no flag;
    // the next poll detects the ending, and that detection is a real change.
    const desc = "Join the Summer 2026 cohort.";
    const stored = storedRow(
      preparePosting(source({ descriptionText: desc }), FIRST_POLL),
      { termEndedFlagAt: null },
    );
    const again = preparePosting(source({ descriptionText: desc }), SECOND_POLL);
    assert.equal(wouldTouchChange(stored, again), true);
  });

  it("counts clearing a stale ended-term flag as a change", () => {
    // Term columns are identical here, so only the flag differs: the listing
    // now states a current term, and the write clears the stale flag.
    const desc = "Join the Summer 2026 cohort.";
    const stored = storedRow(preparePosting(source({ descriptionText: desc }), FIRST_POLL));
    const movedOn = {
      ...preparePosting(source({ descriptionText: desc }), SECOND_POLL),
      termEndedFlagAt: null,
    } satisfies PreparedPosting;
    assert.equal(wouldTouchChange(stored, movedOn), true);
  });

  it("does not count a weaker poll as a change", () => {
    // A list-endpoint poll carries no description, so it parses at best an
    // inferred term. It may not overwrite the stored explicit term or erase
    // its ended-term flag — and it must not claim churn it cannot cause.
    const stored = storedRow(
      preparePosting(source({ descriptionText: "Join the Summer 2026 cohort." }), FIRST_POLL),
    );
    const listPoll = preparePosting(source(), SECOND_POLL);
    assert.equal(listPoll.termSource, "inferred");
    assert.equal(listPoll.descriptionText, null);
    assert.equal(wouldTouchChange(stored, listPoll), false);
  });

  it("counts employer edits and newly learned fields", () => {
    const stored = storedRow(preparePosting(source(), FIRST_POLL));

    const retitled = preparePosting(
      source({ title: "Software Engineering Intern" }),
      SECOND_POLL,
    );
    assert.equal(wouldTouchChange(stored, retitled), true);

    const dated = preparePosting(
      source({ postedAt: new Date("2026-09-15T00:00:00.000Z") }),
      SECOND_POLL,
    );
    assert.equal(wouldTouchChange(stored, dated), true);

    const skilled = preparePosting(
      source({ descriptionText: "You will write Python and TypeScript daily." }),
      SECOND_POLL,
    );
    assert.ok(skilled.skills.length > 0, "fixture must surface a skill");
    assert.equal(wouldTouchChange(stored, skilled), true);
  });
});
