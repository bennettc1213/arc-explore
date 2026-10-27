import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { FitResult } from "@/lib/score/fit";

import { estimateEffort } from "./effort";
import {
  amountCeiling,
  buildPlanPayload,
  confirmedAmount,
  eligibilityFrom,
  fundingTotals,
  nextMoves,
  parseExploreView,
  parseFundingGoal,
  selectRows,
  SIGNED_OUT_CARD_CAP,
  type PlanInput,
  type ScholarshipCardData,
} from "./plan";

const effort = (essays: number, letters: number) => estimateEffort({ essays, letters });

function input(id: string, over: Partial<PlanInput> = {}): PlanInput {
  return {
    id,
    amount: 1_000,
    effort: effort(1, 0), // 2.5 hrs
    essays: 1,
    daysUntilDeadline: 30,
    isMarketing: false,
    eligibility: "unknown",
    closed: false,
    ...over,
  };
}

/** The fixtures the brief names, built through the same amount rule the server uses. */
const UNPARSEABLE = input("unparseable", {
  amount: confirmedAmount({ amountStatus: "unparseable", amountMin: null, amountMax: null, amountIsEstimated: false }),
});
const ZERO = input("zero", {
  amount: confirmedAmount({ amountStatus: "exact", amountMin: 0, amountMax: 0, amountIsEstimated: false }),
});
const MARKETING = input("marketing", { amount: 50_000, effort: effort(0, 0), essays: 0, isMarketing: true });
const CLOSED = input("closed", { amount: 90_000, effort: effort(0, 0), essays: 0, closed: true, daysUntilDeadline: 2 });
const UNKNOWN_EFFORT = input("unknown-effort", { amount: 80_000, effort: null, essays: null });

const FIXTURES = [UNPARSEABLE, ZERO, MARKETING, CLOSED, UNKNOWN_EFFORT];

describe("confirmedAmount", () => {
  test("unparseable, $0, varies and estimated amounts are unknown, never zero", () => {
    assert.equal(UNPARSEABLE.amount, null);
    assert.equal(ZERO.amount, null);
    assert.equal(
      confirmedAmount({ amountStatus: "varies", amountMin: null, amountMax: null, amountIsEstimated: false }),
      null,
    );
    assert.equal(
      confirmedAmount({ amountStatus: "exact", amountMin: 2_000, amountMax: 2_000, amountIsEstimated: true }),
      null,
    );
  });

  test("a range counts as its lower bound", () => {
    assert.equal(
      confirmedAmount({ amountStatus: "range", amountMin: 500, amountMax: 5_000, amountIsEstimated: false }),
      500,
    );
  });

  test("an 'up to' range is a ceiling, not a confirmed amount", () => {
    const upTo = { amountStatus: "range", amountMin: null, amountMax: 22_000, amountIsEstimated: false } as const;
    assert.equal(confirmedAmount(upTo), null);
    assert.equal(amountCeiling(upTo), 22_000);
    assert.equal(
      amountCeiling({ amountStatus: "range", amountMin: 500, amountMax: 5_000, amountIsEstimated: false }),
      null,
    );
  });

  test("a per-award figure beyond the plausibility bound is unknown — the live program-total rows", () => {
    // AIEF ($450,000, program total $101M) and Mensa ($175,000), both stored as per-award.
    for (const amount of [450_000, 175_000]) {
      assert.equal(
        confirmedAmount({ amountStatus: "exact", amountMin: amount, amountMax: amount, amountIsEstimated: false }),
        null,
      );
    }
    assert.equal(
      confirmedAmount({ amountStatus: "exact", amountMin: 22_000, amountMax: 22_000, amountIsEstimated: false }),
      22_000,
    );
  });
});

describe("nextMoves", () => {
  test("excludes every fixture that lacks a known amount, a known effort, or is marketing/closed", () => {
    assert.deepEqual(nextMoves(FIXTURES), []);
  });

  test("ranks by dollars per estimated hour", () => {
    const cheap = input("cheap", { amount: 1_000, effort: effort(0, 0) }); // 1000 / 0.5
    const big = input("big", { amount: 10_000, effort: effort(2, 2) }); // 10000 / 7.5
    const mid = input("mid", { amount: 3_000, effort: effort(1, 0) }); // 3000 / 2.5
    const ranked = nextMoves([mid, cheap, big, ...FIXTURES]).map((m) => m.id);
    assert.deepEqual(ranked, ["cheap", "big", "mid"]);
  });

  test("ties break on the nearest deadline", () => {
    const later = input("later", { daysUntilDeadline: 40 });
    const sooner = input("sooner", { daysUntilDeadline: 10 });
    assert.deepEqual(nextMoves([later, sooner]).map((m) => m.id), ["sooner", "later"]);
  });

  test("needs a deadline at least 3 days out — a missing deadline does not qualify", () => {
    const tooSoon = input("soon", { daysUntilDeadline: 2 });
    const none = input("none", { daysUntilDeadline: null });
    const ok = input("ok", { daysUntilDeadline: 3 });
    assert.deepEqual(nextMoves([tooSoon, none, ok]).map((m) => m.id), ["ok"]);
  });

  test("drops listings the profile conflicts with", () => {
    assert.deepEqual(nextMoves([input("x", { eligibility: "check" })]), []);
  });

  test("returns fewer than three when fewer qualify", () => {
    assert.equal(nextMoves([input("only"), ...FIXTURES]).length, 1);
  });
});

