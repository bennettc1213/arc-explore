import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { postings } from "@/db/schema";

import {
  applyFrameObservation,
  frameVerdictFromResponse,
  type FrameVerdict,
} from "../apply/frame-headers";

import { describeError } from "./errors";
import {
  applyCheck,
  interleaveByHost,
  isFlaggedDead,
  type UrlHealth,
} from "./linkcheck";

/**
 * The network half of apply-URL checking. Decision logic lives in
 * `linkcheck.ts` and is tested without a socket; this file only fetches and
 * writes.
 *
 * BUDGET. There are ~3,765 open postings and checking all of them every run
 * would be both slow and rude. Instead each run takes the least recently
 * checked N — nulls first, so a posting never checked outranks one checked last
 * week — which converges on full coverage without any run being expensive.
 */

const DEFAULT_LIMIT = 300;
const REQUEST_TIMEOUT_MS = 12_000;
/** Between requests to the *same* host. Interleaving means this rarely waits. */
const SAME_HOST_DELAY_MS = 1_000;
const CONCURRENCY = 6;

export interface LinkCheckSummary {
  checked: number;
  alive: number;
  dead: number;
  inconclusive: number;
  /** Postings that crossed the two-strike threshold during this run. */
  newlyFlagged: Array<{ id: string; title: string; url: string; status: number | null }>;
  errors: string[];
}

interface Candidate {
  id: string;
  title: string;
  url: string;
  urlStatus: number | null;
  urlDeadStrikes: number;
  urlDeadSince: Date | null;
  frameAllowStrikes: number;
}

/**
 * A browser-shaped User-Agent, and why that is not sneaky here.
 *
 * We are requesting one public page that a student is about to open, to find
 * out whether it still exists. Identifying as a bot gets that request refused
 * by WAFs on hosts whose pages are perfectly live, which produces exactly the
 * wrong answer. We send no cookies, follow robots-irrelevant single URLs we
 * were given by the employer's own feed, and rate-limit per host.
 */
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (compatible; internship-tracker link check; +https://github.com/bennettc1213/arc-explore)",
  Accept: "text/html,application/xhtml+xml",
};

/**
 * One probe answers two questions, because the response is already in hand.
 *
 * The status decides liveness; the framing headers decide whether the page can
 * be embedded in an Arc page (see `lib/apply/frame-headers.ts`). Reading both
 * off one response is the whole reason framing became an observation rather
 * than a hand-maintained four-host allowlist — it costs no extra request and
 * therefore no extra politeness budget.
 *
 * `frame` is `unknown` whenever we never saw headers at all, and — importantly
 * — also when only the HEAD succeeded, since some hosts answer HEAD from an
 * edge that does not carry the origin's framing headers.
 */
interface Probe {
  status: number | null;
  frame: FrameVerdict;
}

async function probe(url: string): Promise<Probe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // HEAD first — it is a fraction of the bytes. Several ATS hosts answer 405
    // or 404 to HEAD on pages that GET fine, so anything unhelpful falls
    // through to a GET rather than being believed.
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: HEADERS,
      signal: controller.signal,
    });
    if (head.status < 400 || head.status === 410) {
      return { status: head.status, frame: frameVerdictFromResponse(head) };
    }

    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: HEADERS,
      signal: controller.signal,
    });
    return { status: get.status, frame: frameVerdictFromResponse(get) };
  } catch {
    // Timeout, DNS failure, TLS error. Inconclusive — see classifyStatus.
    return { status: null, frame: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Open postings, least recently checked first. Nulls sort first in Postgres
 *  ascending order by default, which is exactly the priority we want. */
async function candidates(limit: number): Promise<Candidate[]> {
  return db
    .select({
      id: postings.id,
      title: postings.title,
      url: postings.url,
      urlStatus: postings.urlStatus,
      urlDeadStrikes: postings.urlDeadStrikes,
      urlDeadSince: postings.urlDeadSince,
      frameAllowStrikes: postings.frameAllowStrikes,
    })
    .from(postings)
    .where(isNull(postings.closedAt))
    .orderBy(asc(postings.urlCheckedAt))
    .limit(limit);
}

export async function runLinkCheck(
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<LinkCheckSummary> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const summary: LinkCheckSummary = {
    checked: 0,
    alive: 0,
    dead: 0,
    inconclusive: 0,
    newlyFlagged: [],
    errors: [],
  };

  const batch = interleaveByHost(await candidates(limit), (c) => c.url);
  const lastHitByHost = new Map<string, number>();

  // Fixed pool of workers pulling from a shared cursor: simpler than chunking,
  // and it keeps all six busy when one host is slow.
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= batch.length) return;
      const row = batch[index];

      let host = "";
      try {
        host = new URL(row.url).host.toLowerCase();
      } catch {
        // An unparseable URL is a data problem, not a liveness one — record it
        // and move on rather than counting it as evidence either way.
        summary.errors.push(`unparseable url on ${row.id}`);
        continue;
      }

      const since = Date.now() - (lastHitByHost.get(host) ?? 0);
      if (since < SAME_HOST_DELAY_MS) await sleep(SAME_HOST_DELAY_MS - since);
      lastHitByHost.set(host, Date.now());

      const { status, frame } = await probe(row.url);
      const at = new Date();
      const previous: UrlHealth = {
        urlStatus: row.urlStatus,
        urlDeadStrikes: row.urlDeadStrikes,
        urlDeadSince: row.urlDeadSince,
      };
      const next = applyCheck(previous, { status, at });
      const nextFrame = applyFrameObservation(
        { frameAllowStrikes: row.frameAllowStrikes },
        frame,
      );

      summary.checked++;
      if (next.urlDeadStrikes > previous.urlDeadStrikes) summary.dead++;
      else if (next.urlDeadStrikes === 0 && status !== null && status < 400) summary.alive++;
      else summary.inconclusive++;

      if (isFlaggedDead(next) && !isFlaggedDead(previous)) {
        summary.newlyFlagged.push({ id: row.id, title: row.title, url: row.url, status });
      }

      if (options.dryRun) continue;

      try {
        await db
          .update(postings)
          .set({
            urlCheckedAt: at,
            urlStatus: next.urlStatus,
            urlDeadStrikes: next.urlDeadStrikes,
            urlDeadSince: next.urlDeadSince,
            frameAllowStrikes: nextFrame.frameAllowStrikes,
            // Stamped whenever headers were actually read. An `unknown` verdict
            // means we never saw any, so the previous stamp stands rather than
            // a failed request looking like a fresh look.
            ...(frame === "unknown" ? {} : { frameCheckedAt: at }),
          })
          .where(eq(postings.id, row.id));
      } catch (err) {
        summary.errors.push(describeError(err));
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}

/** How many open postings currently carry the dead flag. */
export async function flaggedCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postings)
    .where(and(isNull(postings.closedAt), sql`${postings.urlDeadStrikes} >= 2`));
  return Number(row?.n ?? 0);
}
