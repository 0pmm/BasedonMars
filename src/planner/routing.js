/**
 * Route planning on the real elevation grid (pure, unit-tested).
 *
 * A* over an 8-connected grid where the cost of a step is the estimated
 * TIME to walk it (Tobler speed on the signed slope), with soft penalties
 * near rough ground and hard blocks where the suit limits are exceeded.
 */
import { walkingSpeed, DEFAULT_EVA } from './eva.js';

/**
 * Build the traversability map.
 * @returns {{size:number, blocked:Uint8Array, penalty:Float32Array}}
 */
export function buildTraversability(grid, slope, roughness, rocks = [], p = DEFAULT_EVA) {
  const { size, cell, half } = grid;
  const blocked = new Uint8Array(size * size);
  const penalty = new Float32Array(size * size);
  const maxSlope = p.mode === 'rover' ? p.maxSlopeRover : p.maxSlopeWalk;
  const roughLimit = p.mode === 'rover' ? p.maxRoughness * 0.7 : p.maxRoughness;
  for (let k = 0; k < size * size; k++) {
    if (slope[k] > maxSlope || roughness[k] > roughLimit) blocked[k] = 1;
    penalty[k] = 1 + (roughness[k] / roughLimit) * 1.5 + (slope[k] / maxSlope) ** 2;
  }
  // Boulders block their cells (+ a clearance for the rover)
  const clearance = p.mode === 'rover' ? 1.5 : 0.4;
  for (const r of rocks) {
    const ci = Math.floor((r.e + half) / cell);
    const cj = Math.floor((half - r.n) / cell);
    const rad = Math.ceil((r.d / 2 + clearance) / cell);
    if (r.d < (p.mode === 'rover' ? 0.35 : 0.6)) continue; // small rocks can be stepped over
    for (let j = cj - rad; j <= cj + rad; j++)
      for (let i = ci - rad; i <= ci + rad; i++) if (i >= 0 && j >= 0 && i < size && j < size) blocked[j * size + i] = 1;
  }
  return { size, blocked, penalty };
}

class MinHeap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  push(key, val) {
    const { k, v } = this;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const { k, v } = this;
    const top = v[0];
    const lk = k.pop();
    const lv = v.pop();
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.k.length;
  }
}

/** Nearest non-blocked cell (so a waypoint on a boulder still routes). */
export function nearestFree(trav, i, j, maxR = 12) {
  const { size, blocked } = trav;
  if (i >= 0 && j >= 0 && i < size && j < size && !blocked[j * size + i]) return [i, j];
  for (let r = 1; r <= maxR; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const x = i + di;
        const y = j + dj;
        if (x >= 0 && y >= 0 && x < size && y < size && !blocked[y * size + x]) return [x, y];
      }
  return null;
}

/**
 * A* from (i0,j0) to (i1,j1).
 * @returns {null | {cells:[number,number][], seconds:number}}
 */
export function findPath(grid, trav, start, goal, p = DEFAULT_EVA) {
  const { size, data, cell } = grid;
  const s = nearestFree(trav, start[0], start[1]);
  const g = nearestFree(trav, goal[0], goal[1]);
  if (!s || !g) return null;
  const N = size * size;
  const cost = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const startK = s[1] * size + s[0];
  const goalK = g[1] * size + g[0];
  const vmax = p.mode === 'rover' ? p.roverSpeed : p.walkSpeed * 1.2;
  const heur = (k) => (Math.hypot((k % size) - g[0], Math.floor(k / size) - g[1]) * cell) / vmax;
  cost[startK] = 0;
  const open = new MinHeap();
  open.push(heur(startK), startK);
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (open.size) {
    const k = open.pop();
    if (closed[k]) continue;
    if (k === goalK) break;
    closed[k] = 1;
    const i = k % size;
    const j = (k - i) / size;
    for (const [di, dj, len] of dirs) {
      const x = i + di;
      const y = j + dj;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const n = y * size + x;
      if (closed[n] || trav.blocked[n]) continue;
      const run = len * cell;
      const grade = (Math.atan2(data[n] - data[k], run) * 180) / Math.PI;
      const speed = p.mode === 'rover' ? p.roverSpeed * Math.max(0.3, 1 - Math.abs(grade) / 40) : walkingSpeed(grade, p);
      const c = cost[k] + (Math.hypot(run, data[n] - data[k]) / speed) * trav.penalty[n];
      if (c < cost[n]) {
        cost[n] = c;
        from[n] = k;
        open.push(c + heur(n), n);
      }
    }
  }
  if (from[goalK] === -1 && goalK !== startK) return null;
  const cells = [];
  for (let k = goalK; k !== -1; k = from[k]) {
    cells.push([k % size, Math.floor(k / size)]);
    if (k === startK) break;
  }
  cells.reverse();
  return { cells, seconds: cost[goalK] };
}

/** Simplify a cell path (Ramer–Douglas–Peucker) to fewer vertices. */
export function simplifyPath(points, tolerance = 1) {
  if (points.length < 3) return points;
  const sq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  function segDist(p, a, b) {
    const l = sq(a, b);
    if (!l) return sq(p, a);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l));
    return sq(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i], points[a], points[b]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tolerance * tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
