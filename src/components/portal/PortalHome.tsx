import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/count-up";
import type { PortalActivity } from "@/lib/portal/activity";
import { JUMP_IN_IDS, type PortalTile as Tile } from "@/lib/portal/destinations";
import { formatDollars } from "@/lib/portal/summary";
import { FEED_PATH } from "@/lib/routes";

import { PortalTabs } from "./PortalTabs";
import { PortalTile } from "./PortalTile";

export interface PortalHomeProps {
  /** Null signed out. Numbers are never invented for someone with no account. */
  activity: PortalActivity | null;
  /** First name only, or null when the profile has none. */
  firstName: string | null;
  /** Display label of the current plan ("Free", "Pro"). */
  planLabel: string;
  paid: boolean;
  /** Monthly price of the paid plan, as stated in the pricing catalog. */
  paidPrice: number;
  paidLabel: string;
  tiles: Tile[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function Stat({
  label,
  value,
  prefix,
  details,
  accent = false,
}: {
  label: string;
  /** Null renders an em dash — an unknown is shown as unknown, never as zero. */
  value: number | null;
  prefix?: string;
  details: string[];
  accent?: boolean;
}) {
  return (
    <div className={`pstat${accent ? " is-accent" : ""}`}>
      <div className="pstat-label">{label}</div>
      <div className={`pstat-value${value === null ? " is-empty" : ""}`}>
        {value === null ? (
          "—"
        ) : (
          <>
            {prefix}
            <CountUp value={value} />
          </>
        )}
      </div>
      {details.map((d) => (
        <div key={d} className="pstat-detail">
          {d}
        </div>
      ))}
    </div>
  );
}

export function PortalHome({
  activity,
  firstName,
  planLabel,
  paid,
  paidPrice,
  paidLabel,
  tiles,
}: PortalHomeProps) {
  const summary = activity?.summary ?? null;
  const funding = activity?.funding ?? null;
  const jump = JUMP_IN_IDS.map((id) => tiles.find((t) => t.id === id)).filter((t): t is Tile => Boolean(t));
  const locked = tiles.filter((t) => t.state === "locked").map((t) => t.title);

  const signedOutNote = "Sign in to see your numbers";

  return (
    <main className="wrap portal-page">
      <header className="portal-head">
        <div>
          <div className="eyebrow chrome">Portal</div>
          <h1 className="portal-title">
            {firstName ? (
              <>
                Welcome back, <span>{firstName}</span>
              </>
            ) : (
              "Your portal"
            )}
          </h1>
          <p className="portal-sub">
            What you&rsquo;ve done, what&rsquo;s still open, and a way into every tool — in one place.
          </p>
        </div>
        <div className="portal-plan">
          <span className="portal-plan-dot" aria-hidden="true" />
          <span>
            <strong>{planLabel}</strong> plan
          </span>
          {!paid && (
            <Link href="/pricing" className="portal-plan-link">
              See {paidLabel}
              <Icon name="arrow" size={13} />
            </Link>
          )}
        </div>
      </header>

      <PortalTabs current="home" />

      <section className="portal-scout-entry" aria-label="Scout">
        <div><span className="eyebrow">Your next opportunity</span><h2>Send your Scout out.</h2><p>Follow your interests. Find the openings worth a closer look.</p></div>
        <div><Link href="/scout" className="btn btn-primary">Start a Scout <Icon name="arrow" size={18} /></Link><Link href="/memory" className="portal-scout-memory">Application Memory <Icon name="essay" size={15} /></Link></div>
      </section>

      <section aria-label="Your numbers" className="portal-stats">
        <Stat
          label="Submitted"
          value={summary ? summary.counts.submitted : null}
          details={
            summary
              ? [
                  `${plural(summary.byKind.internship.submitted, "internship")} · ${plural(summary.byKind.scholarship.submitted, "scholarship")}`,
                  "Marked submitted in your tracker",
                ]
              : [signedOutNote]
          }
        />
        <Stat
          label="In flight"
          value={summary ? summary.counts.active : null}
          details={
            summary
              ? [`${summary.saved} saved · ${summary.awaiting} awaiting a decision`, "Not yet decided either way"]
              : [signedOutNote]
          }
        />
        <Stat
          accent
          label="Potential award amount"
          value={funding ? funding.submitted : null}
          prefix="$"
          details={
            funding
              ? [
                  "Scholarship dollars on applications you've submitted",
                  ...(funding.saved > 0 ? [`+ ${formatDollars(funding.saved)} saved to apply for`] : []),
                  ...(funding.unconfirmed > 0
                    ? [`${plural(funding.unconfirmed, "tracked scholarship")} without a confirmed amount, not counted`]
                    : []),
                ]
              : [signedOutNote]
          }
        />
      </section>

      <div className="portal-duo">
        <section className="ppanel" aria-labelledby="recent-h">
          <div className="ppanel-head">
            <h2 id="recent-h">What you&rsquo;ve done</h2>
            {summary && summary.recent.length > 0 && (
              <Link href="/tracker" className="ppanel-link">
                Open tracker
              </Link>
            )}
          </div>

          {summary && summary.recent.length > 0 ? (
            <ul className="pactivity">
              {summary.recent.map((r) => (
                <li key={r.postingId}>
                  <Link href={`/listing/${r.postingId}`}>
                    <span className="pactivity-kind" aria-hidden="true">
                      <Icon name={r.kind === "scholarship" ? "graduation" : "resume"} size={16} />
                    </span>
                    <span className="pactivity-main">
                      <span className="pactivity-title">{r.title}</span>
                      <span className="pactivity-meta">
                        {[r.company, r.kind === "scholarship" ? "Scholarship" : "Internship", r.ago]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className={`pstatus is-${r.status}`}>{r.statusLabel}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="slot portal-empty">
              {summary ? (
                <>
                  <span>Nothing tracked yet. Save a listing and it shows up here.</span>
                  <Link href={FEED_PATH} className="btn btn-primary press">
                    Find something to save
                    <Icon name="arrow" size={15} />
                  </Link>
                </>
              ) : (
                <>
                  <span>Sign in to see what you&rsquo;ve saved and sent.</span>
                  <Link href="/login?next=%2Fportal" className="btn btn-primary press">
                    Sign in
                    <Icon name="arrow" size={15} />
                  </Link>
                </>
              )}
            </div>
          )}
        </section>

        <section className="ppanel" aria-labelledby="pipeline-h">
          <div className="ppanel-head">
            <h2 id="pipeline-h">Where it all stands</h2>
            {summary && summary.counts.total > 0 && (
              <span className="ppanel-meta">{plural(summary.counts.total, "listing")} tracked</span>
            )}
          </div>

          {summary && summary.pipeline.length > 0 ? (
            <div className="ppipe">
              <div className="ppipe-bar" role="img" aria-label="Your tracked listings by status">
                {summary.pipeline.map((p) => (
                  <span
                    key={p.status}
                    className="ppipe-seg"
                    data-status={p.status}
                    style={{ flexGrow: p.count }}
                    title={`${p.label}: ${p.count}`}
                  />
                ))}
              </div>
              <ul className="ppipe-legend">
                {summary.pipeline.map((p) => (
                  <li key={p.status}>
                    <span className="ppipe-swatch" data-status={p.status} aria-hidden="true" />
                    <span className="ppipe-name">{p.label}</span>
                    <span className="ppipe-count">{p.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="portal-quiet">
              {summary
                ? "Once you save something, this shows how much of it is saved, sent, and decided."
                : signedOutNote}
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="jump-h" className="portal-section">
        <div className="ppanel-head">
          <h2 id="jump-h">Jump in</h2>
          <Link href="/portal/navigate" className="ppanel-link">
            All destinations
            <Icon name="arrow" size={13} />
          </Link>
        </div>
        <div className="portal-jump">
          {jump.map((tile) => (
            <PortalTile key={tile.id} tile={tile} />
          ))}
        </div>
      </section>

      {!paid && (
        <aside className="pupgrade" aria-label={`About ${paidLabel}`}>
          <div>
            <h2>
              {paidLabel} is ${paidPrice}/mo
            </h2>
            <p>
              {locked.length > 0
                ? `${paidLabel} unlocks ${list(locked)}, and takes the free-plan caps off everything else in the portal.`
                : `${paidLabel} takes the free-plan caps off everything in the portal.`}
            </p>
          </div>
          <Link href="/pricing" className="btn btn-primary press">
            See plans
            <Icon name="arrow" size={15} />
          </Link>
        </aside>
      )}
    </main>
  );
}
