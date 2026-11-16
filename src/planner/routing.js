/**
 * Route planning on the real elevation grid (pure, unit-tested).
 *
 * Three route profiles that really differ, because each one has its own
 * idea of what "dangerous" means, not just different weights:
 *   - FAST: only the suit's hard limits block; cost ≈ walking time, a small
 *     effort term, risk only right at the limits.
 *   - BALANCED: time + effort + moderate risk that starts at half the limit.
 *   - SAFE: a stricter effective slope limit (80 % of the suit's), a buffer
 *     around every blocked cell and risk that starts at 30 % of the limit;
 *     effort weighs as much as time (climbing costs O₂).
 * Search: A* on a 16-connected grid (knight moves give 26.6°/63.4°
 * headings, not only 0/45/90°), then "string pulling": the path is
 * straightened wherever a direct segment is clear of blocked cells and not
 * more expensive. That removes zigzags and unnecessary bends, so detours are
 * as short as the terrain allows and turns look natural.
 * When no path stays fully within the limits (canyon walls, crater rims), a
 * second "least exposure" search lets the route cross over-limit ground at a
 * steep price that grows with how far over the limit it is (and is highest in
 * SAFE): the route goes around everything it can and crosses the shortest,
 * gentlest possible stretch, instead of giving up with a straight line.
 */
import { walkingSpeed, walkingMetabolic, DEFAULT_EVA } from './eva.js';

/**
 * Route profiles.
 * time/energy/risk: weights of the cost terms; start: fraction of the limit
 * where the slope/roughness risk starts; hardSlope: effective slope limit
 * (× suit limit); buffer: metres of extra risk around blocked cells;
 * over: cost multiplier per unit of "over the limit" when no fully safe path
 * exists (least-exposure search);
 * factors: weight of each risk factor in this profile.
 */
export const PROFILES = Object.freeze({
  fast: {
    time: 1,
    energy: 0.15,
    risk: 0.35,
    start: 0.85,
    hardSlope: 1,
    buffer: 0,
    over: 25,
    factors: { slope: 1, rough: 0.6, rocks: 0.5, sand: 0.3, comms: 0, shadow: 0 },
  },
  balanced: {
    time: 1,
    energy: 0.6,
    risk: 1.2,
    start: 0.5,
    hardSlope: 1,
    buffer: 6,
    over: 60,
    factors: { slope: 1, rough: 1, rocks: 1, sand: 0.7, comms: 0.25, shadow: 0.1 },
  },
  safety: {
    time: 1,
    energy: 1,
    risk: 3,
    start: 0.3,
    hardSlope: 0.8,
    buffer: 15,
    over: 150,
    factors: { slope: 1.3, rough: 1.2, rocks: 1.5, sand: 1, comms: 0.45, shadow: 0.2 },
  },
});

/** Back-compat alias: cost weights per priority. */
export const PRIORITIES = PROFILES;

/** Risk factor names (also the i18n keys rt.factor.*). Values = default weights (balanced). */
export const RISK_WEIGHTS = Object.freeze({ ...PROFILES.balanced.factors, hazard: 1 });

const profileOf = (p, priority) => PROFILES[priority || p.priority] || PROFILES.safety;

/** Suit limits for the current mode. */
export function limitsFor(p = DEFAULT_EVA) {
  const rover = p.mode === 'rover';
  return { slope: rover ? p.maxSlopeRover : p.maxSlopeWalk, rough: rover ? p.maxRoughness * 0.7 : p.maxRoughness };
}

/** 0 below `start` × limit, rising smoothly to 1 at the limit (and a bit beyond). */
function ramp(value, limit, start) {
  const x = value / limit;
  if (x <= start) return 0;
  return Math.min(1.5, ((x - start) / (1 - start)) ** 2);
}

