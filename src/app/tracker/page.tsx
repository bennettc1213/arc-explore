import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { Mascot } from "@/components/chrome/Mascot";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/applications/store";
import {
  MIN_FOR_RATE,
  countByStatus,
  responseRate,
  statusMeta,
} from "@/lib/applications/types";

import { ApplicationCard, type CardApplication } from "./ApplicationCard";
import { ComparePicker } from "./ComparePicker";

export const dynamic = "force-dynamic";

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
      closed: r.closedAt !== null,
    }));

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 1100 }}>
      <BackLink href="/" label="back to the feed" />
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
          className="flex flex-wrap gap-x-12 gap-y-6 border-y"
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

      {apps.length === 0 ? (
        <div className="slot" style={{ padding: "24px", gap: 16 }}>
          <Mascot size={32} />
          <span>
            nothing tracked yet — hit <strong style={{ color: "var(--text)" }}>save</strong> on a
            posting in{" "}
            <Link href="/" style={{ color: "var(--accent)" }}>
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
          <ComparePicker
            options={apps
              .filter((a) => !a.closed)
              .map((a) => ({ postingId: a.postingId, title: a.title, company: a.company }))}
          />

          {apps.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
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
