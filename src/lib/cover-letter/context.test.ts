import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evidenceForPosting, gapsToFlag } from "./context";
import type { EvidenceEntry, PostingFacts } from "./context";
import { EMPTY_PARSED_RESUME, type ParsedResume } from "../resume/types";

const POSTING: PostingFacts = {
  kind: "internship",
  title: "Software Engineering Intern",
  company: "Acme",
  term: "Summer 2027",
  locations: ["San Francisco"],
  isRemote: false,
  workAuth: null,
  skills: ["Python", "SQL", "React"],
  eligibility: [],
  amountMin: null,
  amountMax: null,
  deadlineAt: null,
  isContentMarketing: false,
};

function parsed(over: Partial<ParsedResume>): ParsedResume {
  return { ...EMPTY_PARSED_RESUME, ...over };
}

describe("evidenceForPosting", () => {
  it("ranks experience by how many posting skills it demonstrates", () => {
    const p = parsed({
      experiences: [
        {
          organization: "Startup A",
          role: "Data Intern",
          dates: "Jun 2025 – Aug 2025",
          location: null,
          bullets: ["Cleaned data pipelines in Python and SQL"],
        },
        {
          organization: "Cafe",
          role: "Barista",
          dates: "2024",
          location: null,
          bullets: ["Made coffee"],
        },
      ],
    });

    const ev = evidenceForPosting(p, POSTING.skills);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].kind, "experience");
    assert.match(ev[0].title, /Data Intern/);
    assert.deepEqual(ev[0].matchedSkills, ["Python", "SQL"]);
  });

  it("keeps an entry that shares no skill out of the evidence", () => {
    const p = parsed({
      experiences: [
        {
          organization: "Cafe",
          role: "Barista",
          dates: "2024",
          location: null,
          bullets: ["Made coffee"],
        },
      ],
    });
    assert.equal(evidenceForPosting(p, POSTING.skills).length, 0);
  });

  it("uses projects when no experience matches", () => {
    const p = parsed({
      experiences: [
        {
          organization: "Cafe",
          role: "Barista",
          dates: "2024",
          location: null,
          bullets: ["Made coffee"],
        },
      ],
      projects: [
        { name: "Forecast Dashboard", description: "Built a React dashboard backed by a SQL API", link: null },
      ],
    });
    const ev = evidenceForPosting(p, POSTING.skills);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].kind, "project");
  });

  it("prefers experience over a project on an equal match", () => {
    const p = parsed({
      experiences: [
        {
          organization: "Acme",
          role: "SWE Intern",
          dates: null,
          location: null,
          bullets: ["Shipped features in Python"],
        },
      ],
      projects: [{ name: "P", description: "Used Python for a script", link: null }],
    });
    const ev = evidenceForPosting(p, ["Python"]);
    assert.equal(ev[0].kind, "experience");
  });
});

describe("gapsToFlag", () => {
  const base = {
    posting: POSTING,
    evidence: [{ kind: "experience", title: "x", dates: null, bullets: ["y"], matchedSkills: [] }] as EvidenceEntry[],
    candidate: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
      school: null,
      major: null,
      gradYear: null,
      gpa: null,
      skills: [],
      portfolioUrl: null,
      workAuth: null,
      targetVerticals: [],
    },
  };

  it("flags a missing portfolio for internships", () => {
    const gaps = gapsToFlag(base);
    assert.ok(gaps.some((g) => g.includes("portfolio")));
  });

  it("does not demand a portfolio for a scholarship", () => {
    const gaps = gapsToFlag({ ...base, posting: { ...POSTING, kind: "scholarship" } });
    assert.ok(!gaps.some((g) => g.includes("portfolio")));
  });

  it("flags a missing name and email", () => {
    const gaps = gapsToFlag({
      ...base,
      candidate: { ...base.candidate, name: null, email: null },
    });
    assert.ok(gaps.some((g) => g.includes("name")));
    assert.ok(gaps.some((g) => g.includes("email")));
  });

  it("flags when there is no supporting evidence", () => {
    const gaps = gapsToFlag({ ...base, evidence: [] });
    assert.ok(gaps.some((g) => g.includes("nothing on your resume")));
  });
});
