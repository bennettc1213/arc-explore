/**
 * Polling orchestrator: fetch one org's board, enrich, and persist.
 *
 * This is the single entry point the cron jobs call. It owns the one piece of
 * per-source special-casing in the pipeline — description enrichment — so the
 * adapters stay dumb and the reconcile logic stays pure.
 */

import { describeError } from "./errors";
import { mapLimit } from "./http";
import { classifyOpportunity } from "./normalize";
import {
  applyDescription,
  markPolled,
  persistPoll,
  postingsMissingDescription,
  recordPollFailure,
  type PollOutcome,
} from "./persist";
import { ashby } from "./sources/ashby";
import { fetchGreenhouseDescription, greenhouse } from "./sources/greenhouse";
import { fetchSmartRecruitersDescription, smartrecruiters } from "./sources/smartrecruiters";
import { lever } from "./sources/lever";
import type { BoardAdapter, SourcePosting } from "./types";

export const ADAPTERS: Record<string, BoardAdapter> = {
  greenhouse,
  ashby,
  lever,
  smartrecruiters,
};

/** Parallel description fetches per board. Deliberately low — we are a guest. */
const ENRICH_CONCURRENCY = 4;

/**
 * Ceiling on description fetches per board per poll.
 *
 * Protects against a board with hundreds of early-career roles turning one
 * poll into hundreds of requests. Anything beyond the cap simply keeps a null
 * description and renders as an honest slot until a later poll picks it up.
 */
const ENRICH_CAP = 40;

/**
 * Attach JD text to postings that need it.
 *
 * Only Greenhouse is enriched here: its list endpoint is called with
 * `content=false` to keep the common path cheap, whereas Ashby and Lever ship
 * `descriptionPlain` inline. SmartRecruiters also publishes no description in
 * its list payload, but its boards run to thousands of roles — Bosch alone has
 * 4,758 — so fetching those inline would turn one poll into thousands of
 * requests. It is handled by `backfillDescriptions` instead, which is bounded.
 *
 * Without this step `work_auth` is null for every Greenhouse posting — measured
 * at 0/144 on a live sample — because the detector has no text to read.
 */
export async function enrichDescriptions(
  source: string,
  slug: string,
  postings: SourcePosting[],
): Promise<SourcePosting[]> {
  if (source !== "greenhouse") return postings;

  // Enrich only what will survive the early-career filter, and only what is
  // actually missing text.
  const needsEnrichment = postings.filter(
    (p) => !p.descriptionText && classifyOpportunity(p.title, p.employmentHint) !== "other",
  );
  if (needsEnrichment.length === 0) return postings;

  const targets = needsEnrichment.slice(0, ENRICH_CAP);
  const byId = new Map<string, string>();

  await mapLimit(targets, ENRICH_CONCURRENCY, async (p) => {
    const text = await fetchGreenhouseDescription(slug, p.sourceId);
    if (text) byId.set(p.sourceId, text);
  });

  if (byId.size === 0) return postings;

  return postings.map((p) =>
    byId.has(p.sourceId) ? { ...p, descriptionText: byId.get(p.sourceId)! } : p,
  );
}

/**
 * Backfill JD text for stored postings that lack it.
 *
 * Enrichment cannot live solely in the poll path. Once ETags are warm most
 * boards answer 304, so reconcile is skipped and any posting that missed
 * enrichment on its first pass — because the board was unchanged, or because it
 * fell past ENRICH_CAP — would stay description-less forever, leaving work-auth
 * permanently unknown.
 *
 * Runs independently of polling cadence and only touches open postings.
 */
export async function backfillDescriptions(limit = 100): Promise<{
  attempted: number;
  enriched: number;
}> {
  const rows = await postingsMissingDescription(limit);
  if (rows.length === 0) return { attempted: 0, enriched: 0 };

  let enriched = 0;

  await mapLimit(rows, ENRICH_CONCURRENCY, async (row) => {
    if (!row.atsSlug || !row.sourceId) return;

    // Greenhouse and SmartRecruiters each expose a per-posting detail
    // endpoint; Lever and Ashby inline their descriptions in the board
    // response, so there is nothing extra to fetch for them.
    const text =
      row.atsType === "greenhouse"
        ? await fetchGreenhouseDescription(row.atsSlug, row.sourceId)
        : row.atsType === "smartrecruiters"
          ? await fetchSmartRecruitersDescription(row.atsSlug, row.sourceId)
          : null;

    if (!text) return;

    await applyDescription(row.postingId, text, row.title);
    enriched++;
  });

  return { attempted: rows.length, enriched };
}

export interface PollOrgInput {
  id: string;
  name: string;
  atsType: string;
  atsSlug: string | null;
  /** Cached ETag from the previous poll, for conditional requests. */
  etag?: string | null;
}

/**
 * Poll one org end to end. Never throws — a board failure is recorded against
 * the org and reported, so one bad board cannot abort a whole cron run.
 */
export async function pollOrg(
  org: PollOrgInput,
): Promise<{ ok: true; outcome: PollOutcome } | { ok: false; error: string }> {
  const adapter = org.atsSlug ? ADAPTERS[org.atsType] : undefined;
  if (!adapter || !org.atsSlug) {
    const error = `no adapter for atsType=${org.atsType} slug=${org.atsSlug ?? "null"}`;
    await recordPollFailure(org.id, error);
    return { ok: false, error };
  }

  try {
    const { postings, notModified, etag } = await adapter.fetchBoard(org.atsSlug, {
      etag: org.etag,
    });

    // A 304 means the board is byte-identical to last poll. Nothing changed,
    // so there is nothing to insert or close — but the poll timestamp must
    // still advance, or this org stays permanently "due" and re-polls in a
    // loop.
    if (notModified) {
      await markPolled(org.id);
      return {
        ok: true,
        outcome: {
          orgId: org.id,
          inserted: 0,
          touched: 0,
          closed: 0,
          reopened: 0,
          filteredOut: 0,
          closeSuppressed: false,
          totalOnBoard: 0,
          notModified: true,
        },
      };
    }

    const totalOnBoard = postings.length;
    const enriched = await enrichDescriptions(adapter.name, org.atsSlug, postings);
    const outcome = await persistPoll(org.id, enriched, totalOnBoard, etag);
    return { ok: true, outcome };
  } catch (e) {
    // Bounded and cause-aware: this string goes straight into
    // organizations.last_poll_error, and a failed bulk write's raw message is
    // the entire statement plus its parameters. See lib/ingest/errors.ts.
    const error = describeError(e);
    await recordPollFailure(org.id, error);
    return { ok: false, error };
  }
}
