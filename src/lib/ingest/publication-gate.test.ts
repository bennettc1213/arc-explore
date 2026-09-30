import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canPublish,
  describeDecision,
  isAuthoritativeObservation,
  publicationStateFor,
  type PublicationRequest,
  type SourceFacts,
} from "./publication-gate";

function source(overrides: Partial<SourceFacts> = {}): SourceFacts {
  return {
    authority: "source_of_truth",
    state: "active",
    termsReviewStatus: "approved",
    ...overrides,
  };
}

function request(overrides: Partial<PublicationRequest> = {}): PublicationRequest {
  return { source: source(), pollComplete: true, ...overrides };
}

describe("canPublish", () => {
  it("allows an active, approved source of truth with a complete poll", () => {
    assert.deepEqual(canPublish(request()), { allowed: true });
  });

  it("refuses a discovery-only source even when its poll is complete", () => {
    // The rule INS-012 exists for: a complete page from a source that merely
    // describes listings is still not a source of truth for them.
    const decision = canPublish(
      request({ source: source({ authority: "discovery_only" }) }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "discovery_only" });
  });

  it("refuses a discovery-only source that was never terms-reviewed", () => {
    // Reported as discovery_only, not terms: the authority problem is the one
    // that no amount of reviewing this particular source can fix.
    const decision = canPublish(
      request({
        source: source({
          authority: "discovery_only",
          termsReviewStatus: "not_reviewed",
        }),
      }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "discovery_only" });
  });

  it("refuses a source whose terms were denied", () => {
    const decision = canPublish(
      request({ source: source({ termsReviewStatus: "denied" }) }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "terms_denied" });
  });

  it("allows a source whose terms are restricted, since the restriction is a condition, not a ban", () => {
    assert.deepEqual(
      canPublish(request({ source: source({ termsReviewStatus: "restricted" }) })),
      { allowed: true },
    );
  });

  it("allows a source of truth whose terms review is still pending", () => {
    // Deliberate: refusing here would empty the feed of every board nobody has
    // paperwork for yet. Those rows land as `unverified`, which is the honest
    // state, rather than being withheld or deleted.
    assert.deepEqual(
      canPublish(request({ source: source({ termsReviewStatus: "not_reviewed" }) })),
      { allowed: true },
    );
  });

  it("refuses a paused source", () => {
    const decision = canPublish(request({ source: source({ state: "paused" }) }));
    assert.deepEqual(decision, { allowed: false, reason: "source_paused" });
  });

  it("refuses a blocked source before considering anything else", () => {
    const decision = canPublish(
      request({
        source: source({ state: "blocked", termsReviewStatus: "denied" }),
      }),
    );
    assert.deepEqual(decision, { allowed: false, reason: "source_blocked" });
  });

  it("refuses an incomplete poll", () => {
    // A partial page must not publish, and must equally not close anything.
    const decision = canPublish(request({ pollComplete: false }));
    assert.deepEqual(decision, { allowed: false, reason: "poll_incomplete" });
  });

  it("reports poll_incomplete before discovery_only only when the source is otherwise sound", () => {
    // Ordering guarantee: state and terms outrank authority, authority outranks
    // poll completeness. Both refusals are correct; only the reason differs.
    assert.deepEqual(canPublish(request({ pollComplete: false })), {
      allowed: false,
      reason: "poll_incomplete",
    });
  });
});

describe("isAuthoritativeObservation", () => {
  it("is true only for a publishable source of truth", () => {
    assert.equal(isAuthoritativeObservation(request()), true);
  });

  it("is false for discovery-only, so a confirm clock can never be advanced by one", () => {
    assert.equal(
      isAuthoritativeObservation(
        request({ source: source({ authority: "discovery_only" }) }),
      ),
      false,
    );
  });

  it("is false for an incomplete poll", () => {
    assert.equal(isAuthoritativeObservation(request({ pollComplete: false })), false);
  });
});

describe("publicationStateFor", () => {
  it("marks a verified publication for a healthy source of truth", () => {
    assert.equal(publicationStateFor(request()), "verified");
  });

  it("marks a discovery hit a candidate, never verified", () => {
    assert.equal(
      publicationStateFor(
        request({ source: source({ authority: "discovery_only" }) }),
      ),
      "candidate",
    );
  });

  it("marks an incomplete poll unverified rather than withholding the row", () => {
    // The row already exists and may be in the feed. Calling it a candidate
    // would claim we are holding it back, and quarantining it would hide a real
    // listing because our fetch was flaky.
    assert.equal(
      publicationStateFor(request({ pollComplete: false })),
      "unverified",
    );
  });

  it("marks a paused source of truth unverified", () => {
    assert.equal(
      publicationStateFor(request({ source: source({ state: "paused" }) })),
      "unverified",
    );
  });
});

describe("describeDecision", () => {
  it("is readable in a log line", () => {
    assert.equal(describeDecision({ allowed: true }), "publishable");
    assert.equal(
      describeDecision({ allowed: false, reason: "discovery_only" }),
      "not publishable: discovery only",
    );
  });
});
