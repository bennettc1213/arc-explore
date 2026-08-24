/**
 * New-match alert emails.
 *
 * Plain text, and sent with `fetch` against Resend's REST API rather than
 * their SDK — one POST, and this codebase has already declined a dependency
 * for less, twice. Deliberately the same shape as `reminders/email.ts`; the
 * two are near-siblings and a student should not be able to tell that
 * different code sent them.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress(): string {
  return process.env.REMINDER_FROM_EMAIL ?? "alerts@instela.org";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export interface AlertEmail {
  to: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
}

export interface AlertMatch {
  id: string;
  title: string;
  company: string;
  kind: string;
  deadlineAt: Date | null;
}

/** How many matches are listed in the body before it says "and N more". */
const LISTED = 8;

/**
 * Compose the alert.
 *
 * The subject states the count and the search name, because "3 new for
 * scholarships closing within 30 days" is a decision a student can make in the
 * inbox without opening anything. A subject that just says "new matches" makes
 * every one of these worth opening exactly once.
 */
export function composeAlert(input: {
  email: string;
  searchId: string;
  searchName: string;
  /** The query string that reproduces this search in the feed. */
  feedQuery: string;
  matches: AlertMatch[];
  unsubscribeToken: string;
}): AlertEmail {
  const { matches, searchName } = input;
  const n = matches.length;
  const site = siteUrl();
  const unsubscribeUrl = `${site}/unsubscribe?token=${input.unsubscribeToken}&search=${input.searchId}`;

  const lines = matches.slice(0, LISTED).map((m) => {
    const deadline = m.deadlineAt
      ? ` — closes ${m.deadlineAt.toISOString().slice(0, 10)}`
      : "";
    return `  ${m.title}\n    ${m.company}${deadline}\n    ${site}/listing/${m.id}`;
  });

  const more = n > LISTED ? `\n  …and ${n - LISTED} more.\n` : "";

  const text = [
    `${n} new ${n === 1 ? "match" : "matches"} for “${searchName}”.`,
    "",
    lines.join("\n\n"),
    more,
    "",
    // The honest caveat, in every one of these. A new match is new to us, not
    // necessarily newly posted — we can stand behind when we first saw it and
    // not behind an employer's stated posting date.
    "“New” means we first saw it since the last time we wrote to you.",
    "",
    `See them in the feed: ${site}/${input.feedQuery ? `?${input.feedQuery}` : ""}`,
    "",
    `Stop alerts for this search: ${unsubscribeUrl}`,
    `Stop all search alerts: ${site}/unsubscribe?token=${input.unsubscribeToken}&searches=all`,
  ].join("\n");

  return {
    to: input.email,
    subject: `${n} new ${n === 1 ? "match" : "matches"} — ${searchName}`,
    text,
    unsubscribeUrl,
  };
}

export class AlertSendError extends Error {}

export async function sendAlert(email: AlertEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new AlertSendError("RESEND_API_KEY is not set — see .env");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      // Points at the per-search opt-out, not a generic page: one-click
      // unsubscribe should do what the person expects, which is stop *this*.
      headers: { "List-Unsubscribe": `<${email.unsubscribeUrl}>` },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AlertSendError(`Resend replied ${res.status}: ${body.slice(0, 200)}`);
  }
}
