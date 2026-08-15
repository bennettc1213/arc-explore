import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_PROFILE_INPUT, type UserProfile } from "../profile/types";
import { EMPTY_PARSED_RESUME, type ParsedResume } from "../resume/types";

import { buildHeadline, buildLinkedInDraft, rewriteBullets, strongestBullet } from "./build";
import { checkLinkedIn, clichesIn } from "./check";
import {
  EMPTY_LINKEDIN_INPUT,
  HEADLINE_MAX,
  parseBulletLines,
  parseSkillList,
  type LinkedInInput,
} from "./types";

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return { ...EMPTY_PROFILE_INPUT, id: "u1", ...over };
}

function resume(over: Partial<ParsedResume> = {}): ParsedResume {
  return { ...EMPTY_PARSED_RESUME, ...over };
}

function input(over: Partial<LinkedInInput> = {}): LinkedInInput {
  return { ...EMPTY_LINKEDIN_INPUT, ...over };
}

/* ------------------------------------------------------------------ *
 * Parsing what a student pastes
 * ------------------------------------------------------------------ */

test("skills paste splits on whatever separator they used", () => {
  assert.deepEqual(parseSkillList("Python, React\nSQL · Docker | Git"), [
    "Python",
    "React",
    "SQL",
    "Docker",
    "Git",
  ]);
  assert.deepEqual(parseSkillList("Python, python , PYTHON"), ["Python"]);
});

test("experience paste strips the bullet characters LinkedIn uses", () => {
  assert.deepEqual(parseBulletLines("• Built a thing\n- Shipped another\n\n  ‣ Third  "), [
    "Built a thing",
    "Shipped another",
    "Third",
  ]);
});

/* ------------------------------------------------------------------ *
 * The checker
 * ------------------------------------------------------------------ */

test("LinkedIn's own auto-generated headline is a high-severity finding", () => {
  // The single most common and most costly thing wrong with a student profile:
  // it is the highest-weighted text field for LinkedIn's search, and most
  // students never change what LinkedIn wrote for them.
  const check = checkLinkedIn(input({ headline: "Student at University of Nebraska-Lincoln" }));
  const f = check.findings.find((x) => /headline LinkedIn wrote/i.test(x.title));
  assert.ok(f, "expected the default-headline finding");
  assert.equal(f.severity, "high");
});

test("a real headline is not mistaken for the default", () => {
  const check = checkLinkedIn(
    input({ headline: "Information Systems @ UNL | Python, SQL, React | Seeking Summer 2027 data internship" }),
  );
  assert.equal(check.findings.some((f) => /headline LinkedIn wrote/i.test(f.title)), false);
  const d = check.dimensions.find((x) => x.key === "headline");
  assert.ok(d && d.score !== null && d.score >= 80, `got ${d?.score}`);
});

test("a headline over LinkedIn's cap is reported with the real number", () => {
  const check = checkLinkedIn(input({ headline: `Engineer ${"x".repeat(HEADLINE_MAX)}` }));
  assert.ok(check.findings.some((f) => f.title.includes(`${HEADLINE_MAX + 9} characters`)));
});

test("an empty headline is dropped from the score, not scored as zero", () => {
  // Same contract as the fit score and the resume critique: unknown is not
  // failure. A student who pasted only their About has not told us their
  // headline is bad.
  const check = checkLinkedIn(input({ about: "I study data science. I built a pipeline that cut load times by 40%. Reach me at a@b.com." }));
  const headline = check.dimensions.find((d) => d.key === "headline");
  assert.equal(headline?.score, null);
  assert.ok(check.knownDimensions < check.totalDimensions);
});

