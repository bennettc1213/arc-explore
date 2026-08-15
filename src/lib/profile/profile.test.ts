import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_PROFILE_INPUT,
  isProfileUsable,
  parseLocations,
  profileInputSchema,
  toScoreProfile,
  type UserProfile,
} from "./types";

function form(over: Record<string, unknown> = {}) {
  return {
    displayName: "",
    school: "",
    major: "",
    gradYear: "",
    gpa: "",
    workAuth: "",
    targetVerticals: [],
    targetLocations: [],
    openToRemote: true,
    portfolioUrl: "",
    githubUsername: "",
    linkedinUrl: "",
    ...over,
  };
}

describe("profileInputSchema", () => {
  it("turns blank fields into null rather than empty strings", () => {
    const parsed = profileInputSchema.parse(form());
    assert.deepEqual(parsed, EMPTY_PROFILE_INPUT);
  });

  it("trims text", () => {
    const parsed = profileInputSchema.parse(form({ major: "  Computer Science  " }));
    assert.equal(parsed.major, "Computer Science");
  });

  it("accepts a plausible graduation year and rejects a wild one", () => {
    const year = new Date().getFullYear() + 1;
    assert.equal(profileInputSchema.parse(form({ gradYear: String(year) })).gradYear, year);
    assert.equal(profileInputSchema.safeParse(form({ gradYear: "1987" })).success, false);
    assert.equal(profileInputSchema.safeParse(form({ gradYear: "20277" })).success, false);
  });

  it("rejects a work-auth value we do not understand", () => {
    assert.equal(profileInputSchema.safeParse(form({ workAuth: "us_citizen" })).success, true);
    assert.equal(profileInputSchema.safeParse(form({ workAuth: "green_card_ish" })).success, false);
  });

  it("rejects an out-of-range gpa", () => {
    assert.equal(profileInputSchema.parse(form({ gpa: "3.85" })).gpa, 3.85);
    assert.equal(profileInputSchema.safeParse(form({ gpa: "7" })).success, false);
  });

  it("requires a real URL for the portfolio", () => {
    assert.equal(
      profileInputSchema.parse(form({ portfolioUrl: "https://ben.dev" })).portfolioUrl,
      "https://ben.dev",
    );
    assert.equal(profileInputSchema.safeParse(form({ portfolioUrl: "ben.dev" })).success, false);
  });

  it("rejects interest values outside the scorer's taxonomy", () => {
    assert.equal(
      profileInputSchema.safeParse(form({ targetVerticals: ["software", "data_ai"] })).success,
      true,
    );
    assert.equal(
      profileInputSchema.safeParse(form({ targetVerticals: ["astrology"] })).success,
      false,
    );
  });
});

describe("parseLocations", () => {
  it("splits, trims and drops blanks", () => {
    assert.deepEqual(parseLocations("San Francisco,  New York , "), ["San Francisco", "New York"]);
  });

  it("drops case-insensitive duplicates", () => {
    assert.deepEqual(parseLocations("Boston, boston, BOSTON"), ["Boston"]);
  });

  it("returns nothing for an empty string", () => {
    assert.deepEqual(parseLocations("   "), []);
  });
});

const full: UserProfile = {
  id: "u1",
  displayName: "Ben Chu",
  school: "State University",
  major: "Computer Science",
  gradYear: 2027,
  gpa: 3.9,
  workAuth: "us_citizen",
  targetVerticals: ["software"],
  targetLocations: ["New York"],
  openToRemote: false,
  portfolioUrl: "https://ben.dev",
  githubUsername: "benchu",
  linkedinUrl: "https://linkedin.com/in/benchu",
};

describe("toScoreProfile", () => {
  it("passes through only the dimensions the scorer reads", () => {
    assert.deepEqual(toScoreProfile(full), {
      major: "Computer Science",
      gradYear: 2027,
      workAuth: "us_citizen",
      targetVerticals: ["software"],
      targetLocations: ["New York"],
      openToRemote: false,
      skills: [],
    });
  });

  /*
   * Resume skills are derived on read rather than stored on the profile, so
   * improving the extractor improves everyone's scores without a migration or
   * a re-upload.
   */
  it("carries resume skills into scoring when there are any", () => {
    assert.deepEqual(toScoreProfile(full, ["Python", "Go"]).skills, ["Python", "Go"]);
    assert.deepEqual(toScoreProfile(full).skills, []);
  });

  // GPA, school and portfolio exist for the cold-email generator. If any of
  // them reached the scorer it would be inventing a signal no employer stated.
  it("never leaks gpa, school, name or portfolio into scoring", () => {
    const scored = toScoreProfile(full) as Record<string, unknown>;
    for (const leaked of [
      "gpa",
      "school",
      "displayName",
      "portfolioUrl",
      "githubUsername",
      "linkedinUrl",
      "id",
    ]) {
      assert.equal(leaked in scored, false, `${leaked} must not reach the scorer`);
    }
  });

  it("is safe on a missing profile and stays open to remote", () => {
    assert.deepEqual(toScoreProfile(null), {
      targetVerticals: [],
      targetLocations: [],
      openToRemote: true,
      skills: [],
    });
  });
});

describe("isProfileUsable", () => {
  it("is false for nothing and for a profile with no scoreable answer", () => {
    assert.equal(isProfileUsable(null), false);
    assert.equal(
      isProfileUsable({ ...full, major: null, gradYear: null, workAuth: null, targetVerticals: [], targetLocations: [] }),
      false,
    );
  });

  it("is true once any scoring dimension is answered", () => {
    const bare = {
      ...full,
      major: null,
      gradYear: null,
      workAuth: null,
      targetVerticals: [],
      targetLocations: [],
    };
    assert.equal(isProfileUsable({ ...bare, major: "Physics" }), true);
    assert.equal(isProfileUsable({ ...bare, gradYear: 2028 }), true);
    assert.equal(isProfileUsable({ ...bare, targetVerticals: ["quant_finance"] }), true);
  });
});
