/**
 * A listing's receipt: what we observed about it, when, and from where.
 *
 * Shown on `/listing/[id]` so a student can check our work rather than take a
 * label on trust. Every line is something our pipeline recorded, worded as the
 * observation it is:
 *  - "first found" is when OUR crawler first saw it, never a posting date;
 *  - "confirmed on the employer's own board" only rests on `confirmed_at`,
 *    which only an authoritative board poll writes (an aggregator mention
 *    cannot produce it — see the schema comment on `confirmedAt`);
 *  - the apply-link line says what the link checker got back, and a 403/429/5xx
 *    is reported as "could not tell", the same no-information rule
 *    `ingest/linkcheck.ts` applies.
 *
 * Pure; the query lives in `listing-receipt-store.ts`.
 */

export interface ReceiptFacts {
  kind: "internship" | "scholarship";
  url: string;
  /** Distinct `posting_sources.source` names that have listed it. */
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  confirmedAt: string | null;
  urlCheckedAt: string | null;
  urlStatus: number | null;
  reopenCount: number;
  closedAt: string | null;
}

export interface ReceiptLine {
  label: string;
  value: string;
  /** "ok" lines are the ones that back a live claim; "warn" ones undercut it. */
  tone?: "ok" | "warn";
}

const STAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function ago(then: Date, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function linkCheckLine(status: number | null, checkedAt: Date | null): ReceiptLine {
  if (!checkedAt || status === null) return { label: "apply link", value: "not checked yet" };
  const when = STAMP.format(checkedAt) + " UTC";
  if (status >= 200 && status < 400) return { label: "apply link", value: `opened (${status}) on ${when}`, tone: "ok" };
  if (status === 404 || status === 410) {
    return { label: "apply link", value: `did not open (${status}) on ${when}; one answer is not proof it is gone`, tone: "warn" };
  }
  return { label: "apply link", value: `could not tell (${status}) on ${when}; the site blocked or rate-limited the check` };
}

export function describeReceipt(f: ReceiptFacts, now: Date): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const names = f.sources.length > 0 ? ` via ${f.sources.join(", ")}` : "";
  lines.push({ label: "source", value: `${host(f.url)}${names}` });

  const first = new Date(f.firstSeenAt);
  lines.push({ label: "first found by us", value: `${STAMP.format(first)} UTC (${ago(first, now)})` });

  if (f.closedAt) {
    lines.push({ label: "status", value: `closed ${STAMP.format(new Date(f.closedAt))} UTC`, tone: "warn" });
  } else if (f.confirmedAt) {
    const c = new Date(f.confirmedAt);
    lines.push({ label: "still listed", value: `confirmed on the ${f.kind === "scholarship" ? "sponsor's own page" : "employer's own board"} ${ago(c, now)}`, tone: "ok" });
  } else {
    lines.push({ label: "still listed", value: `last seen in a source listing ${ago(new Date(f.lastSeenAt), now)}` });
  }

  lines.push(linkCheckLine(f.urlStatus, f.urlCheckedAt ? new Date(f.urlCheckedAt) : null));

  if (f.reopenCount > 0) {
    lines.push({ label: "history", value: `closed and came back ${f.reopenCount} time${f.reopenCount === 1 ? "" : "s"}` });
  }
  return lines;
}
