import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rankingScore, scoreFit, type FitResult, type ScoreProfile, type ScorePosting } from "./fit";
import { scoreTiming } from "./timing";

const profile: ScoreProfile = {
  major: "Computer Science",
  gradYear: 2027,
  workAuth: "us_citizen",
  targetLocations: ["San Francisco", "New York"],
  targetVerticals: [],
};

function posting(o: Partial<ScorePosting> = {}): ScorePosting {
  return {
    title: "Software Engineer Intern",
    term: "Summer 2027",
    locations: ["San Francisco, CA"],
    isRemote: false,
    workAuth: null,
    descriptionText: null,
    ...o,
  };
}

describe("scoreFit", () => {
  it("always returns at least one reason per dimension", () => {
    // A score with no explanation is a bug — the UI shows these beside it.
    const r = scoreFit(profile, posting());
    assert.ok(r.reasons.length >= 5, `expected >=5 reasons, got ${r.reasons.length}`);
    const dims = new Set(r.reasons.map((x) => x.dimension));
    assert.deepEqual([...dims].sort(), ["field", "location", "skills", "term", "work_auth"]);
  });

  it("scores a strong match highly", () => {
    const r = scoreFit(profile, posting());
    assert.ok(r.score !== null && r.score >= 80, `expected >=80, got ${r.score}`);
    assert.equal(r.blocked, false);
  });

  it("blocks on a citizenship requirement the user cannot meet", () => {
    const r = scoreFit(
      { ...profile, workAuth: "needs_sponsorship" },
      posting({ workAuth: "citizenship_required" }),
    );
    assert.equal(r.blocked, true);
    assert.ok(r.reasons.some((x) => x.kind === "bad" && x.dimension === "work_auth"));
  });

  it("does not block a citizen on a citizenship requirement", () => {
    const r = scoreFit(profile, posting({ workAuth: "citizenship_required" }));
    assert.equal(r.blocked, false);
  });

  it("blocks when sponsorship is needed but explicitly not offered", () => {
    const r = scoreFit(
      { ...profile, workAuth: "needs_sponsorship" },
      posting({ workAuth: "no_sponsorship" }),
    );
    assert.equal(r.blocked, true);
  });

  it("treats unknown work auth as unknown, never as a penalty", () => {
    // The critical honesty property: most postings never state this, and
    // guessing would invent a constraint the employer did not write.
    const known = scoreFit(profile, posting({ workAuth: "sponsorship_offered" }));
    const unknown = scoreFit(profile, posting({ workAuth: null }));

    assert.ok(unknown.reasons.some((r) => r.dimension === "work_auth" && r.kind === "unknown"));
    assert.equal(unknown.blocked, false);
    // Dropping the dimension must not drag the score down.
    assert.ok(
      unknown.score !== null && known.score !== null && unknown.score >= known.score - 1,
      `unknown (${unknown.score}) should not be penalised vs known-good (${known.score})`,
    );
  });

  it("penalises a term that falls after graduation", () => {
    const r = scoreFit(profile, posting({ term: "Summer 2029" }));
    assert.ok(r.reasons.some((x) => x.dimension === "term" && x.kind === "bad"));
  });

  it("penalises an unrelated field", () => {
    const r = scoreFit(profile, posting({ title: "Marketing Intern" }));
    assert.ok(r.reasons.some((x) => x.dimension === "field" && x.kind === "bad"));
  });

  it("credits a remote role regardless of location list", () => {
    const r = scoreFit(profile, posting({ isRemote: true, locations: ["Remote (US)"] }));
    assert.ok(r.reasons.some((x) => x.dimension === "location" && x.kind === "good"));
  });

  it("reports how many dimensions actually contributed", () => {
    // Without this the score overstates its own confidence: a posting known on
    // one dimension can hit 100, same as one known on all five.
    const full = scoreFit(
      { ...profile, skills: ["Python"] },
      posting({ workAuth: "sponsorship_offered", descriptionText: "We use Python daily." }),
    );
    assert.equal(full.knownDimensions, 5);
    assert.equal(full.totalDimensions, 5);

    // The same profile against a posting that names no technologies scores on
    // four — the skills dimension drops out rather than counting as a miss.
    const noSkillsNamed = scoreFit(
      { ...profile, skills: ["Python"] },
      posting({ workAuth: "sponsorship_offered", descriptionText: "A great opportunity." }),
    );
    assert.equal(noSkillsNamed.knownDimensions, 4);
    assert.equal(noSkillsNamed.totalDimensions, 5);

    const sparse = scoreFit(
      { gradYear: 2027 },
      { title: "Intern", term: "Summer 2027", locations: [] },
    );
    assert.ok(
      sparse.knownDimensions < sparse.totalDimensions,
      "a sparse posting must report partial confidence",
    );
  });

  /*
   * The resume-aware dimension. Everything else in the scorer reasons from
   * what a student typed into a form; this reasons from what they built.
   */
  describe("skills", () => {
    const jd = "You will work in Python and SQL on our AWS data platform.";

    it("credits skills the resume and the posting share", () => {
      const r = scoreFit(
        { ...profile, skills: ["Python", "SQL"] },
        posting({ descriptionText: jd }),
      );
      assert.deepEqual(r.skills.matched, ["Python", "SQL"]);
      assert.deepEqual(r.skills.missing, ["AWS"]);
      assert.ok(r.reasons.some((x) => x.dimension === "skills" && x.kind === "good"));
    });

    it("names the gap even for a student with no resume", () => {
      // Unscored, but still the most actionable thing on the page — it is the
      // only place the app tells someone what to go and learn.
      const r = scoreFit(profile, posting({ descriptionText: jd }));
      assert.deepEqual(r.skills.missing, ["Python", "SQL", "AWS"]);
      assert.ok(r.reasons.some((x) => x.dimension === "skills" && x.kind === "unknown"));
    });

    it("does not punish a posting for naming no technologies", () => {
      const bare = scoreFit({ ...profile, skills: ["Python"] }, posting({ descriptionText: null }));
      const named = scoreFit({ ...profile, skills: ["Python"] }, posting({ descriptionText: jd }));
      // Silence must not score worse than a partial match.
      assert.ok((bare.score ?? 0) >= (named.score ?? 0));
    });

    it("raises the score for a stronger resume against the same posting", () => {
      const weak = scoreFit({ ...profile, skills: ["Excel"] }, posting({ descriptionText: jd }));
      const strong = scoreFit(
        { ...profile, skills: ["Python", "SQL", "AWS"] },
        posting({ descriptionText: jd }),
      );
      assert.ok(
        (strong.score ?? 0) > (weak.score ?? 0),
        `expected a stronger resume to score higher (${strong.score} vs ${weak.score})`,
      );
    });

    it("reads a skill out of the title when there is no description", () => {
      const r = scoreFit(
        { ...profile, skills: ["Machine Learning"] },
        { title: "Machine Learning Intern", term: "Summer 2027", locations: ["New York"] },
      );
      assert.deepEqual(r.skills.matched, ["Machine Learning"]);
    });
  });

  /*
   * Observed live: the top of the feed filled with `fit 100 1/5` rows whose
   * only known dimension was one shared skill, sitting above postings we
   * understood on four. Each number was honest; the ordering was not.
   */
  describe("rankingScore", () => {
    const fit = (score: number | null, known: number, total = 5): FitResult => ({
      score,
      reasons: [],
      blocked: false,
      knownDimensions: known,
      totalDimensions: total,
      skills: { matched: [], missing: [] },
    });

    it("ranks a confident score above a speculative higher one", () => {
      assert.ok(
        rankingScore(fit(90, 4)) > rankingScore(fit(100, 1)),
        "a 90 known on 4 of 5 must outrank a 100 known on 1",
      );
    });

    it("orders equal scores by how much they rest on", () => {
      assert.ok(rankingScore(fit(80, 5)) > rankingScore(fit(80, 3)));
      assert.ok(rankingScore(fit(80, 3)) > rankingScore(fit(80, 1)));
    });

    it("leaves a fully-known score untouched", () => {
      assert.equal(rankingScore(fit(100, 5)), 100);
      assert.equal(rankingScore(fit(42, 5)), 42);
    });

    it("sorts unscorable postings last without crashing", () => {
      assert.equal(rankingScore(fit(null, 0)), -1);
      assert.ok(rankingScore(fit(0, 5)) > rankingScore(fit(null, 0)));
    });

    // A low score we are sure of should still rank below a middling one we
    // are not — shrinkage pulls toward neutral from both directions.
    it("pulls a confidently bad score up toward neutral, not below it", () => {
      assert.ok(rankingScore(fit(10, 1)) > rankingScore(fit(10, 5)));
    });
  });

  it("returns null rather than a number when nothing is knowable", () => {
    // An empty profile against a bare posting: we say "not enough info"
    // instead of printing a confident-looking figure derived from nothing.
    const r = scoreFit({}, { title: "Intern" });
    assert.equal(r.score, null);
    assert.ok(r.reasons.every((x) => x.kind === "unknown"));
  });

  it("matches field via stated interests when major is absent", () => {
    const r = scoreFit(
      { targetVerticals: ["quant_finance"], gradYear: 2027 },
      posting({ title: "Quantitative Trading Intern" }),
    );
    assert.ok(r.reasons.some((x) => x.dimension === "field" && x.kind === "good"));
  });
});

