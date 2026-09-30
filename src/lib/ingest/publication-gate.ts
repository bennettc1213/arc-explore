/**
 * The publication gate (INS-012): what may become a verified listing.
 *
 * One rule, stated once, in a pure function: a fact reaches the feed only from
 * a source we are allowed to read, that we are allowed to keep reading, and
 * whose poll actually completed. Everything else stops at a candidate.
 *
 * The rule exists because the tempting shortcut is wrong. Simplify tells us a
 * company exists and roughly what it hires for; its own README carries no
 * licence to redistribute listings, and it is an aggregator, so a row that came
 * from it is a *description* of a job rather than the job. Publishing it anyway
 * would be indistinguishable from the real thing in the feed, and "verified live
 * 5h ago" would be a claim about a page we never polled.
 *
 * Pure on purpose. It takes the source's facts and returns a decision, so the
 * rule is testable without a database and can be checked identically from the
 * ingest path, a backfill, and an admin command.
 */

import type {
  AccessReviewStatus,
  SourceAuthority,
  SourceState,
} from "@/db/schema";

/** The source's standing, as recorded in the `sources` registry row. */
export interface SourceFacts {
  authority: SourceAuthority;
  state: SourceState;
  termsReviewStatus: AccessReviewStatus;
}

/** Everything the gate needs to decide about one observation. */
export interface PublicationRequest {
  source: SourceFacts;
  /**
   * Did the poll that produced this observation finish completely?
   *
   * From `FetchBoardResult.successfulComplete`. A partial page, a timeout, or a
   * 403 is not evidence that anything is gone, and is therefore not evidence
   * that anything may be published either.
   */
  pollComplete: boolean;
}

export type PublicationBlock =
  | "source_blocked"
  | "source_paused"
  | "terms_denied"
  | "discovery_only"
  | "poll_incomplete";

export type PublicationDecision =
  | { allowed: true }
  | { allowed: false; reason: PublicationBlock };

/**
 * Decide whether one observation may become a verified, published listing.
 *
 * Checked in this order so the reason names the most fundamental problem
 * first: a blocked source stays blocked whatever its authority, and a
 * discovery-only source is never rescued by a successful poll.
 */
export function canPublish(request: PublicationRequest): PublicationDecision {
  const { source, pollComplete } = request;

  if (source.state === "blocked") return { allowed: false, reason: "source_blocked" };
  if (source.state === "paused") return { allowed: false, reason: "source_paused" };
  if (source.termsReviewStatus === "denied") return { allowed: false, reason: "terms_denied" };
  // The load-bearing rule. Before the poll check, deliberately: a discovery
  // source that returns a beautifully complete page is still not a source of
  // truth for the listing it describes.
  if (source.authority === "discovery_only") {
    return { allowed: false, reason: "discovery_only" };
  }
  if (!pollComplete) return { allowed: false, reason: "poll_incomplete" };

  return { allowed: true };
}

/**
 * Is this observation one the source itself vouches for?
 *
 * Decides `posting_sources.is_authoritative_observation` and, downstream,
 * whether `postings.confirmed_at` may move. Only an active source of truth that
 * is allowed to publish can advance a "confirmed live" clock; anything else may
 * at most refresh `last_seen_at`, which is a strictly weaker claim.
 */
export function isAuthoritativeObservation(request: PublicationRequest): boolean {
  return canPublish(request).allowed;
}

/**
 * The `postings.publication_state` a new row should carry.
 *
 * `unverified` rather than `candidate` for a source we simply have not reviewed
 * yet: the row is real and may already be in the feed, and calling it a
 * "candidate" would imply we are holding it back when we are not. Quarantine is
 * a decision a person or a rule makes, never a side effect of a missing review.
 */
export function publicationStateFor(request: PublicationRequest):
  | "verified"
  | "unverified"
  | "candidate" {
  if (request.source.authority === "discovery_only") return "candidate";
  return canPublish(request).allowed ? "verified" : "unverified";
}

/** One line an operator can read in a log or a CLI. */
export function describeDecision(decision: PublicationDecision): string {
  return decision.allowed
    ? "publishable"
    : `not publishable: ${decision.reason.replace(/_/g, " ")}`;
}
