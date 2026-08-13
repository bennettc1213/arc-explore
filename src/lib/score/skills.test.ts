import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SATURATION,
  SKILLS,
  canonicalSkill,
  extractSkills,
  matchSkills,
  skillsFromList,
  skillsFromParsedResume,
} from "./skills";

describe("skill vocabulary", () => {
  it("has no duplicate canonical names", () => {
    const names = SKILLS.map((s) => s.name);
    assert.equal(new Set(names).size, names.length);
  });

  /*
   * A malformed alias throws at module load, but an alias that silently
   * matches nothing is the quieter failure — `\bc\+\+\b` cannot match anything,
   * including "C++", because there is no word character after the final "+"
   * for the boundary to sit against. Every alias must find itself.
   */
  it("every alias actually matches its own literal text", () => {
    for (const skill of SKILLS) {
      for (const alias of skill.aliases) {
        if (alias.includes("(?=") || alias.includes("\\b")) continue; // context-dependent
        const plain = alias.replace(/\\(.)/g, "$1");
        assert.ok(
          extractSkills(`I used ${plain} at work`).includes(skill.name),
          `alias "${alias}" does not match ${skill.name}`,
        );
      }
    }
  });

  it("resolves every canonical name from an explicit list", () => {
    for (const skill of SKILLS) {
      assert.equal(canonicalSkill(skill.name), skill.name, `cannot resolve ${skill.name}`);
    }
  });
});

describe("extractSkills", () => {
  it("finds skills in ordinary prose", () => {
    const found = extractSkills(
      "Built a service in Python with PostgreSQL, deployed on AWS using Docker.",
    );
    assert.deepEqual(found.sort(), ["AWS", "Docker", "PostgreSQL", "Python"]);
  });

  it("is case insensitive", () => {
    assert.deepEqual(extractSkills("PYTHON and kubernetes").sort(), ["Kubernetes", "Python"]);
  });

  it("returns nothing for empty input", () => {
    assert.deepEqual(extractSkills(), []);
    assert.deepEqual(extractSkills(null, undefined, "   "), []);
  });

  /*
   * The false-positive suite. A skill we invent inflates the score AND prints
   * a reason the student can see is wrong, which discredits every other number
   * on the page. These are the traps a naive word-match falls into.
   */
  it("does not read Java out of JavaScript", () => {
    const found = extractSkills("Strong JavaScript and TypeScript experience");
    assert.ok(found.includes("JavaScript"));
    assert.ok(!found.includes("Java"), "matched Java inside JavaScript");
  });

  it("does not read Go out of ordinary English", () => {
    for (const text of [
      "We go fast and break things",
      "Ready to go on day one",
      "A go-getter attitude",
    ]) {
      assert.ok(!extractSkills(text).includes("Go"), `matched Go in: ${text}`);
    }
    assert.ok(extractSkills("Backend services in Golang").includes("Go"));
  });

  it("does not read R out of every stray letter", () => {
    for (const text of [
      "Join our R&D team",
      "R. Smith will be your mentor",
      "Section R of the handbook",
    ]) {
      assert.ok(!extractSkills(text).includes("R"), `matched R in: ${text}`);
    }
    assert.ok(extractSkills("Proficient in R programming").includes("R"));
  });

  it("does not read C out of prose, but reads it when qualified", () => {
    assert.ok(!extractSkills("Grade C or above").includes("C"));
    assert.ok(extractSkills("Embedded C on bare metal").includes("C"));
    assert.ok(extractSkills("Experience with C++ and Python").includes("C++"));
  });

  it("does not read SAP out of 'sapling' or similar", () => {
    assert.ok(!extractSkills("planted a sapling").includes("SAP"));
    assert.ok(extractSkills("SAP ERP migration").includes("SAP"));
  });

  it("returns stable, deduped output", () => {
    const twice = extractSkills("Python python PYTHON");
    assert.deepEqual(twice, ["Python"]);
  });
});

