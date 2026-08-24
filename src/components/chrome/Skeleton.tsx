/**
 * Loading skeletons for the App Router's `loading.tsx` boundaries.
 *
 * ── WHY THESE EXIST AT ALL, WHICH IS NOT "POLISH" ───────────────────────────
 *
 * Every interesting route here is a *dynamic* route — it reads the session and
 * hits Postgres, so nothing can be prerendered. Next's own docs are explicit
 * about what that costs when there is no `loading.tsx`:
 *
 *   "Dynamic Route: prefetching is skipped, or the route is partially
 *    prefetched if loading.tsx is present."
 *   "When navigating to a dynamic route, the client must wait for the server
 *    response before showing the result. This can give the users the
 *    impression that the app is not responding."
 *
 * Before these files existed there was no `loading.tsx` anywhere in the app, so
 * **every `<Link>` in the product was in the "prefetching is skipped" case** and
 * every click sat on the old page, painting nothing, until the server answered.
 * That is the whole of the "clicking a listing is slow" report: the navigation
 * was not slow so much as *silent*, and silence reads as broken.
 *
 * A skeleton turns that into an immediate paint and, per the same doc, upgrades
 * the route from "prefetch skipped" to "partially prefetched" — the shell is
 * already on the client before the click.
 *
 * ── WHY THEY ARE DELIBERATELY VAGUE ─────────────────────────────────────────
 *
 * A skeleton is a promise about what is about to appear, and this codebase does
 * not make promises it cannot keep. So these draw *bars where content goes* and
 * never a number, a score, a count or a label. A skeleton that renders a fake
 * "94" where the fit score will land has invented a fact for as long as it is on
 * screen — the same failure as scoring an unknown dimension as a miss. Bars are
 * honest: they say "something is coming here", which is all we know.
 */

/** One shimmering bar. `w` accepts any CSS length so callers can vary rhythm. */
export function SkelLine({
  w = "100%",
  h = 13,
  className,
}: {
  w?: string;
  h?: number;
  className?: string;
}) {
  return <div className={`skel ${className ?? ""}`} style={{ width: w, height: h }} />;
}

/** A block of lines at varying widths — reads as prose rather than a table. */
export function SkelParagraph({ lines = 3 }: { lines?: number }) {
  // Widths cycle rather than randomise: a skeleton that reflows differently on
  // every render draws the eye to the loading state instead of past it.
  const widths = ["96%", "88%", "72%", "91%", "64%"];
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <SkelLine key={i} w={widths[i % widths.length]} />
      ))}
    </div>
  );
}

/**
 * One feed row's worth of skeleton, shaped like `PostingRow` — the liveness
 * line, the title, the org line, the chip row, and the two score badges.
 */
export function SkelPostingRow() {
  return (
    <div className="border-b" style={{ borderColor: "var(--line)", padding: "18px 0" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <SkelLine w="150px" h={10} />
          <SkelLine w="60%" h={17} />
          <SkelLine w="42%" h={12} />
          <div className="flex gap-2" style={{ marginTop: 4 }}>
            <SkelLine w="86px" h={11} />
            <SkelLine w="104px" h={11} />
            <SkelLine w="70px" h={11} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SkelLine w="54px" h={34} />
          <SkelLine w="54px" h={34} />
        </div>
      </div>
    </div>
  );
}
