/**
 * Reconcile a board poll against what we already have.
 *
 * This is the freshness engine, and the product's core claim lives here.
 *
 * No job source exposes "is this filled". We derive it: because we poll each
 * company's own ATS directly, a posting present in today's response is
 * *verifiably* live right now, and one that has vanished from the board is
 * closed. That is strictly better than the aggregator flag we measured, which
 * lagged 30+ days on half its inventory.
 *
 * Kept as a pure function over (existing, incoming) so the whole behaviour —
 * including the safety guards below — is testable without a database.
 */

import {
  canonicalHash,
  classifyOpportunity,
  detectTerm,
  detectWorkAuth,
  isRemoteLocation,
  normalizeCompanyName,
  normalizeLocations,
  normalizeTitle,
  canonicalUrl,
  type OpportunityKind,
} from "./normalize";
import { extractSkills } from "../score/skills";
import type { SourcePosting } from "./types";

/** Minimal shape of a posting we already store, for diffing. */
export interface ExistingPosting {
  canonicalHash: string;
  closedAt: Date | null;
  /** Consecutive prior-scrape absences — see `postings.missingStrikes`. */
  missingStrikes: number;
}

/** A source posting after normalization, ready to upsert. */
export interface PreparedPosting {
  canonicalHash: string;
  kind: OpportunityKind;
  companyName: string;
  normalizedCompanyName: string;
  title: string;
  normalizedTitle: string;
  url: string;
  locations: string[];
  isRemote: boolean;
  term: string | null;
  workAuth: string | null;
  /** Canonical skills named by the title or description. */
  skills: string[];
  postedAt: Date | null;
  deadlineAt: Date | null;
  descriptionText: string | null;
  source: SourcePosting["source"];
  sourceId: string;
  raw: unknown;
}

export interface ReconcileInput {
  /** Early-career postings from this poll, already adapter-parsed. */
  incoming: SourcePosting[];
  /** What we currently hold for this board. */
  existing: ExistingPosting[];
  /**
   * Total postings the board returned, *before* early-career filtering.
   * Used as the liveness guard — see `toClose`.
   */
  totalOnBoard: number;
  now?: Date;
}

export interface ReconcilePlan {
  /** Postings we have never seen — these are the "new within minutes" wins. */
  toInsert: PreparedPosting[];
  /** Already known and still present: bump `lastSeenAt`. */
  toTouch: PreparedPosting[];
  /** Known, still open, but absent from this poll: set `closedAt`. */
  toClose: string[];
  /** Previously closed and back on the board: clear `closedAt`. */
  toReopen: PreparedPosting[];
  /** Postings absent this scrape on a non-closing strike: bump the counter. */
  toIncrementMissing: string[];
  /** Postings that returned after a prior absence: clear `missingStrikes`. */
  toResetMissing: string[];
  /** Postings dropped by the early-career filter. */
  filteredOut: number;
  /** True when the close step was skipped by the liveness guard. */
  closeSuppressed: boolean;
}

/** Normalize one source posting into the shape we store. */
export function preparePosting(sp: SourcePosting): PreparedPosting {
  const locations = normalizeLocations(sp.locations);
  // Term may be stated in the title or the JD; null when neither says.
  const term = detectTerm(sp.title, sp.descriptionText);

  return {
    canonicalHash: canonicalHash({
      companyName: sp.companyName,
      title: sp.title,
      locations,
      term,
    }),
    kind: classifyOpportunity(sp.title, sp.employmentHint),
    companyName: sp.companyName,
    normalizedCompanyName: normalizeCompanyName(sp.companyName),
    title: sp.title,
    normalizedTitle: normalizeTitle(sp.title),
    url: canonicalUrl(sp.url),
    locations,
    isRemote: sp.isRemote || isRemoteLocation(locations),
    term,
    workAuth: detectWorkAuth(sp.descriptionText, sp.title),
    skills: extractSkills(sp.title, sp.descriptionText),
    postedAt: sp.postedAt,
    deadlineAt: sp.deadlineAt,
    descriptionText: sp.descriptionText,
    source: sp.source,
    sourceId: sp.sourceId,
    raw: sp.raw,
  };
}

