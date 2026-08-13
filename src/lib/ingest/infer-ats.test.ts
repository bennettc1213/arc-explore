import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inferAts } from "./sources/simplify";

describe("inferAts", () => {
  it("reads greenhouse board slugs", () => {
    assert.deepEqual(inferAts("https://boards.greenhouse.io/stripe/jobs/123"), {
      atsType: "greenhouse",
      atsSlug: "stripe",
    });
    assert.deepEqual(inferAts("https://job-boards.greenhouse.io/acme/jobs/9"), {
      atsType: "greenhouse",
      atsSlug: "acme",
    });
    assert.deepEqual(inferAts("https://boards.greenhouse.io/embed/job_board?for=acme"), {
      atsType: "greenhouse",
      atsSlug: "acme",
    });
  });

  it("reads lever, ashby and smartrecruiters", () => {
    assert.deepEqual(inferAts("https://jobs.lever.co/matterport/abc-123"), {
      atsType: "lever",
      atsSlug: "matterport",
    });
    assert.deepEqual(inferAts("https://jobs.ashbyhq.com/openai/uuid"), {
      atsType: "ashby",
      atsSlug: "openai",
    });
    assert.deepEqual(inferAts("https://ramp.jobs.ashbyhq.com/anything"), {
      atsType: "ashby",
      atsSlug: "ramp",
    });
    assert.deepEqual(inferAts("https://jobs.smartrecruiters.com/BoschGroup/7440"), {
      atsType: "smartrecruiters",
      atsSlug: "BoschGroup",
    });
  });

  /*
   * The regression this file exists for.
   *
   * URL.pathname is percent-encoded, so a slug with a space arrives as
   * "Tools%20for%20Humanity". Every adapter encodes the slug again when
   * building its request, turning that into "Tools%2520for%2520Humanity" — a
   * guaranteed 404 on every poll, for the life of the registry row. Measured
   * live: two companies were being lost this way.
   */
  it("decodes percent-encoded path segments so adapters do not double-encode", () => {
    assert.deepEqual(inferAts("https://jobs.ashbyhq.com/Tools%20for%20Humanity/uuid"), {
      atsType: "ashby",
      atsSlug: "Tools for Humanity",
    });
    assert.deepEqual(inferAts("https://jobs.ashbyhq.com/Flock%20Safety/uuid"), {
      atsType: "ashby",
      atsSlug: "Flock Safety",
    });
    assert.deepEqual(inferAts("https://jobs.lever.co/caf%C3%A9-co/x"), {
      atsType: "lever",
      atsSlug: "café-co",
    });
  });

  it("tolerates a malformed escape rather than throwing", () => {
    assert.deepEqual(inferAts("https://jobs.lever.co/100%off/x"), {
      atsType: "lever",
      atsSlug: "100%off",
    });
  });

  it("returns a null slug rather than guessing one", () => {
    // An embed URL with no `for` param names no board; inventing a slug from
    // the path produces a 404 on every poll instead of an honest unknown.
    assert.deepEqual(inferAts("https://boards.greenhouse.io/embed/job_board"), {
      atsType: "greenhouse",
      atsSlug: null,
    });
    // Company-hosted careers page backed by Greenhouse — ATS known, slug not.
    assert.deepEqual(inferAts("https://careers.acme.com/apply?gh_jid=123"), {
      atsType: "greenhouse",
      atsSlug: null,
    });
  });

  it("is safe on junk input", () => {
    for (const junk of [null, undefined, "", "not a url", "mailto:a@b.c"]) {
      const res = inferAts(junk);
      assert.equal(res.atsType, "unknown");
      assert.equal(res.atsSlug, null);
    }
  });
});