describe("matchSkills", () => {
  it("reports matched and missing separately", () => {
    const m = matchSkills(["Python", "SQL"], ["Python", "SQL", "Kubernetes"]);
    assert.deepEqual(m.matched, ["Python", "SQL"]);
    assert.deepEqual(m.missing, ["Kubernetes"]);
  });

  /*
   * Silence on either side is unknown, never zero. A posting whose description
   * we never fetched must not look like one the student fails to match.
   */
  it("returns null coverage when either side named nothing", () => {
    assert.equal(matchSkills([], ["Python"]).coverage, null);
    assert.equal(matchSkills(["Python"], []).coverage, null);
    assert.equal(matchSkills([], []).coverage, null);
  });

  it("still reports the gap when the resume is empty", () => {
    // Useful even unscored: this is what tells a student what to go learn.
    assert.deepEqual(matchSkills([], ["Python", "AWS"]).missing, ["Python", "AWS"]);
  });

  it("saturates so a verbose posting cannot bury a strong candidate", () => {
    const posting = ["Python", "SQL", "AWS", "Docker", "Kubernetes", "Go", "React", "Terraform"];
    // Five of eight is a full match — beyond that we are measuring how many
    // technologies the employer chose to list, not the candidate.
    const strong = matchSkills(["Python", "SQL", "AWS", "Docker", "Kubernetes"], posting);
    assert.equal(strong.coverage, 1);

    const partial = matchSkills(["Python", "SQL"], posting);
    assert.equal(partial.coverage, 2 / SATURATION);
  });

  it("requires everything when the posting names fewer than the saturation point", () => {
    assert.equal(matchSkills(["Python"], ["Python", "SQL"]).coverage, 0.5);
    assert.equal(matchSkills(["Python", "SQL"], ["Python", "SQL"]).coverage, 1);
  });

  it("scores a total mismatch at zero, not null", () => {
    // Both sides spoke and disagreed. That is a real answer, unlike silence.
    assert.equal(matchSkills(["Excel"], ["Kubernetes", "Go"]).coverage, 0);
  });
});

/*
 * A skills section is a different kind of text from a job description. "Go" in
 * "we go fast" is noise; "Go" as an entry in a skills list is the student
 * saying so on purpose. Without this split, every student who writes the tidy
 * one-line skills header their career centre taught them silently loses Go,
 * R and C.
 */
describe("skillsFromList", () => {
  it("reads short names that are deliberately unmatchable in prose", () => {
    assert.deepEqual(skillsFromList(["Go", "R", "C"]).sort(), ["C", "Go", "R"]);
  });

  it("splits the ways resumes actually write lists", () => {
    assert.ok(skillsFromList(["Go, Python, TypeScript"]).includes("TypeScript"));
    assert.ok(skillsFromList(["Python / SQL"]).includes("SQL"));
    assert.ok(skillsFromList(["Docker and Kubernetes"]).includes("Kubernetes"));
  });

  it("matches exactly, never by substring", () => {
    // Substring matching here would resolve one phrase to five skills and
    // re-introduce every false positive the prose matcher exists to avoid.
    assert.deepEqual(skillsFromList(["Google Cloud Platform administration"]), []);
    assert.equal(canonicalSkill("gcp"), "GCP");
  });

  it("ignores entries outside the vocabulary and non-strings", () => {
    assert.deepEqual(skillsFromList(["teamwork", "fast learner", null, 7, ""]), []);
  });
});

describe("skillsFromParsedResume", () => {
  const resume = {
    skills: ["Go", "Python", "TypeScript"],
    experiences: [
      {
        role: "Software Engineering Intern",
        bullets: [
          "Rebuilt the telemetry ingest path, cutting p99 latency from 840ms to 190ms",
          "Deployed the service on Kubernetes with Terraform-managed infrastructure",
        ],
      },
    ],
    projects: [{ name: "Tideline", description: "A tide prediction app backed by PostgreSQL" }],
  };

  /*
   * A skills header is a claim; a bullet is evidence. Reading both means a
   * student is not penalised for the tidy one-line skills section that every
   * career centre teaches them to write.
   */
  it("reads skills the bullets demonstrate but the header omits", () => {
    const found = skillsFromParsedResume(resume);
    assert.ok(found.includes("Kubernetes"), "missed a skill proven in a bullet");
    assert.ok(found.includes("Terraform"));
    assert.ok(found.includes("PostgreSQL"), "missed a skill proven in a project");
    assert.ok(found.includes("Go"));
  });

  it("survives anything that is not a resume", () => {
    for (const junk of [null, undefined, "", 42, [], {}, { skills: "not an array" }]) {
      assert.deepEqual(skillsFromParsedResume(junk), []);
    }
  });

  it("ignores malformed entries instead of throwing", () => {
    const messy = {
      skills: ["Python", null, 7],
      experiences: [null, { bullets: "not an array" }, { role: 5 }],
      projects: [undefined, { name: null }],
    };
    assert.deepEqual(skillsFromParsedResume(messy), ["Python"]);
  });
});
