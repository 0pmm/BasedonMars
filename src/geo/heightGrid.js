/**
 * Regular elevation grid built from real terrain tiles, plus the terrain
 * analyses derived from it (pure functions, unit-tested).
 *
 * Grid convention: `size` cells per side, `cell` metres per cell, centred
 * on the site origin. Index (i, j): i grows east, j grows SOUTH (image
 * order). Local metres: e = (i + 0.5) * cell - half, n = half - (j + 0.5) * cell.
 */
import { toLocal } from './mars.js';
import { terrainTileBounds } from './tiles.js';

/**
 * @param {number} size cells per side
 * @param {number} cell metres per cell
 */
export function createGrid(size, cell) {
  return { size, cell, half: (size * cell) / 2, data: new Float32Array(size * size).fill(NaN) };
}

/**
 * Rasterise a decoded quantized-mesh tile into the grid (barycentric
 * interpolation inside each triangle).
 * @param {ReturnType<typeof createGrid>} grid
 * @param {ReturnType<import('./quantizedMesh.js').decodeQuantizedMesh>} mesh
 * @param {{z:number,x:number,y:number}} tile
 * @param {{lat:number, lon:number}} origin
 * @param {number} heightOffset subtracted from every height
 * @param {{e:number, n:number}} [shift] grid centre in the origin's local frame (default: the origin)
 */
export function rasterizeTile(grid, mesh, tile, origin, heightOffset = 0, shift = null) {
  const se = shift?.e ?? 0;
  const sn = shift?.n ?? 0;
  const b = terrainTileBounds(tile.z, tile.x, tile.y);
  const n = mesh.u.length;
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const gh = new Float32Array(n);
  const span = mesh.maxHeight - mesh.minHeight;
  for (let k = 0; k < n; k++) {
    const lon = b.west + (mesh.u[k] / 32767) * (b.east - b.west);
    const lat = b.south + (mesh.v[k] / 32767) * (b.north - b.south);
    const p = toLocal(lat, lon, origin);
    gx[k] = (p.e - se + grid.half) / grid.cell - 0.5;
    gy[k] = (grid.half - (p.n - sn)) / grid.cell - 0.5;
    gh[k] = mesh.minHeight + (mesh.h[k] / 32767) * span - heightOffset;
  }
  const { size, data } = grid;
  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const c = idx[t + 1];
    const d = idx[t + 2];
    const minX = Math.max(0, Math.ceil(Math.min(gx[a], gx[c], gx[d])));
    const maxX = Math.min(size - 1, Math.floor(Math.max(gx[a], gx[c], gx[d])));
    const minY = Math.max(0, Math.ceil(Math.min(gy[a], gy[c], gy[d])));
    const maxY = Math.min(size - 1, Math.floor(Math.max(gy[a], gy[c], gy[d])));
    if (minX > maxX || minY > maxY) continue;
    const det = (gy[c] - gy[d]) * (gx[a] - gx[d]) + (gx[d] - gx[c]) * (gy[a] - gy[d]);
    if (Math.abs(det) < 1e-12) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w1 = ((gy[c] - gy[d]) * (x - gx[d]) + (gx[d] - gx[c]) * (y - gy[d])) / det;
        const w2 = ((gy[d] - gy[a]) * (x - gx[d]) + (gx[a] - gx[d]) * (y - gy[d])) / det;
        const w3 = 1 - w1 - w2;
        if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
        data[y * size + x] = w1 * gh[a] + w2 * gh[c] + w3 * gh[d];
      }
    }
  }
}

/** Fill cells left empty (tile seams / missing tiles) from their neighbours. */
export function fillGaps(grid, maxPasses = 64) {
  const { size, data } = grid;
  for (let pass = 0; pass < maxPasses; pass++) {
    let missing = 0;
    const copy = data.slice();
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = j * size + i;
        if (!Number.isNaN(copy[k])) continue;
        let sum = 0;
        let cnt = 0;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
          const v = copy[jj * size + ii];
          if (!Number.isNaN(v)) {
            sum += v;
            cnt++;
          }
        }
        if (cnt) data[k] = sum / cnt;
        else missing++;
      }
    }
    if (!missing) return 0;
    if (pass === maxPasses - 1) {
      for (let k = 0; k < data.length; k++) if (Number.isNaN(data[k])) data[k] = 0;
      return missing;
    }
  }
  return 0;
}

