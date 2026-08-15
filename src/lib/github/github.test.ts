import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activeDays,
  auditGitHub,
  hasContactPath,
  readmeProse,
  recommendPins,
  templateRemnants,
} from "./audit";
import { normalizeEvents, normalizeRepo, normalizeUser, observedWindowDays } from "./client";
import {
  parseGitHubUsername,
  rankShowcaseRepos,
  type GhRepo,
  type GhSnapshot,
  type GhUser,
} from "./types";

/* ------------------------------------------------------------------ *
 * Username parsing
 * ------------------------------------------------------------------ */

test("accepts a bare username", () => {
  assert.equal(parseGitHubUsername("bennettc1213"), "bennettc1213");
  assert.equal(parseGitHubUsername("  torvalds  "), "torvalds");
  assert.equal(parseGitHubUsername("@octocat"), "octocat");
});

test("pulls the username out of a pasted URL", () => {
  // Students paste what is in their address bar and what is on their resume.
  assert.equal(parseGitHubUsername("https://github.com/octocat"), "octocat");
  assert.equal(parseGitHubUsername("github.com/octocat/"), "octocat");
  assert.equal(parseGitHubUsername("https://www.github.com/octocat/Hello-World"), "octocat");
  assert.equal(parseGitHubUsername("https://github.com/octocat?tab=repositories"), "octocat");
});

test("rejects what GitHub itself would reject", () => {
  assert.equal(parseGitHubUsername("-leading"), null);
  assert.equal(parseGitHubUsername("trailing-"), null);
  assert.equal(parseGitHubUsername("double--hyphen"), null);
  assert.equal(parseGitHubUsername("has space"), null);
  assert.equal(parseGitHubUsername("a".repeat(40)), null);
  assert.equal(parseGitHubUsername(""), null);
  assert.equal(parseGitHubUsername(null), null);
});

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

test("an unset website comes back as null, not an empty string", () => {
  // GitHub returns "" for blog when it is unset. Treating that as set would
  // score a missing link as present.
  const u = normalizeUser({
    login: "x",
    name: null,
    bio: null,
    blog: "",
    location: null,
    company: null,
    public_repos: 0,
    followers: 0,
    html_url: "https://github.com/x",
    created_at: null,
  });
  assert.equal(u.blog, null);
  assert.equal(u.name, null);
});

test("a zero-size repository is empty", () => {
  const r = normalizeRepo({
    name: "starter",
    description: null,
    html_url: "https://github.com/x/starter",
    fork: false,
    archived: false,
    size: 0,
    language: null,
    homepage: null,
    stargazers_count: 0,
    forks_count: 0,
    pushed_at: null,
    created_at: null,
  });
  assert.equal(r.isEmpty, true);
  assert.deepEqual(r.topics, []);
});

test("the observed event window is what arrived, not the 90 days GitHub retains", () => {
  // The feed is capped at 300 events. A busy account's hundred most recent
  // events may only span a week, and reporting activity over 90 days would then
  // be a denominator we made up.
  const now = new Date("2026-08-14T00:00:00Z");
  const events = normalizeEvents([
    { type: "PushEvent", repo: { name: "x/y" }, created_at: "2026-08-13T10:00:00Z" },
    { type: "PushEvent", repo: { name: "x/y" }, created_at: "2026-08-11T10:00:00Z" },
  ]);
  assert.equal(observedWindowDays(events, now), 2);
  assert.equal(observedWindowDays([], now), null);
});

test("distinct active days collapse many events on one day", () => {
  const events = normalizeEvents([
    { type: "PushEvent", repo: null, created_at: "2026-08-13T10:00:00Z" },
    { type: "PushEvent", repo: null, created_at: "2026-08-13T18:00:00Z" },
    { type: "WatchEvent", repo: null, created_at: "2026-08-10T18:00:00Z" },
  ]);
  assert.equal(activeDays(events), 2);
});

/* ------------------------------------------------------------------ *
 * README heuristics
 * ------------------------------------------------------------------ */

