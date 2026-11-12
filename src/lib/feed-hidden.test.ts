import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeHidden, summarizeNew, type HiddenSourceRow } from "./feed-hidden";

function row(id: string, over: Partial<HiddenSourceRow> = {}): HiddenSourceRow {
  return {
    id,
    kind: "internship",
    fit: { score: 50, blocked: false },
    timing: { label: "still open", hoursSinceFirstSeen: 200, daysUntilDeadline: null, isClosed: false },
    amountStatus: "varies",
    amountMin: null,
    amountMax: null,
    amountIsEstimated: false,
    ...over,
  };
}

describe("summarizeHidden", () => {
  it("counts only rows that were not shown", () => {
    const ranked = [row("a"), row("b"), row("c")];
    const s = summarizeHidden(ranked, [{ id: "a" }]);
    assert.equal(s.count, 2);
  });

  it("counts Strong Fit by the same bucket the badge uses, and never a blocked row", () => {
    const ranked = [
      row("s1", { fit: { score: 70, blocked: false } }),
      row("s2", { fit: { score: 95, blocked: true } }),
      row("g", { fit: { score: 69, blocked: false } }),
      row("u", { fit: { score: null, blocked: false } }),
    ];
    const s = summarizeHidden(ranked, []);
    assert.equal(s.strongFit, 1);
    assert.deepEqual(s.preview.map((p) => p.bucket), ["strong", null, "good"]);
  });

  it("treats an unstated deadline as unknown, not as closing soon", () => {
    const t = (d: number | null, closed = false) => ({ label: "x", hoursSinceFirstSeen: 100, daysUntilDeadline: d, isClosed: closed });
    const ranked = [
      row("a", { timing: t(0) }),
      row("b", { timing: t(14) }),
      row("c", { timing: t(15) }),
      row("d", { timing: t(null) }),
      row("e", { timing: t(-1) }),
      row("f", { timing: t(3, true) }),
    ];
    assert.equal(summarizeHidden(ranked, []).closingSoon, 2);
  });

  it("counts found today on our own clock, under 24 hours", () => {
    const ranked = [
      row("a", { timing: { label: "found 5m ago", hoursSinceFirstSeen: 0.1, daysUntilDeadline: null, isClosed: false } }),
      row("b", { timing: { label: "found yesterday", hoursSinceFirstSeen: 24, daysUntilDeadline: null, isClosed: false } }),
    ];
    assert.equal(summarizeHidden(ranked, []).foundToday, 1);
  });

  it("adds only confirmed scholarship awards to the total", () => {
    const ranked = [
      row("exact", { kind: "scholarship", amountStatus: "exact", amountMin: 5000, amountMax: 5000 }),
      row("range", { kind: "scholarship", amountStatus: "range", amountMin: 1000, amountMax: 4000 }),
      row("ceiling", { kind: "scholarship", amountStatus: "range", amountMin: null, amountMax: 22000 }),
      row("estimated", { kind: "scholarship", amountStatus: "exact", amountMin: 3000, amountIsEstimated: true }),
      row("program-total", { kind: "scholarship", amountStatus: "exact", amountMin: 450000 }),
      row("pay", { kind: "internship", amountStatus: "exact", amountMin: 9000 }),
    ];
    const s = summarizeHidden(ranked, []);
    assert.equal(s.awardsConfirmed, 2);
    assert.equal(s.awardTotal, 6000);
  });

  it("previews carry no title, sponsor, id or url", () => {
    const ranked = [row("secret-id")];
    const s = summarizeHidden(ranked, []);
    assert.deepEqual(Object.keys(s.preview[0]).sort(), ["bucket", "kind", "timingLabel"]);
    assert.ok(!JSON.stringify(s).includes("secret-id"));
  });
});

describe("summarizeNew", () => {
  const since = new Date("2026-11-10T00:00:00Z");
  const at = (iso: string) => new Date(iso);
  it("counts only rows first seen after the previous visit, and how many the plan hides", () => {
    const ranked = [
      { ...row("old"), firstSeenAt: at("2026-11-09T00:00:00Z") },
      { ...row("new-shown", { fit: { score: 80, blocked: false } }), firstSeenAt: at("2026-11-11T00:00:00Z") },
      { ...row("new-hidden"), firstSeenAt: at("2026-11-11T05:00:00Z") },
      { ...row("new-blocked", { fit: { score: 90, blocked: true } }), firstSeenAt: at("2026-11-11T06:00:00Z") },
    ];
    assert.deepEqual(summarizeNew(ranked, [{ id: "old" }, { id: "new-shown" }], since), {
      total: 3,
      strongFit: 1,
      beyondShown: 2,
    });
  });
});
