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
  detectWorkAuth,
  isRemoteLocation,
  normalizeCompanyName,
  normalizeLocations,
  normalizeTitle,
  canonicalUrl,
  type OpportunityKind,
} from "./normalize";
import { extractSkills } from "../score/skills";
import { parseTerm, parseExplicitTerm } from "../terms/parser";
import { isTermEnded } from "../terms/bounds";
import type { SourcePosting } from "./types";
import {
  computeLifecycleTransitions,
  type LifecycleCandidate,
} from "../lifecycle";

/** Minimal shape of a posting we already store, for diffing. */
export interface ExistingPosting {
  canonicalHash: string;
  closedAt: Date | null;
  /** Consecutive prior-scrape absences — see `postings.missingStrikes`. */
  missingStrikes: number;
  /** When the first consecutive absence was observed, if any. */
  missingSince: Date | null;
  /** Provenance currently stored for the listing's term. */
  termSource?: "explicit" | "inferred" | "unknown" | null;
}

/** The term columns written to a listing, as a partial update. */
export interface TermUpdate {
  term: PreparedPosting["term"];
  termSource: PreparedPosting["termSource"];
  termSeason: PreparedPosting["termSeason"];
  termYear: PreparedPosting["termYear"];
  termRaw: PreparedPosting["termRaw"];
  termEndedFlagAt: PreparedPosting["termEndedFlagAt"];
}

/**
 * Term columns a poll is allowed to write, or `{}` to leave them alone.
 *
 * Only a term parsed from real source text (`explicit`) may change stored term
 * data. Greenhouse and SmartRecruiters omit descriptions from their list
 * endpoints, so a list-only poll re-derives the term from `first_seen` and gets
 * an `inferred` term. Letting that write would erase an explicit term, and would
 * also clear `termEndedFlagAt` — silently un-quarantining a listing whose term
 * has already ended, purely because a cheaper poll ran.
 *
 * Provenance is therefore monotonic: it can improve (unknown -> inferred ->
 * explicit) but never regress, and an ended-term flag is only ever cleared by a
 * poll that actually saw the term in the source.
 */
export function termUpdateForTouch(p: PreparedPosting): TermUpdate | Record<string, never> {
  return p.termSource === "explicit" ? termColumns(p) : {};
}

/**
 * Same rule as {@link termUpdateForTouch}, for a listing being reopened.
 *
 * On reopen the incoming posting is normally a full detail fetch, so an
 * `explicit` term may replace a weaker one and re-evaluate the ended-term flag.
 */
export function termUpdateForReopen(
  p: PreparedPosting,
  existing: Pick<ExistingPosting, "termSource"> | undefined,
): TermUpdate | Record<string, never> {
  if (p.termSource !== "explicit") return {};
  if (existing?.termSource === "explicit") return {};
  return termColumns(p);
}

function termColumns(p: PreparedPosting): TermUpdate {
  return {
    term: p.term,
    termSource: p.termSource,
    termSeason: p.termSeason,
    termYear: p.termYear,
    termRaw: p.termRaw,
    termEndedFlagAt: p.termEndedFlagAt,
  };
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
  termSource: "explicit" | "inferred" | "unknown";
  termSeason: "summer" | "fall" | "spring" | "winter" | "co-op" | null;
  termYear: number | null;
  termRaw: string | null;
  termEndedFlagAt: Date | null;
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
  /**
   * True only when the poll completed successfully enough for absence to be
   * meaningful. Failed or partial polls must not advance misses or close rows.
   */
  successfulComplete?: boolean;
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
  toIncrementMissing: LifecycleCandidate[];
  /** Postings that returned after a prior absence: clear `missingStrikes`. */
  toResetMissing: LifecycleCandidate[];
  /** Postings dropped by the early-career filter. */
  filteredOut: number;
  /** True when the close step was skipped by the liveness guard. */
  closeSuppressed: boolean;
}

/** Normalize one source posting into the shape we store. */
export function preparePosting(sp: SourcePosting, now?: Date): PreparedPosting {
  const locations = normalizeLocations(sp.locations);
  // Explicit term is used for the stable dedup key so inference rules can
  // change without invalidating existing rows.
  const explicit = parseExplicitTerm(sp.title, sp.descriptionText);
  // Full term result includes inference from first_seen when no explicit term.
  const termInfo = parseTerm(sp.title, sp.descriptionText, now ?? sp.postedAt);

  return {
    canonicalHash: canonicalHash({
      companyName: sp.companyName,
      title: sp.title,
      locations,
      term: explicit?.term ?? null,
    }),
    kind: classifyOpportunity(sp.title, sp.employmentHint),
    companyName: sp.companyName,
    normalizedCompanyName: normalizeCompanyName(sp.companyName),
    title: sp.title,
    normalizedTitle: normalizeTitle(sp.title),
    url: canonicalUrl(sp.url),
    locations,
    isRemote: sp.isRemote || isRemoteLocation(locations),
    term: termInfo.term,
    termSource: termInfo.termSource,
    termSeason: termInfo.termSeason,
    termYear: termInfo.termYear,
    termRaw: termInfo.termRaw,
    termEndedFlagAt:
      termInfo.term && termInfo.termSeason && termInfo.termYear &&
      isTermEnded(termInfo.termSeason, termInfo.termYear, now ?? sp.postedAt ?? undefined)
        ? (now ?? sp.postedAt ?? new Date())
        : null,
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

  const prepared = incoming.map((sp) => preparePosting(sp, input.now));
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
  /*
   * Two-observation close rule, delegated to the shared lifecycle module.
   *
   * A posting absent from one scrape is not closed — that single absence is
   * exactly as flaky as a single 404 on an apply URL (see linkcheck.ts). We
   * increment a strike and wait. Only the second consecutive absence closes it,
   * and `closed_at` is stamped with the first-miss time so a fund that dropped
   * off last week does not read as having closed today.
   *
   * Any posting that *is* present in this scrape but carries a prior strike
   * must have it cleared — it recovered, and the counter must not linger to
   * pre-dispose a future dropout.
   */
  const lifecycleCandidates: LifecycleCandidate[] = existing.map((e) => ({
    id: e.canonicalHash,
    canonicalHash: e.canonicalHash,
    closedAt: e.closedAt,
    missingStrikes: e.missingStrikes,
    missingSince: e.missingSince,
  }));

  const lifecycle = computeLifecycleTransitions(
    lifecycleCandidates,
    Array.from(byHash.keys()),
    {
      now: input.now ?? new Date(),
      successfulComplete: input.successfulComplete ?? true,
      suppressOnEmptySeen: totalOnBoard === 0,
      missingStrikesRequired: 2,
    },
  );

  return {
    toInsert,
    toTouch,
    toClose: lifecycle.toClose.map((c) => c.canonicalHash),
    toReopen,
    filteredOut,
    closeSuppressed: lifecycle.closeSuppressed,
    toIncrementMissing: lifecycle.toIncrementMissing,
    toResetMissing: lifecycle.toResetMissing,
  };
}
