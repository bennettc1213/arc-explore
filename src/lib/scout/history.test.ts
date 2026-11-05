import assert from "node:assert/strict";
import { test } from "node:test";

import { coerceScoutPreferences, describeScout, scoutFingerprint } from "./history";
import { defaultScout } from "./types";

test("recent Scouts retain only valid, complete preferences", () => {
  const prefs = { ...defaultScout, field: "Civil engineering", location: "Colorado", remote: true };
  assert.deepEqual(coerceScoutPreferences(prefs), prefs);
  assert.equal(coerceScoutPreferences({ ...prefs, kind: "job" }), null);
});

test("an identical recent Scout has one stable fingerprint", () => {
  const prefs = { ...defaultScout, field: "Data science" };
  assert.equal(scoutFingerprint(prefs), scoutFingerprint({ ...prefs }));
  assert.equal(describeScout({ ...prefs, remote: true }), "Internships + scholarships · Data science · Remote only");
});
