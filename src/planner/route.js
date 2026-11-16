/**
 * Route between ANY points on Mars, computed on real NASA terrain.
 *
 * Each leg (point → next point) gets its own elevation grid, centred on the
 * leg and sized to it: a 300 m leg is routed on a ~1 m grid (HiRISE DTM
 * where it exists, with boulders detected in the HiRISE image), a 200 km leg
 * on a ~600 m grid (MOLA/HRSC). The A* search minimises walking time while
 * avoiding slopes/roughness/boulders over the suit limits (routing.js). The
 * joined path is then evaluated with the EVA model (eva.js): duration, O₂,
 * point of no return, radio coverage from the base (line of sight), time
 * in shadow, radiation dose and a plan score.
 */
import { toLocal, toLatLon, distanceM, wrapLon } from '../geo/mars.js';
import { sampleHeight, toGrid, toMetres, profileAlong, viewshed, shadowMap } from '../geo/heightGrid.js';
import { sunPosition } from '../geo/mars24.js';
import { loadSite } from './site.js';
import { buildTraversability, findPath, pathBreakdown, straightCells, RISK_WEIGHTS } from './routing.js';
import { findLayer, loadImageryMosaic } from '../geo/trek.js';
import { DEFAULT_EVA, evaluateRoute, pointOfNoReturn, scorePlan, surfaceDoseRate } from './eva.js';

export const MAX_LEG_M = 800e3;

/** Grid size (m) and resolution used for a leg of a given length. */
export function legGridSpec(lengthM) {
  // ~1.1 leg-lengths of room on each side: a detour around a mountain fits in the grid
  const sizeM = Math.max(500, lengthM * 2.2 + 400);
  const cells = Math.round(Math.min(480, Math.max(220, sizeM / 1.2)));
  return { sizeM, cells, cell: sizeM / cells };
}

/** Geographic midpoint of two points (fine for legs < a few hundred km). */
export function midpoint(a, b) {
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return { lat: (a.lat + b.lat) / 2, lon: wrapLon(a.lon + dLon / 2) };
}

/** Sequence of points actually walked (base → stops → base). */
export function routeSequence(points, returnToBase) {
  const seq = points.slice();
  if (returnToBase && points.length > 1) seq.push(points[0]);
  return seq;
}

/**
 * Compute a route.
 * @param {{lat:number, lon:number, minutes?:number, science?:boolean}[]} points first = base
 * @param {{params?:object, returnToBase?:boolean, crew?:number, timeMs?:number, signal?:AbortSignal,
 *          onProgress?:(f:number, text:string)=>void}} opts
 */
