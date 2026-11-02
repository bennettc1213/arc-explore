import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { FEED_PATH } from "@/lib/routes";

export const metadata = {
  title: "Terms of Service — Instela",
  description: "The rules for using Instela, and what we do and do not promise.",
};

/**
 * The terms of service.
 *
 * Like the privacy page, written from what the product does rather than from
 * a template: listings are other people's, the extension never submits, and
 * no payment is taken today. Where a term depends on a decision the owner has
 * not made (governing law, a contact address), it is left out and recorded in
 * FIXES.md rather than invented.
 */

const UPDATED = "November 2, 2026";

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

export default function TermsPage() {
  return (
    <main className="wrap reference-page" style={{ paddingBlock: "48px 96px", maxWidth: 820 }}>
      <BackLink href={FEED_PATH} label="back to the feed" />
      <header style={{ marginBottom: 36 }}>
        <div className="eyebrow chrome">terms of service</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          the rules for <span style={{ color: "var(--accent)" }}>using Instela</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Instela helps students find internships and scholarships and prepare their materials.
          By creating an account or using the site you agree to these terms. Last updated{" "}
          {UPDATED}. How we handle your data is in the{" "}
          <Link href="/privacy" style={{ color: "var(--accent)" }}>
            privacy policy
          </Link>
          .
        </p>
      </header>

      <Section title="who can use it">
        <p>
          You must be at least 16, and old enough to agree to these terms where you live. You are
          responsible for your account and for what is done with it. Sign-in is by emailed link or,
          where it is switched on, Google; keep access to that email or Google account to yourself.
        </p>
      </Section>

      <Section title="what Instela is, and is not">
        <p style={{ marginBottom: 12 }}>
          Listings come from employers&apos; own application systems and from scholarship sources.
          We show where each one came from and when we last saw it live, but the listing, its
          requirements and its deadline belong to the employer or sponsor. We do not guarantee that
          a listing is still open, accurate or genuine, and we are not the employer, the sponsor or
          your agent.
        </p>
        <p style={{ marginBottom: 12 }}>
          A Fit Score is an estimate from the facts we hold about you and the listing. It says how
          many of its dimensions it could compute, and it is not a prediction that you will be
          selected or eligible. Check the sponsor&apos;s own requirements before you apply.
        </p>
        <p>
          Resume feedback, cover letter drafts and the other tools are aids. Nothing here is
          professional career, legal or financial advice, and we do not promise an interview, an
          offer or an award.
        </p>
      </Section>

      <Section title="your applications are yours">
        <p>
          Instela never submits an application for you. The browser extension can fill fields on an
          employer&apos;s form from your profile, and you review it and press submit yourself. You
          are responsible for everything you submit: that it is true, that you are eligible, and that
          you have answered the employer&apos;s legal declarations yourself. Do not use Instela to
          misrepresent yourself to an employer or sponsor.
        </p>
      </Section>

      <Section title="your content">
        <p>
          You keep ownership of your resume, profile and drafts. You give us permission to store and
          process them only to run the features you use, as the privacy policy describes. Only upload
          or enter information you have the right to share, and review generated text before you use
          it; drafts are built from the facts you provided and may still contain mistakes.
        </p>
      </Section>

      <Section title="what you may not do">
        <ul style={{ paddingLeft: 18 }}>
          <li style={{ marginBottom: 6 }}>Scrape, crawl or bulk-copy the site or its data.</li>
          <li style={{ marginBottom: 6 }}>
            Interfere with the service, probe it for weaknesses, or bypass a plan limit or access
            control.
          </li>
          <li style={{ marginBottom: 6 }}>
            Use someone else&apos;s account, or someone else&apos;s information without permission.
          </li>
          <li style={{ marginBottom: 6 }}>
            Report listings falsely, or use the service to send spam or anything unlawful.
          </li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We may limit or close an account that does, and may hide a listing we have reason to think
          is misleading.
        </p>
      </Section>

      <Section title="plans and payment">
        <p>
          There is a free plan and a paid plan; the{" "}
          <Link href="/pricing" style={{ color: "var(--accent)" }}>
            pricing page
          </Link>{" "}
          lists what each includes and marks features that are not finished. We take no payment
          today. If that changes, the price and billing terms will be shown before you are charged,
          and you will not be charged without agreeing to them. Features may change or be withdrawn.
        </p>
      </Section>

      <Section title="ending your account">
        <p>
          You can stop using Instela at any time and delete your account from{" "}
          <Link href="/profile" style={{ color: "var(--accent)" }}>
            your profile
          </Link>
          ; deletion is immediate and cannot be undone. We may suspend or end access for breaking
          these terms or to protect the service.
        </p>
      </Section>

      <Section title="no warranty, and limits on liability">
        <p style={{ marginBottom: 12 }}>
          Instela is provided as is and as available, without warranties of any kind, to the extent
          the law allows. We do not promise it will be uninterrupted, error-free or that every
          listing will be current.
        </p>
        <p>
          To the extent the law allows, we are not liable for indirect or consequential loss, or for
          a missed deadline, a rejected application or an opportunity lost while relying on
          information here. Nothing in these terms limits a right you have by law that cannot be
          limited.
        </p>
      </Section>

      <Section title="changes">
        <p>
          We may update these terms. The date at the top changes when we do, and if a change is
          material we will say so on the site. Continuing to use Instela after a change means you
          accept it.
        </p>
      </Section>

      <footer className="mono" style={{ marginTop: 48, color: "var(--faint-readable)" }}>
        <Link href="/privacy" style={{ color: "var(--accent)" }}>
          privacy policy →
        </Link>{" "}
        ·{" "}
        <Link href={FEED_PATH} style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
