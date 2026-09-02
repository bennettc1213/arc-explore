"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TOOLS } from "@/lib/tools";

interface MobileNavProps {
  signedIn: boolean;
  isAdmin: boolean;
  pricingLabel: string;
  pricingTitle: string;
  dev: { forced: string | null; label: string | null } | null;
}

/**
 * The nav collapsed to a single toggle below `lg` — the same breakpoint the
 * eyebrow already used to hide.
 *
 * FIXES.md §2 measured the header overflowing by 198px at a 390px phone
 * width, with "sign in" entirely past the right edge. Two causes, both
 * closed by this component rather than by patching the desktop bar in place:
 *
 *  - `.eyebrow` sets `display: flex` in globals.css, which outranks
 *    Tailwind's `hidden` utility on the *same element* (equal specificity,
 *    later source order wins). Hiding the whole desktop group in a wrapper
 *    div sidesteps that entirely — a `display: none` ancestor never renders
 *    its children regardless of what display *they* ask for, so the eyebrow
 *    span's own `display: flex` never gets a chance to matter.
 *  - Even with the eyebrow hidden, four signed-out items (tools/dev/pricing/
 *    sign in) still overflowed a 390px screen by 68px, and a signed-in admin
 *    carries seven. CSS alone cannot fit that; it needs an actual collapse.
 *
 * Rendered inside `<header>`, not portaled — `body > header` is already
 * `z-index: 20` against `main`'s 2 (added for the tools-menu dropdown), so
 * anything painted here already out-paints the page beneath it, the same
 * precedent `ToolsMenu` relies on.
 */
export function MobileNav({ signedIn, isAdmin, pricingLabel, pricingTitle, dev }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Same render-phase reset ToolsMenu uses: a navigation (including back/
  // forward) should never leave the panel believing it is still open.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    // The panel covers everything below the bar — lock the page behind it so
    // a scroll gesture on the panel doesn't also drag the feed underneath.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="nav-toggle press"
      >
        <span aria-hidden>
          <span
            className="nav-toggle-bar"
            style={{ top: open ? 21 : 15, transform: open ? "rotate(45deg)" : "none" }}
          />
          <span className="nav-toggle-bar" style={{ top: 21, opacity: open ? 0 : 1 }} />
          <span
            className="nav-toggle-bar"
            style={{ top: open ? 21 : 27, transform: open ? "rotate(-45deg)" : "none" }}
          />
        </span>
      </button>

      {open && (
        <div id="mobile-nav-panel" role="dialog" aria-label="Menu" className="mobile-nav-panel">
          {TOOLS.map((tool, i) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="mobile-navlink"
              style={{ borderTop: i === 0 ? undefined : "none" }}
              onClick={() => setOpen(false)}
            >
              <span className="mono chrome">{tool.label}</span>
              <span className="t-xs" style={{ color: "var(--faint-readable)" }}>
                {tool.blurb}
              </span>
            </Link>
          ))}

          {dev && (
            <Link href="/dev" className="mobile-navlink" onClick={() => setOpen(false)}>
              <span className="mono chrome">
                {dev.forced ? `dev mode · ${dev.label} plan` : "dev — unlock a paid plan"}
              </span>
            </Link>
          )}

          <Link href="/pricing" className="mobile-navlink" title={pricingTitle} onClick={() => setOpen(false)}>
            <span className="mono chrome">{pricingLabel}</span>
          </Link>

          {signedIn ? (
            <>
              <Link href="/tracker" className="mobile-navlink" onClick={() => setOpen(false)}>
                <span className="mono chrome">tracker</span>
              </Link>
              <Link href="/resume" className="mobile-navlink" onClick={() => setOpen(false)}>
                <span className="mono chrome">resume</span>
              </Link>
              <Link href="/profile" className="mobile-navlink" onClick={() => setOpen(false)}>
                <span className="mono chrome">profile</span>
              </Link>
              {isAdmin && (
                <Link href="/admin" className="mobile-navlink mobile-navlink-quiet" onClick={() => setOpen(false)}>
                  <span className="mono chrome">admin</span>
                </Link>
              )}
            </>
          ) : (
            <Link href="/login" className="mobile-navlink" onClick={() => setOpen(false)}>
              <span className="mono chrome">sign in</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
