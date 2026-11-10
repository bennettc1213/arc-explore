import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScoutText, termMatcher } from "./query";
import { findInterest, relatedFields } from "./interests";
import { locationMatcher } from "./places";
import { resolveScout } from "./results";
import { defaultScout } from "./types";

test("the live query: grad year is lifted out of the interest box", () => {
  assert.deepEqual(parseScoutText("cyber security, with grad of 2028"), { interest: "cyber security", gradYear: 2028, location: null, remote: false });
  assert.equal(parseScoutText("class of '29 compsci").gradYear, 2029);
  assert.equal(parseScoutText("graduating 2027 nursing").interest, "nursing");
  assert.equal(parseScoutText("nursing 2031").gradYear, 2031);
  // Two bare years name nothing in particular, so neither is taken.
  assert.equal(parseScoutText("2027 or 2028").gradYear, null);
});

test("states and remote are lifted out; a two-letter code only after 'in' and in capitals", () => {
  assert.equal(parseScoutText("pre med in California").location, "California");
  assert.equal(parseScoutText("pre med in California").interest, "pre med");
  assert.equal(parseScoutText("engineering in West Virginia").location, "West Virginia");
  assert.equal(parseScoutText("finance in TX").location, "Texas");
  assert.equal(parseScoutText("get in it").location, null);
  assert.deepEqual(parseScoutText("graphic design remote"), { interest: "graphic design", gradYear: null, location: null, remote: true });
});

test("term matching: acronyms are case-sensitive, short and '!' terms are whole words, long terms are prefixes", () => {
  assert.equal(termMatcher("IT").test("IT Support Intern"), true);
  assert.equal(termMatcher("IT").test("make it count"), false);
  assert.equal(termMatcher("cyber!").test("Cyber and Forensic Analyst"), true);
  assert.equal(termMatcher("cyber!").test("Delete Cyberbullying Scholarship"), false);
  assert.equal(termMatcher("art").test("Fine Arts Award"), true);
  assert.equal(termMatcher("art").test("Start-up Intern"), false);
  assert.equal(termMatcher("accountan").test("Staff Accountant Intern"), true);
  assert.equal(termMatcher("full stack").test("Full-Stack Developer"), true);
});

test("interests resolve by label, term, abbreviation or containment", () => {
  assert.equal(findInterest("cyber security")?.interest.label, "Cybersecurity");
  assert.equal(findInterest("Cyber-Security")?.how, "exact");
  assert.equal(findInterest("infosec")?.interest.label, "Cybersecurity");
  assert.equal(findInterest("marine biology")?.how, "contains");
  assert.equal(findInterest("underwater basket weaving"), null);
  assert.equal(resolveScout({ ...defaultScout, field: "compsci" }).interestText, "Computer science");
  const marine = resolveScout({ ...defaultScout, field: "marine biology" });
  assert.equal(marine.interestText, "marine biology");
  assert.equal(marine.terms[0], "marine biology!");
});

test("related fields prefer the label, then a specific field over the broad buckets", () => {
  assert.deepEqual(relatedFields(findInterest("Computer science")!.interest, "").sort(), ["data_ai", "software"]);
  assert.deepEqual(relatedFields(findInterest("Law & pre-law")!.interest, ""), ["law"]);
});

test("location matching reads full names and standalone postal codes only", () => {
  const tx = locationMatcher("Texas");
  assert.equal(tx(["San Antonio, TX"]), true);
  assert.equal(tx(["Irving Texas United States"]), true);
  assert.equal(tx(["Austin, MN, United States"]), false);
  assert.equal(locationMatcher("Indiana")(["INTERNATIONAL"]), false);
  assert.equal(locationMatcher("Denver")(["Hybrid - Denver"]), true);
});
