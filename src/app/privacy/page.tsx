import Link from "next/link";

export const metadata = {
  title: "Privacy — internship tracker",
  description: "What we store, what leaves our systems, and what we will never do.",
};

/**
 * The privacy policy.
 *
 * WRITTEN FROM THE SCHEMA, NOT FROM A TEMPLATE. Every claim below was checked
 * against `db/schema.ts` and the code that writes to it. That is the only way
 * this document is worth anything: a policy assembled from boilerplate says
 * what policies usually say, and the interesting facts about this product are
 * the ones boilerplate would smooth over — that resume content goes to
 * Anthropic to be parsed, that a .txt upload is stored as text where a PDF is
 * not, that we hold no payment details because there is nothing to pay for.
 *
 * If the schema changes, this page is wrong until it is updated. It is
 * deliberately specific enough that being out of date is visible rather than
 * quietly survivable.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 className="mono-strong chrome" style={{ color: "var(--accent)", marginBottom: 10 }}>
        {title}
      </h2>
      <div className="t-sm" style={{ color: "var(--muted)", maxWidth: "68ch" }}>
        {children}
      </div>
    </section>
  );
}

function Row({ what, why }: { what: string; why: string }) {
  return (
    <li style={{ marginBottom: 8 }}>
      <span style={{ color: "var(--text)" }}>{what}</span>
      <span style={{ color: "var(--faint-readable)" }}> — {why}</span>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 820 }}>
      <header style={{ marginBottom: 36 }}>
        <div className="eyebrow chrome">privacy</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          we do not <span style={{ color: "var(--accent)" }}>sell your data</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Not to advertisers, not to recruiters, not to schools, not to data brokers, and not as
          part of an acquisition without telling you first. There is no analytics vendor, no
          advertising pixel and no third-party tracker on this site. What follows is the specific
          version of that, written from the database schema rather than from a template.
        </p>
      </header>

      <Section title="what we store, and only because something needs it">
        <p style={{ marginBottom: 12 }}>
          Every field here exists because a feature reads it. Nothing is collected speculatively.
        </p>
        <ul style={{ paddingLeft: 18 }}>
          <Row
            what="Your profile — name, school, major, graduation year, GPA, work authorization, target fields and locations, portfolio and GitHub and LinkedIn links"
            why="these are the Fit Score's dimensions; anything you leave blank is dropped from the score rather than counted against a listing"
          />
          <Row
            what="Your resume, as structure — contact details, education, experience entries and their bullets, skills, projects, links"
            why="the internship score reads your skills, and both generators may assert only what is in here"
          />
          <Row
            what="The file name, and for .txt or .md uploads the text itself"
            why="a PDF is never stored — see the note below, because this is the one place our earlier wording was too flattering"
          />
          <Row
            what="Cover letter drafts, one per listing"
            why="so a draft survives you closing the tab"
          />
          <Row
            what="Applications you saved or tracked, their status, and any notes you wrote"
            why="the tracker"
          />
          <Row
            what="Which deadline reminders we have already sent you"
            why="without it the daily job would mail you about the same award every morning"
          />
          <Row
            what="Your saved searches, and when we last emailed you about each one"
            why="new-match alerts — the timestamp is what stops an alert repeating what it already sent"
          />
          <Row
            what="Whether the weekly digest is on, and when the last one went out"
            why="the digest — the timestamp is the whole of what we remember about it. We do not keep a record of which opportunities any digest contained"
          />
          <Row
            what="Your email address"
            why="it is how you sign in — there are no passwords here — and where reminders, alerts and the digest go if you leave them on"
          />
        </ul>
      </Section>

      <Section title="what we count, and what we deliberately do not">
        <p style={{ marginBottom: 12 }}>
          There is no analytics script on any page here — no Google, no PostHog, no Vercel
          Analytics, nothing that phones a third party when you load something. We count three
          things, into a table in our own database, and that table holds{" "}
          <em>no user id, no IP address and no browser fingerprint</em>. It cannot be joined back
          to a person, because there is nothing in it to join on.
        </p>
        <ul style={{ paddingLeft: 18 }}>
          <Row
            what="That a filtered search happened"
            why="with which filter names were used and whether it returned nothing. What you typed into the search box is never recorded — only that a text term was present"
          />
          <Row
            what="That a listing page was opened"
            why="with whether it was an internship or a scholarship. Not which listing"
          />
          <Row
            what="That a GitHub audit ran"
            why="with the score it produced. Not the username"
          />
        </ul>
        <p style={{ marginTop: 12 }}>
          Everything else we report — signups, applications tracked, resumes, cover letters — is
          counted from the tables that already exist because a feature needed them, rather than
          from a second log of what people did. And the LinkedIn checker and the essay reviewer
          are counted <em>nowhere</em>: both run entirely in your browser, both pages say so, and
          adding even a content-free usage ping would put a network call on a page that currently
          makes none. We would rather not know how often they are used.
        </p>
      </Section>

      <Section title="the one place our wording was too generous">
        <p>
          The upload form used to say we keep &ldquo;only the structured result — not the file&rdquo;.
          That is true for PDFs, which is what nearly everyone uploads: the bytes go straight to the
          parser and are never written down. It was <em>not</em> true for plain-text and markdown
          uploads, where we store the text you gave us so a re-parse does not need you to upload it
          again. The form now says so. We would rather correct a sentence than let a small
          convenient inaccuracy sit in the one product area where being trusted is the entire
          point.
        </p>
      </Section>

      <Section title="what leaves our systems, and to whom">
        <p style={{ marginBottom: 12 }}>
          Four services, each doing one job. None of them is paid for your data, and none of them
          receives anything we were not asked to send.
        </p>
        <ul style={{ paddingLeft: 18 }}>
          <Row
            what="Anthropic — your resume content"
            why="a PDF resume is sent to Claude to be read into structure, because a plain text extractor turns a two-column resume into nonsense. Cover letter generation sends the facts we already hold. This is the most sensitive thing that leaves, and it is worth knowing before you upload"
          />
          <Row
            what="Resend — your email address and the listing titles in that message"
            why="only for the three things you can switch off — deadline reminders for postings you saved, alerts for searches you saved, and the weekly digest. Each is a separate subscription with its own unsubscribe link, none of which needs a login, and turning one off never silently turns off the others"
          />
          <Row
            what="Supabase — everything above"
            why="it is the database and the sign-in provider; the data lives there"
          />
          <Row
            what="GitHub — the username you type into the audit"
            why="a request to GitHub's public API necessarily tells GitHub which profile was asked for. Nothing about you is attached to it"
          />
        </ul>
      </Section>

      <Section title="what we will never do">
        <ul style={{ paddingLeft: 18 }}>
          <Row
            what="Fetch your LinkedIn profile"
            why="not by scraper, not through an unofficial API, not by logging in as you. LinkedIn sued Proxycurl over exactly that and it shut down in July 2026. The checker runs entirely in your browser, so the text you paste into it is never sent to us either"
          />
          <Row
            what="Store or infer demographics"
            why="race, gender, veteran status and disability are legal declarations on an application form. We do not hold them, do not guess at them, and the application packet leaves those questions for you to answer yourself"
          />
          <Row
            what="Submit an application on your behalf"
            why="an application asks things no stored profile answers, and a model answering them would assert things about you that nothing in your resume supports — under your name, to an employer, without you reading it"
          />
          <Row
            what="Take payment details"
            why="there is nothing to pay for, so there is no card number here to lose"
          />
          <Row
            what="Sell, rent or share your data with recruiters, schools or brokers"
            why="the whole premise of this product is that it works for the student, and an aggregator that sells its users to the other side is not doing that"
          />
        </ul>
      </Section>

      <Section title="deleting it">
        <p style={{ marginBottom: 10 }}>
          There is a button on{" "}
          <Link href="/profile" style={{ color: "var(--accent)" }}>
            your profile
          </Link>
          . It deletes your profile, every resume and everything parsed out of it, every cover
          letter, every saved and tracked application with its notes, your reminder history and
          your login record. It happens immediately, not on a queue, and there is no undo — we keep
          no backup copy we could restore you from, which is the same fact stated from both
          directions.
        </p>
        <p>
          Reminders can be switched off without deleting anything: use the unsubscribe link in any
          message, or the setting on your profile. The link needs no login, because putting an auth
          wall in front of an opt-out is how you earn spam reports.
        </p>
      </Section>

      <Section title="what we cannot promise">
        <p>
          No product this size has been through a formal security audit, and this one has not
          either. What we can tell you is specific: row-level security is on for every user-owned
          table, the application connects as the table owner and every query is scoped by user id
          in code, sign-in is a magic link so there is no password of yours to leak, and the
          service-role key exists in exactly one file that does exactly one thing. That is a
          description of the design, not a guarantee about the outcome, and we would rather say so
          than print a badge.
        </p>
      </Section>

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        this page describes what the code does today. if the schema changes and this is not
        updated with it, this page is wrong — it is written specifically enough that being out of
        date shows.{" "}
        <Link href="/" style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
