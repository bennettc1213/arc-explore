import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { googleSignInEnabled } from "./auth-providers";

const ORIGINAL = process.env.GOOGLE_SIGNIN_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GOOGLE_SIGNIN_ENABLED;
  else process.env.GOOGLE_SIGNIN_ENABLED = ORIGINAL;
});

test("google sign-in is off unless explicitly the string 'true'", () => {
  delete process.env.GOOGLE_SIGNIN_ENABLED;
  assert.equal(googleSignInEnabled(), false);
  for (const v of ["", "1", "TRUE", "yes", "false", " true"]) {
    process.env.GOOGLE_SIGNIN_ENABLED = v;
    assert.equal(googleSignInEnabled(), false, `"${v}" must not enable it`);
  }
  process.env.GOOGLE_SIGNIN_ENABLED = "true";
  assert.equal(googleSignInEnabled(), true);
});
