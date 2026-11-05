import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationPageUrl, isApplicationWorkspace, isInstelaPage, normalizeInstelaOrigin } from "./extension-config";

test("extension settings cannot redirect account requests to an arbitrary server", () => {
  for (const value of ["https://evil.example", "https://instela.org.evil.example", "https://instela.org/profile", "https://user:password@instela.org", "http://instela.org", "https://instela.org?redirect=elsewhere", "http://localhost:4000", ""]) assert.equal(normalizeInstelaOrigin(value), null, value);
  assert.equal(normalizeInstelaOrigin(" https://instela.org/ "), "https://instela.org");
  assert.equal(normalizeInstelaOrigin("http://localhost:3000"), "http://localhost:3000");
});

test("application markers are read only on trusted Instela application workspaces", () => {
  assert.equal(isApplicationWorkspace("https://instela.org/listing/job-id/apply", "https://instela.org"), true);
  assert.equal(isApplicationWorkspace("https://www.instela.org/listing/job-id/apply", "https://instela.org"), true);
  assert.equal(isApplicationWorkspace("https://evil.example/listing/job-id/apply", "https://instela.org"), false);
  assert.equal(isApplicationWorkspace("https://instela.org/profile", "https://instela.org"), false);
  assert.equal(isInstelaPage("http://localhost:3000/profile", "https://instela.org"), false);
});

test("application targets reject credentials, unsupported protocols, and excluded hosts", () => {
  for (const value of ["chrome://extensions", "javascript:alert(1)", "http://example.com", "https://user:secret@example.com", "https://linkedin.com/jobs/123", "https://www.linkedin.com/jobs/123", "https://example.com:9000/form"]) assert.equal(applicationPageUrl(value), null, value);
  assert.equal(applicationPageUrl("https://job-boards.greenhouse.io/company/jobs/123"), "https://job-boards.greenhouse.io/company/jobs/123");
});
