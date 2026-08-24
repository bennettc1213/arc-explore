import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyUrlHost,
  EMBED_WITHHELD_HOSTS,
  embedStatus,
  FRAMEABLE_ATS_HOSTS,
  isFrameableApplyUrl,
  isSupportedAtsUrl,
  normalizeApplyUrl,
  SUPPORTED_ATS_HOSTS,
} from "./apply-url";

test("the advert page and the application page reduce to the same identity", () => {
  // The whole reason this module exists. Each pair is one real posting, as
  // stored by the ingest on the left and as the student sees it on the right.
  const pairs: Array<[string, string]> = [
    [
      "https://jobs.lever.co/waabi/0fd4e30b-9bd1-4b53-9043-6088457363cb",
      "https://jobs.lever.co/waabi/0fd4e30b-9bd1-4b53-9043-6088457363cb/apply",
    ],
    [
      "https://jobs.ashbyhq.com/cohere/8c035d3d-081d-4c8a-914a-72f4efaad254",
      "https://jobs.ashbyhq.com/cohere/8c035d3d-081d-4c8a-914a-72f4efaad254/application",
    ],
    [
      "https://job-boards.greenhouse.io/tripadvisor/jobs/8043141",
      "https://job-boards.greenhouse.io/tripadvisor/jobs/8043141#app",
    ],
    [
      "https://jobs.smartrecruiters.com/BoschGroup/744000143069809",
      "https://jobs.smartrecruiters.com/BoschGroup/744000143069809?utm_source=arc",
    ],
  ];
  for (const [stored, onPage] of pairs) {
    assert.equal(
      normalizeApplyUrl(stored),
      normalizeApplyUrl(onPage),
      `should match: ${stored}`,
    );
  }
});

test("tracking params and fragments are dropped", () => {
  assert.equal(
    normalizeApplyUrl("https://job-boards.greenhouse.io/x/jobs/1?gh_src=abc&utm_campaign=z#app"),
    "job-boards.greenhouse.io/x/jobs/1",
  );
});

test("www and a trailing slash are dropped", () => {
  assert.equal(
    normalizeApplyUrl("https://www.jobs.lever.co/acme/abc/"),
    "jobs.lever.co/acme/abc",
  );
});

test("the host is lowercased but the path is not", () => {
  // SmartRecruiters company identifiers and Lever/Ashby UUIDs are
  // case-sensitive; lowercasing the path would stop a correct match.
  assert.equal(
    normalizeApplyUrl("https://JOBS.SmartRecruiters.com/BoschGroup/744000143069809"),
    "jobs.smartrecruiters.com/BoschGroup/744000143069809",
  );
});

test("only one apply suffix is stripped, longest first", () => {
  // /apply matched before /application would leave a stray "ation".
  assert.equal(
    normalizeApplyUrl("https://jobs.ashbyhq.com/x/abc/application"),
    "jobs.ashbyhq.com/x/abc",
  );
  assert.equal(normalizeApplyUrl("https://jobs.lever.co/x/abc/apply"), "jobs.lever.co/x/abc");
});

test("a path that merely contains 'apply' is not truncated", () => {
  // Only a trailing suffix counts — an employer whose slug is "apply-now"
  // must survive intact.
  assert.equal(
    normalizeApplyUrl("https://jobs.lever.co/apply-now/abc"),
    "jobs.lever.co/apply-now/abc",
  );
});

test("non-http pages produce no lookup at all", () => {
  for (const bad of ["about:blank", "chrome://extensions", "file:///c:/x.html", "not a url", ""]) {
    assert.equal(normalizeApplyUrl(bad), null, `should not resolve: ${bad}`);
  }
});

test("the supported-host allowlist covers the ATS families in the corpus", () => {
  assert.equal(isSupportedAtsUrl("https://job-boards.greenhouse.io/tripadvisor/jobs/1"), true);
  assert.equal(isSupportedAtsUrl("https://jobs.lever.co/waabi/abc"), true);
  assert.equal(isSupportedAtsUrl("https://jobs.ashbyhq.com/cohere/abc"), true);
  assert.equal(isSupportedAtsUrl("https://jobs.smartrecruiters.com/BoschGroup/1"), true);
  assert.equal(isSupportedAtsUrl("https://example.com/careers"), false);
});

test("linkedin.com is not, and must never be, a supported host", () => {
  // CLAUDE.md: never a live fetch against linkedin.com in any form. A content
  // script reading their DOM would be that rule broken by another mechanism.
  assert.equal(
    (SUPPORTED_ATS_HOSTS as readonly string[]).some((h) => h.includes("linkedin")),
    false,
  );
  assert.equal(isSupportedAtsUrl("https://www.linkedin.com/jobs/view/123"), false);
});

