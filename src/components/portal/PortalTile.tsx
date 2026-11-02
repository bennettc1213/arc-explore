import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import type { PortalTile as Tile } from "@/lib/portal/destinations";

import { PortalArt } from "./PortalArt";

/**
 * One box. It renders a decision already made — `resolvePortalTiles` read the
 * entitlement catalog — and holds no tier logic of its own, which is the rule
 * every gated surface here follows.
 *
 *  - `locked`: the whole box is a link to the plan page for that feature, never
 *    to the tool. A locked tile that opened the tool would make the lock
 *    decorative, and the tool's own gate would be doing the work alone.
 *  - `soon`: not a link at all. There is nothing to open, so there is nothing to
 *    focus; it is announced as disabled rather than silently doing nothing.
 *  - everything else: a link to the tool, with the plan's allowance in words
 *    when there is one ("Free: 1 run").
 */
export function PortalTile({ tile, bento = false }: { tile: Tile; bento?: boolean }) {
  const className = [
    "ptile",
    `is-${tile.state}`,
    bento ? `ptile-s${tile.span}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <div className="ptile-art">
        <PortalArt id={tile.id} />
      </div>

      {tile.pill && (
        <span className={`ptile-pill ptile-pill-${tile.state}`}>
          {tile.state === "locked" && (
            <>
              <Icon name="lock" size={12} />
              <span className="sr-only">Requires </span>
            </>
          )}
          {tile.pill}
        </span>
      )}

      <div className="ptile-copy">
        <h3 className="ptile-title">{tile.title}</h3>
        <p className="ptile-blurb">{tile.blurb}</p>
        {(tile.note || tile.caveat) && (
          <p className="ptile-note">{[tile.note, tile.caveat].filter(Boolean).join(" · ")}</p>
        )}
        {tile.state === "locked" && (
          <span className="ptile-cta">
            Unlock with {tile.pill}
            <Icon name="arrow" size={14} />
          </span>
        )}
      </div>

      {(tile.state === "open" || tile.state === "limited") && (
        <span className="ptile-go" aria-hidden="true">
          <Icon name="arrow" size={16} />
        </span>
      )}
    </>
  );

  if (tile.state === "soon" || !tile.href) {
    return (
      <div className={className} aria-disabled="true">
        {inner}
      </div>
    );
  }

  return (
    <Link href={tile.href} className={className}>
      {inner}
    </Link>
  );
}
