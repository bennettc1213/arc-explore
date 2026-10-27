/**
 * Server data for the scholarship explore views.
 *
 * Every view reads through here, and every row reaching it came through
 * `getFeed` — so the filters a student set, the feed's visibility rule (open,
 * not hidden, term not ended) and the Fit Score are the same ones the list
 * shows. Nothing is re-derived.
 *
 * LEAN BY CONSTRUCTION. A card carries the labels it renders and nothing more:
 * no description, no raw eligibility jsonb, and never `closed_at` — the plan
 * only ever holds open listings, and a close timestamp is a fact about our
 * crawler that must not be read as a fact about the award.
 */

import { and, eq } from "drizzle-orm";

import { applications, postings } from "@/db/schema";
import { db } from "@/db/client";
import { statusesForPostings } from "@/lib/applications/store";
import { statusMeta } from "@/lib/applications/types";
import { getFeed, type FeedFilters, type FeedItem } from "@/lib/feed";
import { presentFit, type TierId } from "@/lib/pricing/tiers";
import type { ScoreProfile } from "@/lib/score/fit";

import { formatAward } from "./display";
import { effortInputsFor, estimateEffort, formatEffort } from "./effort";
import {
  amountCeiling,
  buildPlanPayload,
  confirmedAmount,
  eligibilityFrom,
  fundingTotals,
  nextMoves,
  selectRows,
  SIGNED_OUT_CARD_CAP,
  type EligibilityStatus,
  type FundingTotals,
  type PlanInput,
  type PlanPayload,
  type ScholarshipCardData,
} from "./plan";

/** The aggregator whose rows link to an index page, not an application. */
const AGGREGATOR_HOSTS = ["scholarships.com"];

/** Enough to score and rank the whole open scholarship corpus (~2k today). */
const PLAN_CANDIDATE_LIMIT = 10_000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDeadline(d: Date): string {
  // UTC: deadlines are calendar dates, and midnight is an artifact of parsing
  // them — the same correction the reminders and the timing score make.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The one-line "why you match", read off the same field reason the Fit Score uses. */
function whyLine(item: FeedItem, eligibility: EligibilityStatus, profileReady: boolean): string {
  const field = item.fit.reasons.find((r) => r.dimension === "field");
  if (eligibility === "eligible" && field) return field.detail;
  if (eligibility === "check" && field) return field.detail;
  if (!profileReady) return "Add your profile to see whether you match.";
  return "Nothing it states rules you out, but it states little we can check.";
}

export function planInputFor(item: FeedItem): PlanInput {
  const requirements = effortInputsFor();
  return {
    id: item.id,
    amount: confirmedAmount(item),
    effort: estimateEffort(requirements),
    essays: requirements.essays,
    daysUntilDeadline: item.timing.daysUntilDeadline,
    isMarketing: item.isContentMarketing,
    eligibility: eligibilityFrom(item.fit),
    closed: item.closedAt !== null,
  };
}

export function cardFor(
  item: FeedItem,
  options: { tier: TierId; profileReady: boolean; tracked: ScholarshipCardData["tracked"] },
): ScholarshipCardData {
  const host = hostOf(item.url);
  const eligibility = eligibilityFrom(item.fit);
  const amount = confirmedAmount(item);
  const ceiling = amountCeiling(item);
  return {
    id: item.id,
    title: item.title,
    sponsor: item.company,
    url: item.url,
    sourceHost: host,
    viaAggregator: AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)),
    // The same rule the ranking uses, so the label and the row a card sits in
    // can never disagree about whether the amount is known.
    amountLabel:
      amount !== null
        ? (formatAward(item) ?? `$${amount.toLocaleString("en-US")}`)
        : ceiling !== null
          ? `up to $${ceiling.toLocaleString("en-US")}`
          : "Amount not confirmed",
    deadlineLabel: item.deadlineAt ? formatDeadline(item.deadlineAt) : null,
    closesLabel: item.dates.closes,
    effortLabel: formatEffort(estimateEffort(effortInputsFor())),
    eligibility,
    why: whyLine(item, eligibility, options.profileReady),
    fit: presentFit(item.fit, options.tier, { profileReady: options.profileReady }),
    // Scholarships are checked on a schedule, not polled live; `dates.verified`
    // already phrases that per freshness tier. Never a posting date.
    verifiedLabel: item.dates.verified,
    isMarketing: item.isContentMarketing,
    lowTrust: !item.isLottery && item.trustScore <= 40,
    tracked: options.tracked,
  };
}

export interface ScholarshipPlanArgs {
  profile: ScoreProfile;
  filters: FeedFilters;
  tier: TierId;
  profileReady: boolean;
  /** Null signed out — which is what switches the card cap on. */
  userId: string | null;
}

/**
 * The Plan view, capped and locked for a signed-out visitor.
 *
 * The cap is applied here and only here. The page and the JSON endpoint both
 * call this; neither re-implements it.
 */
export async function getScholarshipPlan(args: ScholarshipPlanArgs): Promise<PlanPayload> {
  const feed = await getFeed(args.profile, {
    ...args.filters,
    kind: "scholarship",
    limit: PLAN_CANDIDATE_LIMIT,
    reservePerKind: 0,
  });
  // Lottery awards live on their own shelf below the views, as in the list.
  const items = feed.items.filter((i) => !i.isLottery && i.closedAt === null);
  const inputs = items.map(planInputFor);

  // Only the listings the plan can actually show get a card, and only those
  // are looked up in the tracker.
  const shown = new Set([
    ...nextMoves(inputs).map((m) => m.id),
    ...selectRows(inputs).rows.flatMap((r) => r.ids),
  ]);
  const tracked = args.userId
    ? await statusesForPostings(args.userId, [...shown])
    : new Map<string, ScholarshipCardData["tracked"]>();

  const cards = new Map<string, ScholarshipCardData>();
  for (const item of items) {
    if (!shown.has(item.id)) continue;
    cards.set(
      item.id,
      cardFor(item, { tier: args.tier, profileReady: args.profileReady, tracked: tracked.get(item.id) ?? null }),
    );
  }

  return buildPlanPayload(inputs, cards, { cap: args.userId ? null : SIGNED_OUT_CARD_CAP });
}

/**
 * Dollars behind the student's tracked scholarships.
 *
 * Its own query rather than `listApplications`, which inner-joins
 * `organizations` and so silently drops every scholarship (they have no
 * `orgId`) — recorded in FIXES.md.
 */
export async function getFundingTotals(userId: string): Promise<FundingTotals> {
  const rows = await db
    .select({
      status: applications.status,
      amountStatus: postings.amountStatus,
      amountMin: postings.amountMin,
      amountMax: postings.amountMax,
      amountIsEstimated: postings.amountIsEstimated,
    })
    .from(applications)
    .innerJoin(postings, eq(applications.postingId, postings.id))
    .where(and(eq(applications.userId, userId), eq(postings.kind, "scholarship")));

  return fundingTotals(
    rows.map((r) => ({ status: r.status, amount: confirmedAmount(r) })),
    (s) => statusMeta(s).submitted,
  );
}
