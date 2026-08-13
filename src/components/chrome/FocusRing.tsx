"use client";

import { useEffect, useState } from "react";

interface Box {
  fixed: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
}

const OUTSET = 5;

/**
 * Four L-shaped corner brackets around the focused element, replacing the
 * browser's default outline — ties keyboard focus into the same pixel-art
 * language as the mascot and cursor. globals.css turns off `:focus-visible`'s
 * outline; this is what actually shows focus instead.
 *
 * Only the nav is truly `position: fixed` on this page; everything else
 * scrolls with the document (this app is one long feed), so the ring for
 * those elements must be `position: absolute` with the scroll offset baked
 * in — a plain viewport-relative fixed ring would visibly detach from its
 * element the moment the page scrolls.
 */
export function FocusRing() {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement | null;
      if (!el || typeof el.getBoundingClientRect !== "function") return;
      // Wait a frame so :focus-visible has settled before we read it.
      requestAnimationFrame(() => {
        if (!el.matches(":focus-visible")) {
          setBox(null);
          return;
        }
        const r = el.getBoundingClientRect();
        const fixed = !!el.closest("header");
        setBox({
          fixed,
          top: r.top + (fixed ? 0 : window.scrollY) - OUTSET,
          left: r.left + (fixed ? 0 : window.scrollX) - OUTSET,
          width: r.width + OUTSET * 2,
          height: r.height + OUTSET * 2,
        });
      });
    }
    function clear() {
      setBox(null);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", clear);
    window.addEventListener("resize", clear);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", clear);
      window.removeEventListener("resize", clear);
    };
  }, []);

  if (!box) return null;
  return (
    <div
      className="focus-ring"
      style={{
        position: box.fixed ? "fixed" : "absolute",
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      }}
      aria-hidden
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