/** Local metres → fractional grid coordinates. */
export function toGrid(grid, e, n) {
  return { x: (e + grid.half) / grid.cell - 0.5, y: (grid.half - n) / grid.cell - 0.5 };
}

/** Grid indices → local metres (cell centre). */
export function toMetres(grid, i, j) {
  return { e: (i + 0.5) * grid.cell - grid.half, n: grid.half - (j + 0.5) * grid.cell };
}

/** Bilinear elevation at local metres (clamped to the grid). */
export function sampleHeight(grid, e, n) {
  const { size, data } = grid;
  const g = toGrid(grid, e, n);
  const x = Math.min(size - 1.001, Math.max(0, g.x));
  const y = Math.min(size - 1.001, Math.max(0, g.y));
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const k = j * size + i;
  const a = data[k];
  const b = data[k + 1];
  const c = data[k + size];
  const d = data[k + size + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Elevation statistics. */
export function gridStats(grid) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/** Slope in degrees for every cell (central differences, Horn-like). */
export function slopeMap(grid) {
  const { size, data, cell } = grid;
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const l = data[j * size + Math.max(0, i - 1)];
      const r = data[j * size + Math.min(size - 1, i + 1)];
      const u = data[Math.max(0, j - 1) * size + i];
      const d = data[Math.min(size - 1, j + 1) * size + i];
      const dx = (r - l) / ((Math.min(size - 1, i + 1) - Math.max(0, i - 1)) * cell);
      const dy = (d - u) / ((Math.min(size - 1, j + 1) - Math.max(0, j - 1)) * cell);
      out[j * size + i] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
    }
  }
  return out;
}

/**
 * Roughness: standard deviation (m) of the elevation residual against a
 * local best-fit PLANE in a (2r+1)² window — so a steady slope is smooth,
 * while boulders, ridges and scarps stand out.
 */
export function roughnessMap(grid, r = 2) {
  const { size, data } = grid;
  const out = new Float32Array(size * size);
  let sxx = 0;
  for (let d = -r; d <= r; d++) sxx += d * d * (2 * r + 1);
  const n = (2 * r + 1) ** 2;
  const at = (ii, jj) => data[Math.min(size - 1, Math.max(0, jj)) * size + Math.min(size - 1, Math.max(0, ii))];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let s = 0;
      let sx = 0;
      let sy = 0;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const v = at(i + di, j + dj);
          s += v;
          sx += di * v;
          sy += dj * v;
        }
      const mean = s / n;
      const a = sx / sxx;
      const b = sy / sxx;
      let res = 0;
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const e = at(i + di, j + dj) - mean - a * di - b * dj;
          res += e * e;
        }
      out[j * size + i] = Math.sqrt(res / n);
    }
  }
  return out;
}

/** Hillshade 0..1 for a sun azimuth/elevation (degrees). */
export function hillshade(grid, azimuthDeg = 315, elevationDeg = 35) {
  const { size, data, cell } = grid;
  const out = new Float32Array(size * size);
  const az = (azimuthDeg * Math.PI) / 180;
  const zen = ((90 - elevationDeg) * Math.PI) / 180;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const l = data[j * size + Math.max(0, i - 1)];
      const r = data[j * size + Math.min(size - 1, i + 1)];
      const u = data[Math.max(0, j - 1) * size + i];
      const d = data[Math.min(size - 1, j + 1) * size + i];
      const dzdx = (r - l) / (2 * cell); // east
      const dzdy = (u - d) / (2 * cell); // north
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(-dzdx, -dzdy); // direction the slope faces, from north
      const v = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
      out[j * size + i] = Math.max(0, v);
    }
  }
  return out;
}

/**
 * Contour segments (marching squares) every `interval` metres.
 * @returns {{level:number, major:boolean, segs:number[]}[]} segs in grid coordinates (x1,y1,x2,y2…)
 */
