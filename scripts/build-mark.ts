/**
 * Generate the brand mark's static files from the one grid that defines it.
 *
 *   npm run build:mark
 *
 * Writes `public/instela-mark.svg` (the tab icon, and anything else that wants
 * a scalable mark) and `src/app/favicon.ico` (the legacy path browsers and link
 * unfurlers request directly, whatever the HTML says).
 *
 * WHY THIS IS GENERATED AND NOT DRAWN
 *
 * Until now the tab mark and the mark in the nav were two different pictures —
 * separately drawn, and not even the same character. That is the same failure
 * as the two slot-marker regexes and the two query-string parsers: one rule,
 * two definitions, drifting. `mascot-grid.ts` is now the single definition and
 * both files fall out of it, exactly as `extension/vendor/` is compiled from
 * `lib/apply/autofill.ts` rather than reimplemented.
 *
 * NO NEW DEPENDENCY. An image encoder is the obvious thing to reach for a
 * package for, and this codebase has declined packages for less. PNG is a
 * deflate stream plus four CRC'd chunks and `node:zlib` is built in; ICO is a
 * header plus PNG payloads. Roughly sixty lines, and it only has to encode
 * axis-aligned squares.
 */
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

import {
  GRID,
  MARK_BODY,
  MARK_EYE,
  mascotCells,
  RESTING_POSE,
} from "../src/components/chrome/mascot-grid";

const ROOT = join(import.meta.dirname, "..");
const cells = mascotCells(RESTING_POSE.facing, RESTING_POSE.blink);

// ── SVG ──────────────────────────────────────────────────────────────────────

/** Merge each row's filled cells into horizontal runs, so the file stays small
 *  and readable rather than being 44 individual <rect> elements. */
function runs(want: (c: (typeof cells)[number]) => boolean): string {
  const out: string[] = [];
  for (let y = 0; y < GRID; y++) {
    const xs = cells.filter((c) => c.y === y && want(c)).map((c) => c.x).sort((a, b) => a - b);
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      out.push(`M${xs[i]} ${y}h${xs[j] - xs[i] + 1}v1H${xs[i]}z`);
      i = j + 1;
    }
  }
  return out.join("");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">
  <title>Instela</title>
  <path fill="${MARK_BODY}" d="${runs((c) => !c.eye)}"/>
  <path fill="${MARK_EYE}" d="${runs((c) => c.eye)}"/>
</svg>
`;
writeFileSync(join(ROOT, "public", "instela-mark.svg"), svg);

// ── PNG ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixels -> a PNG file. Colour type 6, no interlacing, filter 0. */
function png(size: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: none
    rgba.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[y * (1 + size * 4) + 1 + i] = v;
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/**
 * Render the grid at `SUPER`, then box-average down to the icon size.
 *
 * 480 is deliberate rather than "big enough": it is a whole multiple of the
 * 10-cell grid AND of 16, 32 and 48, so every cell is an exact number of source
 * pixels and every output pixel averages an exact block. Scaling a 10-cell grid
 * straight to 16 would give some cells 2px and others 1px — and the mark is
 * bilaterally symmetric, so that lands as one arm visibly fatter than the
 * other. Symmetry is the thing most obviously broken by naive scaling here.
 */
const SUPER = 480;
const CELL = SUPER / GRID;

const source = new Uint8Array(SUPER * SUPER * 4);
for (const c of cells) {
  const [r, g, b] = hex(c.eye ? MARK_EYE : MARK_BODY);
  for (let y = c.y * CELL; y < (c.y + 1) * CELL; y++) {
    for (let x = c.x * CELL; x < (c.x + 1) * CELL; x++) {
      const o = (y * SUPER + x) * 4;
      source[o] = r;
      source[o + 1] = g;
      source[o + 2] = b;
      source[o + 3] = 255;
    }
  }
}

function downsample(size: number): Uint8Array {
  const block = SUPER / size;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Average in premultiplied space, or the transparent pixels drag their
      // (black) colour into the edges and the mark gets a dark halo.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = y * block; sy < (y + 1) * block; sy++) {
        for (let sx = x * block; sx < (x + 1) * block; sx++) {
          const o = (sy * SUPER + sx) * 4;
          const al = source[o + 3] / 255;
          r += source[o] * al;
          g += source[o + 1] * al;
          b += source[o + 2] * al;
          a += al;
        }
      }
      const n = block * block;
      const o = (y * size + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

// ── ICO ──────────────────────────────────────────────────────────────────────

const SIZES = [16, 32, 48];
const payloads = SIZES.map((s) => png(s, downsample(s)));

const dir = Buffer.alloc(6 + payloads.length * 16);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(payloads.length, 4);
let offset = dir.length;
payloads.forEach((p, i) => {
  const e = 6 + i * 16;
  dir[e] = SIZES[i]; // 0 would mean 256
  dir[e + 1] = SIZES[i];
  dir[e + 2] = 0; // palette size: none
  dir[e + 3] = 0; // reserved
  dir.writeUInt16LE(1, e + 4); // colour planes
  dir.writeUInt16LE(32, e + 6); // bits per pixel
  dir.writeUInt32LE(p.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += p.length;
});
writeFileSync(join(ROOT, "src", "app", "favicon.ico"), Buffer.concat([dir, ...payloads]));

console.log(
  `mark: ${cells.length} cells -> public/instela-mark.svg (${svg.length}b), ` +
    `src/app/favicon.ico (${offset}b, ${SIZES.join("/")})`,
);
