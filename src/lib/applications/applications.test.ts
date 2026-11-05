import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ApplicationStatus } from "@/db/schema";

import {
  MIN_FOR_RATE,
  STATUSES,
  countByStatus,
  isApplicationStatus,
  responseRate,
  shouldStampAppliedAt,
  statusMeta,
  countActiveSlots,
  occupiesActiveSlot,
  transitionNeedsSlot,
} from "./types";
import { FEATURES } from "@/lib/pricing/tiers";

const rows = (...statuses: ApplicationStatus[]) => statuses.map((status) => ({ status }));

describe("status model", () => {
  it("covers every status in the schema exactly once", () => {
    const values = STATUSES.map((s) => s.value);
    assert.equal(new Set(values).size, values.length);
    for (const v of values) assert.equal(statusMeta(v).value, v);
  });

  it("rejects anything outside the known set", () => {
    assert.equal(isApplicationStatus("applied"), true);
    assert.equal(isApplicationStatus("hired"), false);
    assert.equal(isApplicationStatus(null), false);
    assert.equal(isApplicationStatus(7), false);
  });

  it("treats withdrawn as terminal but not submitted", () => {
    // Pulling out is an ending, but it is not evidence about the employer —
    // counting it as an application would poison the outcome data.
    const m = statusMeta("withdrawn");
    assert.equal(m.terminal, true);
    assert.equal(m.submitted, false);
  });

  it("treats saved as neither", () => {
    assert.equal(statusMeta("saved").terminal, false);
    assert.equal(statusMeta("saved").submitted, false);
  });
});

describe("shouldStampAppliedAt", () => {
  it("stamps on the first status that implies a submission", () => {
    assert.equal(shouldStampAppliedAt("applied", null), true);
    assert.equal(shouldStampAppliedAt("interview", null), true);
  });

  it("does not stamp for saved or withdrawn", () => {
    assert.equal(shouldStampAppliedAt("saved", null), false);
    assert.equal(shouldStampAppliedAt("withdrawn", null), false);
  });

  /*
   * "When did I apply" has one answer. Re-stamping on every advance would
   * rewrite the user's own history and destroy the only timing evidence a
   * future odds model would have.
   */
  it("never moves a stamp that already exists", () => {
    const applied = new Date("2026-03-01T00:00:00Z");
    for (const s of STATUSES) {
      assert.equal(shouldStampAppliedAt(s.value, applied), false, `moved on ${s.value}`);
    }
  });
});

describe("countByStatus", () => {
  it("counts an empty tracker without dividing by anything", () => {
    assert.deepEqual(countByStatus([]), {
      total: 0,
      active: 0,
      submitted: 0,
      offers: 0,
      resolved: 0,
    });
  });

  it("separates in-flight from resolved", () => {
    const c = countByStatus(rows("saved", "applied", "interview", "rejected", "offer", "ghosted"));
    assert.deepEqual(c, { total: 6, active: 3, submitted: 5, offers: 1, resolved: 3 });
  });
});

describe("responseRate", () => {
  /*
   * The rule this product is built on. One reply out of two applications is
   * not a 50% response rate, and showing it as one would be a confident number
   * derived from nothing.
   */
  it("returns null below the threshold rather than a flattering number", () => {
    assert.equal(responseRate(rows("applied", "interview")), null);
    assert.equal(responseRate(rows(...Array(MIN_FOR_RATE - 1).fill("applied"))), null);
  });

  it("ignores rows that were never submitted when deciding it has enough", () => {
    // 12 rows, but only 2 were ever sent anywhere.
    const mixed = rows(...(Array(10).fill("saved") as ApplicationStatus[]), "applied", "interview");
    assert.equal(responseRate(mixed), null);
  });

  it("counts anything past 'applied' as a response, and ghosting as not one", () => {
    const r = responseRate(
      rows(
        "applied", "applied", "applied", "applied", "applied",
        "ghosted", "ghosted",
        "screen", "interview", "offer",
      ),
    );
    assert.deepEqual(r, { rate: 30, of: 10 });
  });

  it("excludes saved rows from the denominator", () => {
    const r = responseRate(
      rows(
        "saved", "saved",
        "applied", "applied", "applied", "applied", "applied",
        "screen", "interview", "offer", "rejected", "ghosted",
      ),
    );
    // 10 submitted, 4 responded (screen, interview, offer, rejected).
    assert.deepEqual(r, { rate: 40, of: 10 });
  });
});

describe("active tracker capacity", () => {
  it("Free holds 10 active opportunities", () => {
    assert.equal(FEATURES.tracker.limits.free, 10);
    assert.equal(FEATURES.tracker.limits.apply, null);
  });

  it("in-flight statuses are active; decisions are history", () => {
    for (const s of ["saved", "applied", "screen", "interview"] as const) assert.equal(occupiesActiveSlot(s, false), true);
    for (const s of ["offer", "rejected", "ghosted", "withdrawn"] as const) assert.equal(occupiesActiveSlot(s, false), false);
  });

  it("a saved row on a closed listing is history; a submitted one is still waiting", () => {
    assert.equal(occupiesActiveSlot("saved", true), false);
    assert.equal(occupiesActiveSlot("applied", true), true);
    assert.equal(occupiesActiveSlot("interview", true), true);
  });

  it("counts only active rows, however long the history", () => {
    const history = Array.from({ length: 40 }, () => ({ status: "rejected" as const, closed: true }));
    const active = Array.from({ length: 3 }, () => ({ status: "applied" as const, closed: false }));
    assert.equal(countActiveSlots([...history, ...active]), 3);
  });

  it("only moves into the active set need a slot", () => {
    assert.equal(transitionNeedsSlot(null, "saved", false), true, "new row");
    assert.equal(transitionNeedsSlot("rejected", "interview", false), true, "reactivating history");
    assert.equal(transitionNeedsSlot("saved", "applied", false), false, "active to active");
    assert.equal(transitionNeedsSlot("applied", "rejected", false), false, "active to history");
    assert.equal(transitionNeedsSlot("withdrawn", "ghosted", false), false, "history to history");
    assert.equal(transitionNeedsSlot(null, "saved", true), false, "saving a closed listing is history");
  });

  it("a downgraded account with 14 active rows can still finish them", () => {
    // Moving any of them into history never needs capacity, so the student is
    // never forced to delete work to keep using the tracker.
    for (const next of ["offer", "rejected", "ghosted", "withdrawn"] as const) {
      assert.equal(transitionNeedsSlot("applied", next, false), false);
    }
  });
});
