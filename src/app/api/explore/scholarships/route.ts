/**
 * The scholarship Plan view as JSON.
 *
 * GET /api/explore/scholarships?<the same params /explore takes>
 *
 * The same `getScholarshipPlan` the page renders from, through the same viewer
 * resolution, so a signed-out request gets the same cap and the same locked
 * slots — positional keys and nothing else. Reading this endpoint directly is
 * therefore no way around the blur.
 *
 * Lean on purpose: no descriptions, no raw eligibility, no close timestamps.
 */

import { NextResponse, type NextRequest } from "next/server";

import { resolveViewer, viewPrefsFromParams, type SearchParams } from "@/app/explore/viewer";
import { getScholarshipPlan } from "@/lib/scholarships/explore";
import { filtersFromParams } from "@/lib/searches/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp: SearchParams = {};
  for (const [key, value] of request.nextUrl.searchParams) {
    const prev = sp[key];
    sp[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }

  const viewer = await resolveViewer(sp);
  const prefs = viewPrefsFromParams(sp);
  const plan = await getScholarshipPlan({
    profile: viewer.profile,
    // The plan only ever holds open listings, so includeClosed is forced off.
    filters: { ...filtersFromParams(sp), ...prefs, includeClosed: false },
    tier: viewer.tier,
    profileReady: viewer.profileReady,
    userId: viewer.user?.id ?? null,
  });

  // Per-viewer: a cached signed-in response must never be served to a visitor.
  return NextResponse.json(plan, { headers: { "Cache-Control": "private, no-store" } });
}
