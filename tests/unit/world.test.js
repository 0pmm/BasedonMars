import { describe, it, expect } from 'vitest';
import { fractalNoise, tileableNoise, samplePalette, intHash } from '../../src/core/noise.js';
import { createRng, seedFromLatLon } from '../../src/core/rng.js';
import { elevationKm, temperatureC, radiationMsv, waterIce } from '../../src/orbit/marsModel.js';

describe('noise', () => {
  it('is deterministic and normalised', () => {
    for (let i = 0; i < 200; i++) {
      const v = fractalNoise(i * 3.1, i * 1.7, 5, 22, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(fractalNoise(i * 3.1, i * 1.7, 5, 22, 7)).toBe(v);
    }
    expect(intHash(3, 4, 5)).toBe(intHash(3, 4, 5));
  });

  it('tileable noise wraps seamlessly', () => {
    for (let y = 0; y < 64; y += 7) {
      expect(tileableNoise(0, y, 256, 4, 6, 1)).toBeCloseTo(tileableNoise(256, y, 256, 4, 6, 1), 9);
      expect(tileableNoise(y, 0, 256, 4, 6, 1)).toBeCloseTo(tileableNoise(y, 256, 256, 4, 6, 1), 9);
    }
  });

  it('palette returns RGB within bounds', () => {
    const [r, g, b] = samplePalette(0.5);
    for (const c of [r, g, b]) expect(c).toBeGreaterThanOrEqual(0);
    expect(samplePalette(2)).toEqual([234, 196, 161]);
  });
});

describe('rng', () => {
  it('same seed gives the same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('seedFromLatLon is stable and positive', () => {
    expect(seedFromLatLon(18.4447, 77.4508)).toBe(seedFromLatLon(18.4447, 77.4508));
    expect(seedFromLatLon(-87, 0)).toBeGreaterThan(0);
  });
});

describe('illustrative global model', () => {
  it('reproduces the main real features', () => {
    expect(elevationKm(18.65, -133.8)).toBeGreaterThan(15); // Olympus Mons
    expect(elevationKm(-42.4, 70.5)).toBeLessThan(-5); // Hellas
    expect(elevationKm(60, 0)).toBeLessThan(elevationKm(-30, 0)); // dichotomy
    expect(temperatureC(0, 0)).toBeGreaterThan(temperatureC(-85, 0));
    expect(radiationMsv(18.65, -133.8)).toBeGreaterThan(radiationMsv(-42.4, 70.5));
    expect(waterIce(85, 0)).toBeGreaterThan(waterIce(0, 0));
  });
});
