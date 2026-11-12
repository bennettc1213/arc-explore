import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { FEED_PATH } from "@/lib/routes";

export const metadata = {
  title: "Privacy — Instela",
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
    <main className="wrap reference-page" style={{ paddingBlock: "48px 96px", maxWidth: 820 }}>
      <BackLink href={FEED_PATH} label="back to the feed" />
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
            what="The resume file name and extracted text"
            why="we retain the text and structured details for your profile; the original PDF, Word document, HTML, or image is not retained"
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
            what="Which free tool allowances you have used, and when"
            why="so a Free allowance renews 30 days after it starts and an earned result can be reopened without charging again. For each use we keep the tool, the time, and what it was used on: a fingerprint of the resume revision (a hash, not the text), the GitHub username audited, the listing a cover letter is for, or simply that a LinkedIn or essay session was started. Never essay or profile text"
          />
          <Row
            what="When you last asked for an AI cover-letter generation"
            why="a timestamp per request, kept for an hour's rate limit (30 an hour on every plan). No content"
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
            what="When your current and previous visits to the feed started (two timestamps)"
            why="the “new since you last looked” count. Each visit replaces the older one, and we do not record what you searched for, which listings you opened, or how long you stayed"
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
          Analytics, nothing that phones a third party when you load something. We count a few
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
          <Row
            what="That an upgrade prompt was shown, or a checkout was opened"
            why="with which feature it was about. Not who saw it"
          />
        </ul>
        <p style={{ marginTop: 12 }}>
          Everything else we report — signups, applications tracked, resumes, cover letters — is
          counted from the tables that already exist because a feature needed them, rather than
          from a second log of what people did. The LinkedIn checker and the essay reviewer still
          run entirely in your browser: the text you paste is never sent anywhere. On the Free
          plan, opening one of them makes a single request when you press &ldquo;start&rdquo;,
          which tells us only that a session started, so the allowance can be kept. On Pro
          they make no request at all.
        </p>
      </Section>

      <Section title="application memory and autofill">
        <p>Reusable facts you save in your profile or an Instela autofill prompt are stored in
          your account. You can review, edit, or remove them in your profile. Removing a saved
          fact stops it being reused by autofill; it does not rewrite the resume you uploaded.</p>
        <p style={{ marginTop: 12 }}>When you choose autofill, the extension places answers into
          the application site, which can read those answers even before submission. Answers to
          questions specific to an employer or scholarship stay in that form and are not added
          to your reusable Instela profile. The extension does not keep a separate persistent
          copy of your profile. Your account memory is deleted when you delete your account.</p>
        <p style={{ marginTop: 12 }}>The older saved-story library is stored only in this browser
          and is not synced to your account. It is separate from your reusable profile facts.</p>
      </Section>

      <Section title="resume imports and student verification">
        <p>
          Resume files are read on our server. Extracted text and structured details are stored;
          the original uploaded file is not. Optional AI enrichment sends extracted text to Anthropic
          only when that feature is enabled. Review imported details before saving your profile.
          Your onboarding draft stays in this browser for up to seven days.
        </p>
        <p style={{ marginTop: 12 }}>Student verification stores school-inbox verification,
          current-enrollment status, its expiry, and discount redemption. University sign-in uses
          the university’s identity provider; Instela never receives your university password.
          We retain hashes of the verified school email and university identity after account deletion
          to prevent the same student discount being claimed on another account.</p>
      </Section>

      <Section title="signing in with Google">
        <p style={{ marginBottom: 12 }}>
          Where Google sign-in is switched on, choosing it sends you to Google, and Google returns
          your email address, along with basic profile details (name and picture) that Supabase
          holds in your login record. We ask for nothing else: no access to your Gmail, Drive,
          Calendar, contacts or any other Google data, now or later. We use the email address only
          to sign you in and to match you to the same account a magic link would give you.
        </p>
        <p>
          We do not sell it, use it for advertising, or share it beyond the services listed below,
          and our use of information received from Google APIs follows the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            style={{ color: "var(--accent)" }}
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. Deleting your account removes your login
          record.
        </p>
      </Section>

      <Section title="what leaves our systems, and to whom">
        <p style={{ marginBottom: 12 }}>
          Up to five services, each doing one job. None of them is paid for your data, and none of them
          receives anything we were not asked to send.
        </p>
        <ul style={{ paddingLeft: 18 }}>
          <Row
            what="Anthropic — your resume content"
            why="resume text is sent only if optional AI enrichment is enabled. Cover letter generation sends the profile and resume facts used to generate that letter"
          />
          <Row
            what="Resend — your email address and the listing titles in that message"
            why="for requested student-email verification codes and optional deadline reminders, saved-search alerts, and weekly digests"
          />
          <Row
            what="Supabase — everything above"
            why="it is the database and the sign-in provider; the data lives there"
          />
          <Row
            what="Google — only if you choose Google sign-in"
            why="Google learns that you signed in to Instela; it receives nothing from your profile or resume"
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
        <Link href={FEED_PATH} style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
