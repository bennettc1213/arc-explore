import assert from "node:assert/strict";
import { test } from "node:test";

import { allowanceWords, COMPARISON_ROWS } from "./describe";
import { FEATURES } from "./tiers";

test("plan promises read from the entitlement table", () => {
  assert.equal(allowanceWords("feed_full_depth", "free"), "top 20 ranked matches per search");
  assert.equal(allowanceWords("tracker", "free"), "10 active at a time");
  assert.equal(allowanceWords("tracker", "apply"), "unlimited");
  assert.equal(allowanceWords("cover_letter", "free"), "1 every 30 days");
  assert.equal(allowanceWords("essay_reviewer", "free"), "1 every 30 days");
  assert.equal(allowanceWords("saved_search_alerts", "free"), "1 saved search, weekly alerts");
  assert.equal(allowanceWords("saved_search_alerts", "apply"), "up to 20 saved searches, daily alerts");
  assert.equal(allowanceWords("weekly_digest", "free"), "weekly, up to 6 matches");
  assert.equal(allowanceWords("fit_score_gap_closer", "free"), null);
});

test("the comparison never lists an unbuilt or unverified feature as a benefit", () => {
  for (const key of COMPARISON_ROWS) assert.equal(FEATURES[key].status, "live", key);
});

test("no promise says per month, daily reset, or a midnight reset", () => {
  for (const key of COMPARISON_ROWS) {
    for (const tier of ["free", "apply"] as const) {
      const words = allowanceWords(key, tier) ?? "";
      assert.doesNotMatch(words, /month|midnight|per day/i, `${key}/${tier}: ${words}`);
    }
  }
});