describe("selectRows", () => {
  const ids = (rows: ReturnType<typeof selectRows>["rows"], id: string) =>
    rows.find((r) => r.id === id)?.ids ?? null;

  test("quick wins: known effort ≤ 2 hrs, no marketing, sorted by amount", () => {
    const quick = [300, 900, 600].map((amount, i) =>
      input(`q${i}`, { amount, effort: effort(0, 1) }), // 2 hrs
    );
    const { rows } = selectRows([...quick, ...FIXTURES, input("slow", { effort: effort(1, 0) })]);
    assert.deepEqual(ids(rows, "quick-wins"), ["q1", "q2", "q0"]);
  });

  test("closing this week: 0–7 days, nearest first, closed excluded", () => {
    const week = [6, 1, 7, 0].map((d, i) => input(`c${i}`, { daysUntilDeadline: d }));
    const { rows } = selectRows([...week, input("past", { daysUntilDeadline: -1 }), input("far", { daysUntilDeadline: 8 }), CLOSED]);
    assert.deepEqual(ids(rows, "closing-week"), ["c3", "c1", "c0", "c2"]);
  });

  test("big swings: confirmed amount ≥ $5,000 only — unknown effort is fine, unknown amount is not", () => {
    const { rows } = selectRows([
      input("a", { amount: 5_000 }),
      input("b", { amount: 20_000 }),
      UNKNOWN_EFFORT,
      UNPARSEABLE,
      ZERO,
      input("small", { amount: 4_999 }),
    ]);
    assert.deepEqual(ids(rows, "big-swings"), ["unknown-effort", "b", "a"]);
  });

  test("no-essay: essay count known and zero; unknown essays never count as none", () => {
    const zero = ["n0", "n1", "n2"].map((id) => input(id, { essays: 0 }));
    const { rows } = selectRows([...zero, UNKNOWN_EFFORT]);
    assert.deepEqual(ids(rows, "no-essay")?.sort(), ["n0", "n1", "n2"]);
  });

  test("a row with fewer than three cards is hidden, with its reason", () => {
    const { rows, hidden } = selectRows([input("a", { amount: 6_000 }), input("b", { amount: 7_000 })]);
    assert.equal(ids(rows, "big-swings"), null);
    assert.match(hidden.find((h) => h.id === "big-swings")!.reason, /only 2/);
  });

  test("local and almost-eligible are always hidden — the data does not exist", () => {
    const { hidden } = selectRows([]);
    assert.ok(hidden.some((h) => h.id === "local"));
    assert.ok(hidden.some((h) => h.id === "almost-eligible"));
  });

  test("rows hold at most eight cards", () => {
    const many = Array.from({ length: 12 }, (_, i) => input(`m${i}`, { amount: 9_000 + i }));
    assert.equal(ids(selectRows(many).rows, "big-swings")?.length, 8);
  });
});

// ── Locking ──────────────────────────────────────────────────────────────────

function card(id: string): ScholarshipCardData {
  return {
    id,
    title: `TITLE-${id}`,
    sponsor: `SPONSOR-${id}`,
    url: `https://sponsor.example/${id}`,
    sourceHost: "sponsor.example",
    viaAggregator: false,
    amountLabel: "$9,000",
    deadlineLabel: null,
    closesLabel: null,
    effortLabel: "Effort unknown",
    eligibility: "unknown",
    why: "",
    fit: { score: null, reasons: [], skills: { matched: [], missing: [] }, bucketLabel: null, locked: false },
    verifiedLabel: "checked today",
    isMarketing: false,
    lowTrust: false,
    tracked: null,
  };
}

