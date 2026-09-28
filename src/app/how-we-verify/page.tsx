import Link from "next/link";

export const metadata = {
  title: "How we verify — Instela",
  description:
    "How Instela checks internships and scholarships at the source, what the timestamps mean, and when we label something inferred or estimated.",
};

export default function HowWeVerifyPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: "68ch" }}>
      <Link href="/" className="mono press" style={{ color: "var(--faint-readable)", textDecoration: "none" }}>
        ← back to feed
      </Link>

      <header style={{ marginTop: 24, marginBottom: 32 }}>
        <div className="eyebrow chrome">verification</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          How we know a listing is <span style={{ color: "var(--accent)" }}>live</span>
        </h1>
      </header>

      <section className="t-base" style={{ color: "var(--text)", display: "flex", flexDirection: "column", gap: 24 }}>
        <p>
          We do not guess. Every row in the feed is tied to a source we can point to, and we
          record exactly what that source said and when we asked.
        </p>

        <div>
          <h2 className="t-base" style={{ fontWeight: 600, marginBottom: 8 }}>
            Internships: polled at the source
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Employer applicant-tracking systems (Greenhouse, Lever, Ashby, SmartRecruiters, and
            others) are the source of truth. We poll the board directly, read the posting as the
            employer published it, and keep the original apply URL. If a role disappears from the
            board on two complete checks, we mark it closed and keep the record so you can still
            see what changed.
          </p>
        </div>

        <div>
          <h2 className="t-base" style={{ fontWeight: 600, marginBottom: 8 }}>
            Scholarships: scraped from trusted pages
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Scholarships come from university financial-aid offices, foundation directories, and
            other sponsor-published pages. We read the title, sponsor, amount, deadline, and
            eligibility as stated, then link straight to the sponsor&apos;s application page. When the
            same award appears on multiple independent portals, we count that as corroboration and
            show it as a trust signal.
          </p>
        </div>

        <div>
          <h2 className="t-base" style={{ fontWeight: 600, marginBottom: 8 }}>
            What the timestamps mean
          </h2>
          <ul style={{ color: "var(--muted)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>
              <strong style={{ color: "var(--text)" }}>First seen</strong> — the first time we ever
              observed this listing.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Last confirmed</strong> — the most recent
              time we successfully checked the source and the listing was still there.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Posted</strong> — a date the employer or
              sponsor itself published, when one is available. We omit it when the source does not
              state one.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Closes</strong> — the stated application
              deadline, if the source gives one.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="t-base" style={{ fontWeight: 600, marginBottom: 8 }}>
            Inferred fields
          </h2>
          <p style={{ color: "var(--muted)" }}>
            Some listings do not state a term or an amount directly. When that happens, we may infer
            a term from when the listing first appeared or compute an estimated per-award amount
            from a program total and number of awards. Every inferred value is labeled as inferred;
            we never present a guess as a stated fact.
          </p>
        </div>

        <div>
          <h2 className="t-base" style={{ fontWeight: 600, marginBottom: 8 }}>
            What we do not do
          </h2>
          <ul style={{ color: "var(--muted)", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <li>We do not invent listings that are not on a source page.</li>
            <li>We do not silently remove a saved item when the link goes dead.</li>
            <li>We do not sell student data.</li>
            <li>We do not pretend a sweepstakes is a judged scholarship.</li>
          </ul>
        </div>

        <p className="mono" style={{ color: "var(--faint-readable)", marginTop: 8 }}>
          If a source looks wrong, every listing has a “report a problem” link so we can investigate.
        </p>
      </section>
    </main>
  );
}
