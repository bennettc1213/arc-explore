import Link from "next/link";

import { Mascot } from "./Mascot";

export function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--line)" }}>
      <div
        className="wrap flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between"
        style={{ paddingBlock: 32 }}
      >
        <div className="flex items-center gap-4">
          <Mascot size={40} />
          <div>
            <div className="mono-strong chrome">Instela</div>
            <div className="mono" style={{ marginTop: 2 }}>
              every listing polled from the employer&apos;s own ATS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {/* Same treatment as the nav — it navigates, so it highlights.
              Pricing lives here rather than in the nav: the nav was already
              called out as over-full in FIXES.md §5 and the fix for that was
              collapsing three links into one menu, so adding a top-level link
              back would undo it. */}
          <Link href="/pricing" className="navlink press">
            pricing
          </Link>
          <Link href="/privacy" className="navlink press">
            privacy
          </Link>
          <span className="mono chrome">tech vertical · business vertical next</span>
        </div>
      </div>
    </footer>
  );
}
