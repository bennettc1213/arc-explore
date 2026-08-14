/**
 * Deciding which deadline reminders are due.
 *
 * Pure and free of database imports so the rules that govern sending mail to
 * real people are unit-testable. Everything here is a decision; `store.ts`
 * fetches and `email.ts` sends.
 *
 * THE RULE: a reminder is sent once, and only about something a student can
 * still act on. The job recomputes from scratch every day, so without the
 * already-sent set it would mail the same person about the same scholarship
 * every morning until the deadline — the fastest possible way to be marked as
 * spam by the exact people we are trying to help.
 */

/**
 * How far out we reach, in days.
 *
 * Three, descending, because they answer different questions: a fortnight is
 * "start the essay", a week is "finish it", a day is "submit it now". More
 * windows than that is noise about a single opportunity.
 */
export const REMINDER_WINDOWS = [14, 7, 1] as const;
export type ReminderWindow = (typeof REMINDER_WINDOWS)[number];

export interface ReminderCandidate {
  userId: string;
  postingId: string;
  /** The deadline as the source currently states it. */
  deadlineAt: Date;
}

export interface DueReminder<T extends ReminderCandidate = ReminderCandidate> {
  candidate: T;
  /** Which window fired. Recorded so the same window never fires twice. */
  window: ReminderWindow;
  /**
   * Days actually remaining — not the window.
   *
   * These come apart, and the email must say this one. A student who saves
   * something nine days out gets the 14-day window on the next run; telling
   * them "14 days left" would be false, and a reminder that misstates the
   * deadline is worse than no reminder.
   */
  daysLeft: number;
}

const DAY_MS = 86_400_000;

/**
 * Whole calendar days, in UTC, from today until the deadline's date.
 *
 * Calendar days rather than elapsed time, because the email states both a
 * countdown and a date and they must agree. Measured as instants, a deadline
 * stored at 2026-08-15T00:00:00Z read at 22:00 on the 14th is 0.08 days away,
 * so the subject said "closes today" directly above a body reading "Closes:
 * 2026-08-15" — observed on real data. A reader who spots that contradiction
 * has no reason to trust either number.
 *
 * It is also truer to the source. These deadlines are dates: a scholarship
 * page says "March 22", and midnight UTC is an artifact of parsing it, not a
 * cutoff anybody published. Comparing the dates is comparing what we were
 * actually told.
 */
export function daysUntil(deadline: Date, now: Date): number {
  const deadlineDay = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate(),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.round((deadlineDay - today) / DAY_MS);
}

/** Stable identity of one reminder, matching the table's unique index. */
export function reminderKey(
  userId: string,
  postingId: string,
  window: number,
  deadlineAt: Date,
): string {
  return `${userId}:${postingId}:${window}:${deadlineAt.toISOString()}`;
}

/**
 * The reminders due right now.
 *
 * At most one per candidate per run: the largest unsent window the deadline
 * has already crossed. Taking the largest means a student who saves something
 * inside every window hears once, immediately, rather than getting three
 * emails in one morning — and the smaller windows still fire later as the
 * deadline actually approaches.
 *
 * A passed deadline is skipped outright. There is nothing to remind anyone
 * about, and "your deadline was yesterday" is not a service.
 */
export function selectDue<T extends ReminderCandidate>(
  candidates: T[],
  alreadySent: ReadonlySet<string>,
  now: Date,
): DueReminder<T>[] {
  const due: DueReminder<T>[] = [];

  for (const candidate of candidates) {
    const daysLeft = daysUntil(candidate.deadlineAt, now);
    if (daysLeft < 0) continue;

    for (const window of REMINDER_WINDOWS) {
      if (daysLeft > window) continue;

      const key = reminderKey(candidate.userId, candidate.postingId, window, candidate.deadlineAt);
      if (alreadySent.has(key)) continue;

      due.push({ candidate, window, daysLeft });
      break; // largest unsent window only
    }
  }

  return due;
}

/** How the remaining time reads in a subject line. */
export function urgencyLabel(daysLeft: number): string {
  if (daysLeft === 0) return "closes today";
  if (daysLeft === 1) return "closes tomorrow";
  return `closes in ${daysLeft} days`;
}
