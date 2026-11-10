import type { FeedItem } from "@/lib/feed";
import type { FieldKey } from "@/lib/score/fit";
import { relevanceScore, type RelevanceTerm } from "@/lib/score/relevance";
import { confirmedAmount } from "@/lib/scholarships/plan";
import { capPerSource, sourceCapFor, trimWithReservation } from "@/lib/feed-trim";
import { findInterest, relatedFields, type Interest } from "./interests";
import { locationMatcher } from "./places";
import { parseScoutText, termMatcher } from "./query";
import { parseQuery } from "@/lib/search/query";
import type { ScoutPreferences } from "./types";

/**
 * Tiered Scout results: a ladder from exact matches to broader ones, so a
 * search with any soft preference set never comes back empty, and every row
 * says which tier it is in and what was relaxed to reach it.
 *
 * Why a ladder (decided 2026-11-10). The deployed Scout ran the interest as an
 * AND keyword filter and the location as a hard filter: "cyber security, with
 * grad of 2028" found 35 rows and 0 scholarships. The fix before this one made
 * the interest a ranking hint only, which never empties but put "Entry Level
 * Java Developer" first for cybersecurity, because the shared taxonomy files
 * cybersecurity under software. A ladder keeps both properties: precise
 * matches first, then the taxonomy's related field, then the same interest
 * with preferences relaxed, then everything else the hard filters admit.
 *
 * Hard filters (kind, remote-only, strict location, merit, college, a blocking
 * requirement) are applied before the ladder. They are the only way to get no
 * results, and when they do, `emptyBecause` names them.
 */

export type ScoutTierId = "best" | "related" | "relaxed" | "broader";
export type SoftPreference = "location" | "deadline" | "award" | "remote";

/** The Scout, with facts typed into the interest box resolved into fields. */
export interface ResolvedScout {
  prefs: ScoutPreferences;
  interestText: string;
  interest: Interest | null;
  /** Terms deciding the "best" tier: the catalogue's, or the typed words. */
  terms: string[];
  related: FieldKey[];
  gradYear: number | null;
  location: string;
  /** "remote" typed in the box: preferred, not required. */
  preferRemote: boolean;
}

export function resolveScout(prefs: ScoutPreferences): ResolvedScout {
  const parsed = parseScoutText(prefs.field);
  const typed = parsed.interest;
  let found = findInterest(typed);
  // "compsci", "cs", "premed": the search parser already knows these
  // abbreviations, so its expansions get a turn at the catalogue.
  if (!found && typed) {
    for (const alt of parseQuery(typed).terms.flatMap((t) => t.alternates.slice(1))) {
      const hit = findInterest(alt);
      if (hit) { found = { interest: hit.interest, how: "term" }; break; }
    }
  }
  const interest = found?.interest ?? null;
  // Typed words are whole words and OR'd, never AND'd: one matching word is a
  // better tier than none, and "basket" must not find "Basketball".
  const typedWords = typed.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 3 && !/^(and|the|for|with)$/.test(w));
  const typedTerms = typed ? [...new Set([`${typed.toLowerCase()}!`, ...typedWords.map((w) => `${w}!`)])] : [];
  // A phrase narrower than its entry ("marine biology" inside Biology) keeps
  // the phrase first, so the rows that say "marine biology" lead the tier.
  const narrower = found?.how === "contains";
  return {
    prefs,
    interestText: narrower ? typed : interest?.label ?? typed,
    interest,
    terms: interest ? [...(narrower ? [`${typed.toLowerCase()}!`] : []), ...interest.terms] : typedTerms,
    related: relatedFields(interest, typed),
    gradYear: prefs.gradYear === "" ? parsed.gradYear : prefs.gradYear,
    location: prefs.location || parsed.location || "",
    preferRemote: !prefs.remote && parsed.remote,
  };
}

const SOFT_LABEL: Record<SoftPreference, (r: ResolvedScout) => string> = {
  location: (r) => r.location,
  deadline: (r) => `deadline within ${r.prefs.deadline} days`,
  award: (r) => `awards of $${Number(r.prefs.minAward).toLocaleString("en-US")}+`,
  remote: () => "remote",
};

export interface ScoutTier {
  id: ScoutTierId;
  title: string;
  description: string;
  /** Preferences at least one row in this tier does not meet, in words. */
  relaxed: string[];
  items: FeedItem[];
}

export interface ScoutTierResult {
  tiers: ScoutTier[];
  /** Rows admitted by the hard filters, before the window was trimmed. */
  total: number;
  /** How many of `total` landed in the best tier. */
  bestTotal: number;
  /** When nothing was admitted: the hard filters that did it. */
  emptyBecause: string[];
}

function haystack(item: FeedItem): string[] {
  return [item.title, item.company, item.eligibility.join(" "), item.skills.join(" ")];
}

/** Rows a Scout can ever show: open, not a lottery, not ruled out, not past deadline. */
export function admissible(item: FeedItem, now: Date): boolean {
  return !item.closedAt && !item.isLottery && !item.fit.blocked && (item.deadlineAt === null || item.deadlineAt.getTime() >= now.getTime());
}

