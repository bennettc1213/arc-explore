import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeResumeEdit, parseBulletsInput, parseSkillsInput } from "./edit";

describe("parseSkillsInput", () => {
  it("accepts the separators a student actually types", () => {
    assert.deepEqual(parseSkillsInput("Python, Go\nRust; SQL"), ["Python", "Go", "Rust", "SQL"]);
  });

  // Both spellings on a rendered resume reads as a mistake.
  it("collapses duplicates case-insensitively, keeping the chosen spelling", () => {
    assert.deepEqual(parseSkillsInput("Python, python, PYTHON"), ["Python"]);
  });

  it("drops blanks and stray separators", () => {
    assert.deepEqual(parseSkillsInput("  , Python ,,\n\n , Go , "), ["Python", "Go"]);
    assert.deepEqual(parseSkillsInput("   "), []);
  });
});

describe("parseBulletsInput", () => {
  it("splits on lines and strips a leading bullet character", () => {
    assert.deepEqual(parseBulletsInput("- Built X\n• Shipped Y\n* Fixed Z"), [
      "Built X",
      "Shipped Y",
      "Fixed Z",
    ]);
  });

  it("drops blank lines", () => {
    assert.deepEqual(parseBulletsInput("Built X\n\n\n   \nShipped Y"), ["Built X", "Shipped Y"]);
  });
});

describe("decodeResumeEdit", () => {
  it("rejects a payload that is not a resume", () => {
    assert.equal(decodeResumeEdit(null), null);
    assert.equal(decodeResumeEdit("resume"), null);
    assert.equal(decodeResumeEdit(42), null);
  });

  /**
   * A cleared field means "the document does not state this". Storing "" would
   * make it a stated-but-blank value, which the scorers would then have to
   * treat as known — the exact unknown-vs-absent confusion the whole codebase
   * avoids.
   */
  it("turns cleared fields into null, not empty strings", () => {
    const r = decodeResumeEdit({ name: "  ", school: "", major: "   Physics  " });
    assert.equal(r?.name, null);
    assert.equal(r?.school, null);
    assert.equal(r?.major, "Physics");
  });

  // Number("") is 0 and Number("n/a") is NaN; a GPA stored as 0.0 would read
  // as a real and very bad GPA.
  it("does not coerce a blank or unreadable number into zero", () => {
    assert.equal(decodeResumeEdit({ gpa: "", gradYear: "" })?.gpa, null);
    assert.equal(decodeResumeEdit({ gpa: "n/a" })?.gpa, null);
    assert.equal(decodeResumeEdit({ gpa: "3.7" })?.gpa, 3.7);
    assert.equal(decodeResumeEdit({ gradYear: "2027" })?.gradYear, 2027);
  });

  it("drops rows the student added and left blank", () => {
    const r = decodeResumeEdit({
      experiences: [
        { organization: "Stripe", role: "Intern", bullets: ["Shipped X"] },
        { organization: "", role: "  ", dates: "", location: "", bullets: [] },
      ],
      projects: [{ name: "", description: "", link: "" }],
    });
    assert.equal(r?.experiences.length, 1);
    assert.equal(r?.experiences[0].organization, "Stripe");
    assert.equal(r?.projects.length, 0);
  });

  it("keeps a partially filled experience", () => {
    const r = decodeResumeEdit({ experiences: [{ role: "Research Assistant" }] });
    assert.equal(r?.experiences.length, 1);
    assert.equal(r?.experiences[0].role, "Research Assistant");
    assert.equal(r?.experiences[0].organization, null);
  });

  // The caps live in parsedResumeSchema; enforcing them here is what stops a
  // crafted payload putting something in the column the parser could not have.
  it("applies the stored schema's caps rather than trusting the client", () => {
    const r = decodeResumeEdit({ skills: Array.from({ length: 200 }, (_, i) => `skill-${i}`) });
    assert.ok(r);
    assert.ok(r.skills.length <= 60, `expected the 60-skill cap, got ${r.skills.length}`);
  });

  it("survives arrays containing entries of the wrong type", () => {
    const r = decodeResumeEdit({
      skills: ["Python", 42, null, "Go"],
      links: ["https://example.com", 7],
      experiences: ["not an object", { role: "Intern" }],
    });
    assert.deepEqual(r?.skills, ["Python", "Go"]);
    assert.deepEqual(r?.links, ["https://example.com"]);
    assert.equal(r?.experiences.length, 1);
  });
});