describe("scoreTiming", () => {
  const base = new Date("2026-08-12T12:00:00Z");
  const hoursAgo = (h: number) => new Date(base.getTime() - h * 3_600_000);

  it("scores a brand-new posting at the top", () => {
    const r = scoreTiming({ firstSeenAt: hoursAgo(2), lastSeenAt: hoursAgo(0.1), now: base });
    assert.equal(r.score, 100);
    // "found", not "new": with no employer-stated posting date the only fact
    // we hold is when our own crawler arrived. See the label block in timing.ts.
    assert.equal(r.label, "found today");
  });

  it("says 'posted' only when the employer actually stated a date", () => {
    /*
     * The distinction the old version collapsed. On a bulk-ingested corpus,
     * labelling rows "new today" off `firstSeenAt` marked 2,080
     * simultaneously-imported listings as new on the same day — the same
     * overclaim the saved-search alerts avoid by saying new means new *to us*.
     */
    const stated = scoreTiming({
      firstSeenAt: hoursAgo(400),
      lastSeenAt: base,
      postedAt: hoursAgo(2),
      now: base,
    });
    assert.equal(stated.label, "posted today");
    assert.equal(stated.ageBasis, "posted");

    const ours = scoreTiming({ firstSeenAt: hoursAgo(2), lastSeenAt: base, now: base });
    assert.equal(ours.label, "found today");
    assert.equal(ours.ageBasis, "first_seen");
  });

  it("decays with age", () => {
    const fresh = scoreTiming({ firstSeenAt: hoursAgo(30), lastSeenAt: base, now: base });
    const week = scoreTiming({ firstSeenAt: hoursAgo(120), lastSeenAt: base, now: base });
    const month = scoreTiming({ firstSeenAt: hoursAgo(900), lastSeenAt: base, now: base });
    assert.ok(fresh.score > week.score, `${fresh.score} should exceed ${week.score}`);
    assert.ok(week.score > month.score, `${week.score} should exceed ${month.score}`);
  });

  it("never drops below the floor while still open", () => {
    const ancient = scoreTiming({ firstSeenAt: hoursAgo(50_000), lastSeenAt: base, now: base });
    assert.ok(ancient.score >= 15);
    assert.equal(ancient.isClosed, false);
  });

  it("a stated deadline moves the score continuously, not only inside 72 hours", () => {
    /*
     * THE BUG THIS PINS, measured on the live corpus: the old version only
     * looked at a deadline inside 72 hours, and of 288 open rows carrying a
     * real deadline exactly **2** were in that window. So 286 rows got no
     * benefit at all from stating one, and a scholarship closing in three
     * weeks scored identically to one closing in three years.
     */
    const soon = scoreTiming({ firstSeenAt: hoursAgo(3000), lastSeenAt: base, deadlineAt: new Date(base.getTime() + 5 * 86_400_000), now: base });
    const mid = scoreTiming({ firstSeenAt: hoursAgo(3000), lastSeenAt: base, deadlineAt: new Date(base.getTime() + 30 * 86_400_000), now: base });
    const far = scoreTiming({ firstSeenAt: hoursAgo(3000), lastSeenAt: base, deadlineAt: new Date(base.getTime() + 300 * 86_400_000), now: base });

    assert.ok(soon.score > mid.score, `${soon.score} should exceed ${mid.score}`);
    assert.ok(mid.score > far.score, `${mid.score} should exceed ${far.score}`);
  });

  it("an implausible posting date is dropped, never scored as ancient", () => {
    /*
     * Live corpus: a still-open "User Interface Designer (Entry level)"
     * carries 2012-02-29, and 304 open rows claim to be over a year old.
     * Employers reuse requisitions, so an ancient date means the req id is
     * old, not that the vacancy is fourteen years old. Unknown is dropped,
     * never scored as a miss — the Fit Score's rule, applied here.
     */
    const ancientDate = scoreTiming({
      firstSeenAt: hoursAgo(48),
      lastSeenAt: base,
      postedAt: new Date("2012-02-29T00:00:00Z"),
      now: base,
    });
    assert.equal(ancientDate.ageBasis, "first_seen");
    // And it is not punished for it: same score as if no date were stated.
    const noDate = scoreTiming({ firstSeenAt: hoursAgo(48), lastSeenAt: base, now: base });
    assert.equal(ancientDate.score, noDate.score);
  });

  it("the confidence marker counts what we could read, not what scored well", () => {
    // Getting this wrong first reported 1-of-3 on 3,777 of 3,788 live rows,
    // which is a constant rather than a marker. Verification is always known.
    const bare = scoreTiming({ firstSeenAt: hoursAgo(48), lastSeenAt: base, now: base });
    assert.equal(bare.knownSignals, 1);

    const full = scoreTiming({
      firstSeenAt: hoursAgo(48),
      lastSeenAt: base,
      postedAt: hoursAgo(48),
      deadlineAt: new Date(base.getTime() + 10 * 86_400_000),
      now: base,
    });
    assert.equal(full.knownSignals, 3);
    assert.equal(full.totalSignals, 3);
  });

  it("urgency is the stronger pressure, not the average of the two", () => {
    // An old posting closing in two days is urgent. Averaging its age against
    // its deadline would report a comfortable middle for something about to
    // disappear.
    const r = scoreTiming({
      firstSeenAt: hoursAgo(20_000),
      lastSeenAt: base,
      postedAt: hoursAgo(20_000),
      deadlineAt: new Date(base.getTime() + 2 * 86_400_000),
      now: base,
    });
    assert.ok(r.score >= 90, `expected an imminent deadline to dominate, got ${r.score}`);
  });

  it("zeroes a closed posting", () => {
    const r = scoreTiming({
      firstSeenAt: hoursAgo(100),
      lastSeenAt: hoursAgo(10),
      closedAt: hoursAgo(5),
      now: base,
    });
    assert.equal(r.score, 0);
    assert.equal(r.label, "closed");
    assert.match(r.liveness, /^closed /);
  });

  it("surfaces liveness from lastSeenAt, not postedAt", () => {
    // The product's actual claim: we vouch for when WE last saw it live.
    const r = scoreTiming({ firstSeenAt: hoursAgo(500), lastSeenAt: hoursAgo(0.05), now: base });
    assert.match(r.liveness, /confirmed live/);
  });

  it("an imminent deadline overrides age", () => {
    const r = scoreTiming({
      firstSeenAt: hoursAgo(2000),
      lastSeenAt: base,
      deadlineAt: new Date(base.getTime() + 24 * 3_600_000),
      now: base,
    });
    assert.equal(r.score, 100);
    assert.equal(r.label, "closes tomorrow");
  });

  it("zeroes a deadline that is genuinely in the past", () => {
    const r = scoreTiming({
      firstSeenAt: hoursAgo(100),
      lastSeenAt: base,
      // Two calendar days back, not merely an hour — see the test below.
      deadlineAt: hoursAgo(48),
      now: base,
    });
    assert.equal(r.score, 0);
    assert.equal(r.label, "deadline passed");
  });

  it("a deadline earlier today has NOT passed", () => {
    /*
     * Deadlines are dates; the midnight is an artifact of parsing them. A
     * source stating "deadline: August 12", read at noon on August 12, still
     * has that day left — so this counts whole UTC calendar days, exactly as
     * the deadline reminders were corrected to do after a live run produced a
     * subject line reading "closes today" above a body reading
     * "Closes: 2026-08-15".
     *
     * The elapsed-time comparison this replaces would have zeroed a
     * scholarship at 00:01 on the very day it was due, and buried it in the
     * ranking on the one day it was most urgent.
     */
    const r = scoreTiming({
      firstSeenAt: hoursAgo(100),
      lastSeenAt: base,
      deadlineAt: hoursAgo(1),
      now: base,
    });
    assert.equal(r.label, "closes today");
    assert.equal(r.score, 100);
  });
});
