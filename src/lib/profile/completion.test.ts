import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPTY_CORPUS, profileCompletion, type CompletionCorpus } from "./completion";
import type { UserProfile } from "./types";

const EMPTY: UserProfile = {
  id: "u1",
  displayName: null,
  school: null,
  major: null,
  gradYear: null,
  gpa: null,
  workAuth: null,
  targetVerticals: [],
  targetLocations: [],
  openToRemote: true,
  portfolioUrl: null,
  githubUsername: null,
  linkedinUrl: null,
};

const full = (over: Partial<UserProfile> = {}): UserProfile => ({
  ...EMPTY,
  major: "Information Systems",
  gradYear: 2027,
  workAuth: "us_citizen",
  targetLocations: ["Austin, TX"],
  ...over,
});

const CORPUS: CompletionCorpus = {
  statesWorkAuth: 300,
  statesTerm: 1200,
  statesLocation: 900,
  namesSkills: 1600,
  statesField: 2000,
};

describe("profileCompletion", () => {
  it("counts an empty profile as zero of five", () => {
    const c = profileCompletion(EMPTY, []);
    assert.equal(c.done, 0);
    assert.equal(c.total, 5);
    assert.equal(c.percent, 0);
    assert.equal(c.next?.key !== undefined, true);
  });

  it("counts a filled profile with a resume as complete", () => {
    const c = profileCompletion(full(), ["Python", "SQL"]);
    assert.equal(c.done, 5);
    assert.equal(c.percent, 100);
    assert.equal(c.next, null, "nothing left to suggest");
  });

  it("accepts either a major or an interest for the field dimension", () => {
    // fieldsForProfile reads both, so requiring both would report a gap the
    // student does not have — the one error a prompt like this must not make.
    const byMajor = profileCompletion(full({ targetVerticals: [] }), []);
    const byInterest = profileCompletion(
      full({ major: null, targetVerticals: ["software"] }),
      [],
    );
    assert.equal(byMajor.items.find((i) => i.key === "field")?.done, true);
    assert.equal(byInterest.items.find((i) => i.key === "field")?.done, true);
  });

  it("treats whitespace as blank", () => {
    const c = profileCompletion(full({ major: "   ", targetVerticals: [] }), []);
    assert.equal(c.items.find((i) => i.key === "field")?.done, false);
  });

  it("handles a null profile without throwing", () => {
    const c = profileCompletion(null, []);
    assert.equal(c.done, 0);
    assert.equal(c.items.length, 5);
  });

  it("reads the resume from derived skills, not from a stored flag", () => {
    // Same rule the internship score follows: skills are re-derived on read, so
    // a better extractor improves this without anyone re-uploading anything.
    assert.equal(profileCompletion(EMPTY, []).items.find((i) => i.key === "resume")?.done, false);
    assert.equal(profileCompletion(EMPTY, ["Go"]).items.find((i) => i.key === "resume")?.done, true);
  });
});

describe("ordering", () => {
  it("puts incomplete items first, ranked by how many postings they affect", () => {
    const c = profileCompletion(EMPTY, [], CORPUS);
    assert.deepEqual(
      c.items.map((i) => i.key),
      ["field", "resume", "grad_year", "locations", "work_auth"],
    );
    assert.equal(c.next?.key, "field");
  });

  it("sorts an uncountable item after countable ones rather than to the top", () => {
    // "we cannot count this" is not "this matters most". Only reachable when a
    // count is genuinely unavailable — the live path measures every item, after
    // a first run showed an unmeasured `field` sorting last and telling a brand
    // new profile to add locations before stating a major.
    const c = profileCompletion(EMPTY, [], { ...CORPUS, statesField: null });
    assert.equal(c.items.at(-1)?.key, "field");
    assert.equal(c.items.at(-1)?.postings, null);
  });

  it("keeps completed items below everything still to do", () => {
    const c = profileCompletion(full({ workAuth: null }), ["Python"], CORPUS);
    assert.equal(c.items[0].key, "work_auth");
    assert.equal(c.items[0].done, false);
    assert.equal(c.items.slice(1).every((i) => i.done), true);
  });
});

describe("honesty of the numbers", () => {
  it("prints no number rather than a zero when a count is unavailable", () => {
    const c = profileCompletion(EMPTY, [], EMPTY_CORPUS);
    assert.equal(c.items.every((i) => i.postings === null), true);
  });

  it("passes corpus counts through untouched", () => {
    const c = profileCompletion(EMPTY, [], CORPUS);
    assert.equal(c.items.find((i) => i.key === "resume")?.postings, 1600);
    assert.equal(c.items.find((i) => i.key === "work_auth")?.postings, 300);
    assert.equal(c.items.find((i) => i.key === "field")?.postings, 2000);
  });

  it("never lists a field that feeds no scorer", () => {
    // GPA, display name, portfolio, GitHub and LinkedIn are all storable and
    // none of them changes a score. Including them would inflate the meter with
    // items whose completion means nothing.
    const keys = profileCompletion(EMPTY, []).items.map((i) => i.key);
    for (const absent of ["gpa", "display_name", "portfolio", "github", "linkedin"]) {
      assert.equal(keys.includes(absent as never), false, absent);
    }
  });

  it("the percentage does not move when the corpus does", () => {
    // The counts are impact context; the headline must not fall because we
    // ingested postings while the student did nothing.
    const a = profileCompletion(full({ workAuth: null }), ["Go"], EMPTY_CORPUS);
    const b = profileCompletion(full({ workAuth: null }), ["Go"], CORPUS);
    assert.equal(a.percent, b.percent);
    assert.equal(a.percent, 80);
  });
});
