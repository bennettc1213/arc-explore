import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps ordinary in-app paths", () => {
    assert.equal(safeNextPath("/profile"), "/profile");
    assert.equal(safeNextPath("/?term=Summer%202027"), "/?term=Summer%202027");
    assert.equal(safeNextPath("/a/b/c#frag"), "/a/b/c#frag");
  });

  it("falls back when nothing was requested", () => {
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath(undefined), "/");
    assert.equal(safeNextPath(""), "/");
    assert.equal(safeNextPath("", "/profile"), "/profile");
  });

  // Each of these would otherwise let a sign-in link on our domain deposit the
  // user on an attacker's page — with our brand as the referrer.
  it("rejects every off-site shape", () => {
    for (const hostile of [
      "https://evil.example",
      "http://evil.example",
      "//evil.example",
      "///evil.example",
      "\\\\evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "profile", // no leading slash — resolves relative to whatever page
    ]) {
      assert.equal(safeNextPath(hostile), "/", `should have rejected ${hostile}`);
    }
  });
});
