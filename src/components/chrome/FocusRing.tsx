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
 * Whether the element sits inside a fixed-positioned context — the only case
 * where its viewport coordinates survive a scroll. Asked of the computed
 * style rather than guessed by tag name: the nav header is `position:
 * relative` (normal flow, scrolls away with the page), while the apply
 * wizard's overlay genuinely is fixed. The previous heuristic —
 * `closest("header")` — had it backwards both ways: it pinned the nav's ring
 * to the viewport while the nav itself scrolled off, and would have
 * document-anchored a wizard element that actually stays put on scroll.
 */
function inFixedContext(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (getComputedStyle(node).position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Four L-shaped corner brackets around the focused element, replacing the
 * browser's default outline — ties keyboard focus into the same pixel-art
 * language as the mascot and cursor. globals.css turns off `:focus-visible`'s
 * outline; this is what actually shows focus instead.
 *
 * Elements in normal flow scroll with the document, so their ring is
 * `position: absolute` with the scroll offset baked in — both move together.
 * An element inside a fixed context (the wizard overlay) gets a fixed ring at
 * raw viewport coordinates instead, so neither scrolls away from the other.
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
        const fixed = inFixedContext(el);
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
