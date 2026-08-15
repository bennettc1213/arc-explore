import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_PARSED_RESUME, type ParsedResume } from "../resume/types";
import { EMPTY_PROFILE_INPUT, type UserProfile } from "../profile/types";

import { generateProfileReadme, languagesInUse, readmeSlots } from "./readme";
import type { GhRepo, GhSnapshot, GhUser } from "./types";

const USER: GhUser = {
  login: "octocat",
  name: "Octo Cat",
  bio: null,
  blog: null,
  location: null,
  company: null,
  publicRepos: 2,
  followers: 0,
  htmlUrl: "https://github.com/octocat",
  createdAt: null,
};

function repo(over: Partial<GhRepo> & { name: string }): GhRepo {
  return {
    description: null,
    htmlUrl: `https://github.com/octocat/${over.name}`,
    isFork: false,
    isArchived: false,
    isEmpty: false,
    language: "TypeScript",
    topics: [],
    homepage: null,
    stars: 0,
    forks: 0,
    pushedAt: new Date("2026-08-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function snapshot(over: Partial<GhSnapshot> = {}): GhSnapshot {
  return {
    user: USER,
    repos: [repo({ name: "alpha", description: "A thing that does a thing" })],
    profileReadme: null,
    hasProfileRepo: false,
    readmePresence: {},
    events: null,
    eventsWindowDays: null,
    skipped: [],
    fetchedAt: new Date("2026-08-14T00:00:00Z"),
    rateLimitRemaining: 50,
    ...over,
  };
}

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return { ...EMPTY_PROFILE_INPUT, id: "u1", ...over };
}

function resume(over: Partial<ParsedResume> = {}): ParsedResume {
  return { ...EMPTY_PARSED_RESUME, ...over };
}

test("repo names and URLs are copied verbatim, never retyped", () => {
  // The whole reason this generator is deterministic. A model retyping
  // "arc-explore" as "arc_explore" produces a dead link on the first page a
  // recruiter opens, and nothing about the output would look wrong.
  const { markdown } = generateProfileReadme({
    snapshot: snapshot({
      repos: [repo({ name: "arc-explore", description: "Scholarship matching" })],
    }),
    profile: null,
    resume: null,
    accountEmail: null,
  });
  assert.match(markdown, /\*\*\[arc-explore\]\(https:\/\/github\.com\/octocat\/arc-explore\)\*\* — Scholarship matching/);
});

test("a repo with no description gets a slot, not a description we invented", () => {
  const { markdown, slots } = generateProfileReadme({
    snapshot: snapshot({ repos: [repo({ name: "mystery", description: null })] }),
    profile: null,
    resume: null,
    accountEmail: null,
  });
  assert.match(markdown, /\[YOUR SPECIFIC DETAIL: one line on what mystery does\]/);
  assert.ok(slots.some((s) => s.includes("mystery")));
});

test("markdown links are not mistaken for unfilled slots", () => {
  // The cover letter's slot scanner matches any bracketed capitalised phrase,
  // which in markdown is every link label. Reusing it here would report
  // "[LinkedIn](...)" as a missing fact on a README that has the link.
  const filled = readmeSlots("- [LinkedIn](https://linkedin.com/in/x)\n- [Portfolio](https://x.dev)");
  assert.deepEqual(filled, []);
  assert.deepEqual(readmeSlots("- [YOUR SPECIFIC DETAIL: your LinkedIn URL]"), [
    "[YOUR SPECIFIC DETAIL: your LinkedIn URL]",
  ]);
});

test("the profile wins over the resume, and the resume over GitHub, for the same fact", () => {
  const { markdown } = generateProfileReadme({
    snapshot: snapshot(),
    profile: profile({ displayName: "Ben Chu", school: "UNL", major: "Information Systems", gradYear: 2028 }),
    resume: resume({ name: "B. Chu", school: "Somewhere Else" }),
    accountEmail: null,
  });
  assert.match(markdown, /## Hi, I'm Ben Chu/);
  assert.match(markdown, /Information Systems student at UNL, graduating 2028\./);
  assert.doesNotMatch(markdown, /Somewhere Else/);
});

test("with nothing but a GitHub account it still produces a usable file", () => {
  const { markdown, slots } = generateProfileReadme({
    snapshot: snapshot(),
    profile: null,
    resume: null,
    accountEmail: null,
  });
  assert.match(markdown, /## Hi, I'm Octo Cat/);
  assert.match(markdown, /\*\*Stack:\*\* TypeScript/);
  // Everything we do not hold is visible, not filled in.
  assert.ok(slots.length >= 4, `expected several slots, got ${slots.length}`);
  assert.ok(slots.every((s) => s.startsWith("[YOUR SPECIFIC DETAIL:")));
});

test("languages come from real repos, most-used first, forks excluded", () => {
  const langs = languagesInUse(
    snapshot({
      repos: [
        repo({ name: "a", language: "TypeScript" }),
        repo({ name: "b", language: "TypeScript" }),
        repo({ name: "c", language: "CSS" }),
        repo({ name: "d", language: "Rust", isFork: true }),
      ],
    }),
  );
  assert.deepEqual(langs, ["TypeScript", "CSS"]);
});

test("resume skills extend the stack without repeating a language", () => {
  const { markdown } = generateProfileReadme({
    snapshot: snapshot({ repos: [repo({ name: "a", language: "TypeScript" })] }),
    profile: null,
    resume: resume({ skills: ["typescript", "Postgres", "Docker"] }),
    accountEmail: null,
  });
  const stack = markdown.split("\n").find((l) => l.startsWith("**Stack:**"));
  assert.equal(stack, "**Stack:** TypeScript · Postgres · Docker");
});

test("the account email is preferred over the one printed on a resume", () => {
  // Same rule as the application packet: the magic-link address is proven to
  // work, and a resume's printed address may be a school one that expires.
  const { markdown } = generateProfileReadme({
    snapshot: snapshot(),
    profile: null,
    resume: resume({ email: "old@school.edu" }),
    accountEmail: "me@example.com",
  });
  assert.match(markdown, /- me@example\.com/);
  assert.doesNotMatch(markdown, /old@school\.edu/);
});

test("nothing GitHub's starter template contains survives into our output", () => {
  // The audit calls unedited template text a high-severity finding. A generator
  // that emitted the same phrases would fail the advice sitting one panel away.
  const { markdown } = generateProfileReadme({
    snapshot: snapshot(),
    profile: null,
    resume: null,
    accountEmail: null,
  });
  assert.doesNotMatch(markdown, /currently working on \.\.\./i);
  assert.doesNotMatch(markdown, /ideas to get you started/i);
  // And no badge walls: the audit measures prose after stripping images.
  assert.doesNotMatch(markdown, /img\.shields\.io|!\[/);
});

test("every fact used is attributed to where it came from", () => {
  const { sources } = generateProfileReadme({
    snapshot: snapshot(),
    profile: profile({ displayName: "Ben Chu", portfolioUrl: "https://ben.example" }),
    resume: resume({ skills: ["Docker"] }),
    accountEmail: "me@example.com",
  });
  const from = (fact: string) => sources.find((s) => s.fact.includes(fact))?.from;
  assert.equal(from("your name"), "profile");
  assert.equal(from("portfolio"), "profile");
  assert.equal(from("skills"), "resume");
  assert.equal(from("email"), "account");
  assert.equal(from("repositories"), "github");
});