/**
 * Diff a poll against stored state.
 *
 * ## The liveness guard
 *
 * Closing postings is destructive to the user's view, so it only happens when
 * we are confident the board really answered. If a board returns zero postings
 * in total, that is far more likely to be an upstream hiccup, a renamed slug,
 * or a rate-limit page than every job at the company disappearing at once — so
 * we suppress closing and leave the data alone. A board that legitimately has
 * no internships still returns its other jobs, so `totalOnBoard > 0` with zero
 * early-career matches correctly closes them.
 */
export function reconcile(input: ReconcileInput): ReconcilePlan {
  const { incoming, existing, totalOnBoard } = input;

  const prepared = incoming.map(preparePosting);
  const early = prepared.filter((p) => p.kind !== "other");
  const filteredOut = prepared.length - early.length;

  // Two source rows can normalize to the same canonical posting (e.g. the same
  // role listed per-city). Collapse so we never insert a duplicate.
  const byHash = new Map<string, PreparedPosting>();
  for (const p of early) {
    if (!byHash.has(p.canonicalHash)) byHash.set(p.canonicalHash, p);
  }

  const existingByHash = new Map(existing.map((e) => [e.canonicalHash, e]));

  const toInsert: PreparedPosting[] = [];
  const toTouch: PreparedPosting[] = [];
  const toReopen: PreparedPosting[] = [];

  for (const [hash, p] of byHash) {
    const prev = existingByHash.get(hash);
    if (!prev) {
      toInsert.push(p);
    } else if (prev.closedAt) {
      // A reposted role — clear the closure rather than creating a duplicate.
      toReopen.push(p);
    } else {
      toTouch.push(p);
    }
  }

  /*
   * The liveness guard from the docstring: a board that returns zero postings
   * in total is far more likely an upstream hiccup, a renamed slug, or a
   * rate-limit page than every job vanishing at once — so we suppress closing
   * entirely and leave the data alone. A board that is genuinely alive but has
   * no early-career matches still returns totalOnBoard > 0, and those missing
   * postings are subject to the two-observation rule below.
   */
  const closeSuppressed = totalOnBoard === 0;

  /*
   * Two-observation close rule.
   *
   * A posting absent from one scrape is not closed — that single absence is
   * exactly as flaky as a single 404 on an apply URL (see linkcheck.ts). We
   * increment a strike and wait. Only the second consecutive absence closes it.
   *
   * Concretely: an open posting missing from this scrape gets missingStrikes
   * bumped to (prev + 1). It is closed at the same time the strike crosses the
   * threshold (>= MISSING_STRIKES_REQUIRED), so a single dropout is never
   * destructive and a posting that flaps back into the feed on the very next
   * scrape is never closed at all.
   *
   * Any posting that *is* present in this scrape but carries a prior strike
   * must have it cleared — it recovered, and the counter must not linger to
   * pre-dispose a future dropout. That reset is folded into toTouch: a
   * returning posting is refreshed anyway, so the strike-clear rides the same
   * write rather than demanding a second pass.
   */
  const MISSING_STRIKES_REQUIRED = 2;
  const toClose: string[] = [];
  const toIncrementMissing: string[] = [];
  const toResetMissing: string[] = [];

  if (!closeSuppressed) {
    for (const e of existing) {
      if (e.closedAt) continue; // already closed; only reopen can touch it
      if (byHash.has(e.canonicalHash)) {
        // Present this scrape — a prior strike, if any, must clear.
        if (e.missingStrikes > 0) toResetMissing.push(e.canonicalHash);
        continue;
      }
      // Absent this scrape. Bump and maybe close.
      const strikes = e.missingStrikes + 1;
      if (strikes >= MISSING_STRIKES_REQUIRED) {
        toClose.push(e.canonicalHash);
      } else {
        toIncrementMissing.push(e.canonicalHash);
      }
    }
  }

  return { toInsert, toTouch, toClose, toReopen, filteredOut, closeSuppressed, toIncrementMissing, toResetMissing };
}
