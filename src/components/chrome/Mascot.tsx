"use client";

import { useEffect, useRef, useState } from "react";

import { useMedia, useReducedMotion } from "./hooks";

/**
 * Pixel-art brand mark. Built from a 10x10 grid, never tweened — every state
 * change (facing, blink, hop) is a hard instant cut. That snap is what reads
 * as "character" instead of "UI element shaped like a character"; easing it
 * would undo the effect.
 */

type Facing = "left" | "center" | "right";

const HEAD = ["...xxxx...", "..xxxxxx..", "..xxxxxx..", "..xxxxxx..", "..xxxxxx..", "...xxxx..."];
const BODY = ["..xxxxxx..", ".xxxxxxxx.", ".xxxxxxxx."];
const FEET = "..xx..xx..";
const EYE_ROW = 3;
const EYE_COL: Record<Facing, number> = { left: 2, center: 4, right: 7 };

function shiftRow(row: string, dx: number): string {
  if (dx === 0) return row;
  return dx > 0 ? "." + row.slice(0, 9) : row.slice(1) + ".";
}

interface PixelRect {
  x: number;
  y: number;
  eye: boolean;
}

function buildRects(facing: Facing, blink: boolean): PixelRect[] {
  const dx = facing === "left" ? -1 : facing === "right" ? 1 : 0;
  const rows = [...HEAD.map((r) => shiftRow(r, dx)), ...BODY, FEET];
  const rects: PixelRect[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < 10; x++) {
      if (row[x] !== "x") continue;
      const isEye = y === EYE_ROW && x === EYE_COL[facing];
      if (isEye && blink) continue;
      rects.push({ x, y, eye: isEye });
    }
  });
  return rects;
}

export function Mascot({ size = 28, className }: { size?: number; className?: string }) {
  const reduced = useReducedMotion();
  const fine = useMedia("(pointer: fine)");
  const live = !reduced;

  const ref = useRef<HTMLDivElement>(null);
  const hopping = useRef(false);

  const [facing, setFacing] = useState<Facing>("center");
  const [blink, setBlink] = useState(false);
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
    const u = Math.max(1, Math.round(size / 10));
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

  const rects = buildRects(live ? facing : "center", live && blink);

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
      <svg viewBox="0 0 10 10" width={size} height={size} shapeRendering="crispEdges">
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