export function contours(grid, interval, majorEvery = 5) {
  const { size, data } = grid;
  const { min, max } = gridStats(grid);
  const result = [];
  const first = Math.ceil(min / interval) * interval;
  for (let level = first; level <= max; level += interval) {
    const segs = [];
    for (let j = 0; j < size - 1; j++) {
      for (let i = 0; i < size - 1; i++) {
        const a = data[j * size + i];
        const b = data[j * size + i + 1];
        const c = data[(j + 1) * size + i + 1];
        const d = data[(j + 1) * size + i];
        const pts = [];
        const edge = (v1, v2, x1, y1, x2, y2) => {
          if (v1 < level !== v2 < level) {
            const t = (level - v1) / (v2 - v1);
            pts.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
          }
        };
        edge(a, b, i, j, i + 1, j);
        edge(b, c, i + 1, j, i + 1, j + 1);
        edge(c, d, i + 1, j + 1, i, j + 1);
        edge(d, a, i, j + 1, i, j);
        if (pts.length >= 4) segs.push(pts[0], pts[1], pts[2], pts[3]);
        if (pts.length === 8) segs.push(pts[4], pts[5], pts[6], pts[7]);
      }
    }
    const index = Math.round(level / interval);
    if (segs.length) result.push({ level, major: index % majorEvery === 0, segs });
  }
  return result;
}

/** Elevation profile along a polyline of local points. */
export function profileAlong(grid, points, stepM = grid.cell) {
  const out = [];
  let dist = 0;
  for (let p = 0; p < points.length - 1; p++) {
    const a = points[p];
    const b = points[p + 1];
    const len = Math.hypot(b.e - a.e, b.n - a.n);
    const steps = Math.max(1, Math.ceil(len / stepM));
    for (let s = p === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const e = a.e + (b.e - a.e) * t;
      const n = a.n + (b.n - a.n) * t;
      out.push({ d: dist + len * t, e, n, h: sampleHeight(grid, e, n) });
    }
    dist += len;
  }
  return out;
}

/**
 * Line-of-sight visibility from an observer (viewshed).
 * @returns {Uint8Array} 1 = visible from the observer
 */
export function viewshed(grid, observer, observerHeight = 3, targetHeight = 1.8) {
  const { size, data } = grid;
  const out = new Uint8Array(size * size);
  const o = toGrid(grid, observer.e, observer.n);
  const oh = sampleHeight(grid, observer.e, observer.n) + observerHeight;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - o.x;
      const dy = j - o.y;
      const dist = Math.hypot(dx, dy);
      const th = data[j * size + i] + targetHeight;
      if (dist < 1.5) {
        out[j * size + i] = 1;
        continue;
      }
      const steps = Math.ceil(dist);
      const targetSlope = (th - oh) / dist;
      let visible = 1;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const x = Math.round(o.x + dx * t);
        const y = Math.round(o.y + dy * t);
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if ((data[y * size + x] - oh) / (dist * t) > targetSlope) {
          visible = 0;
          break;
        }
      }
      out[j * size + i] = visible;
    }
  }
  return out;
}

/**
 * Cast shadows for a sun direction by horizon ray-marching.
 * @returns {Uint8Array} 1 = in shadow
 */
export function shadowMap(grid, azimuthDeg, elevationDeg) {
  const { size, data, cell } = grid;
  const out = new Uint8Array(size * size);
  if (elevationDeg <= 0) return out.fill(1);
  const az = (azimuthDeg * Math.PI) / 180;
  const sx = Math.sin(az); // east
  const sy = -Math.cos(az); // grid y grows south
  const rise = Math.tan((elevationDeg * Math.PI) / 180) * cell;
  const maxSteps = size;
  let top = -Infinity;
  for (const v of data) if (v > top) top = v;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const h0 = data[j * size + i];
      for (let s = 1; s < maxSteps; s++) {
        const x = Math.round(i + sx * s);
        const y = Math.round(j + sy * s);
        if (x < 0 || y < 0 || x >= size || y >= size) break;
        const ray = h0 + rise * s;
        const h = data[y * size + x];
        if (h > ray) {
          out[j * size + i] = 1;
          break;
        }
        if (ray > top) break; // nothing can be higher than the ray any more
      }
    }
  }
  return out;
}
