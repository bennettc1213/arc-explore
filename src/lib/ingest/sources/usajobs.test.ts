import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { classifyOpportunity } from "../normalize";
import { mapUsaJobsPosting, type UsaJobsDescriptor } from "./usajobs";

/**
 * Real API payload captured from the live `HiringPath=student` scope
 * (2026-08-14), not hand-written. Seven announcements chosen to cover the
 * cases that decide whether this source is usable at all: the federal
 * "Student Trainee" naming, a remote posting, a 96-location posting, two
 * senior clinical roles that are student-eligible but are emphatically not
 * internships, and one where the agency actually filled in the offering type.
 *
 * Bulk HTML fields the mapper never reads were stripped and `JobSummary`
 * truncated, so the fixture stays a readable size. Every value the tests
 * assert on is untouched.
 */
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "..", "__fixtures__", "usajobs.sample.json"), "utf8"),
) as { SearchResult: { SearchResultItems: Array<{ MatchedObjectDescriptor: UsaJobsDescriptor }> } };

const DESCRIPTORS = FIXTURE.SearchResult.SearchResultItems.map((i) => i.MatchedObjectDescriptor);
const byTitle = (needle: string): UsaJobsDescriptor => {
  const found = DESCRIPTORS.find((d) => (d.PositionTitle ?? "").includes(needle));
  assert.ok(found, `fixture is missing a posting titled like "${needle}"`);
  return found;
};

describe("mapUsaJobsPosting", () => {
  it("maps the fields a listing is rendered from", () => {
    const p = mapUsaJobsPosting(byTitle("Student Volunteer"));

    assert.ok(p);
    assert.equal(p.source, "usajobs");
    assert.equal(p.sourceId, "HCO-26-DE-12865764");
    assert.equal(p.title, "Student Volunteer");
    assert.equal(p.companyName, "Government Accountability Office");
    assert.equal(p.url, "https://www.usajobs.gov:443/job/855084200");
  });

  // Rare enough among our sources to be the point of adding this one.
  it("reads the employer-stated application deadline", () => {
    const p = mapUsaJobsPosting(byTitle("Student Volunteer"));
    assert.equal(p?.deadlineAt?.toISOString().slice(0, 10), "2026-12-31");
  });

  /**
   * USAJobs sends `2026-12-31T23:59:59.9970` with no zone, which `new Date()`
   * would read as server-local — so this same assertion passed in CI (UTC) and
   * failed on a Pacific laptop, one calendar day apart. The date a student
   * sees must not depend on which machine ran the ingest.
   */
  it("pins zoneless timestamps to UTC so the date cannot drift with the runner", () => {
    const closing = mapUsaJobsPosting(byTitle("Student Trainee( Administrative)"));
    assert.equal(closing?.deadlineAt?.toISOString(), "2026-08-14T23:59:59.997Z");

    const posted = mapUsaJobsPosting(byTitle("Student Volunteer"));
    assert.equal(posted?.postedAt?.toISOString().endsWith("Z"), true);
  });

  it("still honors an explicit timezone when one is present", () => {
    const p = mapUsaJobsPosting({
      PositionID: "z",
      PositionTitle: "Student Trainee",
      ApplyURI: ["https://example.gov"],
      ApplicationCloseDate: "2026-12-31T23:59:59-05:00",
    });
    assert.equal(p?.deadlineAt?.toISOString(), "2027-01-01T04:59:59.000Z");
  });

  it("reads remote from the published flag rather than the location text", () => {
    assert.equal(mapUsaJobsPosting(byTitle("Graduate Student Research Assistant"))?.isRemote, true);
    assert.equal(mapUsaJobsPosting(byTitle("Student Volunteer"))?.isRemote, false);
  });

  // One announcement covering 96 duty stations is normal for a federal
  // trainee program; repeated names within it are not.
  it("dedupes locations while preserving order", () => {
    const p = mapUsaJobsPosting(byTitle("Student Trainee"));
    assert.ok(p);
    assert.ok(p.locations.length > 1);
    assert.equal(p.locations.length, new Set(p.locations).size);
  });

  it("passes the offering type through as a hint only when the agency filled it in", () => {
    assert.equal(mapUsaJobsPosting(byTitle("Civil Engineer"))?.employmentHint, "Internships");
    // Blank on the overwhelming majority — null, never an empty string, so
    // the classifier is not handed something that looks like a stated value.
    assert.equal(mapUsaJobsPosting(byTitle("Student Volunteer"))?.employmentHint, null);
  });

  it("drops an announcement with nothing to apply to", () => {
    assert.equal(
      mapUsaJobsPosting({ PositionID: "x", PositionTitle: "Student Trainee", ApplyURI: [], PositionURI: "" }),
      null,
    );
    assert.equal(mapUsaJobsPosting({ PositionID: "x", ApplyURI: ["https://example.gov"] }), null);
  });
});

/**
 * The reason this source needed a vocabulary change rather than just an
 * adapter. `HiringPath=student` is a scope, not a classifier — these are the
 * postings it actually returns, and the split has to come from the title.
 */
describe("classifying real USAJobs student-scope postings", () => {
  const classify = (d: UsaJobsDescriptor) => {
    const p = mapUsaJobsPosting(d);
    assert.ok(p);
    return classifyOpportunity(p.title, p.employmentHint);
  };

  it("recognizes the federal naming convention for student positions", () => {
    assert.equal(classify(byTitle("Student Trainee")), "internship");
    assert.equal(classify(byTitle("Student Volunteer")), "internship");
    assert.equal(classify(byTitle("Graduate Student Research Assistant")), "internship");
  });

  // Real title, real spacing — the agency typed "Trainee(" with no space.
  it("is not defeated by the punctuation agencies actually type", () => {
    assert.equal(classify(byTitle("Student Trainee( Administrative)")), "internship");
  });

  // Both are student-eligible and neither is an internship. Trusting the
  // hiring path instead of the title would have published them as one.
  it("rejects senior roles that merely accept student applicants", () => {
    assert.equal(classify(byTitle("PSYCHOLOGIST")), "other");
    assert.equal(classify(byTitle("Physician (Radiology-Diagnostic)")), "other");
  });

  // The one case where the structured field earns its keep: nothing in
  // "Civil Engineer / Mechancial Engineer / Electrical Engineer" says intern.
  it("lets a stated offering type of Internships promote a title that hides it", () => {
    assert.equal(classify(byTitle("Civil Engineer")), "internship");
  });
});
