import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { exploreBrowseHref, scoutButtonLabel, scoutCopy, scoutHref, type ScoutFocus } from "@/lib/scout/focus";

/**
 * What `/explore` shows when someone picks a category and nothing else.
 *
 * Not a list. A screen of ranked results is a lot to be handed before the site
 * knows anything about you, so the category opens on a few questions instead
 * (the Scout) and the results come back as a short list. The full list is still
 * there, one quiet link away, for anyone who wants to read it.
 *
 * No data is loaded for this screen: it is words and two links, so it renders
 * without waiting on the feed.
 */
const STEPS = [
  ["Tell it what you're after", "A field, a place, and a few details if you like. Only the field is required, and merit awards don't need even that."],
  ["It looks through the index", "Your Scout reads the listings Instela has collected and keeps the ones that fit what you stated."],
  ["You get a short list", "Each result shows where it came from and when we last saw it. Free shows up to 10 matches."],
] as const;

export function ExploreScoutEntry({ focus }: { focus: ScoutFocus | null }) {
  const copy = scoutCopy(focus);
  return (
    <main className="wrap explore-page" style={{ paddingBlock: "48px 96px" }}>
      <header className="workspace-page-heading" style={{ marginBottom: 32 }}>
        <div className="eyebrow chrome">{copy.kicker}</div>
        <h1 className="section-title" style={{ marginTop: 12 }}>
          {copy.heading}
        </h1>
        <p className="t-base" style={{ color: "var(--muted)", maxWidth: "58ch", marginTop: 14 }}>
          {copy.intro}
        </p>
        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
          <Link href={scoutHref(focus)} className="btn btn-primary">
            {scoutButtonLabel(focus)}
            <Icon name="arrow" size={16} />
          </Link>
          <Link href={exploreBrowseHref(focus)} className="mono" style={{ color: "var(--muted)" }} prefetch={false}>
            or browse the full list
          </Link>
        </div>
      </header>

      <ol style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}>
        {STEPS.map(([title, body], index) => (
          <li key={title} className="border" style={{ borderColor: "var(--line)", padding: "18px 20px" }}>
            <div className="mono" style={{ color: "var(--accent)" }}>0{index + 1}</div>
            <div className="mono-strong" style={{ marginTop: 8 }}>{title}</div>
            <p className="t-sm" style={{ color: "var(--muted)", marginTop: 6 }}>{body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
