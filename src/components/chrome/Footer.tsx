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
            <div className="mono-strong chrome">internship tracker</div>
            <div className="mono" style={{ marginTop: 2 }}>
              every listing polled from the employer&apos;s own ATS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/privacy" className="mono chrome press" style={{ color: "var(--accent)" }}>
            privacy
          </Link>
          <span className="mono chrome">tech vertical · business vertical next</span>
        </div>
      </div>
    </footer>
  );
}
