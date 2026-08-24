import { SkelLine, SkelPostingRow } from "@/components/chrome/Skeleton";

/**
 * The feed's loading shell — and, by App Router inheritance, the fallback for
 * every route below it that does not declare its own `loading.tsx`.
 *
 * That inheritance is why this is deliberately generic below the header: a
 * heading bar, then a few rows. `/listing/[id]` declares its own because it is
 * the click target from every feed row and the one worth shaping precisely;
 * `/privacy` and `/login` inherit this and it reads as "a page is coming",
 * which is true of them too.
 *
 * The nav and footer live in the root layout and are NOT inside this boundary,
 * so they stay painted and interactive across the whole transition — which is
 * the point. Clicking the logo from a slow page swaps only the body.
 */
export default function Loading() {
  return (
    <main className="wrap" style={{ paddingBlock: "48px 96px" }}>
      <SkelLine w="120px" h={10} />
      <div style={{ marginTop: 14 }}>
        <SkelLine w="min(420px, 70%)" h={30} />
      </div>
      <div style={{ marginTop: 28 }}>
        <SkelLine w="260px" h={12} />
      </div>
      <div style={{ marginTop: 26 }}>
        {/* Three, not fifty. A skeleton is a hint that something is coming, not
            a rehearsal of the page — and the real feed renders 50. */}
        <SkelPostingRow />
        <SkelPostingRow />
        <SkelPostingRow />
      </div>
    </main>
  );
}
