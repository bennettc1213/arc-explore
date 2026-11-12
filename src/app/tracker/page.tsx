import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { Mascot } from "@/components/chrome/Mascot";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/applications/store";
import {
  MIN_FOR_RATE,
  countActiveSlots,
  countByStatus,
  responseRate,
  statusMeta,
} from "@/lib/applications/types";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature, TIER_LABELS, TIER_PRICE_USD } from "@/lib/pricing/tiers";

import { type CardApplication } from "./ApplicationCard";
import { TrackerList } from "./TrackerList";
import { ComparePicker } from "./ComparePicker";
import { FEED_PATH } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Saved (not yet applied), still open, with a stated deadline 0–`days` days out. */
function savedClosingWithin(
  rows: Array<{ status: string; closedAt: Date | null; deadlineAt: Date | null }>,
  days: number,
): number {
  const now = Date.now();
  return rows.filter((r) => {
    if (r.status !== "saved" || r.closedAt || !r.deadlineAt) return false;
    const d = Math.floor(r.deadlineAt.getTime() / 86_400_000) - Math.floor(now / 86_400_000);
    return d >= 0 && d <= days;
  }).length;
}

/** "3d ago" — coarse on purpose; the exact minute is noise here. */
function ago(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="mono-strong" style={{ fontSize: "1.6rem", color: "var(--text)" }}>
        {value}
      </div>
      <div className="mono">{label}</div>
    </div>
  );
}

export default async function TrackerPage() {
  const user = await requireUser("/tracker");
  const rows = await listApplications(user.id);

  const counts = countByStatus(rows);
  const rate = responseRate(rows);

  // Read-only: the limit is enforced in `setStatusAction`. It counts ACTIVE
  // opportunities (occupiesActiveSlot) — history never counts — and this only
  // tells the student where they stand before a save is refused.
  const tier = await getUserTier(user.id);
  const activeCount = countActiveSlots(rows.map((r) => ({ status: r.status, closed: r.closedAt !== null })));
  const trackerAccess = evaluateFeature(tier, "tracker", activeCount);

  // Saved but not yet sent, with a stated deadline inside the week. Only a
  // deadline the source published counts; an unstated one is not "closing".
  const closingSaved = savedClosingWithin(rows, 7);

  // Sorted by where each application sits in a real process, then by
  // most-recently-touched inside each group.
  const apps: CardApplication[] = rows
    .slice()
    .sort((a, b) => {
      const d = statusMeta(a.status).rank - statusMeta(b.status).rank;
      return d !== 0 ? d : b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .map((r) => ({
      id: r.id,
      postingId: r.postingId,
      status: r.status,
      appliedAgo: r.appliedAt ? ago(r.appliedAt) : null,
      outcome: r.outcome,
      notes: r.notes,
      title: r.title,
      company: r.company,
      url: r.url,
      locations: r.locations,
      term: r.term,
      workArrangement: r.workArrangement,
      compensationMinCents: r.compensationMinCents,
      compensationMaxCents: r.compensationMaxCents,
      compensationInterval: r.compensationInterval,
      closed: r.closedAt !== null,
    }));

  return (
    <main className="wrap tracker-page" style={{ paddingBlock: "48px 96px", maxWidth: 1200 }}>
      <BackLink href={FEED_PATH} label="back to the feed" />
      <header style={{ marginBottom: 32 }}>
        <div className="eyebrow chrome">your applications</div>
        <h1
          className="chrome"
          style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: 12 }}
        >
          what you sent, and what <span style={{ color: "var(--accent)" }}>came back</span>
        </h1>
      </header>

      {rows.length > 0 && (
        <section
          className="flex flex-wrap gap-x-12 gap-y-6 border-y overview-stats"
          style={{ borderColor: "var(--line)", padding: "22px 0", marginBottom: 32 }}
        >
          <Stat value={counts.active} label="in flight" />
          <Stat value={counts.submitted} label="submitted" />
          <Stat value={counts.offers} label="offers" />
          {/*
            A rate below the threshold is not a rate. One reply out of two is
            not 50%, and rendering it as a number would be exactly the kind of
            confident figure derived from nothing this product refuses to show.
          */}
          {rate ? (
            <Stat value={`${rate.rate}%`} label={`response rate · of ${rate.of}`} />
          ) : (
            <div className="slot" style={{ alignSelf: "center" }}>
              response rate needs {MIN_FOR_RATE} applications — {counts.submitted} so far
            </div>
          )}
        </section>
      )}

      {closingSaved > 0 && (
        <div className="since-visit" role="status">
          <strong>
            {closingSaved} saved listing{closingSaved === 1 ? "" : "s"} close{closingSaved === 1 ? "s" : ""} within 7 days
          </strong>{" "}
          and {closingSaved === 1 ? "has" : "have"} not been marked applied yet.
        </div>
      )}

      {!trackerAccess.unlimited && trackerAccess.limit !== null && (
        <div
          className={trackerAccess.usable ? "slot" : "border"}
          style={{
            padding: "14px 16px",
            marginBottom: 24,
            ...(trackerAccess.usable ? {} : { borderColor: "var(--accent)" }),
          }}
        >
          <span>
            {trackerAccess.usable ? (
              <>
                {activeCount} of {trackerAccess.limit} active on {TIER_LABELS[tier]}. Finished
                applications and your history never count.{" "}
                <Link href="/pricing?feature=tracker" style={{ color: "var(--accent)" }}>
                  Pro tracks without a limit
                </Link>
              </>
            ) : (
              <>
                {activeCount} active, which is the {TIER_LABELS[tier]} limit of {trackerAccess.limit}.
                Everything below stays editable: mark one finished (offer, rejected, ghosted,
                withdrawn) or remove it to track another, or{" "}
                <Link href="/pricing?feature=tracker" style={{ color: "var(--accent)" }}>
                  upgrade to {TIER_LABELS.apply} — ${TIER_PRICE_USD.apply}/mo
                </Link>
                .
              </>
            )}
          </span>
        </div>
      )}

      {apps.length === 0 ? (
        <div className="slot" style={{ padding: "24px", gap: 16 }}>
          <Mascot size={32} />
          <span>
            nothing tracked yet — hit <strong style={{ color: "var(--text)" }}>save</strong> on a
            posting in{" "}
            <Link href={FEED_PATH} style={{ color: "var(--accent)" }}>
              the feed
            </Link>{" "}
            and it lands here
          </span>
        </div>
      ) : (
        <div>
          {/* Comparing is what you do with a shortlist, and the tracker is the
              shortlist. Closed rows are excluded — there is no decision left to
              make about those. */}
          <div style={{ marginBottom: 16 }}>
            <ComparePicker
              options={apps
                .filter((a) => !a.closed)
                .map((a) => ({ postingId: a.postingId, title: a.title, company: a.company }))}
            />
          </div>

          <TrackerList apps={apps} />
        </div>
      )}

      <footer className="mono" style={{ marginTop: 48, lineHeight: 1.7 }}>
        outcomes you log here are the only ground truth this app will ever have about what
        actually works. nothing today predicts your odds, and nothing will until there is
        enough of this data to stand behind a number.
      </footer>
    </main>
  );
}
