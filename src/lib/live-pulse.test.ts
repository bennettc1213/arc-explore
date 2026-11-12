import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describePulse, type LivePulse } from "./live-pulse";

const now = new Date("2026-11-12T12:00:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

function pulse(over: Partial<LivePulse> = {}): LivePulse {
  return {
    boardsCheckedLastHour: 812,
    lastCheckAt: minsAgo(4),
    newLast24h: 264,
    closedLast24h: 0,
    measuredAt: now.toISOString(),
    ...over,
  };
}

describe("describePulse", () => {
  it("states the hour's work when the crawler is running", () => {
    const d = describePulse(pulse(), now);
    assert.equal(d.state, "live");
    assert.equal(d.lastCheck, "last board check 4m ago");
    assert.deepEqual(d.facts, ["812 employer boards checked in the last hour", "264 new listings found in 24h"]);
  });

  it("says paused rather than hiding when the last check is stale", () => {
    const d = describePulse(pulse({ lastCheckAt: minsAgo(180), boardsCheckedLastHour: 0 }), now);
    assert.equal(d.state, "paused");
    assert.equal(d.lastCheck, "last board check 3h ago");
    // No "boards checked in the last hour" claim while paused.
    assert.ok(!d.facts.some((f) => f.includes("last hour")));
  });

  it("reports closures in the last day", () => {
    const d = describePulse(pulse({ closedLast24h: 31 }), now);
    assert.ok(d.facts.includes("31 closed in 24h"));
  });

  it("claims nothing when no board has ever been checked", () => {
    assert.deepEqual(describePulse(pulse({ lastCheckAt: null }), now), { state: "unknown", lastCheck: null, facts: [] });
  });
});
