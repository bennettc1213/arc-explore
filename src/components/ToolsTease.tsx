import Link from "next/link";

import { TOOLS } from "@/lib/tools";

/**
 * A signed-out teaser for the three profile tools, surfaced directly on the
 * feed — the place a visitor lands first and the only surface they are
 * guaranteed to see without an account.
 *
 * Every tool lives behind the single "tools" nav menu now (see ToolsMenu),
 * which is the right structure but a discoverable-by-name-only affordance —
 * fine for the owner, hopeless for a student who does not know the page
 * exists. This is the explicit counterweight: these are the tools the
 * platform is built around, and they are open to try with no account.
 *
 * The wording mirrors each tool's own page so the promise here does not drift
 * from what the page actually does.
 */
export function ToolsTease() {
  return (
    <section style={{ marginBottom: 40 }}>
      <div className="eyebrow chrome" style={{ marginBottom: 14 }}>
        tools
      </div>
      <h2 className="section-title chrome" style={{ marginTop: 0, marginBottom: 16 }}>
        the parts that <span style={{ color: "var(--accent)" }}>run on your evidence</span>
      </h2>
      <p
        className="t-base"
        style={{ color: "var(--muted)", maxWidth: "58ch", marginBottom: 24 }}
      >
        Each one runs on text you bring and returns advice you can act on. The audit is the only one
        that fetches anything, and it pulls only what is already public. None of them need an account.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="mono chrome press flex flex-col gap-1.5 border p-4"
            style={{
              borderColor: "var(--line-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            <span className="mono-strong chrome" style={{ color: "var(--accent)" }}>
              {t.label}
            </span>
            <span className="t-xs" style={{ color: "var(--faint-readable)" }}>
              {t.blurb}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
