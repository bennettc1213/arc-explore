"use client";

import Link from "next/link";

import { ScoreBadge } from "@/components/ScoreBadge";
import { TrackButton } from "@/components/TrackButton";
import { ELIGIBILITY_LABELS, type ScholarshipCardData } from "@/lib/scholarships/plan";

import { useEmailModal } from "./EmailModal";
import { track } from "./track";

/**
 * One scholarship in the Plan view.
 *
 * What it will not show, on purpose:
 *  - a "posted X ago" — scholarship freshness is when WE last checked the
 *    listing, and it is labelled as that, separately from internship timing;
 *  - a number for anything unknown — "Amount not confirmed" and "Effort
 *    unknown" are the honest renderings, never $0 or a guessed hour count;
 *  - anything at all for a locked slot, which renders `LockedCard` from a
 *    payload that carries no title, sponsor or link.
 *
 * "Start" goes to the listing page, which already holds the full detail, the
 * apply wizard and the application packet — no prep tool is built here.
 */
export function ScholarshipCard({
  card,
  signedIn,
  origin,
}: {
  card: ScholarshipCardData;
  signedIn: boolean;
  /** Which part of the Plan view the card sits in, for analytics. */
  origin: string;
}) {
  const openModal = useEmailModal();

  return (
    <article className="sch-card">
      <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
        <span style={{ color: card.eligibility === "eligible" ? "var(--accent)" : "var(--faint-readable)" }}>
          {ELIGIBILITY_LABELS[card.eligibility].toLowerCase()}
        </span>
        <span style={{ color: "var(--faint-readable)" }}>· listing {card.verifiedLabel}</span>
      </div>

      {/* Sponsor-authored text — never transformed. */}
      <h3 className="t-base" style={{ fontWeight: 600, letterSpacing: "-0.01em", marginTop: 8 }}>
        {card.title}
      </h3>
      <div className="t-sm" style={{ color: "var(--muted)", marginTop: 2 }}>
        {card.sponsor}
      </div>

      <dl className="sch-card-facts">
        <div>
          <dt className="mono">award</dt>
          <dd className={card.amountLabel === "Amount not confirmed" ? "mono" : "mono-strong"}>
            {card.amountLabel}
          </dd>
        </div>
        <div>
          <dt className="mono">deadline</dt>
          <dd className="mono" style={{ color: card.closesLabel ? "var(--text)" : "var(--faint-readable)" }}>
            {card.deadlineLabel
              ? `${card.closesLabel ? `${card.closesLabel} · ` : ""}${card.deadlineLabel}`
              : "No deadline stated"}
          </dd>
        </div>
        <div>
          {/* Labelled as an estimate wherever it appears. */}
          <dt className="mono">effort (est.)</dt>
          <dd className="mono" style={{ color: "var(--faint-readable)" }}>
            {card.effortLabel}
          </dd>
        </div>
      </dl>

      <p className="t-sm" style={{ color: "var(--muted)", marginTop: 10 }}>
        {card.why}
      </p>

      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
        <ScoreBadge
          label="fit"
          value={card.fit.score}
          known={card.fit.known}
          total={card.fit.total}
          bucketLabel={card.fit.bucketLabel}
        />
        {card.isMarketing && (
          <span
            className="mono"
            style={{ color: "var(--accent-lite)" }}
            title="Run by a company for publicity or links. Real, but not an institutional award."
          >
            marketing contest
          </span>
        )}
        {card.lowTrust && (
          <span className="mono" style={{ color: "var(--accent-lite)" }}>
            low trust
          </span>
        )}
      </div>

      <a
        href={card.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mono press"
        style={{ display: "inline-block", marginTop: 10, color: "var(--faint-readable)" }}
      >
        {card.viaAggregator
          ? `listing on ${card.sourceHost} — not the application ↗`
          : `source: ${card.sourceHost} ↗`}
      </a>

      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 14 }}>
        <Link
          href={`/listing/${card.id}`}
          className="btn btn-primary press"
          style={{ textDecoration: "none" }}
          onClick={() => track("card_start_clicked", { origin })}
        >
          start
        </Link>
        {signedIn ? (
          // The tracker's own button; the capture fires before its action does.
          <div onSubmitCapture={() => track("card_saved", { origin })}>
            <TrackButton postingId={card.id} current={card.tracked} />
          </div>
        ) : (
          <button type="button" className="btn press" onClick={() => openModal("E3")}>
            save
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * A card the visitor has not unlocked. Built from a payload slot holding only a
 * positional key — there is nothing behind the blur to reveal.
 */
export function LockedCard() {
  const openModal = useEmailModal();
  return (
    <button type="button" className="sch-card sch-card-locked press" onClick={() => openModal("E2")}>
      <span aria-hidden className="sch-card-ghost">
        <span style={{ width: "40%" }} />
        <span style={{ width: "85%", height: 14 }} />
        <span style={{ width: "55%" }} />
        <span style={{ width: "70%" }} />
        <span style={{ width: "30%" }} />
      </span>
      <span className="mono-strong chrome" style={{ position: "relative" }}>
        sign in to see this scholarship
      </span>
    </button>
  );
}
