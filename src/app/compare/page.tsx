import Link from "next/link";

import { getSessionUser } from "@/lib/auth";
import { MAX_COMPARE, MIN_COMPARE, buildComparison, parseCompareIds } from "@/lib/compare";
import { getPosting } from "@/lib/feed";
import { getLatestResume, getProfile } from "@/lib/profile/store";
import { toScoreProfile } from "@/lib/profile/types";
import { skillsFromParsedResume } from "@/lib/score/skills";

import type { CompareRow } from "@/lib/compare";

export const dynamic = "force-dynamic";

/**
 * Side by side.
 *
 * Scored against the viewer's own profile, like everything else here — a
 * comparison of two postings against nobody in particular is a table, and the
 * question a student is actually asking is which of these is better *for them*.
 */

function Cell({ value, best }: { value: string | null; best?: boolean }) {
  if (value === null) {
    return (
      <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
        <span className="mono" style={{ color: "var(--faint-readable)" }}>
          not stated
        </span>
      </td>
    );
  }
  return (
    <td style={{ padding: "10px 14px", verticalAlign: "top" }}>
      <span
        className="t-sm"
        style={{ color: best ? "var(--accent)" : "var(--text)", fontWeight: best ? 500 : 400 }}
      >
        {value}
      </span>
    </td>
  );
}

function Rows({ rows }: { rows: CompareRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.label} style={{ borderTop: "1px solid var(--line)" }}>
          <th
            scope="row"
            style={{
              padding: "10px 18px 10px 0",
              textAlign: "left",
              verticalAlign: "top",
              // The label column needs real width or the notes wrap to one word
              // a line and every row grows to match the tallest note.
              minWidth: 190,
            }}
          >
            <span className="mono chrome">{r.label}</span>
            {r.note && (
              <span
                className="mono"
                style={{ display: "block", color: "var(--faint-readable)", marginTop: 3, lineHeight: 1.5 }}
              >
                {r.note}
              </span>
            )}
          </th>
          {r.cells.map((c, i) => (
            <Cell key={i} value={c.value} best={c.best} />
          ))}
        </tr>
      ))}
    </>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ids = parseCompareIds(sp.ids);

  const user = await getSessionUser();
  const [stored, resume] = user
    ? await Promise.all([getProfile(user.id), getLatestResume(user.id)])
    : [null, null];
  const profile = toScoreProfile(stored, resume ? skillsFromParsedResume(resume.parsed) : []);

  // A hidden or deleted posting comes back null and is dropped rather than
  // rendering an empty column.
  const found = (await Promise.all(ids.map((id) => getPosting(id, profile)))).filter(
    (i): i is NonNullable<typeof i> => i !== null,
  );

  if (found.length < MIN_COMPARE) {
    return (
      <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 900 }}>
        <div className="eyebrow chrome">compare</div>
        <h1 className="section-title chrome" style={{ marginTop: 12, marginBottom: 16 }}>
          pick <span style={{ color: "var(--accent)" }}>two or three</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "62ch" }}>
          {ids.length === 0
            ? "Choose opportunities from your tracker to line them up side by side."
            : `Only ${found.length} of the ${ids.length} you asked for is still available — the others may have been taken down.`}
        </p>
        <p className="mono" style={{ marginTop: 20 }}>
          <Link href="/tracker" style={{ color: "var(--accent)" }}>
            go to your tracker →
          </Link>
        </p>
      </main>
    );
  }

  const comparison = buildComparison(found);

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">compare</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          where they <span style={{ color: "var(--accent)" }}>actually differ</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "64ch", marginTop: 14 }}>
          Printing both listings next to each other is a worse version of two browser tabs. What
          you cannot do in two tabs is see which facts differ, so those come first — and the rest
          sit below, unchanged.
          {!user && " Sign in and this is scored against your own profile."}
        </p>
      </header>

      <div style={{ overflowX: "auto", marginBottom: 32 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 190 }} />
              {comparison.items.map((i) => (
                <th key={i.id} scope="col" style={{ padding: "0 14px 14px", textAlign: "left" }}>
                  <Link
                    href={`/listing/${i.id}`}
                    className="t-sm press"
                    style={{ color: "var(--accent)", fontWeight: 500 }}
                  >
                    {i.title}
                  </Link>
                  <span className="mono" style={{ display: "block", color: "var(--faint-readable)", marginTop: 4 }}>
                    {i.company}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {comparison.differing.length > 0 && (
              <tr>
                <td colSpan={comparison.items.length + 1} style={{ paddingTop: 8 }}>
                  <span className="eyebrow chrome">
                    {comparison.differing.length} of {comparison.rows.length} differ
                  </span>
                </td>
              </tr>
            )}
            <Rows rows={comparison.differing} />

            {comparison.shared.length > 0 && (
              <>
                <tr>
                  <td colSpan={comparison.items.length + 1} style={{ paddingTop: 26 }}>
                    <span className="eyebrow chrome" style={{ color: "var(--faint-readable)" }}>
                      the same on all {comparison.items.length}
                    </span>
                  </td>
                </tr>
                <Rows rows={comparison.shared} />
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3" style={{ marginBottom: 32 }}>
        {comparison.items.map((i) => (
          <a
            key={i.id}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn press"
            style={{ textDecoration: "none" }}
          >
            apply — {i.company} ↗
          </a>
        ))}
      </div>

      <footer className="mono" style={{ color: "var(--faint-readable)" }}>
        an accent value is the better of the row. a row where any column is unstated marks nobody —
        picking a winner there would be ranking one posting above another on a fact we do not hold
        for both.{" "}
        <Link href="/tracker" style={{ color: "var(--accent)" }}>
          back to your tracker →
        </Link>
      </footer>
    </main>
  );
}
