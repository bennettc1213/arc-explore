import assert from "node:assert/strict";
import test from "node:test";
import { studentAffiliationMatches } from "./student-sso-config";

test("campus SSO needs a current-student affiliation; alumni and staff do not qualify", () => {
  assert.equal(
    studentAffiliationMatches("student", "student", ["school.edu"]),
    true,
  );
  assert.equal(
    studentAffiliationMatches(["member", "student@school.edu"], "student", [
      "school.edu",
    ]),
    true,
  );
  for (const claim of [
    undefined,
    "alum",
    "alumni",
    "staff",
    "faculty",
    "member",
    "former_student",
    "student@another.edu",
    { student: true },
  ]) {
    assert.equal(
      studentAffiliationMatches(claim, "student", ["school.edu"]),
      false,
      JSON.stringify(claim),
    );
  }
});
