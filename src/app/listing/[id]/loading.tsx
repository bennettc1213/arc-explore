import { SkelLine, SkelParagraph } from "@/components/chrome/Skeleton";

/**
 * The listing page's loading shell.
 *
 * This is the one that matters most: it is the destination of the title link on
 * all 50 feed rows, and until it existed that navigation was in Next's
 * "prefetching is skipped" case — the click painted nothing at all until the
 * server answered. See `components/chrome/Skeleton.tsx` for the full reasoning.
 *
 * Shaped to match `listing/[id]/page.tsx` down to the back link, so the real
 * page swaps in without the layout jumping under the reader's eye.
 */
export default function Loading() {
  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px", maxWidth: 860 }}>
      <SkelLine w="96px" h={11} />

      <div style={{ marginTop: 26 }}>
        <SkelLine w="170px" h={10} />
      </div>
      <div style={{ marginTop: 14 }}>
        <SkelLine w="88%" h={30} />
      </div>
      <div style={{ marginTop: 12 }}>
        <SkelLine w="55%" h={14} />
      </div>

      {/* The two score badges. Bars, never numbers — a skeleton that renders a
          plausible score has invented one for as long as it is on screen. */}
      <div className="flex gap-2" style={{ marginTop: 24 }}>
        <SkelLine w="62px" h={38} />
        <SkelLine w="62px" h={38} />
      </div>

      <div style={{ marginTop: 34 }}>
        <SkelParagraph lines={4} />
      </div>

      <div style={{ marginTop: 34 }}>
        <SkelLine w="200px" h={12} />
        <div style={{ marginTop: 14 }}>
          <SkelParagraph lines={3} />
        </div>
      </div>
    </main>
  );
}
