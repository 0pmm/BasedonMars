import { describe, it, expect } from 'vitest';
import { createGrid, slopeMap, roughnessMap } from '../../src/geo/heightGrid.js';
import { buildTraversability, findPath, pathBreakdown, straightCells, stepCost, PRIORITIES } from '../../src/planner/routing.js';
import { DEFAULT_EVA } from '../../src/planner/eva.js';
import { meshSlopeRaster, tileBounds } from '../../src/geo/tileHeights.js';

/** 200×200 grid (2 m cells) with a round hill in the middle. */
function hill(H, sigma = 30) {
  const n = 200;
  const g = createGrid(n, 2);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) g.data[j * n + i] = H * Math.exp(-((i - 100) ** 2 + (j - 100) ** 2) / (2 * sigma * sigma));
  return g;
}
const maxH = (g, cells) => Math.max(...cells.map(([i, j]) => g.data[j * g.size + i]));

describe('smarter routes', () => {
  it('goes AROUND a hill even when its slope is under the suit limit', () => {
    const g = hill(20); // max slope ~11°, under the 15° limit
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [], DEFAULT_EVA);
    const path = findPath(g, trav, [20, 100], [180, 100], DEFAULT_EVA);
    expect(maxH(g, path.cells)).toBeLessThan(5); // stays at the foot of the hill
    const direct = pathBreakdown(g, trav, straightCells([20, 100], [180, 100]), DEFAULT_EVA);
    const chosen = pathBreakdown(g, trav, path.cells, DEFAULT_EVA);
    expect(chosen.cost).toBeLessThan(direct.cost);
    expect(chosen.climb).toBeLessThan(direct.climb);
    expect(chosen.length).toBeGreaterThan(direct.length); // longer but cheaper
  });

  it('the "speed" priority accepts more climbing than "safety"', () => {
    const g = hill(14);
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [], DEFAULT_EVA);
    const safe = findPath(g, trav, [20, 100], [180, 100], DEFAULT_EVA, 'safety');
    const fast = findPath(g, trav, [20, 100], [180, 100], DEFAULT_EVA, 'fast');
    expect(maxH(g, fast.cells)).toBeGreaterThanOrEqual(maxH(g, safe.cells));
    expect(fast.cells.length).toBeLessThanOrEqual(safe.cells.length);
  });

  it('uphill steps cost more than flat ones, risky cells more than safe ones', () => {
    expect(stepCost(10, 2, 0)).toBeGreaterThan(stepCost(10, 0, 0));
    expect(stepCost(10, 0, 1)).toBeGreaterThan(stepCost(10, 0, 0));
    expect(PRIORITIES.safety.risk).toBeGreaterThan(PRIORITIES.fast.risk);
  });

  it('keeps away from boulders (halo) and avoids loose ground and radio shadows', () => {
    const g = createGrid(40, 1);
    g.data.fill(0);
    const sand = new Float32Array(40 * 40);
    for (let j = 15; j < 25; j++) for (let i = 0; i < 40; i++) sand[j * 40 + i] = 1;
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [{ e: 0, n: 10, d: 1 }], DEFAULT_EVA, { sand });
    expect(trav.factors.rocks.some((v) => v > 0)).toBe(true);
    expect(trav.risk[20 * 40 + 5]).toBeGreaterThan(trav.risk[5 * 40 + 5]);
    // a corridor of loose ground along the straight line is avoided when there is room
    const path = findPath(g, trav, [2, 20], [37, 20], DEFAULT_EVA);
    const inSand = path.cells.filter(([i, j]) => sand[j * 40 + i] > 0).length;
    expect(inSand).toBeLessThan(path.cells.length);
  });
});

