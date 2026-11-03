import Link from "next/link";
import { recordEvent } from "@/lib/analytics/record";

import { BackLink } from "@/components/BackLink";
import { UpgradeWall } from "@/components/pricing/UpgradeGate";
import { getSessionUser } from "@/lib/auth";
import { getUserTier } from "@/lib/pricing/entitlements";
import { sessionGate } from "@/lib/pricing/grants";
import { StartSession } from "@/components/pricing/StartSession";

import { EssayReviewer } from "./EssayReviewer";
import { FEED_PATH } from "@/lib/routes";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Essay review — Instela",
  description: "Structured feedback on a scholarship essay or statement of purpose.",
};

/**
 * The essay reviewer.
 *
 * A PLAN GATE, NOT A CONTENT GATE. The reviewer is a pure client component
 * with no endpoint that takes an essay. Free gets one 72-hour session per
 * 30-day allowance period, opened by a content-free button press
 * (tool-session-actions.ts); Pro renders it directly. The decision happens
 * here, server-side, before the reviewer mounts — without a live session the
 * component that reads essay text is never rendered.
 */
export default async function EssayPage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const gate = user ? await sessionGate(user.id, tier, "essay_reviewer") : null;
  if (gate?.mode === "blocked") void recordEvent("upgrade_prompt_viewed", { feature: "essay_reviewer" });
  return (
    <main className="wrap tool-page" style={{ paddingBlock: "48px 96px", maxWidth: 1000 }}>
      <BackLink href={FEED_PATH} label="back to the feed" />
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
          endpoint that would accept one. Nothing is stored. A scholarship
          essay is often about the hardest thing that has happened to someone, and sending that to
          a server to be graded is a thing we would have to justify. We cannot justify it for
          feedback we can produce without it.
        </p>
      </div>

      {gate?.mode === "open" && (
        <>
          {gate.expiresAt && (
            <p className="mono" style={{ color: "var(--faint-readable)", marginBottom: 12 }}>
              your free session is open until{" "}
              {gate.expiresAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC
              — revise and re-check as often as you like until then
            </p>
          )}
          <EssayReviewer />
        </>
      )}
      {gate?.mode === "start" && (
        <StartSession
          feature="essay_reviewer"
          label="start my free essay review"
          explanation="Free includes one essay review session every 30 days. It stays open for 72 hours, across reloads, so you can revise and re-check. Starting it tells us only that you started; your essay never leaves this page."
        />
      )}
      {gate?.mode === "blocked" && (
        <UpgradeWall
          feature="essay_reviewer"
          access={gate.access}
          renewsAt={gate.renewsAt}
          reasonNote="this period's free essay session is used"
        />
      )}
      {!user && (
        <div className="slot" style={{ padding: "14px 16px", marginBottom: 28 }}>
          <span>
            <Link href="/login?next=/essay" style={{ color: "var(--accent)" }}>
              sign in
            </Link>{" "}
            to use the essay reviewer — Free includes one 72-hour session every 30 days
          </span>
        </div>
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
        <Link href={FEED_PATH} style={{ color: "var(--accent)" }}>
          back to the feed →
        </Link>
      </footer>
    </main>
  );
}
