/**
 * Deciding what goes in a weekly digest.
 *
 * Pure and free of database imports, so the rules that govern mailing real
 * people are unit-testable. Everything here is a decision; `store.ts` fetches
 * and `email.ts` sends — the same split the deadline reminders use.
 *
 * WHY THIS IS NOT JUST A SAVED SEARCH ON A SLOWER CLOCK. A saved-search alert
 * answers "the thing you asked us to watch has news"; it requires someone to
 * have already decided what they want. The digest answers "here is what turned
 * up that fits you", and requires only a profile — which today is everybody,
 * since nobody has saved a search yet. The two differ in three ways that are
 * load-bearing rather than cosmetic:
 *
 *  1. **Ranked, not filtered.** An alert reports everything matching a filter
 *     set. A digest reports the best few of everything, so it must have a
 *     quality floor and a hard cap. A weekly email listing 200 postings is a
 *     feed, and nobody reads a feed in an inbox.
 *  2. **It defers to the alerts.** Anything a student's own notifying saved
 *     searches already told them about is removed before ranking — see
 *     `subtractCovered`. Otherwise the two features are two mouths reporting
 *     the same news, and the digest is the one that looks redundant.
 *  3. **Silence is a valid week.** An alert fires when there is news. A digest
 *     is on a clock, and a clock will come round on a week with nothing worth
 *     saying. Sending "0 new matches" on that week is how a weekly email
 *     teaches people to ignore it.
 */

import { rankingScore, type FitResult } from "../score/fit";
import { daysUntil } from "../reminders/select";

/** How often the digest may fire, in whole calendar days. */
export const DIGEST_INTERVAL_DAYS = 7;

/**
 * The hard cap on listed opportunities.
 *
 * Six, and small on purpose. This is the one email here that nobody asked a
 * specific question to receive, so its entire claim is that everything in it is
 * worth a look. A cap that admits the mediocre rows breaks that claim, and the
 * feed is one click away for anyone who wants the long list.
 */
export const MAX_DIGEST_ITEMS = 6;

/**
 * The quality floor, on the confidence-weighted ranking score.
 *
 * 50 is `score/fit.ts`'s neutral prior — what a posting is worth before we know
 * anything about it. So the rule reads: a digest may only recommend something
 * that looks *better than knowing nothing*. A row scoring below its own prior
 * is one we have positive evidence against, and spending one of six slots on it
 * would be worse than sending five.
 *
 * Deliberately applied to `rankingScore` rather than the displayed score. A
 * posting known on one dimension out of five can display 100; ranking shrinks
 * that toward the prior by how little it rests on, which is exactly the
 * judgement a recommendation needs and the displayed number deliberately does
 * not make.
 */
export const DIGEST_FLOOR = 50;

/** The minimum a digest is worth sending for. Below this, we stay quiet. */
export const MIN_DIGEST_ITEMS = 1;

/**
 * Slots held for each kind that has anything to put in them.
 *
 * MEASURED, NOT ASSUMED. The first real dry run produced six scholarships and
 * zero internships for a profile whose stated interests are software, data/ai,
 * product and business — and the cause is structural rather than a fluke. A
 * scholarship is scored on three dimensions and can be known on all three, so
 * it reaches a confident 100; an internship is scored on five, and `term` and
 * `skills` are routinely unstated, so a strong one lands at 3-of-5 and
 * `rankingScore` correctly shrinks it toward the prior. Best scholarship rank
 * that run: 100.0. Best internship: 82.0. Every internship loses every time.
 *
 * `rankingScore` exists to make the two comparable and it does its job — what
 * it cannot do is make "known on 3 of 3" and "known on 3 of 5" mean the same
 * thing. Rather than pretend the cross-kind ordering is trustworthy enough to
 * award all six slots, the digest holds a couple back. The feed does not need
 * this because it shows everything; a six-line email is where the asymmetry
 * turns into "we never told you about a single internship".
 */
