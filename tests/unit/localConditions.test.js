import { describe, it, expect } from 'vitest';
import { localConditions, JEZERO } from '../../src/geo/localConditions.js';

const weather = { minTemp: -80, maxTemp: -20, pressure: 750 };

describe('telemetry for the route base', () => {
  it('shows the measured values at Jezero (no route, or a base inside Jezero)', () => {
    expect(localConditions(null, { Ls: 100, weather })).toEqual({ measured: true, minT: -80, maxT: -20, pressure: 750, dose: 0.64 });
    expect(localConditions({ lat: JEZERO.lat + 0.05, lon: JEZERO.lon, h: -2500 }, { Ls: 100, weather }).measured).toBe(true);
  });

  it('estimates elsewhere: colder near the poles and up high, more air down low', () => {
    const polar = localConditions({ lat: 68, lon: -125, h: -4100 }, { Ls: 100, weather });
    expect(polar.measured).toBe(false);
    expect(polar.maxT).toBeLessThan(weather.maxTemp);
    const high = localConditions({ lat: 18, lon: -130, h: 15000 }, { Ls: 100, weather });
    const low = localConditions({ lat: 18, lon: -130, h: -5000 }, { Ls: 100, weather });
    expect(high.maxT).toBeLessThan(low.maxT);
    expect(low.pressure).toBeGreaterThan(high.pressure);
    expect(high.dose).toBeGreaterThan(low.dose);
  });

  it('leaves unknowns empty instead of inventing them', () => {
    const c = localConditions({ lat: -4.6, lon: 137.4, h: null }, { Ls: 100, weather: null });
    expect(c).toEqual({ measured: false, minT: null, maxT: null, pressure: null, dose: null });
  });
});
