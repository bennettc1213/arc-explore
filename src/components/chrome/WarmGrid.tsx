"use client";

import { useEffect, useRef } from "react";

import { useIsMobile, useMedia, useReducedMotion } from "./hooks";

/**
 * "The grid gets warm" — fixed canvas under everything. A faint orange dot
 * grid (cursor-reactive on desktop) plus a heat bloom that lags the scroll.
 *
 * Ported to match the portfolio's WarmGrid pixel-for-pixel. Three details are
 * load-bearing and were each verified against the live original:
 *  - The grid is **scroll-anchored** (`oy`), so the dots belong to the page
 *    rather than the screen. This also puts rows on y = 0, 28, 56… — a
 *    viewport-anchored grid starting at spacing/2 sits 14px off.
 *  - The row loop runs to `H + spacing` so a partial row always covers the
 *    bottom edge instead of leaving a bald strip.
 *  - The bloom is what stops the background reading as flat black between
 *    dots; without it the page is measurably colder than the original.
 *
 * Dirty-flag rendering: draws only when something actually changed, so an
 * idle page with a static cursor costs ~0% CPU. Killed entirely under
 * prefers-reduced-motion in favour of the static tile in globals.css.
 */
export function WarmGrid() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const fine = useMedia("(pointer: fine)");
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return undefined;
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const spacing = isMobile ? 46 : 28; // density drops on mobile
    const R = 200; // cursor falloff radius
    const track = fine && !isMobile; // cursor reaction disabled on mobile

    // Read the live accent token so a palette swap doesn't need this file.
    const accentHex = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    const { r, g, b } = hexToRgb(accentHex) ?? { r: 255, g: 77, b: 0 };

    let W = 0;
    let H = 0;
    let raf = 0;
    let dirty = true;
    let scrollY = window.scrollY;
    let bloom = scrollY;
    const mouse = { x: -9999, y: -9999 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    }
    resize();
    window.addEventListener("resize", resize);

    function onScroll() {
      scrollY = window.scrollY;
      dirty = true;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    function onMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      dirty = true;
    }
    if (track) window.addEventListener("mousemove", onMove, { passive: true });

    function draw() {
      ctx!.clearRect(0, 0, W, H);

      // heat bloom — trails the scroll, brightest toward the section you left
      const cy = bloom - scrollY + H * 0.35;
      const grad = ctx!.createLinearGradient(0, cy - H * 0.55, 0, cy + H * 0.55);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},0.05)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, cy - H * 0.55, W, H * 1.1);

      // dot grid, scroll-anchored so it belongs to the page
      const oy = -(((scrollY % spacing) + spacing) % spacing);
      for (let y = oy; y < H + spacing; y += spacing) {
        for (let x = spacing / 2; x < W; x += spacing) {
          let a = 0.075;
          let s = 2;
          if (track) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < R * R) {
              const t = 1 - Math.sqrt(d2) / R;
              a = 0.075 + t * 0.25;
              s = 2 + Math.round(t * 2);
            }
          }
          ctx!.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx!.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
    }

    function loop() {
      if (Math.abs(bloom - scrollY) > 0.5) {
        bloom += (scrollY - bloom) * 0.055;
        dirty = true;
      }
      if (dirty) {
        draw();
        dirty = false;
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      if (track) window.removeEventListener("mousemove", onMove);
    };
  }, [reduced, isMobile, fine]);

  if (reduced) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }}
    />
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
