import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_PARSED_RESUME,
  MAX_RESUME_BYTES,
  checkUpload,
  parsedResumeSchema,
  pickPortfolioLink,
  resumeToProfileSuggestions,
} from "./types";

const file = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "resume.pdf",
  type: "application/pdf",
  size: 120_000,
  ...over,
});

describe("checkUpload", () => {
  it("accepts a pdf", () => {
    assert.deepEqual(checkUpload(file()), { ok: true, kind: "pdf" });
  });

  it("accepts text and markdown", () => {
    assert.equal(checkUpload(file({ name: "cv.txt", type: "text/plain" })).kind, "text");
    assert.equal(checkUpload(file({ name: "cv.md", type: "text/markdown" })).kind, "text");
  });

  // Browsers report application/octet-stream for .md on some platforms, and
  // nothing at all on others — the extension has to be able to carry the call.
  it("falls back to the extension when the browser sends a useless mime type", () => {
    assert.equal(
      checkUpload(file({ name: "cv.pdf", type: "application/octet-stream" })).kind,
      "pdf",
    );
    assert.equal(checkUpload(file({ name: "cv.md", type: "" })).kind, "text");
  });

  it("says plainly that Word is not supported instead of failing oddly", () => {
    const res = checkUpload(file({ name: "resume.docx", type: "application/vnd.openxmlformats" }));
    assert.equal(res.ok, false);
    assert.match(res.error!, /Word/);
  });

  it("rejects empty and oversized files", () => {
    assert.equal(checkUpload(file({ size: 0 })).ok, false);
    assert.equal(checkUpload(file({ size: MAX_RESUME_BYTES + 1 })).ok, false);
    assert.equal(checkUpload(file({ size: MAX_RESUME_BYTES })).ok, true);
  });

  it("rejects an unrelated file type", () => {
    assert.equal(checkUpload(file({ name: "photo.png", type: "image/png" })).ok, false);
  });
});

describe("parsedResumeSchema", () => {
  it("accepts a fully-null extraction — 'the document did not say' is valid", () => {
    const parsed = parsedResumeSchema.parse(EMPTY_PARSED_RESUME);
    assert.deepEqual(parsed, EMPTY_PARSED_RESUME);
  });

  // One malformed field should not cost the user their whole upload.
  it("coerces an individually bad field instead of discarding the resume", () => {
    const parsed = parsedResumeSchema.parse({
      ...EMPTY_PARSED_RESUME,
      school: "State University",
      gradYear: "next spring", // not a year
      gpa: 42, // out of range
      skills: "python", // not an array
    });
    assert.equal(parsed.school, "State University");
    assert.equal(parsed.gradYear, null);
    assert.equal(parsed.gpa, null);
    assert.deepEqual(parsed.skills, []);
  });

  it("keeps bullets verbatim", () => {
    const bullet = "Cut p99 latency 43% by replacing the N+1 query in the ranking path";
    const parsed = parsedResumeSchema.parse({
      ...EMPTY_PARSED_RESUME,
      experiences: [
        {
          organization: "Acme",
          role: "SWE Intern",
          dates: "Jun 2025 - Aug 2025",
          location: "Remote",
          bullets: [bullet],
        },
      ],
    });
    assert.equal(parsed.experiences[0].bullets[0], bullet);
  });

  it("turns an empty string into null so blank never reads as a stated value", () => {
    const parsed = parsedResumeSchema.parse({ ...EMPTY_PARSED_RESUME, major: "" });
    assert.equal(parsed.major, null);
  });
});

describe("pickPortfolioLink", () => {
  it("prefers a personal site over a platform profile", () => {
    assert.equal(
      pickPortfolioLink(["https://github.com/ben", "https://benchu.dev", "linkedin.com/in/ben"]),
      "https://benchu.dev",
    );
  });

  it("adds a scheme to a bare domain", () => {
    assert.equal(pickPortfolioLink(["benchu.dev"]), "https://benchu.dev");
  });

  it("returns null when every link is a platform profile", () => {
    assert.equal(pickPortfolioLink(["https://github.com/ben", "https://linkedin.com/in/ben"]), null);
  });

  it("returns null for nothing usable", () => {
    assert.equal(pickPortfolioLink([]), null);
    assert.equal(pickPortfolioLink(["not a url"]), null);
  });
});

describe("resumeToProfileSuggestions", () => {
  const parsed = {
    ...EMPTY_PARSED_RESUME,
    name: "Ben Chu",
    school: "State University",
    major: "Computer Science",
    gradYear: 2027,
    gpa: 3.9,
    links: ["https://benchu.dev"],
  };

  it("fills only what the profile has left blank", () => {
    assert.deepEqual(resumeToProfileSuggestions(parsed, {}), {
      displayName: "Ben Chu",
      school: "State University",
      major: "Computer Science",
      gradYear: 2027,
      gpa: 3.9,
      portfolioUrl: "https://benchu.dev",
    });
  });

  // A resume is evidence, not an override. What the user typed wins.
  it("never overwrites an answer the user already gave", () => {
    const out = resumeToProfileSuggestions(parsed, {
      displayName: "Bennett Chu",
      major: "Mathematics",
      gradYear: 2026,
      gpa: 3.5,
      portfolioUrl: "https://elsewhere.com",
    });
    assert.deepEqual(out, { school: "State University" });
  });

  it("suggests nothing when the document stated nothing", () => {
    assert.deepEqual(resumeToProfileSuggestions(EMPTY_PARSED_RESUME, {}), {});
  });

  // A GPA of 0.0 and a missing GPA are different facts.
  it("treats a stated zero as stated", () => {
    const out = resumeToProfileSuggestions({ ...EMPTY_PARSED_RESUME, gpa: 0 }, { gpa: null });
    assert.equal(out.gpa, 0);
  });
});
