"use client";

import { useEffect, useRef } from "react";

import { useIsMobile, useMedia, useReducedMotion } from "./hooks";

/**
 * "The grid gets warm" — fixed canvas under everything. A faint orange node
 * lattice that the cursor shoves around, plus a heat bloom that lags the
 * scroll.
 *
 * Rewritten from a plain dot grid into a constellation: every node is a
 * spring-mass anchored to its lattice point, the cursor throws a shockwave
 * scaled by how fast it is moving, and nearby nodes draw a link between them.
 * The dots themselves are unchanged — same 28-family spacing feel, same
 * 0.075 → 0.33 alpha ramp — so the page's texture is the one that was already
 * there, now with structure between the points.
 *
 * FOUR THINGS THAT ARE LOAD-BEARING, three inherited and one new:
 *
 *  1. **The lattice is scroll-anchored** (`oy`), so it belongs to the page
 *     rather than the screen. Physics runs in lattice space and the scroll
 *     offset is applied at draw time, which means the cursor has to be mapped
 *     *into* lattice space (`mgx`/`mgy`) rather than compared in viewport
 *     coordinates — otherwise the shockwave lands up to one row away from the
 *     pointer, and only while scrolled.
 *  2. **The row loop runs past `H`** so a partial row always covers the bottom
 *     edge instead of leaving a bald strip.
 *  3. **The bloom stays.** It is what stops the background reading as flat
 *     black between nodes; without it the page is measurably colder.
 *  4. **The canvas still goes fully idle.** A settled lattice with a still
 *     cursor does no work at all — see the note on `settled` below. That
 *     property is why this can sit under every page on the site.
 *
 * `setTransform`, never `ctx.scale`: scale multiplies into the transform
 * already there, so a second resize would draw at 4× and a third at 8×.
 *
 * Killed entirely under prefers-reduced-motion in favour of the static tile in
 * globals.css.
 */

/** Sparser than the old dot grid, because there are lines between them now. */
const SPACING_DESKTOP = 40;
const SPACING_MOBILE = 58;

/**
 * Link radius. Deliberately under the lattice diagonal (40 × √2 ≈ 56.6) and
 * over its orthogonal step, so at rest the mesh is a quiet square grid and the
 * diagonals only appear where the cursor has pushed things out of true. The
 * disturbance is the drawing.
 */
const LINK_DIST = 54;

/**
 * How far apart two nodes can *start* and still be worth testing. Pairs are
 * precomputed once from the lattice, which is the whole performance story: the
 * naive version tests every node against every other node every frame — 1,170
 * nodes on a 1080p viewport is 683,865 pair tests at 60fps. Bounding it by
 * lattice distance gives ~10 candidates per node instead.
 *
 * The bound is on *relative* displacement, not absolute. Neighbours near the
 * cursor are all pushed outward together, so what matters is how much the
 * shove differs across one cell: the falloff is linear over CURSOR_R, so that
 * is (spacing / CURSOR_R) x peak displacement = 0.2 x 96 ~ 19px at the hardest
 * sweep. The (CANDIDATE_DIST - LINK_DIST) / 2 = 27px of headroom covers it,
 * with room for the pile-up on the far side of the wave.
 */
const CANDIDATE_DIST = 108;

/** Cursor falloff radius, unchanged from the dot grid it replaces. */
const CURSOR_R = 200;

/** Hooke's constant, in px/s² per px of displacement. ω = √K ≈ 13.8 rad/s. */
const SPRING_K = 190;

/**
 * Velocity retained per 60fps frame, raised to the real frame time so a 120Hz
 * display damps at the same rate per second rather than twice as fast.
 * Underdamped on purpose (critical would be ~0.64): the overshoot is what
 * makes it read as elastic rather than as a fade.
 */
const DAMP_PER_FRAME = 0.86;