export const MIN_PER_KIND = 2;

export interface DigestCandidateItem {
  id: string;
  kind: string;
  fit: FitResult;
}

/**
 * Is a profile due a digest?
 *
 * Whole UTC calendar days, using the reminders' `daysUntil` rather than a
 * second implementation — the argument for calendar days over elapsed time is
 * written out there and applies unchanged. Elapsed time would drift the send
 * an hour later every week until the "weekly" email arrived on a different day
 * than it started on.
 */
export function digestDue(lastDigestAt: Date, now: Date): boolean {
  return -daysUntil(lastDigestAt, now) >= DIGEST_INTERVAL_DAYS;
}

/**
 * Remove what the student's saved-search alerts already reported.
 *
 * The covered set is built by running their own notifying searches through the
 * same `getFeed` the alert job uses, rather than by re-implementing the filters
 * here — one taxonomy, one judgement, the rule the category filter already
 * follows in `feed.ts`.
 *
 * Note this keys on the *standing subscription*, not on a log of what was
 * mailed. That is the more correct of the two: if an alert send failed, its
 * watermark did not move and it will retry, so the posting is still covered and
 * the digest should still stay off it.
 */
export function subtractCovered<T extends { id: string }>(
  items: T[],
  coveredIds: ReadonlySet<string>,
): T[] {
  return items.filter((i) => !coveredIds.has(i.id));
}

export interface DigestSelection<T> {
  picked: T[];
  /** How many rows reached the selector at all. */
  considered: number;
  /** Rows a hard requirement rules the student out of entirely. */
  droppedBlocked: number;
  /** Rows we could not score on any dimension. */
  droppedUnscored: number;
  /** Rows that scored, but below the floor. */
  droppedBelowFloor: number;
}

/**
 * Rank and trim.
 *
 * Blocked rows are dropped outright, which is where this parts company with the
 * feed — there they sort last but stay visible, because a stated requirement is
 * real information and requirements change. An email has six lines, and
 * spending one on something the student cannot apply to is not information, it
 * is a wasted slot.
 */
export function pickDigestItems<T extends DigestCandidateItem>(
  items: T[],
  limit: number = MAX_DIGEST_ITEMS,
): DigestSelection<T> {
  let droppedBlocked = 0;
  let droppedUnscored = 0;
  let droppedBelowFloor = 0;

  const eligible: Array<{ item: T; rank: number }> = [];

  for (const item of items) {
    if (item.fit.blocked) {
      droppedBlocked++;
      continue;
    }
    if (item.fit.score === null) {
      droppedUnscored++;
      continue;
    }
    const rank = rankingScore(item.fit);
    if (rank < DIGEST_FLOOR) {
      droppedBelowFloor++;
      continue;
    }
    eligible.push({ item, rank });
  }

  eligible.sort((a, b) => b.rank - a.rank);

  // Reserve first, then fill by rank. Order within the email is by rank
  // regardless, so a held slot changes *what* is in the list, never the
  // impression of which item is strongest.
  const taken = new Set<string>();
  const perKind = new Map<string, number>();

  for (const entry of eligible) {
    if (taken.size >= limit) break;
    const used = perKind.get(entry.item.kind) ?? 0;
    if (used >= MIN_PER_KIND) continue;
    perKind.set(entry.item.kind, used + 1);
    taken.add(entry.item.id);
  }

  for (const entry of eligible) {
    if (taken.size >= limit) break;
    taken.add(entry.item.id);
  }

  return {
    picked: eligible.filter((e) => taken.has(e.item.id)).map((e) => e.item),
    considered: items.length,
    droppedBlocked,
    droppedUnscored,
    droppedBelowFloor,
  };
}

/** Whether a selection is worth an email at all. */
export function worthSending<T>(selection: DigestSelection<T>): boolean {
  return selection.picked.length >= MIN_DIGEST_ITEMS;
}
