/**
 * Procedural value noise, fractal Brownian motion and domain warping.
 * Pure functions: used by the main thread (terrain heights) and by the
 * texture Web Worker (ground/rock textures).
 */

/** Deterministic hash in [0, 1). */
export function hashNoise(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** Smoothly interpolated value noise sampled at (x/scale, y/scale). */
export function smoothNoise(x, y, scale, seed) {
  const xs = x / scale;
  const ys = y / scale;
  const x0 = Math.floor(xs);
  const y0 = Math.floor(ys);
  const sx = xs - x0;
  const sy = ys - y0;
  const sxf = sx * sx * (3 - 2 * sx);
  const syf = sy * sy * (3 - 2 * sy);
  const n00 = hashNoise(x0, y0, seed);
  const n10 = hashNoise(x0 + 1, y0, seed);
  const n01 = hashNoise(x0, y0 + 1, seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, seed);
  const ix0 = n00 + (n10 - n00) * sxf;
  const ix1 = n01 + (n11 - n01) * sxf;
  return ix0 + (ix1 - ix0) * syf;
}

/** Fractal (multi-octave) noise normalised to [0, 1]. */
export function fractalNoise(x, y, octaves, baseScale, seed) {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * freq, y * freq, baseScale, seed + i * 17) * amp;
    max += amp;
    amp *= 0.52;
    freq *= 2.1;
  }
  return value / max;
}

/** Domain-warped fractal noise: distorts coordinates for natural flow. */
export function domainWarpNoise(x, y, seed) {
  const warpX = fractalNoise(x * 0.6 + 11, y * 0.6 - 7, 4, 85, seed + 401) - 0.5;
  const warpY = fractalNoise(x * 0.6 - 33, y * 0.6 + 19, 4, 85, seed + 877) - 0.5;
  return fractalNoise(x + warpX * 140, y + warpY * 140, 6, 60, seed);
}

/** Fast integer hash in [0, 1). */
export function intHash(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise on a lattice that wraps every `cells` cells (seamless tiling). */
function periodicValue(fx, fy, cells, seed) {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const xa = ((x0 % cells) + cells) % cells;
  const ya = ((y0 % cells) + cells) % cells;
  const xb = (xa + 1) % cells;
  const yb = (ya + 1) % cells;
  const a = intHash(xa, ya, seed);
  const b = intHash(xb, ya, seed);
  const c = intHash(xa, yb, seed);
  const d = intHash(xb, yb, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Seamlessly tiling fractal noise over a `size`×`size` texture.
 * @param {number} baseCells lattice cells across the texture at octave 0
 */
export function tileableNoise(x, y, size, octaves, baseCells, seed) {
  let value = 0;
  let amp = 1;
  let max = 0;
  let cells = baseCells;
  for (let i = 0; i < octaves; i++) {
    value += periodicValue((x / size) * cells, (y / size) * cells, cells, seed + i * 31) * amp;
    max += amp;
    amp *= 0.5;
    cells *= 2;
  }
  return value / max;
}

/** 8-stop Martian palette (dark basalt → light beige). */
export const MARS_PALETTE = [
  [0.0, 50, 33, 25],
  [0.28, 86, 49, 34],
  [0.44, 128, 73, 46],
  [0.56, 160, 97, 59],
  [0.68, 190, 123, 77],
  [0.8, 211, 150, 104],
  [0.9, 224, 174, 134],
  [1.0, 234, 196, 161],
];

/**
 * Sample the Martian palette.
 * @param {number} v value in [0,1]
 * @returns {[number, number, number]}
 */
export function samplePalette(v, stops = MARS_PALETTE) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (v >= a[0] && v <= b[0]) {
      const t = (v - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  const last = v < stops[0][0] ? stops[0] : stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}
