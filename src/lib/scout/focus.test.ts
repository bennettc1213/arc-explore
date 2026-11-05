import assert from "node:assert/strict";
import { test } from "node:test";

import { exploreBrowseHref, exploreEntryFocus, focusPreferences, scoutButtonLabel, scoutCopy, scoutFocusFrom, scoutHref, SCOUT_FOCUSES } from "./focus";
import { scoutSchema } from "./types";

test("only the three known tools are accepted from a URL", () => {
  for (const focus of SCOUT_FOCUSES) assert.equal(scoutFocusFrom(focus), focus);
  for (const bad of [undefined, "", "both", "Internships", "merit ", "<script>", 3, null]) {
    assert.equal(scoutFocusFrom(bad), null, String(bad));
  }
  assert.equal(scoutFocusFrom(["merit", "internships"]), "merit", "a repeated parameter reads as its first value");
});

test("a Scout URL round-trips through the parser", () => {
  assert.equal(scoutHref(null), "/scout");
  for (const focus of SCOUT_FOCUSES) {
    const url = new URL(scoutHref(focus), "https://example.test");
    assert.equal(url.pathname, "/scout");
    assert.equal(scoutFocusFrom(url.searchParams.get("for")), focus);
  }
});

test("a plain category entry to Explore is a Scout entry; anything chosen is not", () => {
  assert.deepEqual(exploreEntryFocus({}), { focus: null });
  assert.deepEqual(exploreEntryFocus({ kind: "internship" }), { focus: "internships" });
  assert.deepEqual(exploreEntryFocus({ kind: "scholarship" }), { focus: "scholarships" });
  assert.deepEqual(exploreEntryFocus({ kind: "scholarship", focus: "merit" }), { focus: "merit" });
  // The retired Cards links still land on an entry.
  assert.deepEqual(exploreEntryFocus({ kind: "internship", view: "deck" }), { focus: "internships" });
  assert.deepEqual(exploreEntryFocus({ kind: ["scholarship", "internship"] }), { focus: "scholarships" });
  assert.deepEqual(exploreEntryFocus({ kind: "internship", deleted: undefined }), { focus: "internships" });
  // A search, a filter, an explicit view, or the account-deleted banner: show results.
  for (const params of [{ q: "nursing" }, { kind: "internship", remote: "1" }, { view: "list" }, { kind: "scholarship", view: "plan" }, { show: "100" }, { deleted: "1" }, { college: "Auburn", focus: "merit" }]) {
    assert.equal(exploreEntryFocus(params), null, JSON.stringify(params));
  }
});

test("the browse link leaves the entry, so it cannot loop back to the Scout screen", () => {
  for (const focus of [null, ...SCOUT_FOCUSES]) {
    const url = new URL(exploreBrowseHref(focus), "https://example.test");
    assert.equal(url.pathname, "/explore");
    assert.equal(exploreEntryFocus(Object.fromEntries(url.searchParams)), null, String(focus));
  }
});

test("each tool fixes the kind, and only merit turns the merit filter on", () => {
  assert.deepEqual(focusPreferences("internships"), { kind: "internship", merit: false });
  assert.deepEqual(focusPreferences("scholarships"), { kind: "scholarship", merit: false });
  assert.deepEqual(focusPreferences("merit"), { kind: "scholarship", merit: true });
});

test("fixed preferences stay valid for the Scout schema", () => {
  const base = { field: "Nursing", location: "", remote: false, priority: "fit", school: "", gradYear: "", workAuth: "", gpa: "", gpaScale: "4", residency: "" };
  for (const focus of SCOUT_FOCUSES) {
    assert.equal(scoutSchema.safeParse({ ...base, ...focusPreferences(focus) }).success, true, focus);
  }
});

test("a Scout can start broad without a field", () => {
  const base = { field: "", location: "", remote: false, priority: "fit", school: "", gradYear: "", workAuth: "", gpa: "", gpaScale: "4", residency: "" };
  assert.equal(scoutSchema.safeParse({ ...base, ...focusPreferences("internships") }).success, true);
  assert.equal(scoutSchema.safeParse({ ...base, ...focusPreferences("scholarships") }).success, true);
  assert.equal(scoutSchema.safeParse({ ...base, kind: "both", merit: false }).success, true);
  assert.equal(scoutSchema.safeParse({ ...base, ...focusPreferences("merit") }).success, true);
});

test("preferences saved before merit existed still load, with merit off", () => {
  const old = { kind: "both", field: "Nursing", location: "", remote: false, priority: "fit", school: "", gradYear: "", workAuth: "", gpa: "", gpaScale: "4", residency: "" };
  const parsed = scoutSchema.safeParse(old);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.merit, false);
    assert.equal(parsed.data.college, "");
  }
});

test("every tool has its own words and the button names it", () => {
  const kickers = new Set([null, ...SCOUT_FOCUSES].map((f) => scoutCopy(f).kicker));
  assert.equal(kickers.size, 4);
  assert.equal(scoutButtonLabel(null), "Start a Scout");
  assert.equal(scoutButtonLabel("internships"), "Start a Scout for internships");
  assert.equal(scoutButtonLabel("merit"), "Start a Scout for college merit awards");
});
