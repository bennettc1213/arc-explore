import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  daysUntil,
  reminderKey,
  selectDue,
  urgencyLabel,
  type ReminderCandidate,
} from "./select";

const NOW = new Date("2026-08-14T12:00:00Z");
const inDays = (n: number, hours = 0) =>
  new Date(NOW.getTime() + n * 86_400_000 + hours * 3_600_000);

const candidate = (deadlineAt: Date, postingId = "p1"): ReminderCandidate => ({
  userId: "u1",
  postingId,
  deadlineAt,
});

describe("daysUntil", () => {
  it("counts whole calendar days in UTC", () => {
    assert.equal(daysUntil(inDays(7), NOW), 7);
    assert.equal(daysUntil(inDays(0, 6), NOW), 0);
    assert.equal(daysUntil(inDays(-1), NOW), -1);
  });

  /**
   * The regression this replaced. A deadline stored at midnight on the 15th,
   * read late on the 14th, is hours away as an instant — which produced a
   * subject saying "closes today" above a body saying "Closes: 2026-08-15".
   * The countdown and the printed date have to be the same fact.
   */
  it("agrees with the date the email prints, whatever the time of day", () => {
    const lateOnThe14th = new Date("2026-08-14T22:30:00Z");
    const midnightOnThe15th = new Date("2026-08-15T00:00:00Z");
    assert.equal(daysUntil(midnightOnThe15th, lateOnThe14th), 1);

    const earlyOnThe14th = new Date("2026-08-14T00:30:00Z");
    assert.equal(daysUntil(midnightOnThe15th, earlyOnThe14th), 1);
  });

  it("treats any time on the deadline's own date as zero", () => {
    const now = new Date("2026-08-14T01:00:00Z");
    assert.equal(daysUntil(new Date("2026-08-14T23:59:00Z"), now), 0);
    assert.equal(daysUntil(new Date("2026-08-14T00:00:00Z"), now), 0);
  });
});

describe("selectDue", () => {
  const none = new Set<string>();

  it("sends nothing for a deadline beyond the widest window", () => {
    assert.deepEqual(selectDue([candidate(inDays(20))], none, NOW), []);
  });

  /**
   * The real lifecycle: one deadline, the job running every day, each send
   * recorded. This is the behaviour that matters — a single-call assertion
   * would miss that a window only fires once the larger ones are spent.
   */
  it("fires each window exactly once across a run of daily jobs", () => {
    const deadline = new Date("2026-09-04T12:00:00Z"); // 21 days out
    const sent = new Set<string>();
    const fired: Array<{ day: number; window: number; daysLeft: number }> = [];

    for (let day = 0; day <= 21; day++) {
      const now = new Date(NOW.getTime() + day * 86_400_000);
      for (const due of selectDue([candidate(deadline)], sent, now)) {
        fired.push({ day, window: due.window, daysLeft: due.daysLeft });
        sent.add(reminderKey("u1", "p1", due.window, deadline));
      }
    }

    assert.deepEqual(fired, [
      { day: 7, window: 14, daysLeft: 14 },
      { day: 14, window: 7, daysLeft: 7 },
      { day: 20, window: 1, daysLeft: 1 },
    ]);
  });

  /**
   * The window and the days remaining are different numbers, and the email
   * must state the second. A student saving something nine days out gets the
   * 14-day window, and "14 days left" would be a lie.
   */
  it("reports days actually left, not the window that fired", () => {
    const [due] = selectDue([candidate(inDays(9))], none, NOW);
    assert.equal(due.window, 14);
    assert.equal(due.daysLeft, 9);
  });

  // Three emails in one morning about one scholarship is how you get marked
  // as spam by the person you are trying to help.
  it("sends at most one reminder per posting per run", () => {
    const due = selectDue([candidate(inDays(1))], none, NOW);
    assert.equal(due.length, 1);
    assert.equal(due[0].window, 14, "largest unsent window wins");
  });

  it("does not repeat a window it has already sent", () => {
    const c = candidate(inDays(7));
    const sent = new Set([reminderKey("u1", "p1", 14, c.deadlineAt)]);
    const due = selectDue([c], sent, NOW);
    assert.equal(due.length, 1);
    assert.equal(due[0].window, 7, "falls through to the next unsent window");
  });

  it("goes quiet once every window has fired", () => {
    const c = candidate(inDays(1));
    const sent = new Set(
      [14, 7, 1].map((w) => reminderKey("u1", "p1", w, c.deadlineAt)),
    );
    assert.deepEqual(selectDue([c], sent, NOW), []);
  });

  /**
   * A sponsor moving a deadline is a genuinely new fact. The unique key
   * includes the deadline precisely so a move re-arms the reminder instead of
   * being suppressed by what we sent about the old date.
   */
  it("re-arms when the deadline itself moves", () => {
    const original = inDays(7);
    const moved = inDays(10);
    const sent = new Set([reminderKey("u1", "p1", 14, original)]);

    const due = selectDue([candidate(moved)], sent, NOW);
    assert.equal(due.length, 1);
    assert.equal(due[0].window, 14);
  });

  it("skips a deadline that has already passed", () => {
    assert.deepEqual(selectDue([candidate(inDays(-1))], none, NOW), []);
    assert.deepEqual(selectDue([candidate(inDays(-40))], none, NOW), []);
  });

  it("handles several postings independently", () => {
    const due = selectDue(
      [candidate(inDays(3), "p1"), candidate(inDays(60), "p2"), candidate(inDays(0), "p3")],
      none,
      NOW,
    );
    assert.deepEqual(due.map((d) => d.candidate.postingId).sort(), ["p1", "p3"]);
  });
});

describe("urgencyLabel", () => {
  it("reads naturally at the edges", () => {
    assert.equal(urgencyLabel(0), "closes today");
    assert.equal(urgencyLabel(1), "closes tomorrow");
    assert.equal(urgencyLabel(9), "closes in 9 days");
  });
});
