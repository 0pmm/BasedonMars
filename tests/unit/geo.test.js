import { describe, it, expect } from 'vitest';
import { toLocal, toLatLon, distanceM, bearingDeg, bboxAround, wrapLon, formatLatLon } from '../../src/geo/mars.js';
import { imageryTileRange, terrainTileRange, tileDeg, maxTerrainLevelAt, terrainTileBounds } from '../../src/geo/tiles.js';
import { decodeQuantizedMesh } from '../../src/geo/quantizedMesh.js';
import {
  createGrid,
  rasterizeTile,
  fillGaps,
  sampleHeight,
  slopeMap,
  roughnessMap,
  contours,
  profileAlong,
  viewshed,
  shadowMap,
  hillshade,
} from '../../src/geo/heightGrid.js';
import {
  marsTime,
  sunPosition,
  localSolarTime,
  missionSol,
  PERSEVERANCE_LANDING_MS,
  seasonKey,
  isDustSeason,
  formatHours,
  sunriseSunset,
} from '../../src/geo/mars24.js';

describe('mars geodesy', () => {
  const origin = { lat: 18.4446, lon: 77.4509 };
  it('round-trips local coordinates', () => {
    const p = toLocal(18.45, 77.46, origin);
    const back = toLatLon(p.e, p.n, origin);
    expect(back.lat).toBeCloseTo(18.45, 6);
    expect(back.lon).toBeCloseTo(77.46, 6);
  });
  it('one degree of latitude is ~59.3 km', () => {
    expect(distanceM(0, 0, 1, 0)).toBeGreaterThan(59000);
    expect(distanceM(0, 0, 1, 0)).toBeLessThan(59500);
  });
  it('bearing east is 90°', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 3);
  });
  it('bbox spans the requested size', () => {
    const b = bboxAround(origin.lat, origin.lon, 1000);
    expect(distanceM(b.south, origin.lon, b.north, origin.lon)).toBeCloseTo(1000, 0);
  });
  it('wraps longitudes and formats coordinates', () => {
    expect(wrapLon(190)).toBeCloseTo(-170);
    expect(formatLatLon(-14.5, -5.5, 1)).toBe('14.5° S, 5.5° W');
  });
});

describe('tile math', () => {
  it('level 0 imagery has two tiles', () => {
    const r = imageryTileRange({ west: -180, east: 180, south: -90, north: 90 }, 0);
    expect([r.c0, r.c1, r.r0, r.r1]).toEqual([0, 1, 0, 0]);
  });
  it('imagery rows grow south, terrain rows grow north', () => {
    const b = { west: 77.4, east: 77.5, south: 18.4, north: 18.5 };
    const img = imageryTileRange(b, 10);
    const ter = terrainTileRange(b, 10);
    expect(img.r0).toBe(Math.floor((90 - 18.5) / tileDeg(10)));
    expect(ter.y0).toBe(Math.floor((18.4 + 90) / tileDeg(10)));
    const tb = terrainTileBounds(10, ter.x0, ter.y0);
    expect(tb.south).toBeLessThanOrEqual(18.4);
  });
  it('finds the deepest available terrain level', () => {
    const available = [[{ startX: 0, endX: 1, startY: 0, endY: 0 }], [{ startX: 2, endX: 2, startY: 1, endY: 1 }]];
    expect(maxTerrainLevelAt(available, 10, 10)).toBe(1);
    expect(maxTerrainLevelAt(available, -60, -170)).toBe(0);
  });
});

/** Build a tiny synthetic quantized-mesh tile: 4 vertices, 2 triangles. */
function makeTile(heights) {
  const n = 4;
  const u = [0, 32767, 0, 32767];
  const v = [0, 0, 32767, 32767];
  const h = heights.map((x) => Math.round(x * 32767));
  const zz = (arr) => {
    let prev = 0;
    return arr.map((x) => {
      const d = x - prev;
      prev = x;
      return (d << 1) ^ (d >> 31);
    });
  };
  const idx = [0, 1, 2, 1, 3, 2];
  // high-water-mark encode
  let highest = 0;
  const codes = idx.map((i) => {
    const c = highest - i;
    if (c === 0) highest++;
    return c;
  });
  const bytes = 88 + 4 + n * 6 + 4 + idx.length * 2;
  const buf = new ArrayBuffer(bytes);
  const dv = new DataView(buf);
  dv.setFloat32(24, 100, true);
  dv.setFloat32(28, 200, true);
  dv.setUint32(88, n, true);
  let o = 92;
  for (const arr of [zz(u), zz(v), zz(h)]) for (const x of arr) dv.setUint16(o, x & 0xffff, true), (o += 2);
  dv.setUint32(o, 2, true);
  o += 4;
  for (const c of codes) dv.setUint16(o, c, true), (o += 2);
  return buf;
}

