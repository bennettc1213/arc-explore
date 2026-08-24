import assert from "node:assert/strict";
import { test } from "node:test";

import { USAGE_FEATURE_KEYS } from "@/db/schema";

import type { FitResult } from "../score/fit";

import {
  bucketFitScore,
  evaluateFeature,
  FEATURE_KEYS,
  FEATURES,
  minimumTierFor,
  presentFit,
  statusNote,
  TIER_IDS,
  TIER_PRICE_USD,
  tierAtLeast,
} from "./tiers";

const FIT: FitResult = {
  score: 87,
  reasons: [
    { label: "matches software", dimension: "field", kind: "good", detail: "…" },
    { label: "remote", dimension: "location", kind: "good", detail: "…" },
  ],
  blocked: false,
  knownDimensions: 4,
  totalDimensions: 5,
  skills: { matched: ["Python"], missing: ["Kubernetes", "Go"] },
};

test("a coming_soon feature is unusable on every tier, including the one that pays for it", () => {
  /*
   * The most important test in this file. Five features back the Apply tier
   * and are not built; two more (smart_resume, priority_freshest_listings)
   * turned out to be in the same state. A student paying $14.99 must not be
   * shown a working control for any of them — "reserved" has to mean
   * *disabled*, not merely *gated*, or the top tier advertises capabilities
   * that silently do nothing.
   */
  const unbuilt = FEATURE_KEYS.filter((k) => FEATURES[k].status === "coming_soon");
  assert.ok(unbuilt.length > 0, "expected some reserved-but-unbuilt features");

  for (const key of unbuilt) {
    for (const tier of TIER_IDS) {
      const access = evaluateFeature(tier, key, 0);
      assert.equal(access.usable, false, `${key} must not be usable on ${tier}`);
      assert.equal(access.reason, "coming_soon");
    }
  }
});

test("an unverified feature is usable, and carries its caveat", () => {
  /*
   * THE MIDDLE STATE, AND WHY IT EXISTS. The extension is built and covered
   * by 616 tests including source-level safety invariants, but FIXES.md §3
   * records that it has never been loaded into Chrome and driven with a real
   * session — and every ATS form actually read so far produced at least one
   * bug that reading it was the only way to find.
   *
   * Refusing to run it would be wrong (the code works as far as anyone
   * knows). Selling it as finished would also be wrong. So it runs, and the
   * caveat is printed wherever it is offered — the same distinction as
   * "confirmed live" versus "checked as of".
   */
  const access = evaluateFeature("apply", "extension_autofill_internships");
  assert.equal(access.status, "unverified");
  assert.equal(access.usable, true);
  assert.equal(statusNote("unverified"), "built, not yet verified end-to-end");

  // And it is still tier-gated: unverified is about doneness, not entitlement.
  assert.equal(evaluateFeature("edge", "extension_autofill_internships").usable, false);
  assert.equal(evaluateFeature("free", "extension_autofill_internships").usable, false);
});

test("every feature status has a note, or is genuinely finished", () => {
  assert.equal(statusNote("live"), null);
  assert.equal(statusNote("coming_soon"), "not built yet");
  // A caveated state that rendered no text would be a silent overclaim.
  for (const key of FEATURE_KEYS) {
    const s = FEATURES[key].status;
    if (s !== "live") assert.ok(statusNote(s), `${key} is ${s} but says nothing`);
  }
});

test("coming_soon still reports the tier it will land on, so the UI can say which", () => {
  // A locked badge reading "coming soon" with no tier tells a prospective
  // subscriber nothing about what they would be buying.
  const access = evaluateFeature("free", "answer_bank");
  assert.equal(access.minimumTier, "apply");
  assert.equal(access.status, "coming_soon");
});

test("a capped feature runs out, and reports how much is left on the way", () => {
  const fresh = evaluateFeature("free", "resume_critique", 0);
  assert.equal(fresh.usable, true);
  assert.equal(fresh.remaining, 1);

  const spent = evaluateFeature("free", "resume_critique", 1);
  assert.equal(spent.usable, false);
  assert.equal(spent.reason, "limit_reached");
  assert.equal(spent.remaining, 0);

  // Over-consumption (a lost race, see usage.ts) must clamp, not go negative.
  assert.equal(evaluateFeature("free", "resume_critique", 99).remaining, 0);
});

test("paid tiers are unlimited on the capped tools, and a count never changes that", () => {
  for (const tier of ["edge", "apply"] as const) {
    const access = evaluateFeature(tier, "resume_critique", 10_000);
    assert.equal(access.usable, true);
    assert.equal(access.unlimited, true);
    assert.equal(access.remaining, null);
  }
});

test("a feature not included on a tier is refused regardless of usage count", () => {
  const access = evaluateFeature("free", "essay_reviewer", 0);
  assert.equal(access.usable, false);
  assert.equal(access.reason, "not_included");
  assert.equal(access.included, false);
});

test("every tier includes everything the tier below it includes", () => {
  /*
   * "Everything in Free, plus…" and "everything in Edge, plus…" are promises
   * on the pricing page. A limit that went *down* as the price went up would
   * be invisible in review and infuriating to whoever hit it.
   */
  for (const key of FEATURE_KEYS) {
    const limits = FEATURES[key].limits;
    for (let i = 1; i < TIER_IDS.length; i++) {
      const lower = limits[TIER_IDS[i - 1]];
      const higher = limits[TIER_IDS[i]];
      if (lower === null) {
        assert.equal(higher, null, `${key}: ${TIER_IDS[i]} must stay unlimited`);
      } else if (higher !== null) {
        assert.ok(
          higher >= lower,
          `${key}: ${TIER_IDS[i]} (${higher}) must not be stingier than ${TIER_IDS[i - 1]} (${lower})`,
        );
      }
    }
  }
});

