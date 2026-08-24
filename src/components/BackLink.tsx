import Link from "next/link";

/**
 * A back link, consistent across every page that has one — 13 of them.
 *
 * Server component — no client JS. The arrow is a plain Unicode character,
 * matching the existing inline pattern on the listing and apply pages.
 *
 * ── WHY IT IS A BOX NOW ─────────────────────────────────────────────────────
 *
 * It used to be `.mono` accent text and nothing else: 11px, no border, no hit
 * area beyond the glyphs, and no hover state at all. That made the one control
 * which *undoes* a navigation smaller than the timestamps sitting near it, and
 * gave a student no confirmation they were on target before clicking. It is
 * now a real control — bordered, 13px, with a proper hit area and an accent
 * wash on hover.
 *
 * The arrow lives in its own span so it can slide left on hover. That is the
 * one piece of motion here that is not decoration: direction is the entire
 * meaning of a back control, so moving the arrow the way it will move you is
 * the affordance restating itself. `aria-hidden` on the glyph keeps it out of
 * the accessible name, which is the label alone.
 */
export function BackLink({
  href,
  label = "back",
}: {
  href: string;
  label?: string;
}) {
  return (
    <div className="print-hide" style={{ marginBottom: 28 }}>
      <Link href={href} className="backlink press">
        <span className="backlink-arrow" aria-hidden>
          ←
        </span>
        {label}
      </Link>
    </div>
  );
}
