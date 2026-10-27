import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSchoolEmail,
  schoolEmailHash,
  hashStudentCode,
  matchesStudentCode,
} from "./student-identity";

test("case, whitespace and plus aliases cannot claim the same school email twice", () => {
  assert.equal(
    normalizeSchoolEmail(" Student+discount@SCHOOL.EDU "),
    "student@school.edu",
  );
  assert.equal(
    schoolEmailHash("Student+other@school.edu"),
    schoolEmailHash("student@SCHOOL.edu"),
  );
  assert.notEqual(
    schoolEmailHash("someone@school.edu"),
    schoolEmailHash("student@school.edu"),
  );
});
test("verification codes are salted and only an exact six-digit code matches", () => {
  const hash = hashStudentCode("123456");
  assert.notEqual(hash, hashStudentCode("123456"));
  assert.equal(matchesStudentCode("123456", hash), true);
  for (const input of ["654321", "12345", "1234567", "abcdef"])
    assert.equal(matchesStudentCode(input, hash), false);
});
