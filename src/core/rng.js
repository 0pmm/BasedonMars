/**
 * Deterministic pseudo-random generator (mulberry32).
 * Same seed → same sequence, so every location always generates the
 * same terrain, rocks and objectives.
 * @param {number} seed
 * @returns {() => number} function returning floats in [0, 1)
 */
export function createRng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable seed derived from coordinates.
 * @param {number} lat
 * @param {number} lon
 */
export function seedFromLatLon(lat, lon) {
  return (Math.abs(Math.round(lat * 1000 + lon * 731)) % 100000) + 1;
}