/**
 * Shockwave: a floor, plus a term scaled by cursor speed in px/s.
 *
 * These are NOT the constants this effect is usually written with, and copying
 * those across is the trap. The common form integrates `p += v * dt * 60`,
 * which makes velocity px-per-*frame*; this integrates `p += v * dt`, so it is
 * px-per-*second*, and the same numbers mean something ~60x different. Solved
 * against the actual steady state (spring balances repulsion at
 * displacement = force / SPRING_K) these give a 25px dent under a parked
 * cursor and ~96px at the fastest sweep. The borrowed values gave 4.7px and
 * 557px respectively — invisible, then off the screen.
 */
const REPEL_BASE = 4800;
const REPEL_PER_SPEED = 4.5;
/** Cursor speed is clamped before it reaches the force, so one dropped frame
 *  cannot report 40,000 px/s and fire every node off the screen. */
const MAX_CURSOR_SPEED = 3000;

/** Below this (px/s) the lattice counts as at rest. */
const REST_EPSILON = 0.6;

/**
 * Alpha/size are quantised to this many levels so each frame is a handful of
 * fill/stroke batches instead of one per node and one per link. Setting
 * `fillStyle` is the expensive call, not `fillRect` — ungrouped, the link pass
 * alone is ~2,300 `stroke()` calls per frame.
 */
const LEVELS = 8;

