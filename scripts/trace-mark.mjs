/**
 * Turns the supplied logo PNG into a clean vector mark.
 *
 * The supplied file is a 142x56 screenshot, so the mark is only 34x34 pixels.
 * Rather than eyeball a redraw, this traces the light cut-out inside the dark
 * disc with marching squares at 4x sub-pixel resolution, simplifies the
 * outline, and emits an SVG path that can be scaled to a 1024 px launcher icon
 * without turning to mush.
 *
 * Outputs:
 *   apps/mobile/assets/brand-mark.path          one-line SVG path data
 *   apps/mobile/assets/brand-mark-points.json   the same contours, for GDI+
 *   brand-mark.svg                              preview/standalone asset
 *
 * Usage: node scripts/trace-mark.mjs "C:\path\to\logo.png"
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/trace-mark.mjs <logo.png>");
  process.exit(1);
}

/* ---------------------------------------------------------------- */
/* Minimal PNG reader (8-bit, non-interlaced, RGB or RGBA)          */
/* ---------------------------------------------------------------- */

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[rowIn + x];
      const left = x >= channels ? pixels[rowOut + x - channels] : 0;
      const up = y > 0 ? pixels[rowOut - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[rowOut - stride + x - channels] : 0;

      let out;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + left; break;
        case 2: out = value + up; break;
        case 3: out = value + ((left + up) >> 1); break;
        case 4: out = value + paeth(left, up, upLeft); break;
        default: throw new Error(`unknown filter ${filter}`);
      }

      pixels[rowOut + x] = out & 0xff;
    }
  }

  return { width, height, channels, pixels };
}

/* ---------------------------------------------------------------- */
/* Luminance field of the mark, in mark-local coordinates            */
/* ---------------------------------------------------------------- */

const image = decodePng(fs.readFileSync(source));

// The mark in the 142x56 file sits at x 6..39, y 9..42.
const MARK = { x: 6, y: 9, size: 34 };
const LEVEL = 150; // midpoint between paper and ink

const luminanceAtPixel = (px, py) => {
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return 0;
  const i = (py * image.width + px) * image.channels;
  return (image.pixels[i] + image.pixels[i + 1] + image.pixels[i + 2]) / 3;
};

/**
 * Sample the luminance at a continuous point inside the mark.
 * (u, v) are in mark pixels, where the mark spans 0..34.
 */
function sample(u, v) {
  // Anything outside the disc is paper, not glyph: keep it dark so the four
  // corners of the crop are never traced as cut-outs.
  const dx = u - MARK.size / 2;
  const dy = v - MARK.size / 2;
  if (Math.hypot(dx, dy) > 15.5) return 0;

  // Pixel i covers [i, i+1), so continuous u samples pixel index u - 0.5.
  const px = u - 0.5;
  const py = v - 0.5;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = px - x0;
  const fy = py - y0;

  const top = luminanceAtPixel(MARK.x + x0, MARK.y + y0) * (1 - fx) + luminanceAtPixel(MARK.x + x0 + 1, MARK.y + y0) * fx;
  const bottom = luminanceAtPixel(MARK.x + x0, MARK.y + y0 + 1) * (1 - fx) + luminanceAtPixel(MARK.x + x0 + 1, MARK.y + y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/* ---------------------------------------------------------------- */
/* Marching squares                                                 */
/* ---------------------------------------------------------------- */

const SCALE = 4; // sub-samples per pixel
const N = MARK.size * SCALE; // sample count along each axis (cells = N)

const value = new Float64Array((N + 1) * (N + 1));
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    value[j * (N + 1) + i] = sample(i / SCALE, j / SCALE);
  }
}
const at = (i, j) => value[j * (N + 1) + i];

// Crossing points live on the edges between samples; both cells that share an
// edge compute the identical key and position, so segments link exactly.
const points = new Map();

function horizontalPoint(i, j) {
  const key = `H${i},${j}`;
  let point = points.get(key);
  if (!point) {
    const a = at(i, j);
    const b = at(i + 1, j);
    const t = Math.abs(b - a) < 1e-9 ? 0.5 : (LEVEL - a) / (b - a);
    point = [(i + t) / SCALE, j / SCALE];
    points.set(key, point);
  }
  return key;
}