export async function computeRoute(points, opts = {}) {
  const p = { ...DEFAULT_EVA, ...(opts.params || {}) };
  const seq = routeSequence(points, opts.returnToBase ?? true);
  if (seq.length < 2) return null;
  const legs = [];
  const progress = (f, text) => opts.onProgress?.(f, text);
  const timeMs = opts.timeMs ?? Date.now();

  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i];
    const b = seq[i + 1];
    const straight = distanceM(a.lat, a.lon, b.lat, b.lon);
    const base = i / (seq.length - 1);
    progress(base, 'terrain');
    if (straight > MAX_LEG_M) {
      legs.push({ a, b, straight, tooLong: true, ok: false, path: [a, b].map((q) => ({ lat: q.lat, lon: q.lon, h: q.h ?? 0 })) });
      continue;
    }
    const spec = legGridSpec(straight);
    const center = midpoint(a, b);
    const site = await loadSite(center, {
      sizeM: spec.sizeM,
      cells: spec.cells,
      imagePx: spec.sizeM <= 1600 ? 2048 : 0,
      rocks: spec.sizeM <= 1600,
      maxTerrainTiles: 220,
      // no signal here: the cached terrain download is shared with later calculations,
      // so cancelling this one must not cancel it (abort is checked after it resolves)
      onProgress: (stage, f) => progress(base + (f / (seq.length - 1)) * 0.9, stage),
    });
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    // Extra cost layers: loose ground (THEMIS night IR), radio line of sight to the base, shadow now
    const sun = sunPosition(timeMs, center.lat, center.lon);
    const shadow = shadowMap(site.grid, sun.azimuth, sun.elevation);
    const sand = await looseGround(site);
    const baseL = toLocal(points[0].lat, points[0].lon, center);
    const inGrid = Math.abs(baseL.e) < site.grid.half && Math.abs(baseL.n) < site.grid.half;
    const vis = inGrid ? viewshed(site.grid, baseL, p.commsMastHeight, 1.8) : null;
    const trav = buildTraversability(site.grid, site.slope, site.roughness, site.rocks, p, { sand, vis, shadow });
    const la = toLocal(a.lat, a.lon, center);
    const lb = toLocal(b.lat, b.lon, center);
    const ga = toGrid(site.grid, la.e, la.n);
    const gb = toGrid(site.grid, lb.e, lb.n);
    const ca = [Math.round(ga.x), Math.round(ga.y)];
    const cb = [Math.round(gb.x), Math.round(gb.y)];
    // a path fully within the limits; if none exists, the least-exposure path
    // (goes around everything it can, crosses the shortest/gentlest over-limit stretch)
    const found = findPath(site.grid, trav, ca, cb, p) || findPath(site.grid, trav, ca, cb, p, undefined, { soft: true });
    // what the planner avoided: the same leg in a straight line
    const chosen = found ? pathBreakdown(site.grid, trav, found.cells, p) : null;
    const direct = pathBreakdown(site.grid, trav, straightCells(ca, cb), p);
    let local;
    if (found) {
      // the string-pulled corners: every segment between them was checked against the cost map
      // (a generic simplification could cut a corner through forbidden ground)
      local = found.corners.map(([x, y]) => toMetres(site.grid, x, y));
      local[0] = la;
      local[local.length - 1] = lb;
    } else local = [la, lb];
    const prof = profileAlong(site.grid, local, site.grid.cell);
    // slope + shadow along the leg, and which samples are over the limits
    let maxSlope = 0;
    let shaded = 0;
    const size = site.grid.size;
    const over = new Uint8Array(prof.length);
    prof.forEach((s, q) => {
      const g = toGrid(site.grid, s.e, s.n);
      const k = Math.min(size - 1, Math.max(0, Math.round(g.y))) * size + Math.min(size - 1, Math.max(0, Math.round(g.x)));
      maxSlope = Math.max(maxSlope, site.slope[k]);
      if (shadow[k]) shaded++;
      if (trav.blocked[k]) over[q] = 1;
    });
    legs.push({
      a,
      b,
      straight,
      ok: !!found,
      // metres over the limits on this leg (only when no fully safe path exists)
      overM: found?.soft ? found.overM : 0,
      site,
      center,
      cell: site.grid.cell,
      terrainLevel: site.terrainInfo.level,
      rocks: site.rocks.length,
      maxSlope,
      chosen,
      direct,
      layers: { sand: !!sand, comms: !!vis, rocks: site.rocks.length > 0 },
      shaded,
      samples: prof.length,
      path: prof.map((s, q) => ({ ...toLatLon(s.e, s.n, center), h: s.h, dLeg: s.d, over: !!over[q] })),
      corners: local.map((q) => ({ ...toLatLon(q.e, q.n, center), h: sampleHeight(site.grid, q.e, q.n) })),
    });
  }

  // Join the legs into one path with cumulative distance
  const path = [];
  const stopD = [];
  let dist = 0;
  for (const leg of legs) {
    const pts = leg.path;
    for (let k = 0; k < pts.length; k++) {
      if (path.length && k === 0) continue;
      const prev = path[path.length - 1];
      if (prev) dist += distanceM(prev.lat, prev.lon, pts[k].lat, pts[k].lon);
      path.push({ lat: pts[k].lat, lon: pts[k].lon, h: pts[k].h, d: dist, over: !!pts[k].over });
    }
    stopD.push(dist);
  }
  const profile = path.map((q) => ({ d: q.d, h: q.h }));
  const returnToBase = (opts.returnToBase ?? true) && points.length > 1;
  const stops = points.slice(1).map((s, i) => ({ d: stopD[i] ?? dist, minutes: s.minutes ?? p.stopMinutes }));
  const evaluation = evaluateRoute(profile, stops, p);
  const lastStop = stops.length ? stops[stops.length - 1].d : dist;
  const outbound = returnToBase ? profile.filter((x) => x.d <= lastStop) : profile;
  const pnr = pointOfNoReturn(outbound.length > 1 ? outbound : profile, p);

  // Radio coverage: line of sight from the base antenna
  progress(0.95, 'analysis');
  const baseP = points[0];
  let maxFromBase = 0;
  for (const q of path) maxFromBase = Math.max(maxFromBase, distanceM(baseP.lat, baseP.lon, q.lat, q.lon));
  let coverage = 0;
  let commsRadius = 0;
  try {
    const sizeM = Math.min(40000, Math.max(400, maxFromBase * 2.2));
    const comms = await loadSite(baseP, { sizeM, cells: 260, imagePx: 0, rocks: false, maxTerrainTiles: 160 });
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const vis = viewshed(comms.grid, { e: 0, n: 0 }, p.commsMastHeight, 1.8);
    commsRadius = sizeM / 2;
    let seen = 0;
    for (const q of path) {
      const l = toLocal(q.lat, q.lon, baseP);
      if (Math.abs(l.e) >= sizeM / 2 || Math.abs(l.n) >= sizeM / 2) continue;
      const g = toGrid(comms.grid, l.e, l.n);
      const k = Math.round(g.y) * comms.grid.size + Math.round(g.x);
      if (vis[k]) seen++;
    }
    coverage = path.length ? seen / path.length : 0;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    coverage = 0;
  }

  const maxSlope = Math.max(0, ...legs.map((l) => l.maxSlope || 0));
  const shaded = legs.reduce((s, l) => s + (l.shaded || 0), 0);
  const samples = legs.reduce((s, l) => s + (l.samples || 0), 0);
  const doseMsv = (surfaceDoseRate(baseP.h ?? path[0]?.h ?? 0) * evaluation.totalSeconds) / 86400;
  let straightLine = 0;
  for (let i = 0; i < seq.length - 1; i++) straightLine += distanceM(seq[i].lat, seq[i].lon, seq[i + 1].lat, seq[i + 1].lon);
  // Science coverage: only when the caller knows the objective's full target set.
  const scienceValues = points
    .slice(1)
    .filter((s) => s.science && Number.isFinite(s.value))
    .map((s) => s.value);
  const potential = Number.isFinite(opts.sciencePotential) ? opts.sciencePotential : 0;
  const scienceCoverage =
    potential > 0 && scienceValues.length ? Math.min(1, scienceValues.reduce((a, b) => a + b, 0) / potential) : undefined;
  const score = scorePlan({
    evaluation,
    maxSlope,
    slopeLimit: p.mode === 'rover' ? p.maxSlopeRover : p.maxSlopeWalk,
    commsCoverage: coverage,
    stops: points.length - 1,
    scienceStops: points.slice(1).filter((s) => s.science).length,
    scienceCoverage,
    straightLine,
    doseMsv,
  });
  if ((opts.crew ?? 2) < 2) score.safety = Math.round(score.safety * 0.85);
  score.total = Math.round(score.safety * 0.5 + score.science * 0.3 + score.efficiency * 0.2);
  // Worst-case time back to the base (shelter) from any point
  const total = evaluation.legs.length ? evaluation.legs[evaluation.legs.length - 1].t : 0;
  let shelterS = 0;
  for (const l of evaluation.legs) shelterS = Math.max(shelterS, returnToBase ? Math.min(l.t, total - l.t) : l.t);
  progress(1, 'done');
  return {
    legs,
    path,
    profile,
    stopD,
    evaluation,
    pnr,
    coverage,
    commsRadius,
    maxSlope,
    scienceCoverage,
    shadowPct: samples ? shaded / samples : null,
    doseMsv,
    score,
    shelterS,
    failedLeg: legs.some((l) => !l.ok),
    // no fully safe path: metres of the chosen route vs the straight line over the limits
    overLimitM: legs.reduce((sum, l) => sum + (l.overM || 0), 0),
    directOverM: legs.reduce((sum, l) => sum + (l.overM ? l.direct?.blocked || 0 : 0), 0),
    why: sumBreakdowns(legs),
    tooLong: legs.some((l) => l.tooLong),
    finestCell: Math.min(...legs.map((l) => l.cell || Infinity)),
    coarsestCell: Math.max(...legs.map((l) => l.cell || 0)),
    params: p,
    timeMs,
  };
}