/** Chamfer distance (in cells) to the nearest blocked cell, capped at `max`. */
function distanceToBlocked(blocked, size, max) {
  const INF = 1e9;
  const d = new Float32Array(size * size).fill(INF);
  for (let k = 0; k < d.length; k++) if (blocked[k]) d[k] = 0;
  const D = Math.SQRT2;
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      if (i > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
      if (j > 0) {
        d[k] = Math.min(d[k], d[k - size] + 1);
        if (i > 0) d[k] = Math.min(d[k], d[k - size - 1] + D);
        if (i < size - 1) d[k] = Math.min(d[k], d[k - size + 1] + D);
      }
    }
  for (let j = size - 1; j >= 0; j--)
    for (let i = size - 1; i >= 0; i--) {
      const k = j * size + i;
      if (i < size - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
      if (j < size - 1) {
        d[k] = Math.min(d[k], d[k + size] + 1);
        if (i < size - 1) d[k] = Math.min(d[k], d[k + size + 1] + D);
        if (i > 0) d[k] = Math.min(d[k], d[k + size - 1] + D);
      }
    }
  for (let k = 0; k < d.length; k++) d[k] = Math.min(d[k], max);
  return d;
}

/**
 * Build the cost map for a profile.
 * @param {object} grid elevation grid
 * @param {Float32Array} slope degrees per cell
 * @param {Float32Array} roughness metres per cell
 * @param {{e:number,n:number,d:number}[]} rocks boulders (local metres)
 * @param {object} p EVA parameters (p.priority selects the profile)
 * @param {{sand?:Float32Array, vis?:Uint8Array, shadow?:Uint8Array}} [extras] optional layers
 * @param {keyof PROFILES} [priority]
 */
export function buildTraversability(grid, slope, roughness, rocks = [], p = DEFAULT_EVA, extras = {}, priority) {
  const { size, cell, half } = grid;
  const N = size * size;
  const prof = profileOf(p, priority);
  const lim = limitsFor(p);
  // The roughness limit (0.6 m) is about boulders and steps at ~1 m scale. On a
  // coarse grid (tens to hundreds of metres per cell) the residual in a 5×5
  // window measures relief, not walkability, and would block whole regions:
  // scale the limit with the cell so it keeps meaning "a step as steep as the
  // slope limit". Slopes are still checked at every scale.
  lim.rough *= Math.max(1, cell);
  const hardSlope = lim.slope * prof.hardSlope;
  const rover = p.mode === 'rover';
  const blocked = new Uint8Array(N);
  // how far over the limits each blocked cell is (0 = within limits)
  const excess = new Float32Array(N);
  const f = {
    slope: new Float32Array(N),
    rough: new Float32Array(N),
    rocks: new Float32Array(N),
    sand: new Float32Array(N),
    comms: new Float32Array(N),
    shadow: new Float32Array(N),
    hazard: new Float32Array(N),
  };
  for (let k = 0; k < N; k++) {
    if (slope[k] > hardSlope || roughness[k] > lim.rough) {
      blocked[k] = 1;
      excess[k] = 0.25 + Math.max(0, slope[k] / hardSlope - 1) + Math.max(0, roughness[k] / lim.rough - 1);
    }
    f.slope[k] = ramp(slope[k], hardSlope, prof.start);
    f.rough[k] = ramp(roughness[k], lim.rough, prof.start);
    if (extras.sand) f.sand[k] = Math.min(1, extras.sand[k] * (rover ? 1.6 : 1));
    if (extras.vis) f.comms[k] = extras.vis[k] ? 0 : 1;
    if (extras.shadow) f.shadow[k] = extras.shadow[k] ? 1 : 0;
  }
  // Boulders: blocked core + a "keep away" halo
  const clearance = rover ? 1.5 : 0.4;
  for (const r of rocks) {
    if (r.d < (rover ? 0.35 : 0.6)) continue; // small rocks can be stepped over
    const ci = Math.floor((r.e + half) / cell);
    const cj = Math.floor((half - r.n) / cell);
    const core = r.d / 2 + clearance;
    const halo = core + (rover ? 6 : 3);
    const rad = Math.ceil(halo / cell);
    for (let j = cj - rad; j <= cj + rad; j++)
      for (let i = ci - rad; i <= ci + rad; i++) {
        if (i < 0 || j < 0 || i >= size || j >= size) continue;
        const dist = Math.hypot(i - ci, j - cj) * cell;
        const k = j * size + i;
        if (dist <= core) {
          blocked[k] = 1;
          excess[k] = Math.max(excess[k], 1);
        } else if (dist <= halo) f.rocks[k] = Math.max(f.rocks[k], 1 - (dist - core) / (halo - core));
      }
  }
  // Hazard buffer: keep a margin from cliffs and forbidden ground (profile-dependent)
  if (prof.buffer > 0) {
    const bufCells = Math.max(1, prof.buffer / cell);
    const dist = distanceToBlocked(blocked, size, bufCells + 1);
    for (let k = 0; k < N; k++) if (!blocked[k] && dist[k] <= bufCells) f.hazard[k] = 1 - dist[k] / (bufCells + 1);
  }
  const weights = { ...prof.factors, hazard: 1 };
  const risk = new Float32Array(N);
  const penalty = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    let r = 0;
    for (const name in weights) r += f[name][k] * weights[name];
    risk[k] = r;
    penalty[k] = 1 + r;
  }
  return { size, blocked, excess, risk, penalty, factors: f, profile: prof };
}