describe("buildPlanPayload — server-side locking", () => {
  // 20 big swings, all closing this week too, so the same ids recur across rows.
  const inputs = Array.from({ length: 20 }, (_, i) =>
    input(`p${i}`, { amount: 10_000 + i, effort: effort(0, 0), daysUntilDeadline: 3 + (i % 5) }),
  );
  const cards = new Map(inputs.map((i) => [i.id, card(i.id)]));

  test("signed out: at most the cap of distinct real cards, everything else locked", () => {
    const payload = buildPlanPayload(inputs, cards, { cap: SIGNED_OUT_CARD_CAP });
    const slots = [...payload.nextMoves, ...payload.rows.flatMap((r) => r.slots)];
    const revealed = new Set(slots.flatMap((s) => (s.locked ? [] : [s.card.id])));
    assert.ok(revealed.size <= SIGNED_OUT_CARD_CAP);
    assert.ok(payload.lockedCount > 0);
  });

  test("locked content never appears anywhere in the serialised response", () => {
    const payload = buildPlanPayload(inputs, cards, { cap: SIGNED_OUT_CARD_CAP });
    const slots = [...payload.nextMoves, ...payload.rows.flatMap((r) => r.slots)];
    const revealed = new Set(slots.flatMap((s) => (s.locked ? [] : [s.card.id])));
    const json = JSON.stringify(payload);
    for (const i of inputs) {
      if (revealed.has(i.id)) continue;
      assert.equal(json.includes(`TITLE-${i.id}"`), false, `title of ${i.id} leaked`);
      assert.equal(json.includes(`SPONSOR-${i.id}"`), false, `sponsor of ${i.id} leaked`);
      assert.equal(json.includes(`sponsor.example/${i.id}"`), false, `link of ${i.id} leaked`);
      assert.equal(json.includes(`"${i.id}"`), false, `id of ${i.id} leaked`);
    }
    for (const s of slots) {
      if (s.locked) assert.deepEqual(Object.keys(s).sort(), ["key", "locked"]);
    }
  });

  test("a card revealed once stays revealed where it recurs", () => {
    const payload = buildPlanPayload(inputs, cards, { cap: 3 });
    const first = payload.nextMoves.flatMap((s) => (s.locked ? [] : [s.card.id]));
    for (const row of payload.rows) {
      for (const s of row.slots) {
        if (s.locked) continue;
        assert.ok(first.includes(s.card.id), "a row revealed a card beyond the cap");
      }
    }
  });

  test("signed in (no cap): nothing is locked", () => {
    const payload = buildPlanPayload(inputs, cards, { cap: null });
    assert.equal(payload.lockedCount, 0);
  });

  test("counts report how many listings carry each fact", () => {
    const payload = buildPlanPayload(FIXTURES, new Map(), { cap: null });
    // closed is not counted; marketing + unknown-effort carry an amount;
    // unparseable, zero and marketing carry an effort.
    assert.deepEqual(payload.counts, { listings: 4, amountKnown: 2, effortKnown: 3 });
  });
});

describe("eligibilityFrom", () => {
  const fit = (over: Partial<FitResult>): FitResult => ({
    score: 50,
    reasons: [],
    blocked: false,
    knownDimensions: 1,
    totalDimensions: 3,
    skills: { matched: [], missing: [] },
    ...over,
  });

  test("a matched field is likely eligible, a different field is a check, nothing stated is unknown", () => {
    assert.equal(eligibilityFrom(fit({ reasons: [{ label: "", dimension: "field", kind: "good", detail: "" }] })), "eligible");
    assert.equal(eligibilityFrom(fit({ reasons: [{ label: "", dimension: "field", kind: "bad", detail: "" }] })), "check");
    assert.equal(eligibilityFrom(fit({})), "unknown");
    assert.equal(eligibilityFrom(fit({ blocked: true })), "check");
  });
});

describe("fundingTotals", () => {
  const submitted = (s: string) => s !== "saved" && s !== "withdrawn";

  test("sums confirmed dollars by status, counts unconfirmed separately, ignores withdrawn", () => {
    const totals = fundingTotals(
      [
        { status: "applied", amount: 2_000 },
        { status: "rejected", amount: 1_000 },
        { status: "saved", amount: 500 },
        { status: "saved", amount: null },
        { status: "withdrawn", amount: 9_000 },
      ],
      submitted,
    );
    assert.deepEqual(totals, { submitted: 3_000, saved: 500, unconfirmed: 1 });
  });
});

describe("parseFundingGoal", () => {
  test("accepts typed dollar amounts and rejects nonsense", () => {
    assert.equal(parseFundingGoal("$12,500"), 12_500);
    assert.equal(parseFundingGoal("8000"), 8_000);
    assert.equal(parseFundingGoal("0"), null);
    assert.equal(parseFundingGoal("-5"), null);
    assert.equal(parseFundingGoal("lots"), null);
    assert.equal(parseFundingGoal("99999999"), null);
  });
});

describe("parseExploreView", () => {
  test("defaults to plan; list is honoured; the unbuilt map falls back to plan", () => {
    assert.equal(parseExploreView(undefined), "plan");
    assert.equal(parseExploreView("list"), "list");
    assert.equal(parseExploreView(["list", "plan"]), "list");
    assert.equal(parseExploreView("map"), "plan");
    assert.equal(parseExploreView("garbage"), "plan");
  });
});
