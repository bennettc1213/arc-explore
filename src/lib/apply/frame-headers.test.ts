import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyFrameObservation,
  FRAME_ALLOW_OBSERVATIONS,
  frameVerdictFromHeaders,
  isFrameObserved,
} from "./frame-headers";

describe("frameVerdictFromHeaders", () => {
  test("no framing header at all is the common case and permits embedding", () => {
    assert.equal(frameVerdictFromHeaders({}), "allow");
    assert.equal(frameVerdictFromHeaders({ xFrameOptions: null, contentSecurityPolicy: null }), "allow");
    // A CSP that says plenty but nothing about frame-ancestors still permits.
    assert.equal(
      frameVerdictFromHeaders({ contentSecurityPolicy: "default-src 'self'; img-src *" }),
      "allow",
    );
  });

  test("X-Frame-Options refuses us however it is spelled", () => {
    // Both real values observed in the corpus: Ashby sends DENY,
    // SmartRecruiters SAMEORIGIN, and one scholarship host sent lowercase.
    for (const v of ["DENY", "SAMEORIGIN", "sameorigin", " Deny ", "ALLOW-FROM https://x.com"]) {
      assert.equal(frameVerdictFromHeaders({ xFrameOptions: v }), "deny", v);
    }
  });

  test("ALLOW-FROM is treated as a refusal, not as permission", () => {
    /*
     * It is obsolete and no current browser honours it, so a page sending only
     * ALLOW-FROM behaves exactly like DENY. Reading it as permission would
     * produce the blank rectangle this module exists to prevent — the failure
     * that has no client-side error to catch.
     */
    assert.equal(frameVerdictFromHeaders({ xFrameOptions: "ALLOW-FROM https://arc.example" }), "deny");
  });

  test("frame-ancestors permits only a literal wildcard", () => {
    assert.equal(
      frameVerdictFromHeaders({ contentSecurityPolicy: "frame-ancestors *" }),
      "allow",
    );
    for (const v of [
      "frame-ancestors 'none'",
      "frame-ancestors 'self'",
      // Real, from cobellscholar.org in the live probe.
      "frame-ancestors 'self' http://localhost:3005 https://cobell.prolificdigital.io",
    ]) {
      assert.equal(frameVerdictFromHeaders({ contentSecurityPolicy: v }), "deny", v);
    }
  });

  test("frame-ancestors is found wherever it sits in the policy", () => {
    assert.equal(
      frameVerdictFromHeaders({
        contentSecurityPolicy: "default-src 'self'; frame-ancestors 'none'; script-src *",
      }),
      "deny",
    );
    // And a directive merely *containing* the word must not be mistaken for it.
    assert.equal(
      frameVerdictFromHeaders({ contentSecurityPolicy: "child-src 'self'; frame-src *" }),
      "allow",
    );
  });

  test("either header refusing is enough — the strictest reading wins", () => {
    // CSP supersedes XFO in the spec, but we never need that precedence: if
    // either one refuses us we do not embed, so this stays simple and safe.
    assert.equal(
      frameVerdictFromHeaders({ xFrameOptions: "SAMEORIGIN", contentSecurityPolicy: "frame-ancestors *" }),
      "deny",
    );
  });
});

describe("applyFrameObservation", () => {
  test("takes two consecutive allows before we will embed", () => {
    let h = { frameAllowStrikes: 0 };
    h = applyFrameObservation(h, "allow");
    assert.equal(isFrameObserved(h), false, "one observation is not enough");
    h = applyFrameObservation(h, "allow");
    assert.equal(isFrameObserved(h), true);
    assert.equal(FRAME_ALLOW_OBSERVATIONS, 2);
  });

  test("a single deny withdraws embedding immediately", () => {
    /*
     * DELIBERATELY ASYMMETRIC. A wrong `deny` costs one extra browser tab; a
     * wrong `allow` shows a blank rectangle at the moment someone was applying.
     * Slow to trust, fast to withdraw.
     */
    const proven = { frameAllowStrikes: FRAME_ALLOW_OBSERVATIONS };
    assert.equal(isFrameObserved(applyFrameObservation(proven, "deny")), false);
  });

  test("unknown neither advances nor resets", () => {
    // A timeout is a fact about the network, not about their headers — the
    // same rule linkcheck applies to a 403 or a 5xx.
    const one = { frameAllowStrikes: 1 };
    assert.deepEqual(applyFrameObservation(one, "unknown"), one);
    const proven = { frameAllowStrikes: FRAME_ALLOW_OBSERVATIONS };
    assert.equal(isFrameObserved(applyFrameObservation(proven, "unknown")), true);
  });

  test("the counter does not grow without bound", () => {
    let h = { frameAllowStrikes: 0 };
    for (let i = 0; i < 50; i++) h = applyFrameObservation(h, "allow");
    assert.equal(h.frameAllowStrikes, FRAME_ALLOW_OBSERVATIONS);
  });
});
