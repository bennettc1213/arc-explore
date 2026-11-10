"use server";

import { getSessionUser } from "@/lib/auth";
import { getFeed } from "@/lib/feed";
import { getProfile, getLatestResume } from "@/lib/profile/store";
import { toScoringProfile } from "@/lib/score/v2/profile";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature, TIMING_PRIORITY_POINTS } from "@/lib/pricing/tiers";
import { FREE_RANKED_RESULTS, reservationFor } from "@/lib/feed-trim";
import { toDiscoveryCard } from "@/lib/discovery/cards";
import { buildScoutTiers, resolveScout } from "@/lib/scout/results";
import { scoutSchema } from "@/lib/scout/types";
import { scoutFreshness } from "@/lib/scout/freshness";
import { rememberScout } from "@/lib/scout/history-store";
import { scoutFeedFilters } from "@/lib/scout/filters";
import { describeError } from "@/lib/ingest/errors";
import { confirmedAmount } from "@/lib/scholarships/plan";

/** Every row the hard filters admit; the ladder trims to the window itself. */
const WHOLE_CORPUS = 1_000_000;

export type ScoutErrorKind = "invalid" | "unavailable";

export async function runScout(raw: unknown) {
  const parsed = scoutSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, errorKind: "invalid" as ScoutErrorKind };
  const p = parsed.data;
  const scout = resolveScout(p);
  try {
    const user = await getSessionUser();
    // Recent Scouts are account memory, not browser memory. A failure to save
    // this convenience must never stop a search from running.
    if (user) await rememberScout(user.id, p).catch(() => undefined);
    const [stored, resume, tier] = await Promise.all([user ? getProfile(user.id) : null, user ? getLatestResume(user.id) : null, getUserTier(user?.id)]);
    const profile = {
      ...toScoringProfile(stored, [], resume?.parsed),
      major: scout.interestText || null,
      school: p.school || stored?.school,
      gradYear: scout.gradYear || stored?.gradYear,
      workAuth: p.workAuth || stored?.workAuth,
      gpa: p.gpa === "" ? stored?.gpa : p.gpa,
      gpaScale: Number(p.gpaScale),
      residency: p.residency || null,
      priority: p.priority,
      targetLocations: scout.location ? [scout.location] : [],
      openToRemote: p.remote || scout.preferRemote,
    };
    const full = evaluateFeature(tier, "feed_full_depth").usable;
    const limit = full ? 100 : FREE_RANKED_RESULTS;
    // One ranked pass over everything the hard filters admit, served from the
    // feed's open-corpus memo when no merit/college filter is set. The ladder
    // partitions it; nothing is filtered by the interest or location text.
    const feed = await getFeed(profile, { ...scoutFeedFilters(p), limit: WHOLE_CORPUS, reservePerKind: 0, timingPoints: TIMING_PRIORITY_POINTS[tier] });
    const now = new Date();
    const result = buildScoutTiers(feed.items, scout, { limit, reservePerKind: p.kind === "both" ? reservationFor(limit) : 0, now });
    const displayed = result.tiers.flatMap((t) => t.items);
    return {
      data: {
        total: result.total,
        bestTotal: result.bestTotal,
        emptyBecause: result.emptyBecause,
        full,
        interest: scout.interestText,
        gradYear: scout.gradYear,
        location: scout.location,
        sourceSummary: {
          scholarships: displayed.filter((item) => item.kind === "scholarship").length,
          internships: displayed.filter((item) => item.kind === "internship").length,
          recentlyChecked: displayed.filter((item) => scoutFreshness(item.firstSeenAt, item.lastSeenAt, item.freshnessTier, now).state === "recent").length,
          latestSourceCheck: displayed.filter((item) => item.freshnessTier !== "unverified_static" && item.lastSeenAt <= now).reduce<string | null>((latest, item) => !latest || item.lastSeenAt.getTime() > Date.parse(latest) ? item.lastSeenAt.toISOString() : latest, null),
        },
        sections: result.tiers.map(({ items, ...tierInfo }) => ({
          ...tierInfo,
          items: items.map((item) => {
            const age = now.getTime() - item.firstSeenAt.getTime();
            return {
              ...toDiscoveryCard(item, tier, true),
              confirmedAward: confirmedAmount(item),
              isNew: age >= 0 && age <= 86_400_000,
              freshness: scoutFreshness(item.firstSeenAt, item.lastSeenAt, item.freshnessTier, now),
            };
          }),
        })),
        checkedAt: now.toISOString(),
      },
    };
  } catch (err) {
    // Logged with its real cause (SQLSTATE, not the statement and its params),
    // so a timeout or a dropped connection is diagnosable instead of being
    // reported to the student as an empty search.
    console.error("[scout] search failed:", describeError(err));
    return { error: "Your Scout could not reach the opportunity index. Your preferences are still here. Please try again.", errorKind: "unavailable" as ScoutErrorKind };
  }
}
export type ScoutData = NonNullable<Awaited<ReturnType<typeof runScout>>["data"]>;
