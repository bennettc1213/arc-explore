import Link from "next/link";
import { TIER_LABELS } from "@/lib/pricing/tiers";

import { BackLink } from "@/components/BackLink";
import { UpgradeWall } from "@/components/pricing/UpgradeGate";
import { getSessionUser } from "@/lib/auth";
import { getUserTier } from "@/lib/pricing/entitlements";
import { evaluateFeature } from "@/lib/pricing/tiers";

import { EssayReviewer } from "./EssayReviewer";

/** The single paid plan's display name — never hardcoded. */
const PAID = TIER_LABELS.apply;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Essay review — Instela",
  description: "Structured feedback on a scholarship essay or statement of purpose.",
};

/**
 * The essay reviewer.
 *
 * AN EDGE-TIER GATE, NOT A CONTENT GATE. The reviewer itself is still a pure
 * client component with no endpoint that takes an essay — that privacy
 * property (see EssayReviewer/the "this never leaves your browser" banner
 * below) is unrelated to and unweakened by requiring a plan to reach the
 * tool at all. The gate happens here, server-side, BEFORE the reviewer is
 * ever rendered: a free-tier or signed-out visitor gets an upgrade wall
 * instead of the component, so there is nothing client-side to bypass — no
 * essay text is read, held, or evaluated for someone who isn't entitled to
 * the tool, because the component doing that reading never mounts.
 */
export default async function EssayPage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const access = evaluateFeature(tier, "essay_reviewer");
  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 900 }}>
      <BackLink href="/" label="back to the feed" />
      <header style={{ marginBottom: 28 }}>
        <div className="eyebrow chrome">08 — essay</div>
        <h1 className="section-title chrome" style={{ marginTop: 12 }}>
          the third read-through <span style={{ color: "var(--accent)" }}>you do not have time for</span>
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "66ch", marginTop: 14 }}>
          Four checks, all of them things you can verify by looking at your own text: whether the
          essay actually answers the prompt, whether it says anything checkable, whether the
          sentences work, and whether it fits. Nothing here is a judgement about whether the essay
          is good.
        </p>
      </header>

      <div
        className="border"
        style={{ borderColor: "var(--line-strong)", padding: "14px 18px", marginBottom: 28 }}
      >
        <div className="mono chrome">this never leaves your browser</div>
        <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6, maxWidth: "66ch" }}>
          The whole review runs on this page — there is no request that carries your essay and no
          endpoint that would accept one. Nothing is stored and no account is needed. A scholarship
          essay is often about the hardest thing that has happened to someone, and sending that to
          a server to be graded is a thing we would have to justify. We cannot justify it for
          feedback we can produce without it.
        </p>
      </div>

      {access.usable ? (
        <EssayReviewer />
      ) : (
        <UpgradeWall
          feature="essay_reviewer"
          access={access}
          reasonNote={user ? `the essay reviewer is ${PAID} only` : `sign in and upgrade to ${PAID} to use the essay reviewer`}
        />
      )}

      <section style={{ border: "1px solid var(--line)", padding: 22, marginBottom: 28 }}>
        <div className="eyebrow chrome" style={{ marginBottom: 6 }}>
          what this cannot tell you
        </div>
        <p className="t-sm" style={{ color: "var(--muted)", maxWidth: "66ch" }}>
          Whether the essay is moving. Whether you picked the right story. Whether the ending
          lands. Those are the things that decide a scholarship essay and none of them is
          countable, so we do not pretend to score them — a clean sheet here means the mechanical
          problems are gone, not that the essay is finished. Give it to one person who knows you
          and one who does not. This is for the pass before that, so their time goes on the part
          only a reader can do.
        </p>
      </section>

      <footer className="mono" style={{ marginTop: 40, color: "var(--faint-readable)" }}>
        the same rule as everywhere else here: a check we could not run shows &ldquo;—&rdquo; and is
        left out of the score rather than counted against you.{" "}
        <Link href="/" style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
