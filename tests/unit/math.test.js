import { describe, it, expect } from 'vitest';
import {
  clamp,
  lerp,
  smoothstep,
  latLonToXYZ,
  xyzToLatLon,
  lonLatToUV,
  haversineKm,
  greatCirclePoints,
  angleDiff,
} from '../../src/core/math.js';
import { MARS_RADIUS_KM } from '../../src/config.js';

describe('basic helpers', () => {
  it('clamp, lerp, smoothstep', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
  });

  it('angleDiff wraps around', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
  });
});

describe('spherical coordinates', () => {
  it('round-trips lat/lon through xyz', () => {
    for (const [lat, lon] of [
      [18.65, -133.8],
      [-42.4, 70.5],
      [0, 0],
      [86, 179],
    ]) {
      const p = latLonToXYZ(lat, lon, 50);
      const back = xyzToLatLon(p.x, p.y, p.z);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lon).toBeCloseTo(lon, 6);
    }
  });

  /**
   * Regression test for the mirrored data layers: the texture coordinate
   * used to paint overlays must equal the U that Three.js SphereGeometry
   * assigns to the vertex at the same position (phi = u * 2π with
   * x = -cos(phi)·sinθ, z = sin(phi)·sinθ).
   */
  it('lonLatToUV matches the SphereGeometry UV layout', () => {
    for (const lon of [-170, -133.8, -59.2, 0, 77.45, 137.8]) {
      const p = latLonToXYZ(10, lon, 1);
      let phi = Math.atan2(p.z, -p.x);
      if (phi < 0) phi += Math.PI * 2;
      const uSphere = phi / (Math.PI * 2);
      expect(lonLatToUV(lon, 10).u).toBeCloseTo(uSphere, 6);
    }
  });

  it('north pole is at the top row (v = 0)', () => {
    expect(lonLatToUV(0, 90).v).toBe(0);
    expect(lonLatToUV(0, -90).v).toBe(1);
  });
});

describe('distances', () => {
  it('quarter of the equator is π/2·R', () => {
    expect(haversineKm(0, 0, 0, 90)).toBeCloseTo((Math.PI / 2) * MARS_RADIUS_KM, 3);
  });

  it('is symmetric and zero for the same point', () => {
    expect(haversineKm(18.44, 77.45, -5.4, 137.8)).toBeCloseTo(haversineKm(-5.4, 137.8, 18.44, 77.45), 9);
    expect(haversineKm(10, 10, 10, 10)).toBe(0);
  });

  it('great-circle path starts and ends at the endpoints', () => {
    const pts = greatCirclePoints(18.4, 77.4, -5.4, 137.8, 20);
    expect(pts).toHaveLength(21);
    expect(pts[0].lat).toBeCloseTo(18.4, 6);
    expect(pts[20].lon).toBeCloseTo(137.8, 6);
  });
});
