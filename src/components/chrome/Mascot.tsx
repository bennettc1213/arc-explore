"use client";

import { useEffect, useRef, useState } from "react";

import { useMedia, useReducedMotion } from "./hooks";
import { type Facing, mascotCells, GRID, RESTING_POSE } from "./mascot-grid";

/**
 * Pixel-art brand mark. Built from a 10x10 grid, never tweened — every state
 * change (facing, blink, hop) is a hard instant cut. That snap is what reads
 * as "character" instead of "UI element shaped like a character"; easing it
 * would undo the effect.
 *
 * The grid itself lives in `mascot-grid.ts` so the favicon is generated from
 * the same data rather than redrawn by hand — see the note at the top of that
 * file for why a second copy was not acceptable.
 */

export function Mascot({ size = 28, className }: { size?: number; className?: string }) {
  const reduced = useReducedMotion();
  const fine = useMedia("(pointer: fine)");
  const live = !reduced;

  const ref = useRef<HTMLDivElement>(null);
  const hopping = useRef(false);

  const [facing, setFacing] = useState<Facing>(RESTING_POSE.facing);
  const [blink, setBlink] = useState(RESTING_POSE.blink);
  const [hopY, setHopY] = useState(0);

  useEffect(() => {
    if (!live) return undefined;
    let blinkTimer: ReturnType<typeof setTimeout>;
    let onTimer: ReturnType<typeof setTimeout>;
    // Randomized interval — a fixed one reads as robotic.
    function scheduleBlink() {
      blinkTimer = setTimeout(() => {
        setBlink(true);
        onTimer = setTimeout(() => setBlink(false), 130);
        scheduleBlink();
      }, 4000 + Math.random() * 3000);
    }
    scheduleBlink();
    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(onTimer);
    };
  }, [live]);

  // Face the cursor — three discrete states, snapping between them. The dead
  // zone is a full element-width on each side (not half), so he doesn't
  // flicker between facings while the cursor passes close by.
  useEffect(() => {
    if (!live || !fine) return undefined;
    let raf = 0;
    let mx: number | null = null;
    function update() {
      raf = 0;
      const el = ref.current;
      if (!el || mx == null) return;
      const r = el.getBoundingClientRect();
      const c = r.left + r.width / 2;
      setFacing(mx < c - r.width ? "left" : mx > c + r.width ? "right" : "center");
    }
    function onMove(e: MouseEvent) {
      mx = e.clientX;
      if (!raf) raf = requestAnimationFrame(update);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [live, fine]);

  function hop() {
    if (!live || hopping.current) return;
    hopping.current = true;
    const u = Math.max(1, Math.round(size / GRID));
    // The 1px overshoot on the second-to-last frame sells "landing" — without
    // it the sequence just reads as "stopping".
    const frames = [-2 * u, -3 * u, -3 * u, -2 * u, 0, 1, 0];
    frames.forEach((y, i) => {
      setTimeout(() => {
        setHopY(y);
        if (i === frames.length - 1) hopping.current = false;
      }, i * 55);
    });
  }

  const rects = mascotCells(live ? facing : RESTING_POSE.facing, live && blink);

  return (
    <div
      ref={ref}
      onClick={hop}
      role="img"
      aria-label="brand mark"
      className={className}
      style={{
        width: size,
        height: size,
        flex: "none",
        cursor: "pointer",
        transform: hopY ? `translateY(${hopY}px)` : undefined,
      }}
    >
      <svg viewBox={`0 0 ${GRID} ${GRID}`} width={size} height={size} shapeRendering="crispEdges">
        {rects.map((r) => (
          <rect
            key={`${r.x}-${r.y}`}
            x={r.x}
            y={r.y}
            width="1"
            height="1"
            fill={r.eye ? "var(--accent-lite)" : "var(--accent)"}
          />
        ))}
      </svg>
    </div>
  );
}
