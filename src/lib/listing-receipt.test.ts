import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeReceipt, linkCheckLine, type ReceiptFacts } from "./listing-receipt";

const now = new Date("2026-11-12T12:00:00Z");

function facts(over: Partial<ReceiptFacts> = {}): ReceiptFacts {
  return {
    kind: "internship",
    url: "https://job-boards.greenhouse.io/acme/jobs/1",
    sources: ["greenhouse"],
    firstSeenAt: "2026-11-10T14:14:00Z",
    lastSeenAt: "2026-11-12T11:51:00Z",
    confirmedAt: "2026-11-12T11:51:00Z",
    urlCheckedAt: "2026-11-11T08:00:00Z",
    urlStatus: 200,
    reopenCount: 0,
    closedAt: null,
    ...over,
  };
}

const value = (lines: ReturnType<typeof describeReceipt>, label: string) => lines.find((l) => l.label === label)?.value;

describe("describeReceipt", () => {
  it("states each observation with where and when", () => {
    const lines = describeReceipt(facts(), now);
    assert.equal(value(lines, "source"), "job-boards.greenhouse.io via greenhouse");
    assert.equal(value(lines, "first found by us"), "Nov 10, 2026, 14:14 UTC (45h ago)");
    assert.equal(value(lines, "still listed"), "confirmed on the employer's own board 9m ago");
    assert.match(value(lines, "apply link")!, /^opened \(200\)/);
  });

  it("never claims an employer-board confirmation it does not hold", () => {
    const lines = describeReceipt(facts({ confirmedAt: null }), now);
    assert.equal(value(lines, "still listed"), "last seen in a source listing 9m ago");
  });

  it("says closed instead of still listed", () => {
    const lines = describeReceipt(facts({ closedAt: "2026-11-11T00:00:00Z" }), now);
    assert.equal(lines.find((l) => l.label === "still listed"), undefined);
    assert.match(value(lines, "status")!, /^closed/);
  });

  it("treats a blocked link check as no information, and one 404 as not proof", () => {
    const at = new Date("2026-11-11T08:00:00Z");
    assert.match(linkCheckLine(403, at).value, /^could not tell \(403\)/);
    assert.match(linkCheckLine(404, at).value, /not proof/);
    assert.equal(linkCheckLine(null, null).value, "not checked yet");
  });
});