/** Speed (m/s) and energy ratio (vs flat walking) of a step on a signed grade. */
export function stepModel(gradeDeg, p = DEFAULT_EVA) {
  if (p.mode === 'rover') return { speed: p.roverSpeed * Math.max(0.3, 1 - Math.abs(gradeDeg) / 40), energy: 1 + Math.abs(gradeDeg) / 15 };
  return { speed: walkingSpeed(gradeDeg, p), energy: walkingMetabolic(gradeDeg, p) / p.walkMetabolicW };
}

/** Cost (s-equivalent) of a step of horizontal length `run`, height change `rise`, through cells of mean risk `risk`. */
export function stepCost(run, rise, risk, p = DEFAULT_EVA, w = PROFILES.safety) {
  const grade = (Math.atan2(rise, run) * 180) / Math.PI;
  const { speed, energy } = stepModel(grade, p);
  return (Math.hypot(run, rise) / speed) * (w.time + w.energy * (energy - 1)) * (1 + w.risk * risk);
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
      const q = (i - 1) >> 1;
      if (k[q] <= k[i]) break;
      [k[q], k[i]] = [k[i], k[q]];
      [v[q], v[i]] = [v[i], v[q]];
      i = q;
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

// 16 directions: 4 straight, 4 diagonal, 8 knight moves
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
].map(([di, dj]) => ({ di, dj, len: Math.hypot(di, dj) }));

/** Extra cost factor of entering cell k: 1 within limits, Infinity (hard) or 1 + over × excess (soft). */
function overFactor(trav, k, w, soft) {
  if (!trav.blocked[k]) return 1;
  return soft ? 1 + (w.over ?? 60) * (trav.excess?.[k] ?? 1) : Infinity;
}

/** Cost of a straight segment between two cells (Infinity if it crosses a blocked cell, unless soft). */
function segmentCost(grid, trav, a, b, p, w, soft = false) {
  const { size, data, cell } = grid;
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
  let cost = 0;
  let pi = a[0];
  let pj = a[1];
  for (let s = 1; s <= n; s++) {
    const x = a[0] + ((b[0] - a[0]) * s) / n;
    const y = a[1] + ((b[1] - a[1]) * s) / n;
    const i = Math.round(x);
    const j = Math.round(y);
    if (i < 0 || j < 0 || i >= size || j >= size) return Infinity;
    const k = j * size + i;
    const over = overFactor(trav, k, w, soft);
    if (over === Infinity) return Infinity;
    const run = Math.hypot(x - pi, y - pj) * cell;
    const k0 = Math.round(pj) * size + Math.round(pi);
    cost += stepCost(run, data[k] - data[k0], trav.risk[k], p, w) * over;
    pi = x;
    pj = y;
  }
  return cost;
}

