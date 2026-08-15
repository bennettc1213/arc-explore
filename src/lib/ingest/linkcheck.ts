/**
 * Apply-URL health checking.
 *
 * WHAT THIS IS FOR. The failure mode of every aggregator is dead links. Ours
 * already has a stronger signal than most — a posting that disappears from its
 * employer's ATS gets `closed_at` within about twenty minutes — but that only
 * covers sources we poll. It says nothing about a scholarship page that has
 * quietly 404'd, and nothing about an ATS row whose apply link rots while the
 * feed still lists it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: close anything. `closed_at` means the
 * employer stopped listing the job, which is the employer telling us. A 404 is
 * one HTTP response, and responses lie in every direction:
 *
 *   - **403** is usually a WAF refusing a request that has no browser behind
 *     it. Cloudflare and Akamai both do this to perfectly live pages.
 *   - **429** is a rate limiter, i.e. we asked too fast — a fact about us.
 *   - **5xx** is the host having a bad minute.
 *   - **200** can be a redirect to a generic careers page, which is the most
 *     common way a job posting actually dies. We cannot see the difference.
 *
 * Only 404 and 410 are treated as evidence, and only **twice in a row**. That
 * is the same two-observation rule the UNL scholarship crawl needs and does not
 * yet have, for exactly the same reason: acting on a single observation turns
 * every transient blip into a live opportunity we hid from a student.
 */

/** Statuses that actually mean "this page is not there". */
const HARD_DEAD = new Set([404, 410]);

/** Consecutive dead observations before a posting is flagged. */
export const DEAD_STRIKES_REQUIRED = 2;

export type CheckOutcome = "alive" | "dead" | "inconclusive";

/**
 * What one HTTP answer means.
 *
 * `status: null` is a network failure or timeout — inconclusive, never dead.
 * A DNS hiccup on our side is not the employer taking the page down.
 */
export function classifyStatus(status: number | null): CheckOutcome {
  if (status === null) return "inconclusive";
  if (HARD_DEAD.has(status)) return "dead";
  if (status >= 200 && status < 400) return "alive";
  // 401, 403, 405, 429, 5xx and anything else: we learned nothing usable.
  return "inconclusive";
}

export interface UrlHealth {
  urlStatus: number | null;
  urlDeadStrikes: number;
  urlDeadSince: Date | null;
}

/**
 * Fold one observation into a posting's stored health.
 *
 * Inconclusive answers leave the strike count **alone** rather than resetting
 * it. A posting that answers 404, then 403 from a WAF, then 404 again is
 * probably dead, and resetting on the middle answer would mean a flaky host can
 * never accumulate evidence. But an inconclusive answer never adds a strike
 * either — it is not evidence, in either direction.
 */
export function applyCheck(
  previous: UrlHealth,
  observation: { status: number | null; at: Date },
): UrlHealth {
  const outcome = classifyStatus(observation.status);

  if (outcome === "alive") {
    return { urlStatus: observation.status, urlDeadStrikes: 0, urlDeadSince: null };
  }

  if (outcome === "inconclusive") {
    return {
      urlStatus: observation.status,
      urlDeadStrikes: previous.urlDeadStrikes,
      urlDeadSince: previous.urlDeadSince,
    };
  }

  const strikes = previous.urlDeadStrikes + 1;
  return {
    urlStatus: observation.status,
    urlDeadStrikes: strikes,
    // Stamped once, on the strike that crosses the threshold, and never moved
    // afterwards — the same rule `applied_at` follows in the tracker. It should
    // read "dead since we first had enough evidence", not "since last night".
    urlDeadSince:
      strikes >= DEAD_STRIKES_REQUIRED ? (previous.urlDeadSince ?? observation.at) : null,
  };
}

/** True once there is enough evidence to show a student a warning. */
export function isFlaggedDead(health: Pick<UrlHealth, "urlDeadStrikes">): boolean {
  return health.urlDeadStrikes >= DEAD_STRIKES_REQUIRED;
}

/* ------------------------------------------------------------------ *
 * Politeness
 * ------------------------------------------------------------------ */

/** The host of a URL, or null if it will not parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Order a batch so we never hit the same host twice in a row.
 *
 * Our corpus is concentrated: hundreds of postings share one Greenhouse or
 * Workday host, and checking them in the order the database returns them means
 * hammering a single origin. Interleaving by host spreads the load without
 * needing a scheduler, and a per-host delay on top of it handles the rest.
 *
 * Round-robin over per-host queues, longest queue first so the busiest host is
 * spread across the whole batch rather than bunched at the end.
 */
export function interleaveByHost<T>(items: T[], urlOf: (item: T) => string): T[] {
  const byHost = new Map<string, T[]>();
  for (const item of items) {
    const host = hostOf(urlOf(item)) ?? "";
    const queue = byHost.get(host);
    if (queue) queue.push(item);
    else byHost.set(host, [item]);
  }

  const queues = [...byHost.values()].sort((a, b) => b.length - a.length);
  const out: T[] = [];
  for (let i = 0; out.length < items.length; i++) {
    for (const queue of queues) {
      if (i < queue.length) out.push(queue[i]);
    }
  }
  return out;
}
