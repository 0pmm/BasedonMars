/**
 * Base-viability model of the globe locations (pure, unit-tested).
 */
import { clamp } from '../core/math.js';

const BASE_WEIGHTS = { water: 0.3, radiation: 0.25, terrain: 0.15, sunlight: 0.15, temperature: 0.15 };

/**
 * Habitat viability score in [0, 100] from a location's 0..1 factors.
 * Radiation is a "bad" factor (1 = worst) and is inverted.
 * @param {{water:number, radiation:number, terrain:number, sunlight:number, temperature:number}} b
 */
export function baseViability(b) {
  const factors = {
    water: clamp(b.water, 0, 1),
    radiation: 1 - clamp(b.radiation, 0, 1),
    terrain: clamp(b.terrain, 0, 1),
    sunlight: clamp(b.sunlight, 0, 1),
    temperature: clamp(b.temperature, 0, 1),
  };
  let sum = 0;
  for (const [k, w] of Object.entries(BASE_WEIGHTS)) sum += factors[k] * w;
  return { score: Math.round(sum * 100), factors };
}