export function buildScoutTiers(
  ranked: FeedItem[],
  scout: ResolvedScout,
  opts: { limit: number; reservePerKind: number; now?: Date },
): ScoutTierResult {
  const now = opts.now ?? new Date();
  const { prefs } = scout;
  const matchLocation = scout.location ? locationMatcher(scout.location) : null;

  // Hard filters first. Kind, remote, merit and college are already applied
  // by the feed query; strict location is the one applied here.
  // A row that states no location at all (nearly every scholarship) is
  // unknown, and unknown is dropped rather than scored as a miss, so it meets
  // a location preference and survives a strict one.
  const strict = Boolean(prefs.locationStrict && matchLocation);
  const inArea = (i: FeedItem) => !matchLocation || i.locations.length === 0 || matchLocation(i.locations);
  const pool = ranked.filter((i) => admissible(i, now) && (!strict || inArea(i)));
  if (pool.length === 0) {
    return { tiers: [], total: 0, bestTotal: 0, emptyBecause: hardFilterNames(scout, strict) };
  }

  const matchers = scout.terms.map(termMatcher);
  const exact = (i: FeedItem) => matchers.length > 0 && haystack(i).some((h) => matchers.some((m) => m.test(h)));
  const related = (i: FeedItem) => scout.related.length > 0 && i.fields.some((f) => scout.related.includes(f));

  const deadlineDays = prefs.deadline === "any" ? null : Number(prefs.deadline);
  const minAward = Number(prefs.minAward);
  const unmet = (i: FeedItem): SoftPreference[] => {
    const out: SoftPreference[] = [];
    // A remote role can be done from the place they named, so it meets the
    // preference; a strict location is a filter and was applied above.
    if (!strict && !inArea(i) && !i.isRemote) out.push("location");
    if (deadlineDays !== null && !(i.deadlineAt && i.deadlineAt.getTime() - now.getTime() <= deadlineDays * 86_400_000)) out.push("deadline");
    if (minAward > 0 && i.kind === "scholarship" && (confirmedAmount(i) ?? 0) < minAward) out.push("award");
    if (scout.preferRemote && !i.isRemote) out.push("remote");
    return out;
  };

  const hasInterest = matchers.length > 0 || scout.related.length > 0;
  const buckets: Record<ScoutTierId, FeedItem[]> = { best: [], related: [], relaxed: [], broader: [] };
  const relaxedSeen = new Set<SoftPreference>();
  for (const item of pool) {
    const missing = unmet(item);
    const isExact = exact(item);
    const onTopic = !hasInterest || isExact || related(item);
    if (onTopic && missing.length === 0) (isExact || !hasInterest ? buckets.best : buckets.related).push(item);
    else if (onTopic) {
      buckets.relaxed.push(item);
      missing.forEach((m) => relaxedSeen.add(m));
    } else buckets.broader.push(item);
  }

  // Inside the best tier, how well a row states the interest comes first; the
  // feed's own ranking (fit, timing) is the tiebreaker, via the stable sort.
  if (matchers.length) {
    const bare = scout.terms.map((t) => t.replace(/!$/, ""));
    const term: RelevanceTerm[] = [{ literal: bare[0], alternates: bare }];
    const score = new Map(buckets.best.map((i) => [i.id, relevanceScore(i, term)]));
    buckets.best.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
  }

  const order: ScoutTierId[] = ["best", "related", "relaxed", "broader"];
  const tierOf = new Map<string, ScoutTierId>();
  for (const id of order) for (const i of buckets[id]) tierOf.set(i.id, id);
  const ladder = order.flatMap((id) => buckets[id]);
  const capped = capPerSource(ladder, sourceCapFor(opts.limit), (i) => i.company);
  const window = trimWithReservation(capped, opts.limit, opts.reservePerKind);

  const copy = tierCopy(scout, [...relaxedSeen].map((p) => SOFT_LABEL[p](scout)));
  const tiers = order
    .map((id) => ({ id, ...copy[id], items: window.filter((i) => tierOf.get(i.id) === id) }))
    .filter((t) => t.items.length > 0);
  return { tiers, total: pool.length, bestTotal: buckets.best.length, emptyBecause: [] };
}

function hardFilterNames(scout: ResolvedScout, strict: boolean): string[] {
  const p = scout.prefs;
  const out: string[] = [];
  if (p.remote) out.push("remote only");
  if (strict) out.push(`only ${scout.location}`);
  if (p.merit) out.push("merit awards only");
  if (p.merit && p.college) out.push(`college: ${p.college}`);
  // Merit awards are scholarships by definition; naming both is noise.
  if (p.kind !== "both" && !p.merit) out.push(`${p.kind}s only`);
  return out;
}

function tierCopy(scout: ResolvedScout, relaxed: string[]): Record<ScoutTierId, { title: string; description: string; relaxed: string[] }> {
  const what = scout.interestText;
  const fieldNames = scout.related.map((f) => f.replace(/_/g, " ")).slice(0, 3).join(", ");
  const where = scout.location ? ` in ${scout.location}` : "";
  return {
    best: what
      ? { title: `Best matches for ${what}`, description: `Listings that name ${what}${where ? ` and match your other preferences` : ""}.`, relaxed: [] }
      : { title: "Top matches for you", description: "Ranked by your profile and preferences.", relaxed: [] },
    related: { title: `Related${fieldNames ? ` in ${fieldNames}` : " to your interest"}`, description: `Same field as ${what || "your interest"}, without naming it directly.`, relaxed: [] },
    relaxed: {
      title: relaxed.length ? `Outside ${relaxed.join(" / ")}` : "Close matches",
      description: `On your topic, but not ${relaxed.length ? `matching ${relaxed.join(", ")}` : "every preference"}. Shown so you still have options.`,
      relaxed,
    },
    broader: { title: "More to explore", description: what ? `Not specific to ${what}, ranked by your profile.` : "Ranked by your profile.", relaxed: what ? ["interest"] : [] },
  };
}