function verticalPoint(i, j) {
  const key = `V${i},${j}`;
  let point = points.get(key);
  if (!point) {
    const a = at(i, j);
    const b = at(i, j + 1);
    const t = Math.abs(b - a) < 1e-9 ? 0.5 : (LEVEL - a) / (b - a);
    point = [i / SCALE, (j + t) / SCALE];
    points.set(key, point);
  }
  return key;
}

const links = [];
const link = (a, b) => links.push([a, b]);

for (let j = 0; j < N; j += 1) {
  for (let i = 0; i < N; i += 1) {
    const a = at(i, j) > LEVEL;
    const b = at(i + 1, j) > LEVEL;
    const c = at(i + 1, j + 1) > LEVEL;
    const d = at(i, j + 1) > LEVEL;
    const index = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);

    const T = () => horizontalPoint(i, j);
    const R = () => verticalPoint(i + 1, j);
    const B = () => horizontalPoint(i, j + 1);
    const L = () => verticalPoint(i, j);

    switch (index) {
      case 1: link(L(), T()); break;
      case 2: link(T(), R()); break;
      case 3: link(L(), R()); break;
      case 4: link(R(), B()); break;
      case 5: link(L(), B()); link(T(), R()); break;
      case 6: link(T(), B()); break;
      case 7: link(L(), B()); break;
      case 8: link(L(), B()); break;
      case 9: link(T(), B()); break;
      case 10: link(T(), R()); link(B(), L()); break;
      case 11: link(R(), B()); break;
      case 12: link(L(), R()); break;
      case 13: link(T(), R()); break;
      case 14: link(L(), T()); break;
      default: break;
    }
  }
}

const adjacency = new Map();
for (const [a, b] of links) {
  if (!adjacency.has(a)) adjacency.set(a, []);
  if (!adjacency.has(b)) adjacency.set(b, []);
  adjacency.get(a).push(b);
  adjacency.get(b).push(a);
}

const loops = [];
const visited = new Set();
for (const start of adjacency.keys()) {
  if (visited.has(start)) continue;

  const loop = [];
  let current = start;
  let previous = null;

  while (current && !visited.has(current)) {
    visited.add(current);
    const point = points.get(current);
    if (point) loop.push(point);

    const next = (adjacency.get(current) ?? []).find(
      (candidate) => candidate !== previous && !visited.has(candidate)
    );
    if (!next) {
      // Both ends visited: close the loop if that end is the start.
      const back = (adjacency.get(current) ?? []).find((candidate) => candidate === start);
      if (back) break;
    }
    previous = current;
    current = next;
  }

  if (loop.length > 2) loops.push(loop);
}

/* Ramer-Douglas-Peucker, so a pixel staircase becomes a few straight runs. */
function simplify(points, tolerance) {
  if (points.length < 4) return points;

  const [first] = points;
  const last = points[points.length - 1];
  let index = 0;
  let maxDistance = 0;

  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const length = Math.hypot(dx, dy) || 1;

  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i];
    const distance = Math.abs(dy * px - dx * py + last[0] * first[1] - last[1] * first[0]) / length;
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerance) return [first, last];

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

const rounded = (n) => Number(n.toFixed(2));
const simplified = loops.map((loop) => simplify(loop, 0.22).map(([u, v]) => [rounded(u), rounded(v)]));

/* ---------------------------------------------------------------- */
/* Fit the tile corner radius against the source pixels             */
/* ---------------------------------------------------------------- */

const TILE = MARK.size;
const tilePath = (radius) =>
  `M${rounded(radius)} 0H${rounded(TILE - radius)}` +
  `A${rounded(radius)} ${rounded(radius)} 0 0 1 ${TILE} ${rounded(radius)}` +
  `V${rounded(TILE - radius)}` +
  `A${rounded(radius)} ${rounded(radius)} 0 0 1 ${rounded(TILE - radius)} ${TILE}` +
  `H${rounded(radius)}` +
  `A${rounded(radius)} ${rounded(radius)} 0 0 1 0 ${rounded(TILE - radius)}` +
  `V${rounded(radius)}` +
  `A${rounded(radius)} ${rounded(radius)} 0 0 1 ${rounded(radius)} 0Z`;

