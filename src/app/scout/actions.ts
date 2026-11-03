"use server";

import { getSessionUser } from "@/lib/auth";
import { getFeed } from "@/lib/feed";
import { getProfile, getLatestResume } from "@/lib/profile/store";
import { toScoringProfile } from "@/lib/score/v2/profile";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature, TIMING_PRIORITY_POINTS } from "@/lib/pricing/tiers";
import { FREE_DAILY_RESULTS, reservationFor } from "@/lib/feed-trim";
import { toDiscoveryCard } from "@/lib/discovery/cards";
import { selectScoutSections } from "@/lib/scout/results";
import { scoutSchema } from "@/lib/scout/types";
import { scoutFreshness } from "@/lib/scout/freshness";

export async function runScout(raw: unknown) {
  const parsed = scoutSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  try {
    const user = await getSessionUser();
    const [stored, resume, tier] = await Promise.all([user ? getProfile(user.id) : null, user ? getLatestResume(user.id) : null, getUserTier(user?.id)]);
    const profile = { ...toScoringProfile(stored, [], resume?.parsed), major: p.field || null, school: p.school || stored?.school, gradYear: p.gradYear || stored?.gradYear, workAuth: p.workAuth || stored?.workAuth, gpa: p.gpa === "" ? stored?.gpa : p.gpa, gpaScale: Number(p.gpaScale), residency: p.residency || null, priority: p.priority, targetLocations: p.location ? [p.location] : [], openToRemote: p.remote };
    const full = evaluateFeature(tier, "feed_full_depth").usable;
    const limit = full ? 100 : FREE_DAILY_RESULTS;
    const feed = await getFeed(profile, { q: p.field || null, kind: p.kind === "both" ? null : p.kind, location: p.location || null, remoteOnly: p.remote, hideBlocked: true, excludeMarketing: true, meritOnly: p.merit, college: p.merit && p.college ? p.college : null, limit, reservePerKind: p.kind === "both" ? reservationFor(limit) : 0, timingPoints: TIMING_PRIORITY_POINTS[tier] });
    const now = new Date();
    const sections = selectScoutSections(feed.items, now);
    const displayed = sections.flatMap(section => section.items.map(entry => entry.item));
    return { data: { total: feed.total, full,
      sourceSummary: {
        scholarships: displayed.filter(item => item.kind === "scholarship").length,
        internships: displayed.filter(item => item.kind === "internship").length,
        recentlyChecked: displayed.filter(item => scoutFreshness(item.firstSeenAt, item.lastSeenAt, item.freshnessTier, now).state === "recent").length,
        latestSourceCheck: displayed.filter(item => item.freshnessTier !== "unverified_static" && item.lastSeenAt <= now).reduce<string | null>((latest, item) => !latest || item.lastSeenAt.getTime() > Date.parse(latest) ? item.lastSeenAt.toISOString() : latest, null),
      },
      sections: sections.map(section => ({ ...section, items: section.items.map(({ item, confirmedAward }) => ({ ...toDiscoveryCard(item, tier, true), confirmedAward, freshness: scoutFreshness(item.firstSeenAt, item.lastSeenAt, item.freshnessTier, now) })) })), checkedAt: now.toISOString() } };
  } catch {
    return { error: "Your Scout could not reach the opportunity index. Your preferences are still here. Please try again." };
  }
}
export type ScoutData = NonNullable<Awaited<ReturnType<typeof runScout>>["data"]>;
