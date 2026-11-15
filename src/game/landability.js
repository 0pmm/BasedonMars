/**
 * Landing suitability (landability) for a candidate base: can a habitat or
 * lander safely set down here? Separate from scientific fit — a great science
 * site can be a terrible landing site.
 *
 * Inputs come from the real terrain grid (slope/roughness from MOLA/HRSC/DTX)
 * and from the zone metadata. Pure and unit-tested.
 */

const WEIGHTS = Object.freeze({
  slope: 0.35,
  atmosphere: 0.25,
  roughness: 0.15,
  rocks: 0.15,
  latitude: 0.1,
});

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * @param {{
 *   elevationM?:number, maxSlopeDeg?:number, meanSlopeDeg?:number,
 *   roughnessM?:number, rocksPerKm2?:number, latitude?:number
 * }} input
 */
export function landability(input = {}) {
  const elevationM = Number.isFinite(input.elevationM) ? input.elevationM : 0;
  const maxSlope = Number.isFinite(input.maxSlopeDeg) ? input.maxSlopeDeg : Number.isFinite(input.meanSlopeDeg) ? input.meanSlopeDeg : 12;
  const roughness = Number.isFinite(input.roughnessM) ? input.roughnessM : 0;
  const rocks = Number.isFinite(input.rocksPerKm2) ? input.rocksPerKm2 : 0;
  const lat = Number.isFinite(input.latitude) ? input.latitude : 0;

  const factors = {
    // Thicker atmosphere at low elevation helps parachutes and terminal descent.
    atmosphere: clamp01((3000 - elevationM) / 8000),
    // 12 deg is already a hard limit for most landers.
    slope: clamp01(1 - maxSlope / 12),
    roughness: clamp01(1 - roughness / 1.5),
    rocks: clamp01(1 - rocks / 60),
    // Polar sites lose winter solar power and get harsher thermal extremes.
    latitude: clamp01(1 - (Math.abs(lat) / 90) * 0.7),
  };
  let sum = 0;
  const list = [];
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const value = factors[key];
    sum += value * weight;
    list.push({ key, value, weight, contribution: value * weight });
  }
  const score = Math.round(sum * 100);
  const limits = list
    .map((f) => ({ ...f, gap: (1 - f.value) * f.weight }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);
  return { score, grade: gradeOf(score), factors: list, limits };
}

/** @param {number} score */
export function gradeOf(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

/**
 * How much to trust a landing verdict, from the finest imagery available.
 * @param {{resolutionM?:number}} input
 */
export function landingConfidence({ resolutionM } = {}) {
  const r = Number.isFinite(resolutionM) ? resolutionM : 200;
  if (r <= 2) return { level: 'high', value: 0.9 };
  if (r <= 10) return { level: 'medium', value: 0.65 };
  if (r <= 60) return { level: 'low', value: 0.4 };
  return { level: 'very-low', value: 0.25 };
}
