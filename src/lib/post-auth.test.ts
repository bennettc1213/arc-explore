import assert from "node:assert/strict";
import { test } from "node:test";

import { authConfirmUrl } from "./post-auth";

test("the return address handed to Supabase carries no query string", () => {
  /*
   * The bug this pins: Supabase rejected `/auth/confirm?next=%2Fprofile` as not
   * on the allowlist and sent every sign-in to the bare home page, signed out.
   * Anything appended here would reopen it.
   */
  assert.equal(authConfirmUrl("https://instela.org"), "https://instela.org/auth/confirm");
  assert.equal(authConfirmUrl("https://instela.org/"), "https://instela.org/auth/confirm");
  assert.ok(!authConfirmUrl("http://localhost:3100").includes("?"));
});