test("detects GitHub's unedited starter template", () => {
  const template = `### Hi there 👋

<!--
**octocat/octocat** is a ✨ _special_ ✨ repository because its \`README.md\` (your GitHub profile) appears on your GitHub profile.
Here are some ideas to get you started:

- 🔭 I'm currently working on ...
- 🌱 I'm currently learning ...
-->`;
  const found = templateRemnants(template);
  assert.ok(found.length >= 3, `expected several markers, got ${found.length}`);
  assert.deepEqual(templateRemnants("I build data pipelines in Go."), []);
});

test("a README of nothing but badges measures as nothing", () => {
  // Stripping images before measuring is the whole point: a wall of shields.io
  // badges is not text a reader gets anything from.
  const badges = `# hi
![build](https://img.shields.io/badge/build-passing-green)
![stars](https://img.shields.io/badge/stars-0-blue)
<!-- a comment that says a lot of things but is invisible on the page -->`;
  assert.ok(readmeProse(badges).length < 20, readmeProse(badges));
});

test("a contact path is any link at all", () => {
  assert.equal(hasContactPath("reach me at mailto:a@b.com"), true);
  assert.equal(hasContactPath("[linkedin](https://linkedin.com/in/x)"), true);
  assert.equal(hasContactPath("I am a student who likes computers."), false);
});

/* ------------------------------------------------------------------ *
 * Showcase ranking
 * ------------------------------------------------------------------ */