test("the free tier keeps the things promised as free forever", () => {
  // Browsing, deadline reminders — the roadmap's own line. If a later edit
  // gates one of these, this fails rather than shipping quietly.
  for (const key of ["feed_browse", "deadline_reminders"] as const) {
    assert.equal(evaluateFeature("free", key).usable, true, `${key} must stay free`);
    assert.equal(FEATURES[key].limits.free, null, `${key} must stay unlimited on free`);
  }
});

test("prices are ordered and the paid ones are the stated figures", () => {
  assert.equal(TIER_PRICE_USD.free, 0);
  assert.equal(TIER_PRICE_USD.edge, 6.99);
  assert.equal(TIER_PRICE_USD.apply, 14.99);
  assert.ok(TIER_PRICE_USD.apply > TIER_PRICE_USD.edge);
});

test("minimumTierFor names the cheapest tier that includes a feature", () => {
  assert.equal(minimumTierFor("feed_browse"), "free");
  assert.equal(minimumTierFor("resume_critique"), "free");
  assert.equal(minimumTierFor("essay_reviewer"), "edge");
  assert.equal(minimumTierFor("extension_autofill_internships"), "apply");
});

test("every metered usage key is a real feature key", () => {
  /*
   * `feature_usage.feature` and `FEATURES` are indexed by the same strings on
   * purpose — this codebase has already paid for one taxonomy restated in two
   * places (the remote-only filter, FIXES.md). A drift here would make
   * `evaluateFeature` read `undefined.limits` at runtime.
   */
  for (const key of USAGE_FEATURE_KEYS) {
    assert.ok(FEATURE_KEYS.includes(key), `${key} is metered but not a feature`);
  }
});

test("tierAtLeast orders the three tiers", () => {
  assert.equal(tierAtLeast("free", "free"), true);
  assert.equal(tierAtLeast("free", "edge"), false);
  assert.equal(tierAtLeast("edge", "free"), true);
  assert.equal(tierAtLeast("apply", "edge"), true);
  assert.equal(tierAtLeast("edge", "apply"), false);
});

test("the fit bucket agrees with ScoreBadge's own strong threshold", () => {
  // 70 is where ScoreBadge already switches to its accent treatment. If the
  // bucketed word and the number disagreed at that boundary, a student who
  // upgraded mid-session would see "Good Fit" become an accented 70.
  assert.equal(bucketFitScore(70), "strong");
  assert.equal(bucketFitScore(69), "good");
  assert.equal(bucketFitScore(40), "good");
  assert.equal(bucketFitScore(39), "low");
  assert.equal(bucketFitScore(0), "low");
});

test("an unscorable posting buckets as unscored, not as a bad fit", () => {
  // The product's core rule: unknown is never a miss. A null score means we
  // could not score it, which is true on every tier and must not read as
  // "Low Fit" to a free user.
  assert.equal(bucketFitScore(null), "unscored");
});

test("free tier never receives the number, the reasons, or the gap", () => {
  /*
   * The load-bearing test for the discovery/scoring gate. `presentFit` runs
   * server-side, so what it drops here is genuinely absent from the HTML —
   * not hidden with CSS, not collapsed behind a disclosure a curious student
   * could open in devtools. If this ever returns the score on free, the
   * paywall becomes decorative.
   */
  const shown = presentFit(FIT, "free");
  assert.equal(shown.score, null);
  assert.equal(shown.locked, true);
  assert.equal(shown.bucketLabel, "Strong Fit");
  assert.deepEqual(shown.reasons, []);
  assert.deepEqual(shown.skills, { matched: [], missing: [] });
  // The raw number must not survive anywhere in the returned object.
  assert.ok(!JSON.stringify(shown).includes("87"));
  assert.ok(!JSON.stringify(shown).includes("Kubernetes"));
});

test("the confidence marker survives the paywall", () => {
  /*
   * `FitResult` requires known/total wherever a score appears, because an
   * unknown dimension is dropped rather than scored as a miss — so a posting
   * understood on one dimension reaches the same rating as one understood on
   * five.
   *
   * The first cut of the paywall dropped this along with the number, and it
   * was visibly wrong against live data: signed out, with an empty profile,
   * the feed rendered fifty consecutive rows reading a confident "Strong
   * Fit" and nothing at all saying what that rested on. Bucketing may lower
   * the precision of the score; it may not strip the marker that stops the
   * score overstating itself.
   */
  const shown = presentFit(FIT, "free");
  assert.equal(shown.known, 4);
  assert.equal(shown.total, 5);
});

test("paid tiers receive the score, the confidence marker and the gap intact", () => {
  for (const tier of ["edge", "apply"] as const) {
    const shown = presentFit(FIT, tier);
    assert.equal(shown.score, 87);
    assert.equal(shown.locked, false);
    assert.equal(shown.bucketLabel, null);
    // The known/total marker travels with the score, always — a score
    // without its confidence fraction overstates itself (see FitResult).
    assert.equal(shown.known, 4);
    assert.equal(shown.total, 5);
    assert.deepEqual(shown.skills.missing, ["Kubernetes", "Go"]);
  }
});

test("an unscorable posting looks identical on every tier", () => {
  // "We don't know" is not a paid insight. A free user must be able to tell
  // it apart from "you're not seeing the number", which is why this returns
  // an unlocked null rather than a bucket.
  const nullFit: FitResult = { ...FIT, score: null, knownDimensions: 0 };
  for (const tier of TIER_IDS) {
    const shown = presentFit(nullFit, tier);
    assert.equal(shown.score, null);
    assert.equal(shown.locked, false, `${tier} must not read as locked`);
    assert.equal(shown.bucketLabel, null);
  }
});
