import assert from "node:assert/strict";
import { test } from "node:test";

import { hasSessionCookie } from "./auth-cookie";

test("the session cookie, whole or chunked, counts", () => {
  assert.equal(hasSessionCookie("sb-tumajkbrzxdikgdvdgaz-auth-token=base64-abc"), true);
  assert.equal(hasSessionCookie("theme=dark; sb-tumajkbrzxdikgdvdgaz-auth-token.0=base64-abc"), true);
});

test("PKCE verifier cookies do not count: they exist while signed out", () => {
  // The exact set seen on instela.org after a sign-in attempt, minus the session.
  const verifiers =
    "sb-tumajkbrzxdikgdvdgaz-auth-token-flow-35abd2df-code-verifier=x; " +
    "sb-tumajkbrzxdikgdvdgaz-auth-token-flows-code-verifier=y; " +
    "sb-tumajkbrzxdikgdvdgaz-auth-token-code-verifier=z";
  assert.equal(hasSessionCookie(verifiers), false);
});

test("a cleared cookie and no cookies at all do not count", () => {
  assert.equal(hasSessionCookie("sb-tumajkbrzxdikgdvdgaz-auth-token="), false);
  assert.equal(hasSessionCookie(""), false);
});
