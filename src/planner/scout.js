/**
 * Science scouting: choose a base inside a zone, pick the science stops that
 * match an objective, order them into a walk, and measure how much of the
 * objective the route covers.
 *
 * Pure functions (unit-tested); the terrain grid comes from planner/site.js.
 */
import { distanceM, toLatLon } from '../geo/mars.js';
import { toMetres } from '../geo/heightGrid.js';
import { landability } from '../game/landability.js';

/**
 * Best landing/base point inside a terrain grid: flat, smooth, low and not
 * rocky, with the worst slope of the neighbourhood kept under a limit.
 * @param {{grid:any, slope:Float32Array, roughness:Float32Array, origin:{lat:number,lon:number}, resolutionM?:number}} site
 * @param {{maxSlopeDeg?:number, step?:number}} [opts]
 */
export function bestBasePoint(site, opts = {}) {
  const { grid, slope, roughness } = site;
  const maxSlopeDeg = opts.maxSlopeDeg ?? 12;
  const step = opts.step ?? 2;
  const size = grid.size;
  let best = null;
  for (let j = 1; j < size - 1; j += step) {
    for (let i = 1; i < size - 1; i += step) {
      const k = j * size + i;
      const elev = grid.data[k];
      const s = slope[k];
      if (!Number.isFinite(elev) || !Number.isFinite(s)) continue;
      let localMax = s;
      let rough = 0;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const kk = (j + dj) * size + (i + di);
          if (Number.isFinite(slope[kk])) localMax = Math.max(localMax, slope[kk]);
          if (Number.isFinite(roughness[kk])) {
            rough += roughness[kk];
            n++;
          }
        }
      }
      rough = n ? rough / n : 0;
      if (localMax > maxSlopeDeg * 1.5) continue;
      // Prefer flat/smooth; elevation below ~ -1 km helps the atmosphere.
      const cost = localMax * 2 + rough * 4 + Math.max(0, elev + 1000) * 0.0005;
      if (!best || cost < best.cost) {
        const m = toMetres(grid, i, j);
        const ll = toLatLon(m.e, m.n, site.origin);
        best = {
          cost,
          i,
          j,
          e: m.e,
          n: m.n,
          lat: ll.lat,
          lon: ll.lon,
          elevationM: elev,
          maxSlopeDeg: localMax,
          meanSlopeDeg: s,
          roughnessM: rough,
        };
      }
    }
  }
  if (!best) return null;
  const land = landability({
    elevationM: best.elevationM,
    maxSlopeDeg: best.maxSlopeDeg,
    meanSlopeDeg: best.meanSlopeDeg,
    roughnessM: best.roughnessM,
    latitude: best.lat,
  });
  return { ...best, landability: land, resolutionM: site.resolutionM ?? null };
}

/**
 * Targets that can serve an objective from a base, within a range.
 * @param {{targets:Array, objective:{targetKinds:string[]}, base:{lat:number,lon:number}, maxRadiusM?:number}} input
 */
export function eligibleTargets({ targets, objective, base, maxRadiusM = 12000 }) {
  const kinds = new Set(objective?.targetKinds || []);
  return (targets || [])
    .filter((t) => (t.kinds || []).some((k) => kinds.has(k)))
    .map((t) => ({ ...t, distanceM: distanceM(base.lat, base.lon, t.lat, t.lon) }))
    .filter((t) => t.distanceM > 0.1 && t.distanceM <= maxRadiusM && t.value > 0.4)
    .sort((a, b) => b.value - a.value || a.distanceM - b.distanceM);
}

/**
 * Pick the stops that best serve an objective.
 * @param {{
 *   targets:Array<{id:string,name:string,lat:number,lon:number,value:number,kinds:string[]}>,
 *   objective: {targetKinds:string[]},
 *   base:{lat:number,lon:number},
 *   maxStops?:number, maxRadiusM?:number
 * }} input
 */
export function selectTargets({ targets, objective, base, maxStops = 4, maxRadiusM = 12000 }) {
  const kinds = new Set(objective?.targetKinds || []);
  const candidates = eligibleTargets({ targets, objective, base, maxRadiusM });
  if (!candidates.length) return [];
  // One target per primary kind first, so the route is not four copies of the same task.
  const picked = [];
  const usedKinds = new Set();
  for (const t of candidates) {
    const primary = (t.kinds || []).find((k) => kinds.has(k));
    if (primary && !usedKinds.has(primary)) {
      picked.push(t);
      usedKinds.add(primary);
      if (picked.length >= maxStops) return picked;
    }
  }
  for (const t of candidates) {
    if (picked.length >= maxStops) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked;
}

/** Greedy nearest-neighbour order, improved with 2-opt (open path). */
export function sequenceStops(base, stops) {
  if (stops.length <= 1) return stops.slice();
  const left = stops.slice();
  const order = [];
  let cur = base;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = distanceM(cur.lat, cur.lon, left[i].lat, left[i].lon);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    cur = left.splice(bi, 1)[0];
    order.push(cur);
  }
  // 2-opt on the open path from the base.
  const pts = [base, ...order];
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < pts.length - 1; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i - 1];
        const b = pts[i];
        const c = pts[j];
        const d = pts[j + 1];
        const before = distanceM(a.lat, a.lon, b.lat, b.lon) + (d ? distanceM(c.lat, c.lon, d.lat, d.lon) : 0);
        const after = distanceM(a.lat, a.lon, c.lat, c.lon) + (d ? distanceM(b.lat, b.lon, d.lat, d.lon) : 0);
        if (after + 1 < before) {
          const seg = pts.slice(i, j + 1).reverse();
          pts.splice(i, j - i + 1, ...seg);
          improved = true;
        }
      }
    }
  }
  return pts.slice(1);
}

/**
 * Fraction of the best possible science (top maxStops targets) that a route
 * actually visits. 1.0 when the route takes every best target.
 */
export function scienceCoverage(selected, available, maxStops = 4) {
  const best = (available || [])
    .map((t) => Math.max(0, Number(t.value) || 0))
    .sort((a, b) => b - a)
    .slice(0, maxStops)
    .reduce((s, v) => s + v, 0);
  if (best <= 0) return 0;
  const got = (selected || []).reduce((s, t) => s + Math.max(0, Number(t.value) || 0), 0);
  return Math.min(1, got / best);
}

/**
 * Build the route points for a scientific Marswalk.
 * @returns {{points:Array, potential:number, coverage:number, targets:Array}}
 */
export function buildSciencePlan({ site, targets, objective, maxStops = 4, maxRadiusM = 12000 }) {
  const base = { lat: site.lat, lon: site.lon, h: site.elevationM, label: site.name, base: true };
  const picked = selectTargets({ targets, objective, base, maxStops, maxRadiusM });
  const ordered = sequenceStops(base, picked);
  const points = [
    base,
    ...ordered.map((t) => ({
      lat: t.lat,
      lon: t.lon,
      h: t.h,
      science: true,
      value: t.value,
      targetId: t.id,
      label: t.name,
      kinds: t.kinds,
      minutes: 20,
    })),
  ];
  // Coverage is measured against the best targets that this mode can reach,
  // so a walking plan is not penalised for a delta 15 km away.
  const eligible = eligibleTargets({ targets, objective, base, maxRadiusM });
  const potential = eligible
    .map((t) => Math.max(0, Number(t.value) || 0))
    .sort((a, b) => b - a)
    .slice(0, maxStops)
    .reduce((s, v) => s + v, 0);
  return { points, potential, coverage: scienceCoverage(ordered, eligible, maxStops), targets: ordered };
}
