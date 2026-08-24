/**
 * What the extension is allowed to know about the page the student is on.
 *
 * GET /api/extension/packet?url=<the tab's URL>
 *
 * Returns the student's own facts, formatted for autofill, for exactly one
 * posting — the one whose apply URL matches the tab. Nothing here is a new
 * capability: every value is something already shown on `/listing/[id]/apply`.
 * The extension is a different delivery mechanism for the same packet, not a
 * wider door onto it.
 *
 * THREE THINGS THIS DELIBERATELY WILL NOT RETURN.
 *
 *   1. ATTESTATION VALUES. Work authorization, sponsorship and the demographic
 *      questions come back as LABELS ONLY. `autofill.ts` refuses to fill them
 *      and has a blocklist to prove it — but a guarantee that depends on the
 *      client choosing not to misuse a value it was handed is not a guarantee.
 *      Not sending the value is.
 *   2. ANYTHING FOR A CLOSED OR HIDDEN POSTING. `findPostingByUrl` excludes
 *      both, for the same reason `getPosting` 404s a hidden row: a listing an
 *      operator took down must not come back through a side door.
 *   3. ANYTHING AT ALL WITHOUT A SESSION. 401, and the extension shows a sign
 *      in link. There is no anonymous mode — this is one person's private data.
 */

import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildAutofillValues } from "@/lib/apply/autofill";
import { corsHeaders, preflight } from "@/lib/apply/cors";
import { findPostingByUrl, type ExtensionPacket } from "@/lib/apply/extension";
import { buildApplicationPacket } from "@/lib/apply/packet";
import { getCoverLetter } from "@/lib/cover-letter/store";
import { statusesForPostings } from "@/lib/applications/store";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature } from "@/lib/pricing/tiers";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { coerceParsedResume } from "@/lib/resume/types";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return preflight(req.headers.get("origin"));
}

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const pageUrl = new URL(req.url).searchParams.get("url");
  if (!pageUrl) {
    return NextResponse.json({ error: "missing url" }, { status: 400, headers });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401, headers });
  }

  // The extension's autofill is an Apply-tier entitlement
  // ("extension_autofill_internships" in src/lib/pricing/tiers.ts). Checked
  // here, not just by hiding the button in the extension's own popup — the
  // popup is JavaScript the student's own browser runs and cannot be trusted
  // to enforce a plan against itself; this endpoint is the actual boundary.
  const tier = await getUserTier(user.id);
  const access = evaluateFeature(tier, "extension_autofill_internships");
  if (!access.usable) {
    return NextResponse.json(
      { error: "upgrade_required", feature: "extension_autofill_internships", minimumTier: access.minimumTier },
      { status: 403, headers },
    );
  }

  const posting = await findPostingByUrl(pageUrl);
  if (!posting) {
    // Not an error — most pages are not one of our postings. The extension
    // says "we don't have this one" rather than showing a failure.
    return NextResponse.json({ posting: null }, { status: 200, headers });
  }

  const [profile, resume, statuses, letter] = await Promise.all([
    getProfile(user.id),
    getLatestResume(user.id),
    statusesForPostings(user.id, [posting.id]),
    getCoverLetter(user.id, posting.id),
  ]);

  const parsed = resume ? coerceParsedResume(resume.parsed) : null;
  const packet = buildApplicationPacket({
    profile,
    resume: parsed,
    accountEmail: user.email ?? null,
  });

  // Links come from the resume and the profile, plus the two dedicated
  // columns — the extension tells LinkedIn from GitHub by host, so they are
  // passed as one list rather than pre-sorted here.
  const links = [
    ...(parsed?.links ?? []),
    profile?.portfolioUrl ?? null,
    profile?.linkedinUrl ?? null,
    profile?.githubUsername ? `https://github.com/${profile.githubUsername}` : null,
  ].filter((l): l is string => Boolean(l && l.trim()));

  const coverLetter = letter
    ? letter.paragraphs.map((p) => p.text.trim()).filter(Boolean).join("\n\n")
    : null;

  const values = buildAutofillValues({
    // Only the ordinary fields. `packet.attestations` is not passed, and there
    // is no AutofillKey it could map to even if it were.
    fields: packet.fields.map((f) => ({ key: f.key, value: f.value })),
    links,
    coverLetter,
  });

  const body: ExtensionPacket = {
    posting,
    values: values as Record<string, string>,
    attestations: packet.attestations.map((a) => a.label),
    hasCoverLetter: Boolean(coverLetter),
    alreadyApplied: statuses.get(posting.id) === "applied",
  };

  return NextResponse.json(body, { status: 200, headers });
}