/** Range (m) reachable out-and-back on flat ground with the usable O₂. */
export function rangeRadius(p) {
  const usable = p.o2HoursAt300W * 300 * 0.000247 * (1 - p.reservePct / 100) * (p.mode === 'rover' ? 1.6 : 1);
  const watts = p.mode === 'rover' ? p.restMetabolicW * 0.8 : p.walkMetabolicW;
  const speed = p.mode === 'rover' ? p.roverSpeed : p.walkSpeed;
  return ((usable / (watts * 0.000247)) * 3600 * speed) / 2;
}

/** Position, height and heading along a computed path at distance d. */
export function pointAlong(path, d) {
  if (!path.length) return null;
  if (d <= 0) return { ...path[0], i: 0 };
  let lo = 0;
  let hi = path.length - 1;
  if (d >= path[hi].d) return { ...path[hi], i: hi };
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].d <= d) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const t = (d - a.d) / Math.max(1e-9, b.d - a.d);
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: wrapLon(a.lon + dLon * t), h: a.h + (b.h - a.h) * t, d, i: lo };
}

/** Sum the per-leg breakdowns of the chosen path and of the straight line. */
export function sumBreakdowns(legs) {
  const zero = () => ({
    length: 0,
    climb: 0,
    cost: 0,
    blocked: 0,
    seconds: 0,
    factors: Object.fromEntries(Object.keys(RISK_WEIGHTS).map((k) => [k, 0])),
  });
  const route = zero();
  const direct = zero();
  const layers = { sand: false, comms: false, rocks: false };
  for (const leg of legs) {
    for (const [acc, b] of [
      [route, leg.chosen],
      [direct, leg.direct],
    ]) {
      if (!b) continue;
      for (const k of ['length', 'climb', 'cost', 'blocked', 'seconds']) acc[k] += b[k];
      for (const k of Object.keys(acc.factors)) acc.factors[k] += b.factors[k];
    }
    for (const k of Object.keys(layers)) layers[k] ||= !!leg.layers?.[k];
  }
  return { route, direct, layers };
}

