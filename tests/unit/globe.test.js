import { describe, it, expect } from 'vitest';
import {
  tileBounds,
  ancestorAt,
  childrenOf,
  terrainLevelFor,
  sampleMeshGrid,
  sampleTileGrid,
  gridSlopes,
  needsRefine,
} from '../../src/geo/tileHeights.js';
import { legGridSpec, midpoint, routeSequence, pointAlong, rangeRadius } from '../../src/planner/route.js';
import { DEFAULT_EVA, pointOfNoReturn, evaluateRoute, o2Capacity } from '../../src/planner/eva.js';
import { chunkOf, chunksAround, CHUNK } from '../../src/traverse/chunks.js';
import { maxTiltForRange } from '../../src/orbit/globeControls.js';
import { createGrid, rasterizeTile } from '../../src/geo/heightGrid.js';

/** Flat quantized-mesh tile (two triangles) with a height ramp west → east. */
function rampMesh(minH, maxH) {
  return {
    minHeight: minH,
    maxHeight: maxH,
    u: new Uint16Array([0, 32767, 0, 32767]),
    v: new Uint16Array([0, 0, 32767, 32767]),
    h: new Uint16Array([0, 32767, 0, 32767]),
    indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
  };
}

describe('globe tiles', () => {
  it('tile bounds follow the Mars Trek geographic tiling', () => {
    expect(tileBounds(0, 0, 0)).toEqual({ west: -180, east: 0, south: -90, north: 90 });
    expect(tileBounds(1, 3, 1)).toEqual({ west: 90, east: 180, south: 0, north: 90 });
  });

  it('children cover the parent and point back to it', () => {
    for (const c of childrenOf(5, 10, 7)) expect(ancestorAt(c.z, c.x, c.y, 5)).toEqual({ z: 5, x: 10, y: 7 });
  });

  it('picks the finest available terrain level', () => {
    const available = [
      [{ startX: 0, endX: 1, startY: 0, endY: 0 }],
      [{ startX: 0, endX: 3, startY: 0, endY: 1 }],
      [{ startX: 2, endX: 2, startY: 1, endY: 1 }],
    ];
    expect(terrainLevelFor(available, 4, 9, 5)).toBe(2); // ancestor at z2 is (2,1)
    expect(terrainLevelFor(available, 4, 0, 0)).toBe(1);
  });

  it('re-samples an ancestor mesh exactly (edges shared between children)', () => {
    const src = tileBounds(3, 4, 2);
    const mesh = rampMesh(1000, 2000);
    const [sw, se] = childrenOf(3, 4, 2);
    const a = sampleMeshGrid(mesh, src, tileBounds(sw.z, sw.x, sw.y), 8, 1000);
    const b = sampleMeshGrid(mesh, src, tileBounds(se.z, se.x, se.y), 8, 1000);
    // east edge of the west child == west edge of the east child
    for (let j = 0; j <= 8; j++) expect(a[j * 9 + 8]).toBeCloseTo(b[j * 9], 6);
    // ramp: 0 m at the west edge of the parent, 500 m at the middle, 1000 m at the east
    expect(a[0]).toBeCloseTo(0, 3);
    expect(a[8]).toBeCloseTo(500, 3);
    expect(b[8]).toBeCloseTo(1000, 3);
    const bb = tileBounds(sw.z, sw.x, sw.y);
    expect(sampleTileGrid(a, 8, bb, (bb.north + bb.south) / 2, (bb.west + bb.east) / 2)).toBeCloseTo(250, 3);
  });

  it('slope of a flat grid is zero and grows with relief', () => {
    const b = tileBounds(12, 100, 100);
    const flat = new Float32Array(81).fill(5);
    expect(Math.max(...gridSlopes(flat, 8, b, 3396190))).toBeCloseTo(0, 6);
    const steep = sampleMeshGrid(rampMesh(0, 500), b, b, 8);
    expect(Math.max(...gridSlopes(steep, 8, b, 3396190))).toBeGreaterThan(5);
  });

  it('refines a tile when one texel spans more than ~1.4 px', () => {
    expect(needsRefine(1, 100, 1000, Math.PI / 4)).toBe(false);
    expect(needsRefine(1, 0.5, 1000, Math.PI / 4)).toBe(true);
  });

  it('tilt is only allowed close to the ground', () => {
    expect(maxTiltForRange(8000e3)).toBe(0);
    expect(maxTiltForRange(5e3)).toBeGreaterThan(80);
  });

  it('rasterizes a patch around a shifted centre', () => {
    const origin = { lat: 0, lon: 0 };
    const tile = { z: 14, x: 16384, y: 8192 }; // touches (0°, 0°) from the north-east
    const grid = createGrid(5, 10);
    rasterizeTile(grid, rampMesh(0, 0), tile, origin, 0, { e: 200, n: 200 });
    expect(grid.data.some((v) => !Number.isNaN(v))).toBe(true);
  });
});

