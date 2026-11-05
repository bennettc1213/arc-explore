import assert from "node:assert/strict";
import { test } from "node:test";
import { scoutFeedFilters } from "./filters";
import { defaultScout } from "./types";

test("Scout uses field and location to rank instead of filtering the corpus away", () => {
  const filters = scoutFeedFilters({ ...defaultScout, field: "Computer science", location: "Colorado" });
  assert.deepEqual(filters, {
    kind: null, remoteOnly: false, hideBlocked: true, excludeMarketing: true,
    meritOnly: false, college: null,
  });
  assert.equal("q" in filters, false);
  assert.equal("location" in filters, false);
});

test("only the student's explicit must-have choices narrow a Scout", () => {
  assert.deepEqual(scoutFeedFilters({ ...defaultScout, kind: "internship", remote: true }), {
    kind: "internship", remoteOnly: true, hideBlocked: true, excludeMarketing: true,
    meritOnly: false, college: null,
  });
  assert.deepEqual(scoutFeedFilters({ ...defaultScout, kind: "scholarship", merit: true, college: "Example University" }), {
    kind: "scholarship", remoteOnly: false, hideBlocked: true, excludeMarketing: true,
    meritOnly: true, college: "Example University",
  });
});
