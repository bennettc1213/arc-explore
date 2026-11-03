import { BackLink } from "@/components/BackLink";
import { requireAdmin } from "@/lib/admin/auth";
import { formatAge, perDay, type SourceHealth } from "@/lib/admin/source-health";
import { getSourcesReport, type SourceRow } from "@/lib/admin/sources-store";

export const dynamic = "force-dynamic";

/**
 * Every source we read from, whether it is working, and how much it brings in.
 *
 * Behind `requireAdmin` like the rest of `/admin`: the page names failing
 * boards and the keys a source is missing, which is operator information.
 * Health is judged from what each run actually did (`source-health.ts`), not
 * from the run's stored status, which says `successful_complete` for runs that
 * failed and for runs still in progress.
 */

const HEALTH_STYLE: Record<SourceHealth, { label: string; color: string }> = {
  healthy: { label: "working", color: "var(--system-ok)" },
  degraded: { label: "needs a look", color: "var(--accent)" },
  failing: { label: "failing", color: "var(--system-danger)" },
  stale: { label: "stopped", color: "var(--system-danger)" },
  never_run: { label: "never run", color: "var(--faint-readable)" },
};

const n = (x: number) => x.toLocaleString("en-US");

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div>
      <div className="mono-strong" style={{ fontSize: "1.6rem", color: tone ?? "var(--text)" }}>
        {value}
      </div>
      <div className="mono">{label}</div>
    </div>
  );
}

function SourceTable({ title, rows, now }: { title: string; rows: SourceRow[]; now: Date }) {
  const cell: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid var(--line)", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, borderTop: "none", textAlign: "left", whiteSpace: "nowrap" };
  const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };

  return (
    <section style={{ marginBottom: 44 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <div className="border" style={{ borderColor: "var(--line-strong)", overflowX: "auto" }}>
        <table className="t-sm" style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <thead>
            <tr className="mono">
              <th style={head}>source</th>
              <th style={head}>status</th>
              <th style={{ ...head, textAlign: "right" }}>new in 24h</th>
              <th style={{ ...head, textAlign: "right" }}>avg new / day (7d)</th>
              <th style={{ ...head, textAlign: "right" }}>open now</th>
              <th style={{ ...head, textAlign: "right" }}>read last run</th>
              <th style={head}>last run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const h = HEALTH_STYLE[r.verdict.health];
              const run = r.facts.lastRun;
              return (
                <tr key={r.key}>
                  <td style={cell}>
                    <div className="mono-strong">{r.def?.label ?? r.key}</div>
                    <div className="mono" style={{ color: "var(--faint-readable)" }}>
                      {r.def ? `${r.def.method} · ${r.def.cadence}` : "not in the catalogue"}
                    </div>
                    {r.facts.boards && (
                      <div className="mono" style={{ color: "var(--faint-readable)" }}>
                        {n(r.facts.boards.total)} boards
                        {r.facts.boards.failing > 0 && ` · ${n(r.facts.boards.failing)} dead (5+ failed polls)`}
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, maxWidth: 300 }}>
                    <div className="mono-strong" style={{ color: h.color }}>
                      ● {h.label}
                    </div>
                    <div className="mono" style={{ color: "var(--muted)" }}>
                      {r.verdict.reason}
                    </div>
                  </td>
                  <td style={num} className="mono-strong">
                    {n(r.facts.new24h)}
                  </td>
                  <td style={num}>{perDay(r.facts.new7d)}</td>
                  <td style={num}>{n(r.facts.open)}</td>
                  <td style={num}>
                    {run ? n(run.postingsSeen) : "—"}
                    {run && r.def?.runSource === null && (
                      <div className="mono" style={{ color: "var(--faint-readable)" }}>
                        all job boards
                      </div>
                    )}
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }} className="mono">
                    {run ? formatAge(run.startedAt, now) : "—"}
                    {r.facts.runningSince && (
                      <div style={{ color: "var(--accent)" }}>running now</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AdminSourcesPage() {
  await requireAdmin();
  const { now, rows, pipeline } = await getSourcesReport();

  const scholarships = rows.filter((r) => (r.def?.kind ?? "scholarship") === "scholarship");
  const internships = rows.filter((r) => r.def?.kind === "internship");
  const working = rows.filter((r) => r.verdict.health === "healthy").length;
  const sum = (rs: SourceRow[], f: (r: SourceRow) => number) => rs.reduce((a, r) => a + f(r), 0);

  // n8n triggers a poll every 20 minutes: 72 a day is a perfect day.
  const pollTone =
    pipeline.pollsLast24h >= 60 ? "var(--system-ok)" : pipeline.pollsLast24h >= 24 ? "var(--accent)" : "var(--system-danger)";

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <BackLink href="/admin" label="back to admin" />
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">admin · sources</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          where the listings <span style={{ color: "var(--accent)" }}>come from</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Every source we read, whether its last run worked, and how many new listings it added.
          &ldquo;New&rdquo; means new to us: the first time we saw the listing, not the day the sponsor
          posted it. Status is judged from what each run read, not from the label the run left behind.
        </p>
      </header>

      <div
        className="flex flex-wrap gap-x-12 gap-y-5 border"
        style={{ borderColor: "var(--line-strong)", padding: "18px 20px", marginBottom: 32 }}
      >
        <Stat
          value={`${working} of ${rows.length}`}
          label="sources working"
          tone={working === rows.length ? "var(--system-ok)" : "var(--accent)"}
        />
        <Stat value={n(sum(scholarships, (r) => r.facts.new24h))} label="new scholarships, 24h" />
        <Stat value={n(sum(internships, (r) => r.facts.new24h))} label="new internships, 24h" />
        <Stat value={n(pipeline.pollsLast24h)} label="job-board polls, 24h (target 72)" tone={pollTone} />
        <Stat
          value={pipeline.lastPollAt ? formatAge(pipeline.lastPollAt, now) : "never"}
          label={pipeline.lastPollRunning ? "last poll · one running now" : "last job-board poll"}
        />
      </div>

      <SourceTable title="01 — scholarships" rows={scholarships} now={now} />
      <SourceTable title="02 — internships" rows={internships} now={now} />

      <p className="mono" style={{ color: "var(--faint-readable)", maxWidth: "80ch" }}>
        A listing found by two sources counts under both. Job-board polls are triggered every 20
        minutes by the n8n workflow &ldquo;Instela - Ingest Trigger&rdquo;; scholarship sources run
        weekly on Sundays. Checked {now.toISOString().slice(0, 16).replace("T", " ")} UTC.
      </p>
    </main>
  );
}
