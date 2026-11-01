import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, postings, postingSources, sources } from "@/db/schema";
import { getFeed, type FeedItem } from "@/lib/feed";
import { toScoreProfile } from "@/lib/profile/types";
import { formatAward } from "@/lib/scholarships/display";
import { trimWithReservation } from "@/lib/feed-trim";
import { PREVIEW_AREAS, type LandingListing, type PreviewLane } from "./landing-preview";

const TTL_MS = 60_000;
interface LandingSnapshot { lanes: PreviewLane[]; hero: LandingListing[] }
let previewMemo: { at: number; value: LandingSnapshot } | null = null;
let previewPending: Promise<LandingSnapshot> | null = null;

function publicListing(item: FeedItem): LandingListing {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    company: item.company,
    detail: item.kind === "scholarship"
      ? formatAward(item) ?? "Award amount not stated"
      : item.isRemote ? "Remote" : item.locations.slice(0, 2).join(" · ") || "Location not stated",
    verified: item.dates.verified,
    deadline: item.dates.closes,
    caution: item.applyLinkDead,
  };
}

/** Use the actual feed filters and taxonomy, and coalesce cold concurrent requests. */
async function getLandingSnapshot(): Promise<LandingSnapshot> {
  if (previewMemo && Date.now() - previewMemo.at < TTL_MS) return previewMemo.value;
  if (previewPending) return previewPending;
  // Classify once with the feed's own derived fields. Fetch before grouping so
  // the default 500-row window cannot hide a whole field from the preview.
  previewPending = getFeed(toScoreProfile(null), {
    limit: Number.MAX_SAFE_INTEGER, excludeMarketing: true,
  }).then(result => {
    const lanes = PREVIEW_AREAS.map(area => {
      const items = result.items.filter(item => item.kind === "internship" && item.fields.includes(area.key));
      return { key: area.key as string, total: items.length, items: items.slice(0, 3).map(publicListing) };
    });
    const judged = result.items.filter(item => item.kind === "scholarship" && !item.isLottery);
    lanes.push({ key: "scholarship", total: judged.length, items: judged.slice(0, 3).map(publicListing) });
    const value = { lanes, hero: trimWithReservation(result.items.filter(item => !item.isLottery), 3, 1).map(publicListing) };
    previewMemo = { at: Date.now(), value };
    return value;
  }).finally(() => { previewPending = null; });
  return previewPending;
}

export async function getLandingPreview(): Promise<PreviewLane[]> {
  return (await getLandingSnapshot()).lanes;
}

export async function getLandingHero(): Promise<LandingListing[]> {
  return (await getLandingSnapshot()).hero;
}

export interface SourceCoverage {
  mode: "registry" | "observed";
  employerBoards: number;
  scholarshipSources: number;
  checkedRecently: number;
  activeSources: number;
  latestCheck: string | null;
  measuredAt: string;
}

let coverageMemo: { at: number; value: SourceCoverage } | null = null;

export async function getSourceCoverage(): Promise<SourceCoverage> {
  if (coverageMemo && Date.now() - coverageMemo.at < TTL_MS) return coverageMemo.value;
  const [row] = await db.select({
    employerBoards: sql<number>`count(*) filter (where ${sources.orgId} is not null and ${sources.opportunityKind} in ('internship', 'both'))::int`,
    scholarshipSources: sql<number>`count(*) filter (where ${sources.opportunityKind} in ('scholarship', 'both'))::int`,
    checkedRecently: sql<number>`count(*) filter (where ${sources.lastCompletePollAt} >= now() - interval '24 hours')::int`,
    activeSources: sql<number>`count(*)::int`,
    latestCheck: sql<string | null>`max(${sources.lastCompletePollAt})::text`,
  }).from(sources).where(and(eq(sources.state, "active"), eq(sources.authority, "source_of_truth")));
  let value: SourceCoverage = { ...row, mode: "registry", measuredAt: new Date().toISOString() };
  if (row.activeSources === 0) {
    // Older databases have real poll history but no registry backfill. Report
    // those observations as observations, never as active approved sources.
    const [[boards], [scholarships]] = await Promise.all([
      db.select({
        employerBoards: sql<number>`count(*) filter (where ${organizations.lastPolledAt} is not null)::int`,
        checkedRecently: sql<number>`count(*) filter (where ${organizations.lastPollOk} = true and ${organizations.lastPolledAt} >= now() - interval '24 hours')::int`,
        latestCheck: sql<string | null>`max(${organizations.lastPolledAt}) filter (where ${organizations.lastPollOk} = true)::text`,
      }).from(organizations).where(sql`${organizations.atsSlug} is not null and ${organizations.atsType} <> 'unknown'`),
      db.select({
        scholarshipSources: sql<number>`count(distinct ${postingSources.source})::int`,
      }).from(postingSources).innerJoin(postings, eq(postingSources.postingId, postings.id))
        .where(sql`${postings.kind} = 'scholarship' and ${postings.closedAt} is null and ${postings.hiddenAt} is null and ${postings.termEndedFlagAt} is null`),
    ]);
    value = { ...boards, ...scholarships, activeSources: boards.employerBoards, mode: "observed", measuredAt: new Date().toISOString() };
  }
  coverageMemo = { at: Date.now(), value };
  return value;
}
