import Link from "next/link";

import type { ProfileCompletion } from "@/lib/profile/completion";

/**
 * What each blank field costs you.
 *
 * The Phase 06 line asked for points. This shows coverage instead, and the
 * distinction is the whole design: a points total is a number you can raise
 * without anything about your outcomes changing — the exact complaint this
 * codebase makes about the GitHub contribution graph one page over. What is
 * actually true is that an unknown dimension is *dropped* from a Fit Score
 * rather than counted as a miss, so an incomplete profile does not produce a
 * bad score, it produces a thin one. Filling something in makes a number mean
 * more. That is the only honest reason to do it, so it is the one we give.
 *
 * ONE CALL TO ACTION, not five. `PresencePrompt` two panels down already
 * settled this argument for routing — five equal buttons hands the decision
 * back to someone who came here to be told what to do next. The rest of the
 * list is legible below it, ranked, and each row says what it is worth.
 */
export function Completion({ completion }: { completion: ProfileCompletion }) {
  const { done, total, percent, next, items } = completion;
  const complete = next === null;

  return (
    <section style={{ border: "1px solid var(--line-strong)", padding: 22, marginBottom: 28 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="eyebrow chrome">how much of your score is real</div>
        <span className="mono-strong" style={{ color: complete ? "var(--accent)" : "var(--text)" }}>
          {done}/{total} · {percent}%
        </span>
      </div>

      {/* A bar rather than a number alone, but built from the same count — no
          animation, no streak, nothing that rewards returning without doing
          anything. */}
      <div
        aria-hidden
        style={{
          height: 3,
          background: "var(--line)",
          marginTop: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: complete ? "var(--accent)" : "var(--text)",
          }}
        />
      </div>

      <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "62ch", marginBottom: 18 }}>
        {complete ? (
          <>
            Every dimension both scorers can read about you is filled in. Anything still marked
            unknown on a listing is missing from{" "}
            <span style={{ color: "var(--text)" }}>the posting</span>, not from you.
          </>
        ) : (
          <>
            A blank field is never scored against you — the dimension is dropped and the score is
            averaged over what is left. So this is not a penalty, it is{" "}
            <span style={{ color: "var(--text)" }}>how much of each Fit Score rests on
            something real</span>.
          </>
        )}
      </p>

      {next && (
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 18 }}>
          <Link
            href={next.href}
            className="btn btn-primary press"
            style={{ textDecoration: "none" }}
          >
            {next.cta}
          </Link>
          <span className="mono" style={{ color: "var(--faint-readable)" }}>
            {next.postings !== null
              ? `${next.postings.toLocaleString("en-US")} open roles state this and cannot score you on it`
              : "unlocks a dimension we cannot put a count on"}
          </span>
        </div>
      )}

      <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <li key={item.key} className="flex items-baseline gap-3">
            <span
              className="mono"
              aria-hidden
              style={{ color: item.done ? "var(--accent)" : "var(--faint-readable)" }}
            >
              {item.done ? "✓" : "—"}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                className="t-sm"
                style={{ color: item.done ? "var(--faint-readable)" : "var(--text)" }}
              >
                {item.label}
              </span>
              <span
                className="mono"
                style={{ display: "block", color: "var(--faint-readable)" }}
              >
                {item.unlocks}
                {/* The count is impact context, and it is printed only where we
                    can count honestly — a dimension we cannot measure says so
                    rather than showing a zero. */}
                {item.postings !== null && ` · ${item.postings.toLocaleString("en-US")} open roles`}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mono" style={{ marginTop: 16, color: "var(--faint-readable)" }}>
        only fields a scorer actually reads are listed. your name, gpa, links and portfolio are
        stored but change no score, so counting them here would pad the number.
      </p>
    </section>
  );
}
