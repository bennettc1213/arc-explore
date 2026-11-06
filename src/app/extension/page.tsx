import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { getSessionUser } from "@/lib/auth";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature, TIER_LABELS } from "@/lib/pricing/tiers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Autofill with Instela | Browser extension" };

export default async function ExtensionPage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const access = evaluateFeature(tier, "extension_autofill_internships");
  return <main className="wrap tool-page reference-page" style={{ paddingBlock: "40px 80px", maxWidth: 900 }}>
    <BackLink href="/portal" label="Back to portal" />
    <header className="memory-heading"><div><div className="eyebrow">INSTELA PRO · BROWSER EXTENSION</div><h1>Less typing. More applications.</h1><p>Your Instela profile follows you to supported internship and scholarship applications.</p></div></header>
    <p className="memory-privacy">Development preview. The extension is built and available to test locally; its Chrome Web Store release and end-to-end portal verification are still pending.</p>
    {!access.usable && <p style={{ marginBottom: 24 }}>Autofill requires {TIER_LABELS[access.minimumTier]}. You can build and edit <Link href="/profile#application-memory">your Instela memory</Link> on any plan. <Link href="/pricing">Explore Pro</Link>.</p>}
    <section className="memory-fact-group"><h2>How it works</h2><ol style={{ padding: "16px 0 16px 24px", lineHeight: 2 }}>
      <li>Review your reusable details in <Link href="/profile#application-memory">your profile</Link>.</li>
      <li>Choose <strong>Apply with Instela</strong> on an opportunity.</li>
      <li>The official form opens inside the opportunity&rsquo;s Instela application page on supported sites.</li>
      <li>Open the Instela extension, allow access to this site when asked, and press <strong>Autofill with Instela</strong>.</li>
      <li>Answer the Instela prompts for anything missing, then review and submit the form.</li>
    </ol><p className="t-sm" style={{ color: "var(--muted)" }}>Stay on Instela to autofill, answer questions, and submit supported forms. Each new application site needs your permission through the extension. If a site blocks embedding or needs a separate sign-in, its Instela workspace explains the limitation and offers a separate tab as an optional fallback.</p></section>
    <section className="memory-fact-group"><h2>Remember facts. Keep one-time answers separate.</h2><p style={{ marginBlock: 14 }}>A missing phone number or degree can be saved to your account and reused. A question like “Why do you want to work here?” or “Has a family member received this scholarship?” gets your own answer for that application only.</p><p className="t-sm" style={{ color: "var(--muted)" }}>The prompt tells you whether an answer will be saved. You can skip any prompt and finish directly in the form. Custom widgets, file uploads, account creation, and declarations may need your attention on the application site.</p></section>
    <section className="memory-privacy"><div><h2>Your information, under your control</h2><p>Saved facts belong to your Instela account. View, change, or remove them from your profile. Choosing autofill shares the answers being filled with the application site. Application-specific answers are not added to your reusable profile. <Link href="/privacy">Read the privacy details</Link>.</p></div></section>
    <details className="application-packet"><summary>Set up the development extension</summary><ol style={{ padding: "16px 0 16px 24px", lineHeight: 2 }}>
      <li>Run <code>npm run build:extension</code> in the project.</li>
      <li>Open <code>chrome://extensions</code>, enable developer mode, and load the <code>extension/</code> folder.</li>
      <li>Configure <code>EXTENSION_ORIGINS=chrome-extension://&lt;extension-id&gt;</code> on the Instela server.</li>
      <li>The extension defaults to <code>https://instela.org</code>. For local testing, change its Instela address in extension settings to <code>http://localhost:3000</code>.</li>
      <li>Sign in to Instela in the same Chrome browser with a Pro test account.</li>
    </ol><p>Apply migration <code>0033_application_memory</code> to the test database before testing saved answers. Setup and verification notes are in <code>docs/application-memory-autofill.md</code>.</p></details>
  </main>;
}
