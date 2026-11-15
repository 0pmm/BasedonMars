/**
 * Height sampling for the streaming globe (pure, unit-tested).
 *
 * Every globe tile is drawn as a regular (N+1)×(N+1) vertex grid whose
 * corners lie exactly on the tile bounds, so neighbouring tiles share edge
 * positions. Heights come from the best quantized-mesh tile available: the
 * tile itself or, beyond the terrain's resolution, one of its ancestors
 * (the ancestor's triangles are re-sampled into the child's grid).
 */
import { tileDeg } from './tiles.js';

/** Geographic bounds of a tile (TMS rows, growing north from −90°). */
export function tileBounds(z, x, y) {
  const d = tileDeg(z);
  return { west: x * d - 180, east: (x + 1) * d - 180, south: y * d - 90, north: (y + 1) * d - 90 };
}

/** Ancestor (z, x, y) of a tile at a coarser level. */
export function ancestorAt(z, x, y, level) {
  const k = z - level;
  return { z: level, x: x >> k, y: y >> k };
}

/** Child tiles of a tile (TMS). */
export function childrenOf(z, x, y) {
  return [
    { z: z + 1, x: 2 * x, y: 2 * y },
    { z: z + 1, x: 2 * x + 1, y: 2 * y },
    { z: z + 1, x: 2 * x, y: 2 * y + 1 },
    { z: z + 1, x: 2 * x + 1, y: 2 * y + 1 },
  ];
}

/** True when the terrain tileset has tile (z, x, y). */
export function terrainHasTile(available, z, x, y) {
  const ranges = available?.[z];
  if (!ranges) return false;
  return ranges.some((r) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY);
}

/** Finest level ≤ z whose ancestor tile exists in the terrain tileset. */
export function terrainLevelFor(available, z, x, y) {
  for (let l = Math.min(z, (available?.length ?? 1) - 1); l > 0; l--) {
    const a = ancestorAt(z, x, y, l);
    if (terrainHasTile(available, l, a.x, a.y)) return l;
  }
  return 0;
}

/**
 * Re-sample a decoded quantized-mesh tile into an (n+1)² vertex grid
 * covering `target` (which must lie inside `source`).
 * Row 0 is the NORTH edge, column 0 the WEST edge.
 * @param {{minHeight:number, maxHeight:number, u:Uint16Array, v:Uint16Array, h:Uint16Array, indices:ArrayLike<number>}} mesh
 * @param {{west:number,east:number,south:number,north:number}} source bounds of the mesh tile
 * @param {{west:number,east:number,south:number,north:number}} target bounds of the grid
 * @param {number} n segments per side
 * @param {number} [offset] subtracted from every height
 * @returns {Float32Array} (n+1)² heights in metres
 */
export function sampleMeshGrid(mesh, source, target, n, offset = 0) {
  const size = n + 1;
  const out = new Float32Array(size * size).fill(NaN);
  const count = mesh.u.length;
  const gx = new Float64Array(count);
  const gy = new Float64Array(count);
  const gh = new Float64Array(count);
  const span = mesh.maxHeight - mesh.minHeight;
  const sw = source.east - source.west;
  const sh = source.north - source.south;
  const tw = target.east - target.west;
  const th = target.north - target.south;
  for (let k = 0; k < count; k++) {
    const lon = source.west + (mesh.u[k] / 32767) * sw;
    const lat = source.south + (mesh.v[k] / 32767) * sh;
    gx[k] = ((lon - target.west) / tw) * n;
    gy[k] = ((target.north - lat) / th) * n;
    gh[k] = mesh.minHeight + (mesh.h[k] / 32767) * span - offset;
  }
  const idx = mesh.indices;
  const eps = 1e-7;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    const minX = Math.max(0, Math.ceil(Math.min(gx[a], gx[b], gx[c]) - eps));
    const maxX = Math.min(n, Math.floor(Math.max(gx[a], gx[b], gx[c]) + eps));
    const minY = Math.max(0, Math.ceil(Math.min(gy[a], gy[b], gy[c]) - eps));
    const maxY = Math.min(n, Math.floor(Math.max(gy[a], gy[b], gy[c]) + eps));
    if (minX > maxX || minY > maxY) continue;
    const det = (gy[b] - gy[c]) * (gx[a] - gx[c]) + (gx[c] - gx[b]) * (gy[a] - gy[c]);
    if (Math.abs(det) < 1e-14) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w1 = ((gy[b] - gy[c]) * (x - gx[c]) + (gx[c] - gx[b]) * (y - gy[c])) / det;
        const w2 = ((gy[c] - gy[a]) * (x - gx[c]) + (gx[a] - gx[c]) * (y - gy[c])) / det;
        const w3 = 1 - w1 - w2;
        if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
        out[y * size + x] = w1 * gh[a] + w2 * gh[b] + w3 * gh[c];
      }
    }
  }
  fillGrid(out, size);
  return out;
}

