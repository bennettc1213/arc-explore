/**
 * Deadline reminders.
 *
 *   npm run reminders          # dry run — prints what it would send
 *   npm run reminders -- --send # actually sends
 *
 * DRY RUN IS THE DEFAULT, deliberately and unlike every other job in this
 * repo. The ingest scripts write to our own database, where a mistake is
 * fixable by running them again. This one puts mail in other people's inboxes,
 * which is not revocable at any price — so the destructive mode is the one you
 * have to ask for by name.
 *
 * The receipt is written *after* a successful send, one at a time rather than
 * in a batch at the end. If the process dies halfway through, the reminders
 * already sent are recorded and will not be resent; the rest are simply still
 * due tomorrow. Recording first would risk the opposite — a student silently
 * never hearing about a deadline because we marked it done before it left.
 */

import "dotenv/config";

import { closeDb } from "../src/db/client";
import { describeError } from "../src/lib/ingest/errors";
import { finishRun, startRun } from "../src/lib/ingest/runs";
import { composeReminder, sendReminder } from "../src/lib/reminders/email";
import { selectDue } from "../src/lib/reminders/select";
import {
  recordReminderSent,
  reminderCandidates,
  remindablePostingCount,
  sentReminderKeys,
} from "../src/lib/reminders/store";

const SEND = process.argv.includes("--send");

async function main() {
  const runId = await startRun("reminders", SEND ? "send" : "dry-run");
  const started = Date.now();

  try {
    const [candidates, alreadySent, remindable] = await Promise.all([
      reminderCandidates(),
      sentReminderKeys(),
      remindablePostingCount(),
    ]);

    const due = selectDue(candidates, alreadySent, new Date());

    console.log(
      [
        SEND ? "reminders (SENDING)" : "reminders (dry run — pass --send to actually send)",
        `  remindable postings : ${remindable} open with a future deadline`,
        `  saved + eligible    : ${candidates.length}`,
        `  already sent        : ${alreadySent.size}`,
        `  due now             : ${due.length}`,
      ].join("\n"),
    );

    let sent = 0;
    let failed = 0;

    for (const item of due) {
      const { candidate, window, daysLeft } = item;
      const email = composeReminder({
        email: candidate.email,
        displayName: candidate.displayName,
        title: candidate.title,
        company: candidate.company,
        url: candidate.url,
        kind: candidate.kind,
        daysLeft,
        deadlineAt: candidate.deadlineAt,
        unsubscribeToken: candidate.unsubscribeToken,
      });

      if (!SEND) {
        console.log(`\n  would send → ${email.to}`);
        console.log(`  subject: ${email.subject}`);
        console.log(`  window : ${window}d (${daysLeft} days left)`);
        continue;
      }

      try {
        await sendReminder(email);
        // Only now, and only for this one. See the header.
        await recordReminderSent(candidate.userId, candidate.postingId, window, candidate.deadlineAt);
        sent++;
      } catch (err) {
        // One bad address must not stop everyone else's reminders.
        failed++;
        console.error(`  FAILED → ${email.to}: ${describeError(err)}`);
      }
    }

    await finishRun(runId, {
      orgsPolled: 0,
      postingsSeen: candidates.length,
      postingsNew: sent,
      postingsClosed: 0,
      errors: failed,
      detail: { mode: SEND ? "send" : "dry-run", due: due.length, sent, failed },
    });

    if (SEND) console.log(`\n  sent: ${sent}, failed: ${failed}`);
    console.log(`  duration : ${((Date.now() - started) / 1000).toFixed(1)}s`);

    if (failed > 0 && sent === 0 && due.length > 0) {
      console.error("FAILED: every reminder errored");
      process.exitCode = 1;
    }
  } catch (err) {
    const error = describeError(err);
    await finishRun(runId, {
      orgsPolled: 0,
      postingsSeen: 0,
      postingsNew: 0,
      postingsClosed: 0,
      errors: 1,
      detail: { mode: SEND ? "send" : "dry-run", error },
    });
    console.error(`reminders: FAILED — ${error}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err);
    await closeDb().catch(() => {});
    process.exit(1);
  });