/**
 * A* (16-connected) from start to goal, then string-pulled.
 * soft: least-exposure search — over-limit cells are allowed at a steep,
 * profile-dependent price (used when no fully safe path exists).
 * @param {keyof PROFILES} [priority]
 * @param {{soft?:boolean}} [opts]
 * @returns {null | {cells:[number,number][], corners:[number,number][], seconds:number, cost:number, overM:number, soft:boolean}}
 */
export function findPath(grid, trav, start, goal, p = DEFAULT_EVA, priority = p.priority || 'safety', opts = {}) {
  const { size, data, cell } = grid;
  const soft = !!opts.soft;
  const w = PROFILES[priority] || PROFILES.safety;
  const inside = (q) => q[0] >= 0 && q[1] >= 0 && q[0] < size && q[1] < size;
  const s = soft ? (inside(start) ? start : null) : nearestFree(trav, start[0], start[1]);
  const g = soft ? (inside(goal) ? goal : null) : nearestFree(trav, goal[0], goal[1]);
  if (!s || !g) return null;
  const N = size * size;
  const cost = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const startK = s[1] * size + s[0];
  const goalK = g[1] * size + g[0];
  // admissible heuristic: fastest speed, no extra effort, no risk
  const vmax = p.mode === 'rover' ? p.roverSpeed : p.walkSpeed * 1.2;
  const perMetre = w.time / vmax;
  const heur = (k) => Math.hypot((k % size) - g[0], Math.floor(k / size) - g[1]) * cell * perMetre;
  const risk = trav.risk || trav.penalty.map((x) => x - 1);
  cost[startK] = 0;
  const open = new MinHeap();
  open.push(heur(startK), startK);
  while (open.size) {
    const k = open.pop();
    if (closed[k]) continue;
    if (k === goalK) break;
    closed[k] = 1;
    const i = k % size;
    const j = (k - i) / size;
    for (const { di, dj, len } of DIRS) {
      const x = i + di;
      const y = j + dj;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const n = y * size + x;
      if (closed[n]) continue;
      let over = overFactor(trav, n, w, soft);
      if (over === Infinity) continue;
      let r = risk[n];
      if (len > 1.5) {
        // knight move: also crosses two intermediate cells
        const ma = (j + Math.floor(dj / 2)) * size + (i + Math.floor(di / 2));
        const mb = (j + Math.ceil(dj / 2)) * size + (i + Math.ceil(di / 2));
        const oa = overFactor(trav, ma, w, soft);
        const ob = overFactor(trav, mb, w, soft);
        if (oa === Infinity || ob === Infinity) continue;
        r = (r + risk[ma] + risk[mb]) / 3;
        over = (over + oa + ob) / 3;
      }
      const c = cost[k] + stepCost(len * cell, data[n] - data[k], r, p, w) * over;
      if (c < cost[n]) {
        cost[n] = c;
        from[n] = k;
        open.push(c + heur(n), n);
      }
    }
  }
  if (from[goalK] === -1 && goalK !== startK) return null;
  const raw = [];
  for (let k = goalK; k !== -1; k = from[k]) {
    raw.push([k % size, Math.floor(k / size)]);
    if (k === startK) break;
  }
  raw.reverse();
  const corners = pullString(grid, trav, raw, p, w, soft);
  const cells = densify(corners);
  const b = pathBreakdown(grid, trav, cells, p, priority);
  return { cells, corners, seconds: b.seconds, cost: b.cost, overM: b.blocked, soft };
}