/** Fill NaN vertices from their neighbours (missing triangles at edges). */
export function fillGrid(data, size) {
  for (let pass = 0; pass < size; pass++) {
    let missing = 0;
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const k = j * size + i;
        if (!Number.isNaN(data[k])) continue;
        let sum = 0;
        let cnt = 0;
        if (i > 0 && !Number.isNaN(data[k - 1])) (sum += data[k - 1]), cnt++;
        if (i < size - 1 && !Number.isNaN(data[k + 1])) (sum += data[k + 1]), cnt++;
        if (j > 0 && !Number.isNaN(data[k - size])) (sum += data[k - size]), cnt++;
        if (j < size - 1 && !Number.isNaN(data[k + size])) (sum += data[k + size]), cnt++;
        if (cnt) data[k] = sum / cnt;
        else missing++;
      }
    if (!missing) return;
  }
  for (let k = 0; k < data.length; k++) if (Number.isNaN(data[k])) data[k] = 0;
}

/**
 * Bilinear height inside a tile grid at a lat/lon.
 * @param {Float32Array} heights (n+1)² grid, row 0 = north
 */
export function sampleTileGrid(heights, n, bounds, lat, lon) {
  const fx = Math.min(n, Math.max(0, ((lon - bounds.west) / (bounds.east - bounds.west)) * n));
  const fy = Math.min(n, Math.max(0, ((bounds.north - lat) / (bounds.north - bounds.south)) * n));
  const i = Math.min(n - 1, Math.floor(fx));
  const j = Math.min(n - 1, Math.floor(fy));
  const u = fx - i;
  const v = fy - j;
  const s = n + 1;
  const a = heights[j * s + i];
  const b = heights[j * s + i + 1];
  const c = heights[(j + 1) * s + i];
  const d = heights[(j + 1) * s + i + 1];
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/**
 * Slope (degrees) at every vertex of a tile grid, from central differences
 * with the real ground spacing of the tile.
 */
export function gridSlopes(heights, n, bounds, radius) {
  const s = n + 1;
  const out = new Float32Array(s * s);
  const dLatM = (((bounds.north - bounds.south) / n) * Math.PI * radius) / 180;
  for (let j = 0; j < s; j++) {
    const lat = bounds.north - ((bounds.north - bounds.south) * j) / n;
    const dLonM = Math.max(1e-3, (((bounds.east - bounds.west) / n) * Math.PI * radius * Math.cos((lat * Math.PI) / 180)) / 180);
    for (let i = 0; i < s; i++) {
      const l = heights[j * s + Math.max(0, i - 1)];
      const r = heights[j * s + Math.min(n, i + 1)];
      const u = heights[Math.max(0, j - 1) * s + i];
      const d = heights[Math.min(n, j + 1) * s + i];
      const gx = (r - l) / (dLonM * (Math.min(n, i + 1) - Math.max(0, i - 1)));
      const gy = (u - d) / (dLatM * (Math.min(n, j + 1) - Math.max(0, j - 1)));
      out[j * s + i] = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
    }
  }
  return out;
}

/**
 * Screen-space error test used to refine the quadtree: true when one
 * texel of the tile would cover more than `maxPx` pixels.
 */
export function needsRefine(tileWidth, distance, screenHeight, fovRad, maxPx = 1.4, texels = 256) {
  const pxPerUnit = screenHeight / (2 * Math.tan(fovRad / 2) * Math.max(distance, 1e-9));
  return (tileWidth / texels) * pxPerUnit > maxPx;
}