describe('routes between any points', () => {
  it('sizes each leg grid to the leg', () => {
    const short = legGridSpec(300);
    const long = legGridSpec(200e3);
    expect(short.cell).toBeLessThan(2.5);
    expect(long.cell).toBeGreaterThan(300);
    expect(long.sizeM).toBeGreaterThan(200e3);
  });

  it('midpoint handles the antimeridian', () => {
    const m = midpoint({ lat: 0, lon: 179 }, { lat: 2, lon: -179 });
    expect(m.lat).toBeCloseTo(1);
    expect(Math.abs(m.lon)).toBeCloseTo(180);
  });

  it('returns to the base when asked', () => {
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 },
    ];
    expect(routeSequence(pts, true)).toHaveLength(3);
    expect(routeSequence(pts, false)).toHaveLength(2);
  });

  it('interpolates along a path', () => {
    const path = [
      { lat: 0, lon: 0, h: 0, d: 0 },
      { lat: 0, lon: 1, h: 100, d: 1000 },
    ];
    const p = pointAlong(path, 250);
    expect(p.lon).toBeCloseTo(0.25);
    expect(p.h).toBeCloseTo(25);
    expect(pointAlong(path, 5000).d).toBe(1000);
  });

  it('range ring grows with O₂ autonomy', () => {
    expect(rangeRadius({ ...DEFAULT_EVA, o2HoursAt300W: 10 })).toBeGreaterThan(rangeRadius(DEFAULT_EVA));
  });

  it('linear point of no return matches the out-and-back O₂ budget', () => {
    const profile = Array.from({ length: 400 }, (_, i) => ({ d: i * 50, h: Math.sin(i / 20) * 30 }));
    const pnr = pointOfNoReturn(profile);
    const usable = o2Capacity() * (1 - DEFAULT_EVA.reservePct / 100);
    const out = profile.filter((s) => s.d <= pnr);
    const back = out
      .slice()
      .reverse()
      .map((s, k, arr) => ({ d: arr[0].d - s.d, h: s.h }));
    expect(evaluateRoute(out).o2Kg + evaluateRoute(back).o2Kg).toBeLessThanOrEqual(usable + 1e-9);
    expect(pnr).toBeGreaterThan(0);
  });
});

describe('first-person chunks', () => {
  it('indexes chunks around the walker, nearest first', () => {
    expect(chunkOf(0, 0)).toEqual({ i: 0, j: 0 });
    expect(chunkOf(CHUNK, -CHUNK)).toEqual({ i: 1, j: 1 }); // z = −north
    const around = chunksAround(10, 10, 2.6);
    expect(around[0]).toMatchObject({ i: 0, j: 0 });
    expect(around.length).toBeGreaterThan(15);
    expect(around.every((c, k) => k === 0 || c.d >= around[k - 1].d)).toBe(true);
  });
});

describe('first-person realism models', async () => {
  const { dustTau, hazeDistance, airTemperature } = await import('../../src/traverse/traverse.js');
  const { smallRocks } = await import('../../src/traverse/chunks.js');
  const { layerForBox } = await import('../../src/traverse/horizon.js');

  it('dust is thicker in the perihelion season and the haze closes in', () => {
    expect(dustTau(255)).toBeGreaterThan(dustTau(70));
    expect(hazeDistance(dustTau(255))).toBeLessThan(hazeDistance(dustTau(70)));
  });

  it('air temperature follows the day between the MEDA min and max', () => {
    expect(airTemperature(-80, -20, 13.5)).toBeCloseTo(-20);
    expect(airTemperature(-80, -20, 1.5)).toBeCloseTo(-80);
  });

  it('small rocks are many, small and inside the chunk', () => {
    const list = smallRocks({ e: 0, n: 0 }, 7, 20, true);
    expect(list.length).toBeGreaterThan(300);
    expect(list.every((r) => r.d >= 0.05 && r.d <= 0.5 && Math.abs(r.x) <= CHUNK / 2 && Math.abs(r.z) <= CHUNK / 2)).toBe(true);
    const small = list.filter((r) => r.d < 0.1).length;
    expect(small / list.length).toBeGreaterThan(0.5); // power law: most rocks are small
  });

  it('the far ring uses the sharpest image that covers it', () => {
    expect(layerForBox({ west: 77.4, east: 77.5, south: 18.4, north: 18.5 }).id).toBe('hiriseJezero');
    expect(layerForBox({ west: 10, east: 11, south: 0, north: 1 }).id).toBe('themisDay');
    expect(layerForBox({ west: 10, east: 11, south: 70, north: 71 }).id).toBe('viking');
  });
});
