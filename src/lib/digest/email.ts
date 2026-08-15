/**
 * The weekly digest email.
 *
 * Plain text, sent with `fetch` against Resend's REST API rather than their
 * SDK — one POST, and this codebase has already declined a dependency for less,
 * three times now. Deliberately the same shape as `reminders/email.ts` and
 * `searches/email.ts`: a student should not be able to tell that three
 * different modules sent them.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.REMINDER_FROM_EMAIL ?? "alerts@arc-explore.dev";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export interface DigestEmail {
  to: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
}

export interface DigestItem {
  id: string;
  title: string;
  company: string;
  kind: string;
  deadlineAt: Date | null;
  /** The displayed fit score, or null when we could not score it. */
  score: number | null;
  knownDimensions: number;
  totalDimensions: number;
}

/** Subjects get unreadable past roughly this; the body carries the full title. */
const SUBJECT_TITLE_MAX = 48;

function trimTitle(title: string): string {
  return title.length <= SUBJECT_TITLE_MAX ? title : `${title.slice(0, SUBJECT_TITLE_MAX - 1)}…`;
}

/**
 * How a score reads in an email.
 *
 * The confidence marker travels with the number, always. `FitResult` says this
 * in as many words and the reason is the whole premise: because unknown
 * dimensions are dropped rather than counted as misses, a posting we barely
 * understand can reach 100 on one known dimension and look exactly as certain
 * as one that matched on all five. A digest is a recommendation, so it is the
 * last place that distinction may quietly go missing.
 */
function scoreLine(item: DigestItem): string {
  if (item.score === null) return "";
  return ` — fit ${item.score} (on ${item.knownDimensions} of ${item.totalDimensions})`;
}

/**
 * Compose the digest.
 *
 * The subject names the count *and* the top match, because "4 new this week —
 * Software Engineer Intern" is a decision a student can make from the inbox. A
 * subject reading "your weekly digest" is worth opening exactly once.
 */
export function composeDigest(input: {
  email: string;
  displayName: string | null;
  items: DigestItem[];
  /** How many rows we looked at before ranking — context for a short list. */
  considered: number;
  /** Matches withheld because a saved-search alert already reported them. */
  coveredBySearches: number;
  unsubscribeToken: string;
}): DigestEmail {
  const { items } = input;
  const n = items.length;
  const site = siteUrl();
  const unsubscribeUrl = `${site}/unsubscribe?token=${input.unsubscribeToken}&digest=1`;
  const greeting = input.displayName ? `${input.displayName}, ` : "";

  const lines = items.map((m) => {
    const deadline = m.deadlineAt
      ? ` — closes ${m.deadlineAt.toISOString().slice(0, 10)}`
      : "";
    return `  ${m.title}${scoreLine(m)}\n    ${m.company}${deadline}\n    ${site}/listing/${m.id}`;
  });

  // Said out loud rather than left as an unexplained gap. A student with saved
  // searches would otherwise wonder why their digest is short, and the true
  // answer — we already emailed you about those — is the answer that makes the
  // two features look like one product.
  const covered =
    input.coveredBySearches > 0
      ? `\n${input.coveredBySearches} more matched your saved searches, and those alerts already covered them.\n`
      : "";

  const text = [
    `${greeting}${n} new ${n === 1 ? "opportunity" : "opportunities"} worth a look this week.`,
    "",
    // Ranked, and the email says so. It is not "everything new" — it is our
    // best few out of everything new, which is a different and smaller claim.
    `Picked from ${input.considered} we saw for the first time since the last digest, ranked against your profile.`,
    "",
    lines.join("\n\n"),
    covered,
    "",
    // The same caveat every alert carries. "New" is an observation we can stand
    // behind; an employer's stated posting date is a claim, and usually absent.
    "“New” means we first saw it since the last time we wrote to you.",
    "",
    `The full feed: ${site}/`,
    "",
    `Stop the weekly digest: ${unsubscribeUrl}`,
    "Deadline reminders and saved-search alerts are separate — this link does not touch them.",
  ].join("\n");

  const top = items[0];
  const subject = top
    ? `${n} new ${n === 1 ? "match" : "matches"} this week — ${trimTitle(top.title)}`
    : `${n} new this week`;

  return { to: input.email, subject, text, unsubscribeUrl };
}

export class DigestSendError extends Error {}

export async function sendDigest(email: DigestEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new DigestSendError("RESEND_API_KEY is not set — see .env");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      // Points at the digest-only opt-out. One-click unsubscribe should do what
      // the reader expects, which is stop this — not everything we send.
      headers: { "List-Unsubscribe": `<${email.unsubscribeUrl}>` },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DigestSendError(`Resend replied ${res.status}: ${body.slice(0, 200)}`);
  }
}
