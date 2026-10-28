import { z } from "zod";
import type { FeedItem } from "@/lib/feed";
import { presentFit, type TierId } from "@/lib/pricing/tiers";
import { formatAward } from "@/lib/scholarships/display";
import { formatTerm } from "@/lib/terms/display";
import type { PresentedAssessment } from "@/lib/score/v2/types";

const reasonSchema = z.object({ label: z.string(), detail: z.string(), kind: z.enum(["good", "bad", "unknown"]) });
export const discoveryCardSchema = z.object({
  id: z.string(), kind: z.enum(["internship", "scholarship"]), title: z.string(), company: z.string(),
  url: z.string().url().refine(v => /^https?:\/\//i.test(v)),
  locations: z.array(z.string()), remote: z.boolean(), term: z.string().nullable(),
  award: z.string().nullable(), awardsCount: z.number().int().nonnegative().nullable(),
  deadline: z.string().nullable(), closes: z.string().nullable(), verified: z.string(), posted: z.string().nullable(),
  score: z.number().nullable(), bucketLabel: z.string().nullable(), scoreKnown: z.number(), scoreTotal: z.number(), scoreLocked: z.boolean(),
  reasons: z.array(reasonSchema), eligibility: z.array(z.string()),
  skills: z.array(z.string()), matchedSkills: z.array(z.string()), missingSkills: z.array(z.string()),
  timing: z.number().nullable(), timingLabel: z.string(), timingKnown: z.number(), timingTotal: z.number(),
  warnings: z.array(z.string()), closed: z.boolean(), profileReady: z.boolean(),
  assessment: z.custom<PresentedAssessment>().optional(),
  detailsHref: z.string().regex(/^\/listing\/[A-Za-z0-9%._~-]+(?:\?[^#]*)?$/).optional(),
});
export type DiscoveryCard = z.infer<typeof discoveryCardSchema>;
export const GUEST_SAVES_KEY = "instela.discovery.saved.v1";

/** Retain public listing facts, not a guest's profile-derived scoring data. */
export function savedSnapshot(card: DiscoveryCard): DiscoveryCard {
  return { ...card, score: null, bucketLabel: null, scoreKnown: 0, scoreLocked: false, profileReady: false, reasons: [], matchedSkills: [], missingSkills: [], assessment: undefined, detailsHref: undefined, warnings: card.warnings.filter(warning => !warning.startsWith("Check eligibility: your profile")) };
}

/** Presentation is gated BEFORE crossing the server/client boundary. */
export function toDiscoveryCard(item: FeedItem, tier: TierId, profileReady: boolean, scoringQuery = ""): DiscoveryCard {
  const fit = presentFit(item.fit, tier, { profileReady });
  const warnings: string[] = [];
  if (item.applyLinkDead) warnings.push("The application link may be unavailable. Check the source before preparing your application.");
  if (item.closedAt) warnings.push("This listing is closed. Check the source for a future application cycle.");
  if (item.fit.blocked) warnings.push("Check eligibility: your profile may conflict with a stated requirement.");
  if (item.isContentMarketing) warnings.push("Sponsor / marketing award. Review the sponsor's requirements carefully.");
  if (item.isLottery) warnings.push("Random drawing / sweepstakes, not a judged scholarship.");
  else if (item.kind === "scholarship" && item.trustScore <= 40) warnings.push(...item.trustReasons.filter(r => r.kind === "caution").map(r => r.detail));
  if (item.workAuth === "citizenship_required") warnings.push("U.S. citizenship required.");
  if (item.workAuth === "no_sponsorship") warnings.push("Visa sponsorship is not offered.");
  return {
    id: item.id, kind: item.kind, title: item.title, company: item.company, url: item.url,
    locations: item.locations, remote: item.isRemote, term: item.term ? formatTerm(item) : null,
    award: formatAward(item), awardsCount: item.awardsCount,
    deadline: item.deadlineAt ? item.deadlineAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null,
    closes: item.dates.closes, verified: item.dates.verified, posted: item.dates.posted ?? null,
    score: fit.score, bucketLabel: fit.bucketLabel, scoreKnown: fit.known ?? 0, scoreTotal: fit.total ?? 0, scoreLocked: fit.locked,
    reasons: fit.reasons.map(r => ({ label: r.label, detail: r.detail, kind: r.kind })),
    eligibility: item.eligibility, skills: fit.locked ? [] : item.skills,
    matchedSkills: fit.skills.matched, missingSkills: fit.skills.missing,
    timing: item.closedAt ? null : item.timing.score, timingLabel: item.timing.label,
    timingKnown: item.timing.knownSignals, timingTotal: item.timing.totalSignals,
    warnings, closed: Boolean(item.closedAt), profileReady: fit.assessment?.hasProfile ?? profileReady,
    assessment: fit.assessment, detailsHref: `/listing/${encodeURIComponent(item.id)}${scoringQuery ? `?${scoringQuery}` : ""}`,
  };
}

/** Browser storage is untrusted; never render unsafe URLs or malformed snapshots. */
export function readGuestSaves(raw: string | null): DiscoveryCard[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cards = parsed.slice(0, 100).flatMap(value => {
      // Browser saves are public snapshots, never a trusted source of personal assessments.
      const snapshot = value && typeof value === "object" ? { ...value, assessment: undefined, detailsHref: undefined } : value;
      const result = discoveryCardSchema.safeParse(snapshot);
      return result.success ? [savedSnapshot(result.data)] : [];
    });
    return [...new Map(cards.map(card => [card.id, card])).values()];
  } catch { return []; }
}
