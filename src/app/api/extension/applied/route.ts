/**
 * The student says they submitted it.
 *
 * POST /api/extension/applied   { "postingId": "<uuid>" }
 *
 * Stamps the tracker and sends the confirmation email. Called when the student
 * clicks "I submitted this" in the extension, after they have pressed the
 * employer's own submit button.
 *
 * WHY THIS IS A CLAIM RATHER THAN AN OBSERVATION, AND WHY THAT IS FINE. We do
 * not watch the employer's form and we do not read their response — the
 * extension has no code that clicks submit and no way to know whether the POST
 * behind it succeeded. So this records what the student told us, exactly as
 * the tracker's own "mark applied" button always has, and `/metrics` already
 * says so in as many words: applications submitted is self-reported, and no
 * employer ever confirms anything to us. Naming it after what we observed
 * rather than what we wish we knew is the same rule the freshness badge
 * follows.
 *
 * Idempotent by construction: `setStatus` upserts on (user, posting) and
 * `appliedAt` is stamped once and never moved, so a double click cannot
 * produce two applications or quietly rewrite the date of the first.
 */

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { setStatus, statusesForPostings } from "@/lib/applications/store";
import { buildApplicationPacket } from "@/lib/apply/packet";
import { describeConfirmation, sendConfirmation } from "@/lib/apply/confirmation";
import { corsHeaders, preflight } from "@/lib/apply/cors";
import { composeConfirmation } from "@/lib/apply/wizard";
import { getPosting } from "@/lib/feed";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature } from "@/lib/pricing/tiers";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { toScoreProfile } from "@/lib/profile/types";
import { coerceParsedResume } from "@/lib/resume/types";
import { skillsFromParsedResume } from "@/lib/score/skills";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return preflight(req.headers.get("origin"));
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401, headers });
  }

  // Same Apply-tier gate as /api/extension/packet — the confirmation email
  // and auto-tracked Submitted status are part of the same bundled
  // entitlement, not a separately-gated feature, so they share one check.
  const tier = await getUserTier(user.id);
  const access = evaluateFeature(tier, "extension_autofill_internships");
  if (!access.usable) {
    return NextResponse.json(
      { error: "upgrade_required", feature: "extension_autofill_internships", minimumTier: access.minimumTier },
      { status: 403, headers },
    );
  }

  let postingId: string;
  try {
    const body = (await req.json()) as { postingId?: unknown };
    postingId = String(body.postingId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400, headers });
  }
  if (!postingId) {
    return NextResponse.json({ error: "missing postingId" }, { status: 400, headers });
  }

  const [profile, resume] = await Promise.all([getProfile(user.id), getLatestResume(user.id)]);
  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];

  // Resolve the posting BEFORE stamping anything: a bad id must not leave a
  // tracker row pointing at nothing.
  const posting = await getPosting(postingId, toScoreProfile(profile, resumeSkills));
  if (!posting) {
    return NextResponse.json({ error: "unknown posting" }, { status: 404, headers });
  }

  // Was it already applied? Read before the write, so the response can tell
  // the student "you had already marked this" rather than implying this click
  // is what recorded it.
  const before = await statusesForPostings(user.id, [postingId]);
  const wasAlreadyApplied = before.get(postingId) === "applied";

  await setStatus(user.id, postingId, "applied");

  const packet = buildApplicationPacket({
    profile,
    resume: resume ? coerceParsedResume(resume.parsed) : null,
    accountEmail: user.email ?? null,
  });

  const draft = composeConfirmation({
    displayName: profile?.displayName ?? null,
    title: posting.title,
    company: posting.company ?? null,
    kind: posting.kind,
    url: posting.url,
    deadlineAt: posting.deadlineAt,
    filled: packet.fields.filter((f) => f.value !== null).map((f) => f.label),
    answered: [],
    confirmed: packet.attestations.filter((f) => f.value !== null).map((f) => f.label),
  });

  // Only on the first stamp. Re-sending a receipt every time someone reopens
  // the extension on a page they already applied to is how a useful email
  // becomes one people filter.
  const email = wasAlreadyApplied
    ? ({ status: "not-configured" } as const)
    : await sendConfirmation(user.email, draft);

  return NextResponse.json(
    {
      ok: true,
      alreadyApplied: wasAlreadyApplied,
      email: email.status,
      emailMessage: wasAlreadyApplied ? "already recorded" : describeConfirmation(email),
    },
    { status: 200, headers },
  );
}
