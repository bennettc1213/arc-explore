import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationStatus, PostingKind } from "@/db/schema";
import { countByStatus } from "@/lib/applications/types";

import { RECENT_LIMIT, agoLabel, formatDollars, summarizeActivity, type ActivityRow } from "./summary";

const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

let seq = 0;
const row = (
  status: ApplicationStatus,
  kind: PostingKind = "internship",
  updatedAt: Date = NOW,
  title = `listing ${++seq}`,
): ActivityRow => ({ postingId: `p${seq}`, status, kind, title, company: "Acme", updatedAt });

describe("summarizeActivity", () => {
  it("returns honest zeros for a student with nothing tracked", () => {
    const s = summarizeActivity([], NOW);
    assert.equal(s.counts.total, 0);
    assert.equal(s.counts.submitted, 0);
    assert.equal(s.saved, 0);
    assert.deepEqual(s.pipeline, []);
    assert.deepEqual(s.recent, []);
  });

  it("uses the tracker's own definition of submitted", () => {
    const rows = [
      row("saved"),
      row("applied"),
      row("interview", "scholarship"),
      row("rejected"),
      row("withdrawn"),
    ];
    // One definition per rule: whatever the tracker counts, the portal counts.
    assert.equal(summarizeActivity(rows, NOW).counts.submitted, countByStatus(rows).submitted);
    // Withdrawing is an ending, not evidence about the employer.
    assert.equal(summarizeActivity(rows, NOW).counts.submitted, 3);
  });

  it("splits saved from awaiting-a-decision, and neither counts a finished application", () => {
    const rows = [
      row("saved"),
      row("saved", "scholarship"),
      row("applied"),
      row("screen"),
      row("interview"),
      row("offer"),
      row("rejected"),
      row("ghosted"),
    ];
    const s = summarizeActivity(rows, NOW);
    assert.equal(s.saved, 2);
    assert.equal(s.awaiting, 3);
    assert.equal(s.counts.offers, 1);
  });

  it("counts scholarships — the rows the tracker's inner join silently drops", () => {
    const rows = [row("applied", "scholarship"), row("applied", "scholarship"), row("saved", "internship")];
    const s = summarizeActivity(rows, NOW);
    assert.deepEqual(s.byKind.scholarship, { tracked: 2, submitted: 2 });
    assert.deepEqual(s.byKind.internship, { tracked: 1, submitted: 0 });
  });

  it("lists only statuses that hold something, in the order a real process runs", () => {
    const s = summarizeActivity([row("offer"), row("saved"), row("saved"), row("interview")], NOW);
    assert.deepEqual(
      s.pipeline.map((p) => [p.status, p.count]),
      [
        ["saved", 2],
        ["interview", 1],
        ["offer", 1],
      ],
    );
  });

  it("shows the most recently touched rows first, capped", () => {
    const rows = Array.from({ length: RECENT_LIMIT + 3 }, (_, i) =>
      row("applied", "internship", daysAgo(i), `role ${i}`),
    );
    const s = summarizeActivity(rows.reverse(), NOW);
    assert.equal(s.recent.length, RECENT_LIMIT);
    assert.equal(s.recent[0].title, "role 0");
    assert.equal(s.recent[0].ago, "today");
    assert.equal(s.recent[RECENT_LIMIT - 1].title, `role ${RECENT_LIMIT - 1}`);
  });
});

describe("agoLabel", () => {
  it("is coarse on purpose", () => {
    assert.equal(agoLabel(NOW, NOW), "today");
    assert.equal(agoLabel(daysAgo(1), NOW), "yesterday");
    assert.equal(agoLabel(daysAgo(6), NOW), "6d ago");
    assert.equal(agoLabel(daysAgo(65), NOW), "2mo ago");
  });

  it("never reports a future date as negative days", () => {
    assert.equal(agoLabel(new Date(NOW.getTime() + 3_600_000), NOW), "today");
  });
});

describe("formatDollars", () => {
  it("states whole dollars with thousands separators", () => {
    assert.equal(formatDollars(0), "$0");
    assert.equal(formatDollars(12500), "$12,500");
    assert.equal(formatDollars(1234567), "$1,234,567");
  });
});