describe('quantized mesh + grid', () => {
  it('decodes vertices, heights and indices', () => {
    const m = decodeQuantizedMesh(makeTile([0, 1, 0, 1]));
    expect(m.minHeight).toBe(100);
    expect(m.maxHeight).toBe(200);
    expect(Array.from(m.u)).toEqual([0, 32767, 0, 32767]);
    expect(Array.from(m.indices)).toEqual([0, 1, 2, 1, 3, 2]);
  });

  it('rasterises a tile into a sloped grid', () => {
    const z = 17;
    const x = 187469;
    const y = 78963;
    const b = terrainTileBounds(z, x, y);
    const origin = { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
    const grid = createGrid(32, 2); // 64 m, inside the ~81 m tile
    rasterizeTile(grid, decodeQuantizedMesh(makeTile([0, 1, 0, 1])), { z, x, y }, origin, 100);
    fillGaps(grid);
    // Height rises from west (0) to east (100) across the tile
    expect(sampleHeight(grid, 20, 0)).toBeGreaterThan(sampleHeight(grid, -20, 0));
    expect(sampleHeight(grid, 0, 0)).toBeCloseTo(50, 0);
  });
});

function rampGrid(size = 40, cell = 1, slope = 0.1) {
  const g = createGrid(size, cell);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) g.data[j * size + i] = i * cell * slope;
  return g;
}

describe('terrain analysis', () => {
  it('slope of a 10 % ramp is ~5.7°', () => {
    const s = slopeMap(rampGrid());
    expect(s[20 * 40 + 20]).toBeCloseTo(5.71, 1);
  });
  it('roughness is ~0 on a plane and high on a spike', () => {
    const g = rampGrid();
    expect(roughnessMap(g)[20 * 40 + 20]).toBeLessThan(0.01);
    g.data[20 * 40 + 20] += 5;
    expect(roughnessMap(g)[20 * 40 + 20]).toBeGreaterThan(0.5);
  });
  it('contours cross a ramp', () => {
    const c = contours(rampGrid(), 1);
    expect(c.length).toBeGreaterThan(2);
    expect(c[0].segs.length % 4).toBe(0);
  });
  it('profile follows distance and height', () => {
    const g = rampGrid(40, 1, 0.1);
    const p = profileAlong(g, [
      { e: -10, n: 0 },
      { e: 10, n: 0 },
    ]);
    expect(p[p.length - 1].d).toBeCloseTo(20, 5);
    expect(p[p.length - 1].h - p[0].h).toBeCloseTo(2, 1);
  });
  it('a wall blocks line of sight and casts a shadow', () => {
    const g = createGrid(40, 1);
    g.data.fill(0);
    for (let j = 0; j < 40; j++) g.data[j * 40 + 20] = 30; // north-south wall at i=20
    const vs = viewshed(g, { e: -15, n: 0 }, 2, 1);
    expect(vs[20 * 40 + 5]).toBe(1);
    expect(vs[20 * 40 + 35]).toBe(0);
    const sh = shadowMap(g, 90, 10); // sun in the east, low
    expect(sh[20 * 40 + 15]).toBe(1); // west of the wall is shaded
    expect(sh[20 * 40 + 30]).toBe(0);
    expect(hillshade(g)[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('Mars24 sun and time', () => {
  it('matches the Mars24 worked example (2000-01-06 00:00 UTC)', () => {
    const t = marsTime(Date.UTC(2000, 0, 6, 0, 0, 0));
    expect(t.Ls).toBeCloseTo(277.187, 1);
    expect(t.msd).toBeCloseTo(44795.9998, 2);
  });
  it('the Sun is up at local noon and down at local midnight', () => {
    const base = Date.UTC(2026, 10, 14);
    let noon = null;
    let night = null;
    for (let m = 0; m < 25 * 60 && (!noon || !night); m += 5) {
      const t = base + m * 60000;
      const { ltst } = localSolarTime(t, 77.45);
      if (!noon && Math.abs(ltst - 12) < 0.1) noon = t;
      if (!night && Math.abs(ltst - 0) < 0.1) night = t;
    }
    expect(sunPosition(noon, 18.44, 77.45).elevation).toBeGreaterThan(40);
    expect(sunPosition(night, 18.44, 77.45).elevation).toBeLessThan(-20);
  });
  it('Perseverance sol counter matches NASA (Nov 6 2026 ≈ sol 2031)', () => {
    const sol = missionSol(Date.UTC(2026, 10, 6, 12), PERSEVERANCE_LANDING_MS, 77.45);
    expect(Math.abs(sol - 2031)).toBeLessThanOrEqual(1);
  });
  it('seasons, dust season and formatting', () => {
    expect(seasonKey(10, 18)).toBe('spring');
    expect(seasonKey(10, -18)).toBe('autumn');
    expect(isDustSeason(250)).toBe(true);
    expect(isDustSeason(90)).toBe(false);
    expect(formatHours(13.5)).toBe('13:30');
  });
  it('sunrise is before sunset', () => {
    const r = sunriseSunset(Date.UTC(2026, 10, 14), 18.44, 77.45);
    expect(r.sunrise).toBeGreaterThan(4);
    expect(r.sunset).toBeGreaterThan(r.sunrise);
  });
});