function insideTile(x, y, radius) {
  // Rounded rect: full inside the cross, circular at the corners.
  if (x < 0 || y < 0 || x > TILE || y > TILE) return false;
  const cx = Math.min(Math.max(x, radius), TILE - radius);
  const cy = Math.min(Math.max(y, radius), TILE - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

function inLoop(loop, x, y) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function fidelity(radius) {
  const SUB = 4;
  let hit = 0;
  let union = 0;

  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      // Compare against the raw crop, not the clipped sample field.
      const sourceDark = luminanceAtPixel(MARK.x + x, MARK.y + y) < LEVEL;

      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const u = x + (sx + 0.5) / SUB;
          const v = y + (sy + 0.5) / SUB;
          let glyph = false;
          for (const loop of simplified) if (inLoop(loop, u, v)) glyph = !glyph;
          const drawn = insideTile(u, v, radius) && !glyph;
          if (drawn && sourceDark) hit += 1;
          if (drawn || sourceDark) union += 1;
        }
      }
    }
  }

  return union === 0 ? 0 : hit / union;
}

let bestRadius = 8;
let bestScore = -1;
for (let radius = 4; radius <= 12; radius += 0.25) {
  const score = fidelity(radius);
  if (score > bestScore) {
    bestScore = score;
    bestRadius = radius;
  }
}

const tile = tilePath(bestRadius);

const glyphPath = simplified
  .map((loop) => {
    const [start, ...rest] = loop;
    return `M${start[0]} ${start[1]}${rest.map(([u, v]) => `L${u} ${v}`).join("")}Z`;
  })
  .join("");

const d = `${tile}${glyphPath}`;

const assets = path.join(repoRoot, "apps", "mobile", "assets");
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, "brand-mark.path"), d);
fs.writeFileSync(
  path.join(assets, "brand-mark-points.json"),
  JSON.stringify({ size: MARK.size, radius: bestRadius, loops: simplified })
);

fs.writeFileSync(
  path.join(repoRoot, "brand-mark.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="34" height="34" role="img" aria-label="TradeVault">\n  <path fill="#141412" fill-rule="evenodd" d="${d}"/>\n</svg>\n`
);

/* The apps import these two paths, so the tracer is the only place the mark is
   defined. Re-run it and both apps pick up the change. */
const tsModule =
  `/**\n * The TradeVault mark, traced from the supplied logo by\n * scripts/trace-mark.mjs. Do not edit by hand: re-run the tracer instead.\n */\n` +
  `export const BRAND_TILE_PATH = ${JSON.stringify(tile)};\n` +
  `export const BRAND_GLYPH_PATH = ${JSON.stringify(glyphPath)};\n`;

fs.writeFileSync(path.join(repoRoot, "apps", "web", "src", "brand-mark-path.ts"), tsModule);
fs.writeFileSync(path.join(repoRoot, "apps", "mobile", "src", "brand-mark-path.ts"), tsModule);

// Favicon: cream chip so it reads on a light or a dark tab strip, with the ink
// tile inset at the same ratio as the supplied logo.
fs.mkdirSync(path.join(repoRoot, "apps", "web", "public"), { recursive: true });
const inset = 6;
const scale = (32 - inset * 2) / TILE;
fs.writeFileSync(
  path.join(repoRoot, "apps", "web", "public", "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">\n` +
    `  <rect width="32" height="32" rx="9" fill="#FAFBF8"/>\n` +
    `  <g transform="translate(${inset} ${inset}) scale(${scale.toFixed(4)})">\n` +
    `    <path d="${tile}" fill="#141412"/>\n` +
    `    <path d="${glyphPath}" fill="#FAFBF8" fill-rule="evenodd"/>\n` +
    `  </g>\n` +
    `</svg>\n`
);

console.log(`loops: ${simplified.length}`);
console.log(`points: ${simplified.map((l) => l.length).join(", ")}`);
console.log(`tile radius: ${bestRadius}  fidelity IoU: ${bestScore.toFixed(4)}`);
console.log(`path length: ${d.length} chars`);
for (const loop of simplified) {
  const us = loop.map((p) => p[0]);
  const vs = loop.map((p) => p[1]);
  console.log(`  bbox u ${Math.min(...us)}..${Math.max(...us)}  v ${Math.min(...vs)}..${Math.max(...vs)}`);
}
console.log(`wrote brand-mark.svg`);