describe('route profiles really differ', () => {
  // a 140 m mountain (flanks over the suit limit) between the points, and a low ridge
  const n = 240;
  const g = createGrid(n, 4);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      g.data[j * n + i] =
        140 * Math.exp(-((i - 120) ** 2 + (j - 125) ** 2) / (2 * 28 * 28)) +
        25 * Math.exp(-((j - 70) ** 2) / (2 * 10 * 10)) * (i > 60 && i < 190 ? 1 : 0.2);
  const slope = slopeMap(g);
  const run = (priority) => {
    const p = { ...DEFAULT_EVA, priority };
    const trav = buildTraversability(g, slope, roughnessMap(g), [], p);
    const path = findPath(g, trav, [20, 120], [220, 130], p);
    const b = pathBreakdown(g, trav, path.cells, p);
    return { ...b, maxSlope: Math.max(...path.cells.map(([i, j]) => slope[j * n + i])), corners: path.corners.length };
  };
  const fast = run('fast');
  const balanced = run('balanced');
  const safe = run('safety');
  const straight = 200 * 4;

  it('fast is the shortest, safe keeps the gentlest slopes, balanced sits between', () => {
    expect(fast.length).toBeLessThan(balanced.length);
    expect(balanced.length).toBeLessThan(safe.length);
    expect(safe.maxSlope).toBeLessThan(balanced.maxSlope);
    expect(balanced.maxSlope).toBeLessThan(fast.maxSlope);
    expect(safe.climb).toBeLessThan(fast.climb);
  });

  it('goes around the mountain without an oversized loop', () => {
    expect(fast.blocked).toBe(0);
    expect(safe.length).toBeLessThan(straight * 1.5);
  });

  it('string pulling leaves real turns, not a cell staircase', () => {
    expect(safe.corners).toBeLessThan(60);
  });
});

describe('slope seen from far away', () => {
  it('keeps the steep triangle of the NASA mesh in the raster (max, not average)', () => {
    const b = tileBounds(10, 600, 300);
    // flat tile with one very steep triangle
    const mesh = {
      minHeight: 0,
      maxHeight: 4000,
      u: new Uint16Array([0, 32767, 0, 32767, 16000, 17000, 16000]),
      v: new Uint16Array([0, 0, 32767, 32767, 16000, 16000, 17000]),
      h: new Uint16Array([0, 0, 0, 0, 0, 0, 32767]),
      indices: new Uint16Array([0, 1, 2, 1, 3, 2, 4, 5, 6]),
    };
    const r = meshSlopeRaster(mesh, b, b, 64);
    const max = Math.max(...r) / 4;
    expect(max).toBeGreaterThan(40);
    expect(r[0]).toBe(0); // flat corner
  });
});

/** A north–south ridge whose walls are over the limit everywhere except a gentler saddle at row `saddle`. */
function ridge(n = 160, cell = 2, saddle = 30) {
  const g = createGrid(n, cell);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const height = Math.abs(j - saddle) < 6 ? 6 : 40; // 40 m wall, 6 m saddle
      g.data[j * n + i] = height * Math.exp(-((i - n / 2) ** 2) / (2 * 6 * 6));
    }
  return g;
}

describe('no fully safe path (canyon walls, crater rims)', () => {
  it('finds the least-exposure path instead of giving up with a straight line', () => {
    const g = ridge();
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [], DEFAULT_EVA, {}, 'safety');
    const a = [20, 120];
    const b = [140, 120];
    expect(findPath(g, trav, a, b, DEFAULT_EVA, 'safety')).toBeNull(); // the wall blocks every hard path
    const soft = findPath(g, trav, a, b, DEFAULT_EVA, 'safety', { soft: true });
    expect(soft).not.toBeNull();
    expect(soft.soft).toBe(true);
    // crosses at the saddle, not straight over the high wall
    const crossing = soft.cells.find(([i]) => i === 80);
    expect(Math.abs(crossing[1] - 30)).toBeLessThan(8);
    const direct = pathBreakdown(g, trav, straightCells(a, b), DEFAULT_EVA, 'safety');
    expect(soft.overM).toBeLessThan(direct.blocked);
  });

  it('roughness on a coarse grid measures relief, not boulders: it does not block a gentle plain', () => {
    // 300 m cells, rolling terrain with a few tens of metres of relief but slopes of ~1–2°
    const n = 120;
    const g = createGrid(n, 300);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.data[j * n + i] = 30 * Math.sin(i / 7) * Math.cos(j / 9);
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [], DEFAULT_EVA);
    const blockedFrac = trav.blocked.reduce((s, v) => s + v, 0) / trav.blocked.length;
    expect(blockedFrac).toBeLessThan(0.01);
    const path = findPath(g, trav, [5, 60], [115, 60], DEFAULT_EVA);
    expect(path).not.toBeNull();
  });
});
