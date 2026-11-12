import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sinceLabel } from "./visit-label";

describe("sinceLabel", () => {
  const now = new Date("2026-11-12T15:00:00Z"); // a Thursday
  it("words a same-day gap in hours", () => {
    assert.equal(sinceLabel(new Date("2026-11-12T09:30:00Z"), now), "in the last 5 hours");
    assert.equal(sinceLabel(new Date("2026-11-12T14:20:00Z"), now), "in the last hour");
  });
  it("uses yesterday, then the weekday, then a date", () => {
    assert.equal(sinceLabel(new Date("2026-11-11T22:00:00Z"), now), "since yesterday");
    assert.equal(sinceLabel(new Date("2026-11-10T08:00:00Z"), now), "since Tuesday");
    assert.equal(sinceLabel(new Date("2026-10-30T08:00:00Z"), now), "since Oct 30");
  });
});
