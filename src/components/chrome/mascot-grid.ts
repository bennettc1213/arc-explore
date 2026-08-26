/**
 * The brand mark, as data.
 *
 * Split out of `Mascot.tsx` so it is a plain `.ts` module with no React import
 * — which is what lets the favicon generator and `mascot-grid.test.ts` read the
 * same grid the component renders. The alternative was drawing the mark twice,
 * once in the component and once by hand in `public/instela-mark.svg`, and this
 * codebase has already paid for that shape twice: the remote-only filter bug
 * (two parsers over one query string) and the slot-marker regex (two copies,
 * one drifting). A logo is a rule like any other and gets one definition.
 *
 * The grid is 10x10. Every state change is a hard cut — see `Mascot.tsx` for
 * why nothing here is ever tweened.
 */

export type Facing = "left" | "center" | "right";

export const GRID = 10;

const HEAD = ["...xxxx...", "..xxxxxx..", "..xxxxxx..", "..xxxxxx..", "..xxxxxx..", "...xxxx..."];
const BODY = ["..xxxxxx..", ".xxxxxxxx.", ".xxxxxxxx."];
const FEET = "..xx..xx..";

const EYE_ROW = 3;
const EYE_COL: Record<Facing, number> = { left: 2, center: 4, right: 7 };

function shiftRow(row: string, dx: number): string {
  if (dx === 0) return row;
  return dx > 0 ? "." + row.slice(0, GRID - 1) : row.slice(1) + ".";
}

export interface PixelRect {
  x: number;
  y: number;
  /** The eye pixel, which is painted in the lighter accent. */
  eye: boolean;
}

/** Every filled cell for one pose, in row-major order. */
export function mascotCells(facing: Facing, blink: boolean): PixelRect[] {
  const dx = facing === "left" ? -1 : facing === "right" ? 1 : 0;
  const rows = [...HEAD.map((r) => shiftRow(r, dx)), ...BODY, FEET];
  const rects: PixelRect[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < GRID; x++) {
      if (row[x] !== "x") continue;
      const isEye = y === EYE_ROW && x === EYE_COL[facing];
      if (isEye && blink) continue;
      rects.push({ x, y, eye: isEye });
    }
  });
  return rects;
}

/**
 * The pose the mark is *published* in — the tab icon, and where the component
 * starts before any cursor or timer has moved it.
 *
 * Centre-facing and unblinking, because a favicon has no cursor to look at and
 * an icon caught mid-blink reads as a rendering fault rather than as character.
 */
export const RESTING_POSE = { facing: "center" as Facing, blink: false };

/** Literal hex, not `var(--accent)`: an SVG loaded as a favicon has no page to
 *  inherit CSS custom properties from. Kept in step with globals.css by test. */
export const MARK_BODY = "#ff4d00";
export const MARK_EYE = "#ffa366";