/* ------------------------------------------------------------------ *
 * Frameability — which forms can be filled without leaving Arc
 *
 * Every expectation below is a response header read off the live host on
 * 2026-08-20, four employers sampled per host. They are pinned here because
 * they are facts about someone else's server: if one of these flips, this test
 * is where the change should be noticed and argued about.
 * ------------------------------------------------------------------ */

test("only Greenhouse is embedded today", () => {
  // Sent no X-Frame-Options and no frame-ancestors, rendered inside a page
  // served from our own origin, AND its reCAPTCHA minted a full token in that
  // frame — 2382 chars, identical to top-level. All three were required.
  assert.equal(isFrameableApplyUrl("https://job-boards.greenhouse.io/tripadvisor/jobs/8043141"), true);
  assert.equal(isFrameableApplyUrl("https://boards.greenhouse.io/point72/jobs/7297666002"), true);

  // X-Frame-Options: DENY — unanimous across four sampled employers.
  assert.equal(
    isFrameableApplyUrl("https://jobs.ashbyhq.com/cohere/8c035d3d-081d-4c8a-914a-72f4efaad254"),
    false,
  );
  // X-Frame-Options: SAMEORIGIN — the largest single internship source, and
  // the reason the new-tab flow has to stay.
  assert.equal(isFrameableApplyUrl("https://jobs.smartrecruiters.com/BoschGroup/744000143069809"), false);
});

test("Lever is withheld rather than refused, and the difference is not cosmetic", () => {
  // Lever's headers permit framing and its form renders fine. What was never
  // observed is its invisible hCaptcha minting a token in a frame — it only
  // executes on a real submit gesture, so it timed out top-level too and the
  // measurement was never made. Permission is not evidence.
  const lever = "https://jobs.lever.co/waabi/0fd4e30b-9bd1-4b53-9043-6088457363cb/apply";
  assert.equal(isFrameableApplyUrl(lever), false);
  assert.equal(embedStatus(lever), "withheld");

  // A withheld host is still fully supported — it applies through its own tab
  // exactly as it did before the embedded path existed. Confusing the two
  // would drop 165 open postings out of the extension entirely.
  assert.equal(isSupportedAtsUrl(lever), true);

  // The distinction exists so the page can say the true sentence: calling this
  // "refused" would be a lie about a board that plainly allows framing.
  assert.equal(embedStatus("https://jobs.smartrecruiters.com/BoschGroup/744000143069809"), "refused");
  assert.equal(embedStatus("https://example.com/careers/apply"), "unsupported");
});

test("frameable is a strict subset of supported, never the other way round", () => {
  // A host we would embed but could not fill would be a form the student can
  // look at and nothing else.
  for (const host of [...FRAMEABLE_ATS_HOSTS, ...EMBED_WITHHELD_HOSTS]) {
    assert.ok(
      (SUPPORTED_ATS_HOSTS as readonly string[]).includes(host),
      `${host} is embedded or withheld but not supported by the autofill matcher`,
    );
  }
  assert.ok(FRAMEABLE_ATS_HOSTS.length < SUPPORTED_ATS_HOSTS.length);
});

test("a host is never both embedded and withheld", () => {
  // The two lists are the whole mechanism for holding a host back. If a name
  // appeared in both, the withholding would silently do nothing — which is
  // exactly the failure this pair of lists exists to prevent.
  for (const host of EMBED_WITHHELD_HOSTS) {
    assert.ok(
      !(FRAMEABLE_ATS_HOSTS as readonly string[]).includes(host),
      `${host} is withheld and embedded at the same time`,
    );
  }
});

test("a plaintext or unparseable URL is never framed", () => {
  // Mixed content: the browser blocks it, and an empty box with no error is
  // the worst possible failure here.
  assert.equal(isFrameableApplyUrl("http://jobs.lever.co/waabi/abc"), false);
  assert.equal(isFrameableApplyUrl("not a url"), false);
  assert.equal(isFrameableApplyUrl(""), false);
});

test("linkedin.com is not frameable, as it is not supported", () => {
  // Same standing rule as `isSupportedAtsUrl`: no mechanism, ever.
  assert.equal(isFrameableApplyUrl("https://www.linkedin.com/jobs/view/123"), false);
  assert.ok(!(FRAMEABLE_ATS_HOSTS as readonly string[]).some((h) => h.includes("linkedin")));
});

test("the host banner names the real employer domain, or nothing at all", () => {
  // It is shown in place of the address bar the embed hides, so a placeholder
  // would be worse than an absence.
  assert.equal(
    applyUrlHost("https://job-boards.greenhouse.io/tripadvisor/jobs/8043141"),
    "job-boards.greenhouse.io",
  );
  assert.equal(applyUrlHost("https://JOBS.LEVER.CO/waabi/abc"), "jobs.lever.co");
  assert.equal(applyUrlHost("nonsense"), null);
});
