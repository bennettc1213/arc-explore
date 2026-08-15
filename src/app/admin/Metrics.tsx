import { GROUP_LABELS, rate, type Metric, type MetricGroup } from "@/lib/metrics/types";

/**
 * The numbers, with what each one means printed beside it.
 *
 * On `/admin` rather than anywhere public, and behind the same fail-closed
 * guard: these are operator numbers, and a signup count on a page a visitor can
 * reach is marketing rather than measurement.
 *
 * EVERY VALUE CARRIES ITS DEFINITION. That is the Phase 07 line "confirm you
 * are capturing them" rendered rather than merely believed — a number whose
 * definition you have to reconstruct from memory six months later is one you
 * will eventually cite wrongly, and the person most likely to be misled by
 * "60% of users uploaded a resume" is the one who wrote it. Anything below the
 * citable floor is marked, so the page never hands over a figure that reads
 * like a rate and is not one.
 */

const ORDER: MetricGroup[] = ["reach", "activation", "output", "usage", "corpus"];

function Row({ metric }: { metric: Metric }) {
  return (
    <li style={{ marginBottom: 14 }}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span
          className="mono-strong"
          style={{
            fontSize: "1.25rem",
            minWidth: 72,
            color: metric.citable ? "var(--text)" : "var(--faint-readable)",
          }}
        >
          {metric.value.toLocaleString("en-US")}
        </span>
        <span className="t-sm" style={{ color: "var(--text)" }}>
          {metric.label}
        </span>
        {!metric.citable && (
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            too small to cite
          </span>
        )}
      </div>
      <div className="mono" style={{ color: "var(--faint-readable)", marginLeft: 84 }}>
        {metric.definition}
      </div>
      {metric.caveat && (
        <div className="mono" style={{ color: "var(--accent)", marginLeft: 84, opacity: 0.85 }}>
          {metric.caveat}
        </div>
      )}
    </li>
  );
}

export function Metrics({
  metrics,
  recent,
  filters,
}: {
  metrics: Metric[];
  recent: {
    signups: number;
    applicationsTracked: number;
    filteredFeedRequests: number;
    savedSearches: number;
  };
  filters: Array<{ filter: string; n: number }>;
}) {
  const byKey = new Map(metrics.map((m) => [m.key, m.value]));
  const searches = byKey.get("filteredFeedRequests") ?? 0;
  const empty = byKey.get("zeroResultSearches") ?? 0;
  const emptyRate = rate(empty, searches);

  return (
    <section
      style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}
    >
      <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
        metrics
      </div>
      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "64ch", marginBottom: 20 }}>
        Every number here is defined beside it, because a figure you have to
        reconstruct from memory later is one you will eventually cite wrongly. Nothing
        leaves our own database to produce any of this — there is no analytics script on
        any page.
      </p>

      <div className="flex flex-wrap gap-x-10 gap-y-4" style={{ marginBottom: 22 }}>
        <div>
          <div className="mono-strong" style={{ fontSize: "1.4rem" }}>
            {recent.signups}
          </div>
          <div className="mono">signups · 7d</div>
        </div>
        <div>
          <div className="mono-strong" style={{ fontSize: "1.4rem" }}>
            {recent.applicationsTracked}
          </div>
          <div className="mono">tracked · 7d</div>
        </div>
        <div>
          <div className="mono-strong" style={{ fontSize: "1.4rem" }}>
            {recent.filteredFeedRequests}
          </div>
          <div className="mono">filtered feed requests · 7d</div>
        </div>
        <div>
          <div
            className="mono-strong"
            style={{ fontSize: "1.4rem", color: emptyRate === null ? "var(--faint-readable)" : "var(--accent)" }}
          >
            {emptyRate === null ? "—" : `${emptyRate}%`}
          </div>
          <div className="mono">
            {emptyRate === null ? "empty-result rate · not enough yet" : "of searches return nothing"}
          </div>
        </div>
      </div>

      {ORDER.map((group) => {
        const rows = metrics.filter((m) => m.group === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: 18 }}>
            <div className="mono chrome" style={{ marginBottom: 10 }}>
              {GROUP_LABELS[group]}
            </div>
            <ul>
              {rows.map((m) => (
                <Row key={m.key} metric={m} />
              ))}
            </ul>
          </div>
        );
      })}

      {filters.length > 0 && (
        <div>
          <div className="mono chrome" style={{ marginBottom: 8 }}>
            which filters students actually use
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {filters.map((f) => (
              <span key={f.filter} className="mono" style={{ color: "var(--text)" }}>
                {f.filter}{" "}
                <span style={{ color: "var(--faint-readable)" }}>· {f.n}</span>
              </span>
            ))}
          </div>
          {/* The one question the event log answers that no other table can,
              and the reason it stores filter keys rather than nothing at all:
              whether the category filter earns the taxonomy work it needs. */}
          <p className="mono" style={{ marginTop: 10, color: "var(--faint-readable)" }}>
            filter keys only. what anyone typed into the search box is never recorded.
          </p>
        </div>
      )}
    </section>
  );
}
