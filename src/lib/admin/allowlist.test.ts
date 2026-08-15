import assert from "node:assert/strict";
import { test } from "node:test";

import { adminEmails, isAdminEmail } from "./allowlist";

test("no configured admins means no admins", () => {
  /*
   * The most important test in this file. The tempting shortcut — "nothing
   * configured, so let anyone in while developing" — is how an admin panel
   * ships open, and this one can take listings down and read every report a
   * student has filed.
   */
  assert.equal(isAdminEmail("anyone@example.com", undefined), false);
  assert.equal(isAdminEmail("anyone@example.com", ""), false);
  assert.equal(isAdminEmail("anyone@example.com", "   "), false);
  assert.equal(isAdminEmail("anyone@example.com", ",,,"), false);
  // Not even an address that looks like it was meant to be there.
  assert.equal(isAdminEmail("admin@example.com", "not-an-email"), false);
});

test("a session with no email address is never an admin", () => {
  // Supabase permits a user with no email. `undefined` must not match an
  // allow-list entry through some coercion.
  assert.equal(isAdminEmail(null, "me@example.com"), false);
  assert.equal(isAdminEmail(undefined, "me@example.com"), false);
  assert.equal(isAdminEmail("", "me@example.com"), false);
});

test("matching is case and whitespace insensitive", () => {
  assert.equal(isAdminEmail("Me@Example.com", "me@example.com"), true);
  assert.equal(isAdminEmail("  me@example.com  ", "me@example.com"), true);
  assert.equal(isAdminEmail("me@example.com", " ME@EXAMPLE.COM "), true);
});

test("a multi-admin list works and does not match neighbours", () => {
  const list = "a@example.com, b@example.com ,c@example.com";
  assert.deepEqual(adminEmails(list), ["a@example.com", "b@example.com", "c@example.com"]);
  assert.equal(isAdminEmail("b@example.com", list), true);
  assert.equal(isAdminEmail("d@example.com", list), false);
  // No substring or prefix matching.
  assert.equal(isAdminEmail("a@example.com.evil.test", list), false);
  assert.equal(isAdminEmail("xa@example.com", list), false);
});

test("entries that are not addresses are dropped rather than trusted", () => {
  assert.deepEqual(adminEmails("me@example.com, garbage, "), ["me@example.com"]);
  assert.equal(isAdminEmail("garbage", "me@example.com, garbage"), false);
});
