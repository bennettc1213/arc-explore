import assert from "node:assert/strict";
import { test } from "node:test";

import { routePresence } from "./routing";
import { EMPTY_PROFILE_INPUT, profileInputSchema, type UserProfile } from "./types";

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return { ...EMPTY_PROFILE_INPUT, id: "u1", ...over };
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

test("a stated tech interest routes to github first, linkedin second", () => {
  const r = routePresence(profile({ targetVerticals: ["software"] }));
  assert.equal(r.primary, "github");
  assert.equal(r.secondary, "linkedin");
  assert.match(r.because, /software/);
});

test("a business student is not sent to build a github profile at all", () => {
  // "Without forcing both" cuts this way too. A design portfolio and a case
  // record are what that track is judged on; a GitHub profile is a weekend
  // spent on a page nobody in their field opens.
  const r = routePresence(profile({ targetVerticals: ["business", "product"] }));
  assert.equal(r.primary, "linkedin");
  assert.equal(r.secondary, null);
});

test("the resume overrides what they ticked when it names enough technical skills", () => {
  const r = routePresence(profile({ targetVerticals: ["business"] }), [
    "Python",
    "SQL",
    "React",
  ]);
  assert.equal(r.primary, "github");
  assert.equal(r.fromResume, true);
  assert.match(r.because, /3 technical skills/);
});

test("business-group skills alone are not technical evidence", () => {
  // Excel and PowerPoint are in the vocabulary but they are not the signal that
  // someone's work is worth reading as source code.
  const r = routePresence(profile(), ["Excel", "PowerPoint", "Salesforce"]);
  assert.equal(r.primary, "linkedin");
  assert.equal(r.secondary, null);
});

test("one or two technical skills is below the threshold", () => {
  assert.equal(routePresence(profile(), ["Python", "SQL"]).primary, "linkedin");
  assert.equal(routePresence(profile(), ["Python", "SQL", "Git"]).primary, "github");
});

test("an empty profile still gets an answer, and it is linkedin", () => {
  const r = routePresence(null);
  assert.equal(r.primary, "linkedin");
  assert.match(r.because, /nearly every recruiter/);
});

/* ------------------------------------------------------------------ *
 * The stored links
 * ------------------------------------------------------------------ */

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

test("a pasted github URL is stored as the handle", () => {
  // The handle is what every API path needs. Storing the URL would mean
  // re-parsing it on every audit.
  const parse = (v: string) => profileInputSchema.parse(form({ githubUsername: v })).githubUsername;
  assert.equal(parse("https://github.com/octocat"), "octocat");
  assert.equal(parse("github.com/octocat/Hello-World"), "octocat");
  assert.equal(parse("@octocat"), "octocat");
  assert.equal(parse("octocat"), "octocat");
});

test("an unparseable github handle is an error, not a silently dropped field", () => {
  assert.equal(
    profileInputSchema.safeParse(form({ githubUsername: "not a username!" })).success,
    false,
  );
  // Blank is "not stated", which is a different thing and always allowed.
  assert.equal(profileInputSchema.parse(form({ githubUsername: "" })).githubUsername, null);
});

test("the linkedin field only accepts a linkedin.com URL", () => {
  assert.equal(
    profileInputSchema.parse(form({ linkedinUrl: "https://www.linkedin.com/in/benchu" }))
      .linkedinUrl,
    "https://www.linkedin.com/in/benchu",
  );
  assert.equal(
    profileInputSchema.safeParse(form({ linkedinUrl: "https://example.com/in/benchu" })).success,
    false,
  );
});
