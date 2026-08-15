import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildApplicationPacket, type PacketField } from "./packet";
import { EMPTY_PARSED_RESUME, type ParsedResume } from "../resume/types";
import type { UserProfile } from "../profile/types";

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  githubUsername: null,
  linkedinUrl: null,
  id: "u1",
  displayName: "Jordan Ellis",
  school: "University of Nevada, Reno",
  major: "Computer Science",
  gradYear: 2027,
  gpa: 3.7,
  workAuth: "us_citizen",
  targetVerticals: [],
  targetLocations: ["San Francisco"],
  openToRemote: true,
  portfolioUrl: null,
  ...over,
});

const resume = (over: Partial<ParsedResume> = {}): ParsedResume => ({
  ...EMPTY_PARSED_RESUME,
  name: "Jordan Ellis",
  email: "jordan@personal.example",
  phone: "(555) 010-2288",
  ...over,
});

const field = (fields: PacketField[], key: string): PacketField => {
  const f = fields.find((x) => x.key === key);
  assert.ok(f, `no field "${key}"`);
  return f;
};

describe("buildApplicationPacket", () => {
  it("fills what we hold and records where each value came from", () => {
    const { fields } = buildApplicationPacket({
      profile: profile(),
      resume: resume(),
      accountEmail: "jordan@school.edu",
    });

    assert.equal(field(fields, "name").value, "Jordan Ellis");
    assert.equal(field(fields, "school").source, "profile");
    assert.equal(field(fields, "phone").value, "(555) 010-2288");
    assert.equal(field(fields, "phone").source, "resume");
  });

  /**
   * Magic-link auth proves the account address works; a printed resume address
   * proves nothing. But a student may genuinely check the other one, so the
   * difference is surfaced rather than silently resolved.
   */
  it("prefers the proven account address and flags a different one on the resume", () => {
    const { fields } = buildApplicationPacket({
      profile: profile(),
      resume: resume(),
      accountEmail: "jordan@school.edu",
    });

    const email = field(fields, "email");
    assert.equal(email.value, "jordan@school.edu");
    assert.equal(email.source, "account");
    assert.match(email.note ?? "", /jordan@personal\.example/);
  });

  it("falls back to the resume address when there is no account", () => {
    const { fields } = buildApplicationPacket({
      profile: profile(),
      resume: resume(),
      accountEmail: null,
    });
    assert.equal(field(fields, "email").value, "jordan@personal.example");
    assert.equal(field(fields, "email").source, "resume");
  });

  /**
   * One of the two is about to go onto an application wrong, and only the
   * student knows which. Picking silently would put a number they never
   * checked in front of an employer.
   */
  it("reports a profile/resume disagreement instead of quietly choosing", () => {
    const { fields } = buildApplicationPacket({
      profile: profile({ gpa: 3.5 }),
      resume: resume({ gpa: 3.7 }),
      accountEmail: null,
    });

    const gpa = field(fields, "gpa");
    assert.equal(gpa.value, "3.5", "the profile is the more recent, direct statement");
    assert.deepEqual(gpa.conflict, { profile: "3.5", resume: "3.7" });
  });

  it("does not invent a conflict when the two agree", () => {
    const { fields } = buildApplicationPacket({
      profile: profile(),
      resume: resume({ school: "University of Nevada, Reno" }),
      accountEmail: null,
    });
    assert.equal(field(fields, "school").conflict, undefined);
  });

  it("leaves what it does not hold as null, with a note rather than a blank", () => {
    const { fields } = buildApplicationPacket({
      profile: null,
      resume: null,
      accountEmail: null,
    });

    for (const f of fields) {
      assert.equal(f.value, null, `${f.key} should be null`);
      assert.equal(f.source, "missing");
    }
    assert.match(field(fields, "school").note ?? "", /add it to your profile/);
  });

  it("counts completeness from what is actually filled", () => {
    const empty = buildApplicationPacket({ profile: null, resume: null, accountEmail: null });
    assert.equal(empty.known, 0);
    assert.ok(empty.total > 0);

    const full = buildApplicationPacket({
      profile: profile(),
      resume: resume({ links: ["github.com/jordan"] }),
      accountEmail: "jordan@school.edu",
    });
    assert.ok(full.known > empty.known);
  });

  it("dedupes links across resume and profile", () => {
    const { fields } = buildApplicationPacket({
      profile: profile({ portfolioUrl: "github.com/Jordan" }),
      resume: resume({ links: ["github.com/jordan"] }),
      accountEmail: null,
    });
    assert.equal(field(fields, "links").value, "github.com/jordan");
  });
});

/**
 * The rule that keeps this feature from doing harm. These are legal
 * declarations, not form-filling convenience.
 */
describe("attestations", () => {
  it("never pre-fills sponsorship or demographics, even with a full profile", () => {
    const { attestations } = buildApplicationPacket({
      profile: profile(),
      resume: resume(),
      accountEmail: "jordan@school.edu",
    });

    const sponsorship = field(attestations, "sponsorship");
    assert.equal(sponsorship.value, null);
    assert.match(sponsorship.note ?? "", /answer this yourself/);

    const demographics = field(attestations, "demographics");
    assert.equal(demographics.value, null);
    assert.match(demographics.note ?? "", /never store or infer/);
  });

  // We hold it because the student typed it. That makes it theirs to confirm,
  // not ours to assert on a form they sign.
  it("shows work authorization as the student's own statement to confirm", () => {
    const { attestations } = buildApplicationPacket({
      profile: profile({ workAuth: "needs_sponsorship" }),
      resume: resume(),
      accountEmail: null,
    });

    const auth = field(attestations, "workAuth");
    assert.equal(auth.value, "need sponsorship");
    assert.match(auth.note ?? "", /legal declaration/);
  });

  it("refuses to guess a work authorization it does not hold", () => {
    const { attestations } = buildApplicationPacket({
      profile: profile({ workAuth: null }),
      resume: resume(),
      accountEmail: null,
    });

    const auth = field(attestations, "workAuth");
    assert.equal(auth.value, null);
    assert.match(auth.note ?? "", /we will not guess/);
  });

  it("keeps attestations out of the copy-straight-in fields", () => {
    const { fields } = buildApplicationPacket({
      profile: profile(),
      resume: resume(),
      accountEmail: null,
    });
    for (const key of ["workAuth", "sponsorship", "demographics"]) {
      assert.equal(fields.find((f) => f.key === key), undefined, `${key} must not be a plain field`);
    }
  });
});