/**
 * String pulling: from each corner, jump to the farthest later path cell
 * reachable in a straight, unblocked segment that costs no more than the
 * path it replaces (+3 %). Removes grid zigzags and needless bends.
 */
export function pullString(grid, trav, cells, p = DEFAULT_EVA, w = PROFILES.safety, soft = false) {
  if (cells.length < 3) return cells.slice();
  // cumulative cost along the A* path
  const { size, data, cell } = grid;
  const cum = [0];
  for (let q = 1; q < cells.length; q++) {
    const [i0, j0] = cells[q - 1];
    const [i1, j1] = cells[q];
    const k0 = j0 * size + i0;
    const k1 = j1 * size + i1;
    cum.push(
      cum[q - 1] + stepCost(Math.hypot(i1 - i0, j1 - j0) * cell, data[k1] - data[k0], trav.risk[k1], p, w) * overFactor(trav, k1, w, soft)
    );
  }
  const out = [cells[0]];
  let a = 0;
  const WINDOW = 400;
  while (a < cells.length - 1) {
    let next = a + 1;
    for (let b = Math.min(cells.length - 1, a + WINDOW); b > a + 1; b--) {
      const c = segmentCost(grid, trav, cells[a], cells[b], p, w, soft);
      if (c <= (cum[b] - cum[a]) * 1.03) {
        next = b;
        break;
      }
    }
    out.push(cells[next]);
    a = next;
  }
  return out;
}

/** Contiguous cells along a list of corners. */
export function densify(corners) {
  const out = [];
  for (let q = 0; q < corners.length - 1; q++) {
    const seg = straightCells(corners[q], corners[q + 1]);
    if (q) seg.shift();
    out.push(...seg);
  }
  return out.length ? out : corners.slice();
}

/**
 * How much each factor weighs along a cell path: metres spent in each risk
 * factor (weighted by its intensity), climb, time, cost and blocked metres.
 */
export function pathBreakdown(grid, trav, cells, p = DEFAULT_EVA, priority = p.priority || 'safety') {
  const { size, data, cell } = grid;
  const w = PROFILES[priority] || PROFILES.safety;
  const names = Object.keys(trav.factors);
  const out = { length: 0, climb: 0, cost: 0, blocked: 0, seconds: 0, maxSlopeRisk: 0, factors: {} };
  for (const name of names) out.factors[name] = 0;
  for (let q = 1; q < cells.length; q++) {
    const [i0, j0] = cells[q - 1];
    const [i1, j1] = cells[q];
    if (i1 < 0 || j1 < 0 || i1 >= size || j1 >= size || i0 < 0 || j0 < 0 || i0 >= size || j0 >= size) continue;
    const a = j0 * size + i0;
    const b = j1 * size + i1;
    const run = Math.hypot(i1 - i0, j1 - j0) * cell;
    if (!run) continue;
    const rise = data[b] - data[a];
    out.length += run;
    if (rise > 0) out.climb += rise;
    out.cost += stepCost(run, rise, trav.risk[b], p, w);
    out.seconds += Math.hypot(run, rise) / stepModel((Math.atan2(rise, run) * 180) / Math.PI, p).speed;
    if (trav.blocked[b]) out.blocked += run;
    for (const name of names) out.factors[name] += trav.factors[name][b] * run;
  }
  return out;
}

/** Cells of the straight segment between two cells. */
export function straightCells(a, b) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
  const out = [];
  for (let k = 0; k <= n; k++) out.push([Math.round(a[0] + ((b[0] - a[0]) * k) / n), Math.round(a[1] + ((b[1] - a[1]) * k) / n)]);
  return out;
}

/** Simplify a cell path (Ramer–Douglas–Peucker) to fewer vertices. */
export function simplifyPath(points, tolerance = 1) {
  if (points.length < 3) return points;
  const sq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  function segDist(q, a, b) {
    const l = sq(a, b);
    if (!l) return sq(q, a);
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / l));
    return sq(q, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
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
