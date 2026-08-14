import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { scoreScholarshipFit } from "./scholarship-fit";

const EMPTY_PROFILE = {
  targetVerticals: [],
  targetLocations: [],
  openToRemote: true,
  skills: [],
};

const CS_PROFILE = {
  ...EMPTY_PROFILE,
  major: "computer science",
};

function base(over: Record<string, unknown> = {}) {
  return {
    title: "Taco Bell Live Más Scholarship",
    sponsorName: "Taco Bell",
    amountMin: null,
    amountMax: null,
    isContentMarketing: false,
    eligibility: [],
    ...over,
  };
}

describe("scoreScholarshipFit", () => {
  it("reports reasons for every dimension it scored", () => {
    const r = scoreScholarshipFit(CS_PROFILE, base({ amountMin: 10000 }));
    assert.ok(r.reasons.length >= 3);
    assert.ok(r.reasons.some((x) => x.dimension === "field"));
    assert.ok(r.reasons.some((x) => x.dimension === "award"));
    assert.ok(r.reasons.some((x) => x.dimension === "competition"));
  });

  it("scores a matching field, a large award, and an institutional sponsor at 100 (3/3)", () => {
    const r = scoreScholarshipFit(
      CS_PROFILE,
      base({
        title: "Computer Science Undergraduate Scholarship",
        amountMin: 10000,
        isContentMarketing: false,
      }),
    );
    assert.equal(r.score, 100);
    assert.equal(r.knownDimensions, 3);
    assert.equal(r.totalDimensions, 3);
    assert.equal(r.blocked, false);
  });

  it("reads a stated field out of the eligibility text, not just the title", () => {
    const r = scoreScholarshipFit(
      CS_PROFILE,
      base({
        title: "Annual Award",
        eligibility: ["Must be pursuing a degree in computer science"],
      }),
    );
    const field = r.reasons.find((x) => x.dimension === "field");
    assert.equal(field?.kind, "good");
    assert.equal(r.knownDimensions, 2); // field + competition; amount unknown
  });

  it("does not read a role word out of scholarship prose as a field", () => {
    // "Security" here is Social Security benefits, not infosec. The role-title
    // regexes must not run over scholarship prose, or every disability-advocacy
    // award turns into a software match. This was observed live on this exact
    // title.
    const r = scoreScholarshipFit(
      CS_PROFILE,
      base({ title: "The Social Security Disability Advocacy Scholarship", amountMin: 1000 }),
    );
    const field = r.reasons.find((x) => x.dimension === "field");
    assert.equal(field?.kind, "unknown");
    assert.equal(r.knownDimensions, 2); // award + competition
  });

  it("matches a scholarship whose title states the field in degree language", () => {
    const r = scoreScholarshipFit(
      CS_PROFILE,
      base({ title: "AI Innovators Undergraduate Scholarship" }),
    );
    const field = r.reasons.find((x) => x.dimension === "field");
    assert.equal(field?.kind, "good");
  });

  it("scores a scholarship aimed at a different field as a likely ineligibility", () => {
    const r = scoreScholarshipFit(
      CS_PROFILE,
      base({
        title: "Mechanical Engineering Scholarship",
        eligibility: ["For students enrolled in an accredited mechanical engineering program"],
        amountMin: 2500,
      }),
    );
    const field = r.reasons.find((x) => x.dimension === "field");
    assert.equal(field?.kind, "bad");
    assert.ok((r.score ?? 0) < 80);
  });

  it("down-ranks content-marketing awards below institutional ones", () => {
    const institutional = scoreScholarshipFit(
      CS_PROFILE,
      base({ title: "Computer Science Scholarship", amountMin: 1000 }),
    );
    const marketing = scoreScholarshipFit(
      CS_PROFILE,
      base({ title: "Computer Science Scholarship", amountMin: 1000, isContentMarketing: true }),
    );
    assert.ok((institutional.score ?? 0) > (marketing.score ?? 0));
  });

  it("keeps an unstated amount out of the average rather than scoring a miss", () => {
    const r = scoreScholarshipFit(CS_PROFILE, base({ title: "Computer Science Scholarship" }));
    assert.equal(r.knownDimensions, 2); // field + competition
    assert.ok(r.reasons.some((x) => x.dimension === "award" && x.kind === "unknown"));
  });

  it("drops the field dimension when the profile has no major or interests", () => {
    const r = scoreScholarshipFit(EMPTY_PROFILE, base({ title: "Computer Science Scholarship" }));
    assert.equal(r.knownDimensions, 1); // competition only
    assert.ok(r.reasons.some((x) => x.dimension === "field" && x.kind === "unknown"));
    assert.equal(r.blocked, false);
  });

  it("scores an unstated award against the exact single-figure amount", () => {
    const r = scoreScholarshipFit(
      CS_PROFILE,
      base({ title: "Engineering Scholarship", amountMax: 5000 }),
    );
    const award = r.reasons.find((x) => x.dimension === "award");
    assert.equal(award?.label, "$5,000");
  });

  it("returns a real skills gap shape (empty) so the feed can render it", () => {
    const r = scoreScholarshipFit(CS_PROFILE, base({ amountMin: 1000 }));
    assert.deepEqual(r.skills, { matched: [], missing: [] });
  });
});
