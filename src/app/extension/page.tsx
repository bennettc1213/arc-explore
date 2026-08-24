import Link from "next/link";

import { BackLink } from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature, TIER_LABELS, TIER_PRICE_USD } from "@/lib/pricing/tiers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Browser extension — internship tracker",
  description:
    "Fill an employer's application with the facts you already gave us, in your own browser.",
};

/**
 * What the extension is, and the honest reason it is an extension.
 *
 * THIS PAGE EXISTS BECAUSE OF A RECORDED PRODUCT FAILURE. The cover letter
 * builder shipped and its own owner did not know it existed; FIXES.md §5 calls
 * that a product failure rather than an oversight. A browser extension is
 * worse than most features in that respect, because it needs a deliberate
 * install — nobody discovers it by clicking around. So it gets a page, a slot
 * in the tools menu, and an explanation of the constraint that shaped it.
 *
 * The "why not one click on our site" section is the important half. A student
 * who does not understand why they still press submit will read the extension
 * as a half-finished auto-applier rather than as the honest maximum.
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

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ marginBottom: 10 }}>
      <span className="mono" style={{ color: "var(--accent)" }}>
        {n}.
      </span>{" "}
      <span style={{ color: "var(--text)" }}>{children}</span>
    </li>
  );
}

export default async function ExtensionPage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const access = evaluateFeature(tier, "extension_autofill_internships");

  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 820 }}>
      <BackLink href="/" label="back to the feed" />

      {/* Said up front, not discovered after installing. The extension is
          free to install and useless without the plan — its packet endpoint
          answers 403 (see api/extension/packet), so a student who installs
          it on Free and only then finds out has been wasted. */}
      {!access.usable && (
        <div
          className="border"
          style={{ borderColor: "var(--accent)", padding: "14px 18px", marginBottom: 28 }}
        >
          <div className="mono-strong" style={{ color: "var(--accent)" }}>
            autofill needs the {TIER_LABELS[access.minimumTier]} plan
          </div>
          <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
            You can install the extension on any plan, but it will not fill a form until your
            account is on {TIER_LABELS[access.minimumTier]} — the endpoint it asks for your facts
            refuses anything less. Everything below describes what it does once it is switched on.{" "}
            <Link href="/pricing" style={{ color: "var(--accent)" }}>
              see pricing — ${TIER_PRICE_USD[access.minimumTier]}/mo
            </Link>
          </p>
        </div>
      )}

      <header style={{ marginBottom: 36 }}>
        <div className="eyebrow chrome">browser extension</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          apply with <span style={{ color: "var(--accent)" }}>your own facts</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Open any internship in your feed on Greenhouse, Lever, Ashby or SmartRecruiters, click
          the Arc button, and the form fills with what you have already told us — name, school,
          major, graduation year, contact details, your links, and your cover letter for that
          role. You read it, attach your resume, and press submit.
        </p>
      </header>

      <Section title="why you still press submit">
        <p style={{ marginBottom: 10 }}>
          Because the alternative would be a lie. Every board these applications live on requires{" "}
          <span style={{ color: "var(--text)" }}>the employer&rsquo;s own API credentials</span> to
          submit anything programmatically — SmartRecruiters needs their OAuth consent, Greenhouse
          needs their job-board key, Lever and Ashby the same. Reading those boards is public,
          which is how your feed is built. Submitting is not.
        </p>
        <p style={{ marginBottom: 10 }}>
          So a &ldquo;one-click apply&rdquo; button on our site would either need permission from
          each of the ~500 employers in the corpus, or would have to drive their forms with a robot
          — which breaks their terms, is blocked by most of them, and fails in the worst possible
          way: telling you that you applied when you did not. You would stop tracking the role and
          miss the deadline, and we would have caused it.
        </p>
        <p>
          In your own browser, none of that applies. It is your session and your click. That is why
          this is an extension and not a button, and it is the same reason we do not auto-answer
          the legal questions below.
        </p>
      </Section>

      <Section title="what it will never fill">
        <p style={{ marginBottom: 10 }}>
          Work authorization, sponsorship, citizenship, veteran and disability status, race and
          gender, and any box that asks you to agree or consent to something. These are
          declarations you sign, not fields to save time on — getting one wrong is a false
          statement on your application, not a typo.
        </p>
        <p>
          They are highlighted in amber on the page and listed in the panel as{" "}
          <span style={{ color: "var(--text)" }}>yours to answer</span>. We never store or infer
          your demographics at all.
        </p>
      </Section>

      <Section title="what else it leaves alone">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--text)" }}>Anything you already typed.</span> A value we did
            not put there is one you chose.
          </li>
          <li style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--text)" }}>The resume file upload.</span> We keep the
            structured content of your resume, not the original document — so you attach your own
            PDF. That is the same thing the privacy policy says.
          </li>
          <li style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--text)" }}>Questions only you can answer.</span> &ldquo;Why
            this team&rdquo;, &ldquo;when can you start&rdquo;, salary expectations. We do not hold
            them, and a guess is worse than a blank you will notice.
          </li>
          <li>
            <span style={{ color: "var(--text)" }}>Every field it cannot identify.</span> The panel
            tells you how many those were, rather than reporting only the ones that worked.
          </li>
        </ul>
      </Section>

      <Section title="installing it">
        <p style={{ marginBottom: 12 }}>
          Not in the Chrome Web Store yet — it installs from the repo in developer mode.
        </p>
        <ol style={{ paddingLeft: 4, margin: 0, listStyle: "none" }}>
          <Step n={1}>
            Run <code className="mono">npm run build:extension</code>.
          </Step>
          <Step n={2}>
            Open <code className="mono">chrome://extensions</code> and turn on developer mode.
          </Step>
          <Step n={3}>
            Choose <span className="mono">load unpacked</span> and select the{" "}
            <code className="mono">extension/</code> folder.
          </Step>
          <Step n={4}>
            Copy the extension ID Chrome shows you into <code className="mono">EXTENSION_ORIGINS</code>{" "}
            in <code className="mono">.env</code>, as{" "}
            <code className="mono">chrome-extension://&lt;id&gt;</code>, and restart the server.
          </Step>
          <Step n={5}>Sign in here in the same browser, then open any internship in your feed.</Step>
        </ol>
        <p style={{ marginTop: 12 }}>
          Full notes are in <code className="mono">extension/README.md</code>.
        </p>
      </Section>

      <Section title="what it sends us">
        <p>
          The address of the page you are on, so we can tell whether it is a listing in your feed —
          and, when you press <span style={{ color: "var(--text)" }}>I submitted this</span>, the id
          of that listing so your tracker is stamped and your confirmation email goes out. It does
          not read the employer&rsquo;s page, does not watch what you type, and stores nothing about
          you: your facts are fetched fresh each time from the account you are already signed in to.
        </p>
      </Section>
    </main>
  );
}