export function WarmGrid() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const fine = useMedia("(pointer: fine)");
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const c2d = el.getContext("2d");
    if (!c2d) return undefined;
    // Aliased with an explicit type: TypeScript drops the null-narrowing of a
    // closed-over const inside the hoisted function declarations below.
    const cv: HTMLCanvasElement = el;
    const ctx: CanvasRenderingContext2D = c2d;

    const spacing = isMobile ? SPACING_MOBILE : SPACING_DESKTOP;

    /**
     * A touch device has no cursor, so there is nothing to react to and no
     * physics worth running — the lattice would sit at its anchors forever.
     * It renders once as static texture and re-renders only on scroll/resize.
     */
    const track = fine && !isMobile;

    // Read the live accent token so a palette swap doesn't need this file.
    const accentHex = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    const { r, g, b } = hexToRgb(accentHex) ?? { r: 255, g: 77, b: 0 };
    const rgb = `${r},${g},${b}`;

    /** With no cursor to light it, the mesh needs a standing warmth or it is
     *  invisible. With one, the cursor supplies all of it. */
    const restHeat = track ? 0 : 0.22;

    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let scrollY = window.scrollY;
    let bloom = scrollY;
    let last = performance.now();

    /**
     * The idle switch. When the lattice has stopped moving and nothing has
     * happened, the loop skips physics *and* drawing entirely — an open tab
     * on a settled page costs a `requestAnimationFrame` callback that reads
     * one boolean. Every input path below clears it.
     */
    let settled = false;

    // Lattice state, flat typed arrays rather than an array of objects: this
    // is touched 1,170 times a frame and the allocation shape matters.
    let hx = new Float32Array(0); // home (anchor) position, lattice space
    let hy = new Float32Array(0);
    let px = new Float32Array(0); // current position
    let py = new Float32Array(0);
    let vx = new Float32Array(0);
    let vy = new Float32Array(0);
    let heat = new Float32Array(0); // 0..1 cursor proximity, reused by the links
    let linkA = new Int32Array(0);
    let linkB = new Int32Array(0);

    const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, speed: 0 };

    function build() {
      cols = Math.ceil(W / spacing) + 1;
      // Past the bottom edge, so a partial row covers it (note 2).
      rows = Math.ceil((H + spacing * 2) / spacing) + 1;
      const n = cols * rows;

      hx = new Float32Array(n);
      hy = new Float32Array(n);
      px = new Float32Array(n);
      py = new Float32Array(n);
      vx = new Float32Array(n);
      vy = new Float32Array(n);
      heat = new Float32Array(n);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const k = i * rows + j;
          hx[k] = i * spacing;
          hy[k] = j * spacing;
          px[k] = hx[k];
          py[k] = hy[k];
        }
      }

      // Candidate links, once. Only forward offsets, so no pair is listed
      // twice: strictly-positive column step, or same column and downward.
      const step = Math.floor(CANDIDATE_DIST / spacing);
      const offsets: Array<[number, number]> = [];
      for (let di = 0; di <= step; di++) {
        for (let dj = -step; dj <= step; dj++) {
          if (di === 0 && dj <= 0) continue;
          if (Math.hypot(di * spacing, dj * spacing) > CANDIDATE_DIST) continue;
          offsets.push([di, dj]);
        }
      }

      const a: number[] = [];
      const bIdx: number[] = [];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          for (const [di, dj] of offsets) {
            const ni = i + di;
            const nj = j + dj;
            if (ni >= cols || nj < 0 || nj >= rows) continue;
            a.push(i * rows + j);
            bIdx.push(ni * rows + nj);
          }
        }
      }
      linkA = Int32Array.from(a);
      linkB = Int32Array.from(bIdx);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      // setTransform, not scale — see the header note.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      settled = false;
    }

    function onScroll() {
      scrollY = window.scrollY;
      settled = false;
    }

    function onMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      settled = false;
    }

    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.px = -9999;
      mouse.py = -9999;
      settled = false;
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (track) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseleave", onLeave);
    }

    /** Lattice-space offset of the draw origin. x is half a cell in, matching
     *  the grid this replaces; y is the scroll anchor (note 1). */
    const ox = spacing / 2;
    let oy = 0;

    function step(dt: number): void {
      oy = -(((scrollY % spacing) + spacing) % spacing);

      // Cursor mapped into lattice space, because that is where the nodes are.
      const mgx = mouse.x - ox;
      const mgy = mouse.y - oy;

      const dxm = mouse.x - mouse.px;
      const dym = mouse.y - mouse.py;
      mouse.speed =
        mouse.px < -9000
          ? 0
          : Math.min(Math.hypot(dxm, dym) / Math.max(dt, 0.001), MAX_CURSOR_SPEED);
      mouse.px = mouse.x;
      mouse.py = mouse.y;

      const force = REPEL_BASE + mouse.speed * REPEL_PER_SPEED;
      const damp = Math.pow(DAMP_PER_FRAME, dt * 60);
      const n = px.length;
      let maxSpeed = 0;

      for (let k = 0; k < n; k++) {
        let h = restHeat;

        if (track) {
          const dx = px[k] - mgx;
          const dy = py[k] - mgy;
          const d2 = dx * dx + dy * dy;
          if (d2 < CURSOR_R * CURSOR_R) {
            const d = Math.sqrt(d2) || 0.0001;
            const t = 1 - d / CURSOR_R;
            h = t;
            // Push away from the cursor, hardest at the centre.
            vx[k] += (dx / d) * t * force * dt;
            vy[k] += (dy / d) * t * force * dt;
          }
        }
        heat[k] = h;

        // Restoring pull back to the anchor.
        vx[k] += (hx[k] - px[k]) * SPRING_K * dt;
        vy[k] += (hy[k] - py[k]) * SPRING_K * dt;

        vx[k] *= damp;
        vy[k] *= damp;

        px[k] += vx[k] * dt;
        py[k] += vy[k] * dt;

        const s = Math.abs(vx[k]) + Math.abs(vy[k]);
        if (s > maxSpeed) maxSpeed = s;
      }

      // Equilibrium counts as rest even with the cursor parked in the field:
      // the spring balances the repulsion and nothing is moving any more.
      if (maxSpeed < REST_EPSILON && Math.abs(bloom - scrollY) <= 0.5) settled = true;
    }

    // Reused across frames so a 60fps loop allocates nothing.
    const linkBuckets: number[][] = Array.from({ length: LEVELS }, () => []);
    const nodeBuckets: number[][] = Array.from({ length: LEVELS }, () => []);

    function draw(): void {
      ctx.clearRect(0, 0, W, H);

      // Heat bloom — trails the scroll, brightest toward the section you left.
      const cy = bloom - scrollY + H * 0.35;
      const grad = ctx.createLinearGradient(0, cy - H * 0.55, 0, cy + H * 0.55);
      grad.addColorStop(0, `rgba(${rgb},0)`);
      grad.addColorStop(0.5, `rgba(${rgb},0.05)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, cy - H * 0.55, W, H * 1.1);

      for (const bucket of linkBuckets) bucket.length = 0;
      for (const bucket of nodeBuckets) bucket.length = 0;

      // Links. Only the precomputed candidates are tested.
      for (let e = 0; e < linkA.length; e++) {
        const i = linkA[e];
        const j = linkB[e];
        const dx = px[i] - px[j];
        const dy = py[i] - py[j];
        const d2 = dx * dx + dy * dy;
        if (d2 >= LINK_DIST * LINK_DIST) continue;

        const fade = 1 - Math.sqrt(d2) / LINK_DIST;
        // Warmth is the mean of the two ends, so a link entering the cursor's
        // reach brightens from the end that got there first.
        // 0.18 floor so the mesh is faintly present across the whole page
        // rather than existing only where the cursor happens to be — the old
        // dot grid's constant 0.075 texture is the thing being preserved.
        const warm = 0.18 + 0.82 * ((heat[i] + heat[j]) * 0.5);
        const level = Math.min(LEVELS - 1, Math.round((0.35 + 0.65 * fade) * warm * (LEVELS - 1) * 1.6));
        const bucket = linkBuckets[level];
        bucket.push(px[i] + ox, py[i] + oy, px[j] + ox, py[j] + oy);
      }

      for (let l = 1; l < LEVELS; l++) {
        const bucket = linkBuckets[l];
        if (bucket.length === 0) continue;
        ctx.strokeStyle = `rgba(${rgb},${(0.03 + (l / (LEVELS - 1)) * 0.17).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let q = 0; q < bucket.length; q += 4) {
          ctx.moveTo(bucket[q], bucket[q + 1]);
          ctx.lineTo(bucket[q + 2], bucket[q + 3]);
        }
        ctx.stroke();
      }

      // Nodes, over the links. Same alpha and size ramp as the dot grid this
      // replaces: 0.075 at rest, 0.325 under the cursor, 2px growing to 4px.
      for (let k = 0; k < px.length; k++) {
        const level = Math.min(LEVELS - 1, Math.round(heat[k] * (LEVELS - 1)));
        nodeBuckets[level].push(px[k] + ox, py[k] + oy);
      }

      for (let l = 0; l < LEVELS; l++) {
        const bucket = nodeBuckets[l];
        if (bucket.length === 0) continue;
        const t = l / (LEVELS - 1);
        ctx.fillStyle = `rgba(${rgb},${(0.075 + t * 0.25).toFixed(3)})`;
        const s = 2 + Math.round(t * 2);
        const half = s / 2;
        for (let q = 0; q < bucket.length; q += 2) {
          ctx.fillRect(bucket[q] - half, bucket[q + 1] - half, s, s);
        }
      }
    }

    function loop(now: number): void {
      // Clamped, so a backgrounded tab returning does not integrate one huge
      // step and detonate the lattice.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (Math.abs(bloom - scrollY) > 0.5) {
        bloom += (scrollY - bloom) * 0.055;
        settled = false;
      }

      if (!settled) {
        step(dt);
        draw();
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      if (track) {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseleave", onLeave);
      }
    };
  }, [reduced, isMobile, fine]);

  if (reduced) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      /**
       * `width`/`height` are set explicitly and that is not belt-and-braces.
       * A canvas is a *replaced* element, so under `position: fixed; inset: 0`
       * a `width: auto` resolves to its intrinsic size — the `width` attribute,
       * which we set to `viewport x dpr` — and `right: 0` is then dropped as
       * over-constrained. Measured at DPR 3: a 588px viewport got a 1176px
       * canvas, so the grid drew at half density into a box twice the screen.
       * At DPR 1 the two happen to agree, which is why this hid on a desktop.
       */
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