/**
 * Loose ground estimate (0..1 per cell) from the THEMIS night-time infrared
 * mosaic: fine sand and dust (low thermal inertia) cool faster at night and
 * look darker than rock and compact ground around them. Relative to the
 * local median, so only the contrast inside the leg matters. Null when the
 * mosaic does not cover the leg.
 */
async function looseGround(site) {
  try {
    const layer = findLayer('themisNight');
    const b = site.bbox;
    if (!layer || b.south < -64 || b.north > 64) return null;
    const { canvas, loaded } = await loadImageryMosaic(layer, b, { targetPx: Math.min(256, site.grid.size), maxTiles: 16 });
    if (!loaded) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const lum = new Float32Array(width * height);
    for (let i = 0; i < lum.length; i++) lum[i] = data[i * 4 + 3] < 10 ? NaN : data[i * 4];
    const valid = [...lum].filter((v) => !Number.isNaN(v) && v > 2).sort((x, y) => x - y);
    if (valid.length < 4) return null;
    const median = valid[valid.length >> 1];
    const spread = Math.max(6, valid[Math.floor(valid.length * 0.9)] - valid[Math.floor(valid.length * 0.1)]);
    const { size } = site.grid;
    const out = new Float32Array(size * size);
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const v = lum[Math.min(height - 1, Math.floor((j / size) * height)) * width + Math.min(width - 1, Math.floor((i / size) * width))];
        out[j * size + i] = Number.isNaN(v) ? 0 : Math.max(0, Math.min(1, (median - v) / spread));
      }
    return out;
  } catch {
    return null;
  }
}