test("an About with nothing specific above the fold is flagged", () => {
  const vague =
    "I am a passionate and hard-working student who is eager to learn and always looking for new opportunities to grow. " +
    "I believe in teamwork and I am a team player who thinks outside the box. ".repeat(3);
  const check = checkLinkedIn(input({ about: vague }));
  assert.ok(check.findings.some((f) => /before the .see more. fold/i.test(f.title)));
  assert.ok(check.findings.some((f) => /could appear on anyone's profile/i.test(f.title)));
});

test("clichés are counted, not guessed at", () => {
  assert.deepEqual(clichesIn("A passionate, detail-oriented team player"), [
    "passionate",
    "team player",
    "detail-oriented",
  ]);
  // A line that states what happened is never flagged. A checker that marks
  // good writing gets ignored wholesale, so the list stays tight.
  assert.deepEqual(clichesIn("I cut p95 latency from 800ms to 120ms"), []);
});

test("experience bullets are graded by the resume critique's own functions", () => {
  // Imported rather than restated. A student told on one page that
  // "Responsible for" is weak and on another that it is fine has been given two
  // products' worth of advice by one product.
  const check = checkLinkedIn(
    input({ experience: "Responsible for the weekly report\nHelped with the migration" }),
  );
  const f = check.findings.find((x) => /describes the job, not your work/i.test(x.title));
  assert.ok(f);
  assert.equal(f.severity, "high");
  assert.ok(check.findings.some((x) => /None of your 2 experience lines carry a number/.test(x.title)));
});

test("recommendations not stated is different from zero", () => {
  const unstated = checkLinkedIn(input({ recommendations: null }));
  assert.equal(unstated.dimensions.find((d) => d.key === "recommendations")?.score, null);
  assert.equal(unstated.findings.some((f) => f.section === "recommendations"), false);

  const none = checkLinkedIn(input({ recommendations: 0 }));
  assert.equal(none.dimensions.find((d) => d.key === "recommendations")?.score, 0);
  assert.ok(none.findings.some((f) => /no recommendations/i.test(f.title)));
});

test("a profile with nothing pasted scores null rather than zero", () => {
  const check = checkLinkedIn(input());
  // About is the exception: an absent About genuinely is a finding, because we
  // asked for it directly and nothing is a real answer.
  assert.equal(check.dimensions.filter((d) => d.score === null).length, 4);
  assert.ok(check.findings.some((f) => /no About section/i.test(f.title)));
});

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

test("the generated headline never exceeds LinkedIn's cap", () => {
  const headline = buildHeadline(
    {
      profile: profile({
        major: "B.S. Information Systems and Business Analytics with a Minor in Mathematics",
        school: "University of Nebraska-Lincoln College of Business Administration",
        targetVerticals: ["data_ai"],
      }),
      resume: null,
      accountEmail: null,
    },
    ["Python", "SQL", "React", "Docker"],
  );
  assert.ok(headline.length <= HEADLINE_MAX, `${headline.length} chars: ${headline}`);
});

test("the builder strips a degree prefix so the subject reads as a subject", () => {
  const headline = buildHeadline(
    { profile: profile({ major: "B.S. Computer Science", school: "UNL" }), resume: null, accountEmail: null },
    ["Go"],
  );
  assert.match(headline, /^Computer Science @ UNL/);
});

test("what the builder generates passes the checker it ships beside", () => {
  /*
   * The property that made this generator deterministic rather than a model
   * call. "Passionate about" is the statistical centre of every LinkedIn About
   * ever written, so a model would emit it sometimes — and we would be
   * generating text our own checker fails one panel away.
   */
  const draft = buildLinkedInDraft({
    profile: profile({
      displayName: "Ben Chu",
      major: "Information Systems",
      school: "UNL",
      gradYear: 2028,
      targetVerticals: ["data_ai"],
      targetLocations: ["Chicago"],
    }),
    resume: resume({
      skills: ["Python", "SQL", "React"],
      experiences: [
        {
          organization: "Acme",
          role: "Analyst Intern",
          dates: "Jun 2026 – Aug 2026",
          location: null,
          bullets: ["Automated a weekly report, cutting 6 hours of manual work to 20 minutes"],
        },
      ],
    }),
    accountEmail: "me@example.com",
  });

  assert.deepEqual(clichesIn(draft.headline), []);
  assert.deepEqual(clichesIn(draft.about), []);

  const check = checkLinkedIn(
    input({ headline: draft.headline, about: draft.about, skills: "Python, SQL, React" }),
  );
  const headline = check.dimensions.find((d) => d.key === "headline");
  const about = check.dimensions.find((d) => d.key === "about");
  assert.ok(headline?.score !== null && headline!.score >= 80, `headline ${headline?.score}`);
  assert.ok(about?.score !== null && about!.score >= 80, `about ${about?.score}`);
});

test("the About quotes the student's own strongest line rather than inventing one", () => {
  const r = resume({
    experiences: [
      {
        organization: "Acme",
        role: "Intern",
        dates: null,
        location: null,
        bullets: [
          "Responsible for the weekly report",
          "Cut report generation from 6 hours to 20 minutes",
        ],
      },
    ],
  });
  const best = strongestBullet(r);
  assert.equal(best?.bullet, "Cut report generation from 6 hours to 20 minutes");

  const draft = buildLinkedInDraft({ profile: null, resume: r, accountEmail: null });
  assert.ok(draft.about.includes("Cut report generation from 6 hours to 20 minutes"));
});

test("bullet rewrites restate the student's own lines and never invent the number", () => {
  const rewrites = rewriteBullets(
    resume({
      experiences: [
        {
          organization: "Acme",
          role: "Intern",
          dates: null,
          location: null,
          bullets: ["Responsible for maintaining the weekly sales report"],
        },
      ],
    }),
  );
  assert.equal(rewrites.length, 1);
  assert.equal(rewrites[0].before, "Responsible for maintaining the weekly sales report");
  assert.match(rewrites[0].after, /\[YOUR SPECIFIC DETAIL: a verb/);
  assert.match(rewrites[0].after, /\[YOUR SPECIFIC DETAIL: what came of it, with a number\]/);
  assert.match(rewrites[0].reason, /opens with “Responsible for” and states no outcome/);
});

test("a line that is already strong is left alone", () => {
  const rewrites = rewriteBullets(
    resume({
      experiences: [
        {
          organization: "Acme",
          role: "Intern",
          dates: null,
          location: null,
          bullets: ["Cut p95 latency from 800ms to 120ms across 3 services"],
        },
      ],
    }),
  );
  assert.deepEqual(rewrites, []);
});

test("with no profile and no resume the draft is all visible placeholders", () => {
  const draft = buildLinkedInDraft({ profile: null, resume: null, accountEmail: null });
  assert.ok(draft.slots.length >= 5, `got ${draft.slots.length}`);
  assert.ok(draft.slots.every((s) => s.startsWith("[YOUR SPECIFIC DETAIL:")));
  assert.deepEqual(draft.bullets, []);
});
