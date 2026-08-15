import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEAD_STRIKES_REQUIRED,
  applyCheck,
  classifyStatus,
  hostOf,
  interleaveByHost,
  isFlaggedDead,
  type UrlHealth,
} from "./linkcheck";

const FRESH: UrlHealth = { urlStatus: null, urlDeadStrikes: 0, urlDeadSince: null };
const T1 = new Date("2026-08-15T00:00:00Z");
const T2 = new Date("2026-08-16T00:00:00Z");
const T3 = new Date("2026-08-17T00:00:00Z");

test("only 404 and 410 count as evidence the page is gone", () => {
  assert.equal(classifyStatus(404), "dead");
  assert.equal(classifyStatus(410), "dead");

  assert.equal(classifyStatus(200), "alive");
  assert.equal(classifyStatus(301), "alive");

  // Each of these lies in a different direction. 403 is a WAF refusing a
  // request with no browser behind it; 429 is a fact about us, not the posting;
  // 5xx is the host having a bad minute.
  for (const status of [401, 403, 405, 429, 500, 503]) {
    assert.equal(classifyStatus(status), "inconclusive", `${status}`);
  }

  // A timeout or DNS failure is our problem, not the employer's.
  assert.equal(classifyStatus(null), "inconclusive");
});

test("one 404 is never enough to flag a posting", () => {
  const after = applyCheck(FRESH, { status: 404, at: T1 });
  assert.equal(after.urlDeadStrikes, 1);
  assert.equal(after.urlDeadSince, null);
  assert.equal(isFlaggedDead(after), false);
});

test("two consecutive 404s flag it, and the timestamp never moves after that", () => {
  const one = applyCheck(FRESH, { status: 404, at: T1 });
  const two = applyCheck(one, { status: 404, at: T2 });
  assert.equal(isFlaggedDead(two), true);
  assert.equal(two.urlDeadSince?.toISOString(), T2.toISOString());

  // Stamped once and left alone, the same rule applied_at follows in the
  // tracker: it should read "dead since we had enough evidence", not "since
  // last night".
  const three = applyCheck(two, { status: 404, at: T3 });
  assert.equal(three.urlDeadSince?.toISOString(), T2.toISOString());
  assert.equal(three.urlDeadStrikes, 3);
});

test("a single good answer clears everything", () => {
  const dead = applyCheck(applyCheck(FRESH, { status: 404, at: T1 }), { status: 404, at: T2 });
  const recovered = applyCheck(dead, { status: 200, at: T3 });
  assert.equal(recovered.urlDeadStrikes, 0);
  assert.equal(recovered.urlDeadSince, null);
  assert.equal(isFlaggedDead(recovered), false);
});

test("an inconclusive answer neither adds nor erases evidence", () => {
  /*
   * The case this exists for: 404, then a WAF 403, then 404 again. That posting
   * is probably dead, and resetting on the middle answer would mean a flaky
   * host can never accumulate enough evidence to be flagged. Equally, the 403
   * must not itself count as a strike.
   */
  const one = applyCheck(FRESH, { status: 404, at: T1 });
  const blocked = applyCheck(one, { status: 403, at: T2 });
  assert.equal(blocked.urlDeadStrikes, 1);
  assert.equal(isFlaggedDead(blocked), false);

  const two = applyCheck(blocked, { status: 404, at: T3 });
  assert.equal(two.urlDeadStrikes, DEAD_STRIKES_REQUIRED);
  assert.equal(isFlaggedDead(two), true);
});

test("a rate limit never accumulates toward dead", () => {
  let health = FRESH;
  for (let i = 0; i < 5; i++) health = applyCheck(health, { status: 429, at: T1 });
  assert.equal(health.urlDeadStrikes, 0);
  assert.equal(isFlaggedDead(health), false);
});

test("hosts are read off the URL, and rubbish does not throw", () => {
  assert.equal(hostOf("https://boards.greenhouse.io/acme/jobs/1"), "boards.greenhouse.io");
  assert.equal(hostOf("HTTPS://Example.COM/x"), "example.com");
  assert.equal(hostOf("not a url"), null);
});

test("a batch is interleaved so one host is never hit twice in a row", () => {
  // Our corpus is concentrated — hundreds of postings share one Greenhouse
  // host — so database order means hammering a single origin.
  const items = [
    { url: "https://a.com/1" },
    { url: "https://a.com/2" },
    { url: "https://a.com/3" },
    { url: "https://b.com/1" },
    { url: "https://c.com/1" },
  ];
  const ordered = interleaveByHost(items, (i) => i.url);

  assert.equal(ordered.length, items.length);
  const hosts = ordered.map((i) => hostOf(i.url));
  for (let i = 1; i < hosts.length; i++) {
    if (hosts[i] === hosts[i - 1]) {
      // Only allowed once the smaller queues are exhausted.
      assert.ok(i >= 3, `same host back to back too early at ${i}: ${hosts.join(",")}`);
    }
  }
});

test("interleaving keeps every item exactly once", () => {
  const items = Array.from({ length: 37 }, (_, i) => ({
    url: `https://host${i % 4}.com/${i}`,
  }));
  const ordered = interleaveByHost(items, (i) => i.url);
  assert.equal(ordered.length, 37);
  assert.equal(new Set(ordered.map((i) => i.url)).size, 37);
});
