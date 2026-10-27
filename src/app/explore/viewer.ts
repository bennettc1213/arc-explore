/**
 * Who is looking at the feed, and what they are scored against.
 *
 * Moved out of `page.tsx` when the scholarship Plan view gained a JSON endpoint
 * (`/api/explore/scholarships`): the page and the endpoint must resolve the
 * viewer identically, or the locked cards the page hides would be a different
 * set from the ones the endpoint hides. One definition per rule.
 */

import { getSessionUser, type SessionUser } from "@/lib/auth";
import { getUserTier } from "@/lib/pricing/entitlements";
import type { TierId } from "@/lib/pricing/tiers";
import { getLatestResume, getProfile, type StoredResume } from "@/lib/profile/store";
import {
  isProfileReadyForFit,
  parseLocations,
  toScoreProfile,
  type UserProfile,
} from "@/lib/profile/types";
import type { ScoreProfile } from "@/lib/score/fit";
import { skillsFromParsedResume } from "@/lib/score/skills";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Signed out, the profile lives in the URL — the whole product works without an account. */
export function profileFromParams(sp: SearchParams): ScoreProfile {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const all = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };
  const gradYear = Number(one("gradYear"));

  return {
    major: one("major") ?? null,
    gradYear: Number.isFinite(gradYear) && gradYear > 0 ? gradYear : null,
    workAuth: one("workAuth") ?? null,
    targetLocations: parseLocations(one("locations") ?? ""),
    targetVerticals: all("targetVerticals"),
    openToRemote: one("remote") !== "0",
  };
}

/**
 * The feed's view preferences — read from the URL but never saved on a saved
 * search (see `filtersFromParams`). One reader, shared by the page and the
 * Plan view's endpoint.
 */
export function viewPrefsFromParams(sp: SearchParams) {
  return {
    includeClosed: sp.includeClosed === "1",
    includeInferred: sp.includeInferred !== "0",
    includeUnknownAmounts: sp.includeUnknownAmounts === "1",
    hideBlocked: sp.hideBlocked === "1",
    excludeMarketing: sp.excludeMarketing === "1",
  };
}

/** Whether a fit label may be shown — the four fields `presentFit` requires. */
export function profileReadyFor(user: SessionUser | null, stored: UserProfile | null, profile: ScoreProfile): boolean {
  return user
    ? isProfileReadyForFit(stored)
    : isProfileReadyForFit({
        major: profile.major ?? null,
        gradYear: profile.gradYear ?? null,
        workAuth: profile.workAuth ?? null,
        targetLocations: profile.targetLocations ?? [],
      });
}

export interface ExploreViewer {
  user: SessionUser | null;
  stored: UserProfile | null;
  resume: StoredResume | null;
  tier: TierId;
  profile: ScoreProfile;
  resumeSkills: string[];
  profileReady: boolean;
}

/** For callers that need the viewer and nothing else the page loads. */
export async function resolveViewer(sp: SearchParams): Promise<ExploreViewer> {
  const user = await getSessionUser();
  const [stored, resume, tier] = await Promise.all([
    user ? getProfile(user.id) : null,
    user ? getLatestResume(user.id) : null,
    getUserTier(user?.id),
  ]);
  const resumeSkills = resume ? skillsFromParsedResume(resume.parsed) : [];
  const profile = user ? toScoreProfile(stored, resumeSkills) : profileFromParams(sp);
  return {
    user,
    stored,
    resume,
    tier,
    profile,
    resumeSkills,
    profileReady: profileReadyFor(user, stored, profile),
  };
}
