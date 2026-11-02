import type { Metadata } from "next";
import Link from "next/link";

import { PortalTabs } from "@/components/portal/PortalTabs";
import { PortalTile } from "@/components/portal/PortalTile";
import { Icon } from "@/components/ui/Icon";
import { getSessionUser } from "@/lib/auth";
import { getUserTier, isPaidTier } from "@/lib/pricing/entitlements";
import { TIER_LABELS } from "@/lib/pricing/tiers";
import { resolvePortalTiles } from "@/lib/portal/destinations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Navigate | Portal | Instela",
};

export default async function PortalNavigatePage() {
  const user = await getSessionUser();
  const tier = await getUserTier(user?.id);
  const tiles = resolvePortalTiles(tier);
  const paid = isPaidTier(tier);

  // The key only names states that are actually on the page, so it never
  // explains a badge nobody can see.
  const has = (state: string) => tiles.some((t) => t.state === state);

  return (
    <main className="wrap portal-page">
      <header className="portal-head">
        <div>
          <div className="eyebrow chrome">Portal</div>
          <h1 className="portal-title">
            Where to <span>next?</span>
          </h1>
          <p className="portal-sub">
            Every tool in Instela, one click away.
            {!paid && (
              <>
                {" "}
                You&rsquo;re on the {TIER_LABELS[tier]} plan, so a locked box opens its plan page, not the tool.
              </>
            )}
          </p>
        </div>
        {!paid && (
          <Link href="/pricing" className="btn press portal-head-cta">
            See {TIER_LABELS.apply}
            <Icon name="arrow" size={15} />
          </Link>
        )}
      </header>

      <PortalTabs current="navigate" />

      <ul className="portal-key" aria-label="What the badges mean">
        {has("locked") && (
          <li>
            <span className="ptile-pill ptile-pill-locked">
              <Icon name="lock" size={12} />
              {TIER_LABELS.apply}
            </span>
            Needs the {TIER_LABELS.apply} plan
          </li>
        )}
        {has("limited") && (
          <li>
            <span className="ptile-pill ptile-pill-limited">Free</span>
            Open on your plan, with a cap
          </li>
        )}
        {has("soon") && (
          <li>
            <span className="ptile-pill ptile-pill-soon">Coming soon</span>
            Not built yet
          </li>
        )}
      </ul>

      <section aria-label="All destinations" className="portal-bento">
        {tiles.map((tile) => (
          <PortalTile key={tile.id} tile={tile} bento />
        ))}
      </section>
    </main>
  );
}
