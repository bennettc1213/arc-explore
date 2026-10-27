import test from "node:test";
import assert from "node:assert/strict";
import { isSchoolEmail, onboardingSchema } from "./onboarding";
import { EMPTY_PROFILE_INPUT } from "./profile/types";

test("student discount preview accepts academic domain endings, not lookalikes", () => {
  for (const email of [
    "student@stanford.edu",
    " STUDENT@SCHOOL.EDU ",
    "student@school.ac.uk",
    "student@school.edu.au",
  ]) {
    assert.equal(isSchoolEmail(email), true, email);
  }
  for (const email of [
    "student@gmail.com",
    "student@edu",
    "student@school.edu.evil.com",
    "student@school-edu.com",
    "student@@school.edu",
    "@school.edu",
    "student @school.edu",
  ]) {
    assert.equal(isSchoolEmail(email), false, email);
  }
});

test("onboarding validates goals and profile before persisting", () => {
  const valid = {
    goals: ["scholarships", "merit"],
    education: "transfer",
    degree: "Bachelor’s degree",
    profile: EMPTY_PROFILE_INPUT,
  };
  assert.equal(onboardingSchema.safeParse(valid).success, true);
  assert.equal(
    onboardingSchema.safeParse({ ...valid, goals: [] }).success,
    false,
  );
  assert.equal(
    onboardingSchema.safeParse({ ...valid, goals: ["unknown"] }).success,
    false,
  );
  assert.equal(
    onboardingSchema.safeParse({ ...valid, education: "unknown" }).success,
    false,
  );
  assert.equal(
    onboardingSchema.safeParse({
      ...valid,
      profile: { ...EMPTY_PROFILE_INPUT, gpa: "5.0" },
    }).success,
    false,
  );
  assert.equal(
    onboardingSchema.safeParse({
      ...valid,
      profile: { ...EMPTY_PROFILE_INPUT, githubUsername: "../../someone" },
    }).success,
    false,
  );
});