function repo(over: Partial<GhRepo> & { name: string }): GhRepo {
  return {
    description: "a thing",
    htmlUrl: `https://github.com/x/${over.name}`,
    isFork: false,
    isArchived: false,
    isEmpty: false,
    language: "TypeScript",
    topics: ["web"],
    homepage: null,
    stars: 0,
    forks: 0,
    pushedAt: new Date("2026-08-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

test("forks, archives and empty repos are excluded from the showcase, not ranked low", () => {
  // Including them would let a profile of twelve forks look like twelve
  // projects, which is the exact impression the audit exists to correct.
  const ranked = rankShowcaseRepos([
    repo({ name: "forked", isFork: true, stars: 900 }),
    repo({ name: "archived", isArchived: true, stars: 800 }),
    repo({ name: "empty", isEmpty: true, stars: 700 }),
    repo({ name: "real", stars: 2 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.name), ["real"]);
});

test("showcase order is stars, then recency", () => {
  const ranked = rankShowcaseRepos([
    repo({ name: "old-popular", stars: 5, pushedAt: new Date("2024-01-01T00:00:00Z") }),
    repo({ name: "fresh", stars: 0, pushedAt: new Date("2026-08-13T00:00:00Z") }),
    repo({ name: "stale", stars: 0, pushedAt: new Date("2025-01-01T00:00:00Z") }),
  ]);
  assert.deepEqual(ranked.map((r) => r.name), ["old-popular", "fresh", "stale"]);
});

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

const USER: GhUser = {
  login: "octocat",
  name: "Octo Cat",
  bio: "Studying information systems",
  blog: "https://octo.example",
  location: null,
  company: null,
  publicRepos: 3,
  followers: 0,
  htmlUrl: "https://github.com/octocat",
  createdAt: new Date("2025-06-10T00:00:00Z"),
};

function snapshot(over: Partial<GhSnapshot> = {}): GhSnapshot {
  return {
    user: USER,
    repos: [repo({ name: "alpha" }), repo({ name: "beta" })],
    profileReadme: "I build web apps in TypeScript. Reach me at https://octo.example. ".repeat(6),
    hasProfileRepo: true,
    readmePresence: { alpha: true, beta: true },
    events: [],
    eventsWindowDays: null,
    skipped: [],
    fetchedAt: new Date("2026-08-14T00:00:00Z"),
    rateLimitRemaining: 50,
    ...over,
  };
}

test("a complete profile scores well and reports what it counted", () => {
  const audit = auditGitHub(snapshot());
  assert.ok(audit.score !== null && audit.score >= 80, `got ${audit.score}`);
  assert.equal(audit.knownDimensions, 5);
  for (const d of audit.dimensions) {
    assert.ok(d.detail.length > 0, `${d.key} has no detail`);
  }
});

test("a missing profile README is the first thing reported", () => {
  const audit = auditGitHub(snapshot({ profileReadme: null, hasProfileRepo: false }));
  assert.equal(audit.findings[0].dimension, "profile_readme");
  assert.match(audit.findings[0].fix, /named exactly “octocat”/);
});

test("a README check we could not afford is dropped, never scored as a miss", () => {
  // The rule that governs this whole codebase: unknown is not failure. An audit
  // that ran out of rate-limit budget must not tell a student their READMEs are
  // missing when we simply did not look.
  const withChecks = auditGitHub(snapshot());
  const withoutChecks = auditGitHub(
    snapshot({ readmePresence: {}, skipped: ["we stopped short of checking every project README"] }),
  );

  const showcase = withoutChecks.dimensions.find((d) => d.key === "showcase");
  assert.ok(showcase);
  // Topics are still known, so the dimension survives — but no finding claims a
  // README is absent.
  assert.equal(
    withoutChecks.findings.some((f) => /no README/i.test(f.title)),
    false,
  );
  assert.ok(withChecks.score !== null);
  assert.equal(withoutChecks.skipped.length, 1);
});

test("a genuinely missing README on a top project is a high-severity finding", () => {
  const audit = auditGitHub(snapshot({ readmePresence: { alpha: false, beta: true } }));
  const f = audit.findings.find((x) => /no README/i.test(x.title));
  assert.ok(f, "expected a README finding");
  assert.equal(f.severity, "high");
  assert.equal(f.evidence, "alpha");
});

test("a dormant account is named in days, from real push timestamps", () => {
  const stale = new Date("2025-06-01T00:00:00Z");
  const audit = auditGitHub(
    snapshot({ repos: [repo({ name: "alpha", pushedAt: stale, createdAt: stale })] }),
  );
  const f = audit.findings.find((x) => /pushed to any repository/i.test(x.title));
  assert.ok(f, "expected a dormancy finding");
  assert.equal(f.severity, "high");
  assert.match(f.title, /\d+ days/);
});

test("the burst pattern is reported as the fact we counted", () => {
  const day = new Date("2026-08-13T00:00:00Z");
  const audit = auditGitHub(
    snapshot({
      repos: [
        repo({ name: "a", createdAt: day, pushedAt: day }),
        repo({ name: "b", createdAt: day, pushedAt: day }),
        repo({ name: "c", createdAt: day, pushedAt: day }),
      ],
      readmePresence: { a: true, b: true, c: true },
    }),
  );
  const f = audit.findings.find((x) => /created within/i.test(x.title));
  assert.ok(f, "expected a burst finding");
  assert.match(f.title, /the same day/);
});

test("empty repositories are counted and named", () => {
  const audit = auditGitHub(
    snapshot({ repos: [repo({ name: "alpha" }), repo({ name: "scratch", isEmpty: true })] }),
  );
  const f = audit.findings.find((x) => /empty/i.test(x.title));
  assert.ok(f);
  assert.equal(f.evidence, "scratch");
});

test("descriptions are scored over original repos with content", () => {
  const audit = auditGitHub(
    snapshot({
      repos: [
        repo({ name: "alpha", description: "does a thing" }),
        repo({ name: "beta", description: null }),
        // Neither of these belongs in the denominator.
        repo({ name: "forked", isFork: true, description: null }),
        repo({ name: "empty", isEmpty: true, description: null }),
      ],
      readmePresence: { alpha: true, beta: true },
    }),
  );
  const d = audit.dimensions.find((x) => x.key === "repo_descriptions");
  assert.ok(d);
  assert.equal(d.score, 50);
  assert.match(d.detail, /1 of 2 original repositories/);
});

test("pins are recommended with what each still needs", () => {
  const pins = recommendPins(
    snapshot({
      repos: [repo({ name: "alpha", description: null, topics: [] })],
      readmePresence: { alpha: false },
    }),
  );
  assert.equal(pins.length, 1);
  assert.deepEqual(pins[0].gaps, ["no description", "no README", "no topics"]);
});

test("a profile with nothing in it still returns a number and says why", () => {
  const audit = auditGitHub(
    snapshot({ repos: [], profileReadme: null, hasProfileRepo: false, readmePresence: {} }),
  );
  assert.ok(audit.score !== null);
  assert.ok(audit.score < 30, `got ${audit.score}`);
  assert.ok(audit.findings.length > 0);
});
