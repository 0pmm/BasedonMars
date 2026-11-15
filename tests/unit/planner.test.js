import { describe, it, expect } from 'vitest';
import { createGrid, slopeMap, roughnessMap } from '../../src/geo/heightGrid.js';
import {
  DEFAULT_EVA,
  walkingSpeed,
  walkingMetabolic,
  evaluateRoute,
  pointOfNoReturn,
  scorePlan,
  surfaceDoseRate,
  surfacePressure,
  o2Capacity,
} from '../../src/planner/eva.js';
import { buildTraversability, findPath, simplifyPath, nearestFree } from '../../src/planner/routing.js';
import { detectRocks, rockDensity } from '../../src/planner/rocks.js';
import { parseWaypoints, parseRawImages, placeImages, parseWeather, safeImageUrl } from '../../src/geo/missionData.js';

describe('EVA model', () => {
  it('walks slower uphill and burns more energy', () => {
    expect(walkingSpeed(0)).toBeGreaterThan(walkingSpeed(15));
    expect(walkingSpeed(-3)).toBeGreaterThanOrEqual(walkingSpeed(0)); // gentle downhill is fastest (Tobler)
    expect(walkingMetabolic(10)).toBeGreaterThan(walkingMetabolic(0));
  });
  it('evaluates time and O₂ of a flat 1 km walk', () => {
    const profile = Array.from({ length: 101 }, (_, i) => ({ d: i * 10, h: 0 }));
    const ev = evaluateRoute(profile, [{ d: 500 }]);
    expect(ev.length).toBe(1000);
    expect(ev.moveSeconds / 60).toBeGreaterThan(15);
    expect(ev.moveSeconds / 60).toBeLessThan(25);
    expect(ev.stopSeconds).toBe(DEFAULT_EVA.stopMinutes * 60);
    expect(ev.withinO2).toBe(true);
    expect(ev.o2Kg).toBeLessThan(o2Capacity());
  });
  it('flags a route that exceeds the O₂ budget', () => {
    const profile = Array.from({ length: 401 }, (_, i) => ({ d: i * 100, h: i * 2 }));
    expect(evaluateRoute(profile).withinO2).toBe(false);
  });
  it('point of no return is inside the route', () => {
    const profile = Array.from({ length: 81 }, (_, i) => ({ d: i * 250, h: 0 }));
    const pnr = pointOfNoReturn(profile);
    expect(pnr).toBeGreaterThan(1000);
    expect(pnr).toBeLessThan(20000);
  });
  it('scores plans and environment estimates are sane', () => {
    const ev = evaluateRoute([
      { d: 0, h: 0 },
      { d: 500, h: 5 },
    ]);
    const s = scorePlan({
      evaluation: ev,
      maxSlope: 5,
      slopeLimit: 15,
      commsCoverage: 1,
      stops: 2,
      scienceStops: 2,
      straightLine: 450,
      doseMsv: 0.2,
    });
    expect(s.total).toBeGreaterThan(50);
    expect(s.safety).toBeLessThanOrEqual(100);
    expect(surfaceDoseRate(-4500)).toBeCloseTo(0.64, 2);
    expect(surfaceDoseRate(20000)).toBeGreaterThan(surfaceDoseRate(-4500));
    expect(surfacePressure(-2570, 255)).toBeGreaterThan(700);
  });
});

describe('route planning', () => {
  function bowl(size = 60) {
    const g = createGrid(size, 2);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) g.data[j * size + i] = 0;
    // a steep ridge across the middle with a gap at the bottom
    for (let j = 0; j < size - 8; j++) for (let i = 28; i < 32; i++) g.data[j * size + i] = 20;
    return g;
  }
  it('routes around a steep ridge', () => {
    const g = bowl();
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [], DEFAULT_EVA);
    const path = findPath(g, trav, [5, 5], [55, 5], DEFAULT_EVA);
    expect(path).not.toBeNull();
    const maxJ = Math.max(...path.cells.map((c) => c[1]));
    expect(maxJ).toBeGreaterThan(50); // went through the gap
    expect(simplifyPath(path.cells, 1).length).toBeLessThan(path.cells.length);
  });
  it('returns null when fully blocked and snaps to free cells', () => {
    const g = createGrid(20, 1);
    g.data.fill(0);
    for (let j = 0; j < 20; j++) g.data[j * 20 + 10] = 50;
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [], DEFAULT_EVA);
    expect(findPath(g, trav, [2, 2], [18, 2], DEFAULT_EVA)).toBeNull();
    expect(nearestFree(trav, 10, 5)).not.toBeNull();
  });
  it('boulders block the walk', () => {
    const g = createGrid(20, 1);
    g.data.fill(0);
    const trav = buildTraversability(g, slopeMap(g), roughnessMap(g), [{ e: 0, n: 0, d: 2 }], DEFAULT_EVA);
    expect(trav.blocked[10 * 20 + 10]).toBe(1);
  });
});

describe('rock detection', () => {
  it('finds dark blobs on bright ground', () => {
    const w = 60;
    const h = 60;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 180 + ((i * 7919) % 11) - 5;
      px.set([v, v * 0.7, v * 0.5, 255], i * 4);
    }
    for (const [cx, cy] of [
      [15, 15],
      [40, 30],
    ])
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) px.set([30, 20, 15, 255], ((cy + y) * w + cx + x) * 4);
    const rocks = detectRocks(px, w, h, 0.3);
    expect(rocks.length).toBe(2);
    expect(rocks[0].d).toBeGreaterThan(1);
    expect(rockDensity(rocks, 100, 0.5)).toBe(2);
  });
});

describe('mission feeds parsing', () => {
  it('parses waypoints and places raw images by site/drive', () => {
    const wps = parseWaypoints({
      features: [
        { properties: { sol: 13, site: 3, drive: 0, lat: 18.44, lon: 77.45, elev_geoid: -2569.9, yaw: 130 } },
        { properties: { lat: 'x' } },
      ],
    });
    expect(wps).toHaveLength(1);
    const imgs = parseRawImages({
      images: [
        {
          imageid: 'A',
          sol: 13,
          site: 3,
          drive: 0,
          extended: { mastAz: '10' },
          camera: { instrument: 'NAVCAM_LEFT' },
          image_files: { medium: 'https://mars.nasa.gov/a_800.jpg', large: 'https://mars.nasa.gov/a_1200.jpg' },
        },
        { imageid: 'B', image_files: { medium: 'https://evil.example/x.jpg', large: 'https://evil.example/y.jpg' } },
      ],
    });
    expect(imgs).toHaveLength(1);
    const placed = placeImages(imgs, wps);
    expect(placed[0].lat).toBe(18.44);
    expect(placed[0].azimuth).toBe(140);
    expect(placed[0].exact).toBe(true);
  });
  it('rejects non-NASA image hosts and parses weather', () => {
    expect(safeImageUrl('http://mars.nasa.gov/x.jpg')).toBeNull();
    expect(safeImageUrl('https://mars.nasa.gov.evil.com/x.jpg')).toBeNull();
    const w = parseWeather({ sols: [{ sol: '1', min_temp: '--', max_temp: -10, pressure: 700, ls: '240.2' }] });
    expect(w[0].minTemp).toBeNull();
    expect(w[0].maxTemp).toBe(-10);
    expect(w[0].Ls).toBeCloseTo(240.2);
  });
});
