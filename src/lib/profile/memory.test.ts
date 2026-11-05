import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMemoryFacts, memoryFactSchema } from "./memory";
import { matchFieldKey } from "../apply/autofill";

test("application-specific answers cannot become profile facts", () => {
  for (const key of ["whyWorkHere", "friendsAndFamily", "coverLetter", "workAuth", "ssn", "__proto__"]) {
    assert.equal(memoryFactSchema.safeParse({ key, value: "Yes" }).success, false, key);
  }
  for (const label of ["Why do you want to work at this school?", "Describe your family", "Do you have friends and family that received this scholarship before?", "Tell us your school story"]) {
    assert.equal(matchFieldKey({ label, type: "textarea" }), null, label);
  }
});

test("memory validates saved values and profile links", () => {
  for (const input of [
    { key: "email", value: "bad" }, { key: "gradYear", value: "next year" },
    { key: "gpa", value: "-1" }, { key: "gpa", value: "6" },
    { key: "portfolioUrl", value: "javascript:alert(1)" },
    { key: "linkedinUrl", value: "https://linkedin.com.evil.test/person" },
    { key: "phone", value: "x".repeat(501) },
  ]) assert.equal(memoryFactSchema.safeParse(input).success, false);
  assert.deepEqual(memoryFactSchema.parse({ key: "phone", value: " 555-123-1234 " }), { key: "phone", value: "555-123-1234" });
  assert.equal(memoryFactSchema.safeParse({ key: "phone", value: null }).success, true);
});

test("forgotten facts cannot be restored by profile or resume fallback", () => {
  const result = applyMemoryFacts({ fullName: "Old Name", firstName: "Old", lastName: "Name", phone: "555", school: "Old School" }, [
    { key: "fullName", value: null }, { key: "phone", value: null }, { key: "school", value: "New School" },
    { key: "workAuth", value: "citizen" },
  ]);
  assert.deepEqual(result, { school: "New School" });
});

test("name changes rebuild derived parts while respecting explicit name overrides", () => {
  const result = applyMemoryFacts({ firstName: "Old", lastName: "Name" }, [
    { key: "fullName", value: "Alex Rivera" }, { key: "firstName", value: "Alexis" },
  ]);
  assert.deepEqual(result, { fullName: "Alex Rivera", firstName: "Alexis", lastName: "Rivera" });
});

test("a city is not reused as a street address, postal code, or state", () => {
  for (const label of ["Street address", "Address line 1", "Postal code", "State", "Country"]) assert.equal(matchFieldKey({ label }), null);
  assert.equal(matchFieldKey({ label: "Current city" }), "location");
});
