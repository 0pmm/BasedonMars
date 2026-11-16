/**
 * EVA (Marswalk) planning models — pure, unit-tested.
 *
 * All physiological numbers are PLANNING ASSUMPTIONS, not mission
 * requirements. They are exposed as editable parameters in the UI and
 * documented in docs/METHODOLOGY.md:
 * - Suited walking speed on flat ground ~0.9 m/s (Apollo J-mission EVA
 *   traverses averaged roughly 2–3 km/h); slope effect from Tobler's hiking
 *   function.
 * - Metabolic rate ~300 W while working, more when walking uphill
 *   (Apollo EVAs averaged ~230–300 W, with peaks above 500 W).
 * - O₂ consumption ≈ 0.25 g per W per hour (≈0.2 L O₂ per kcal).
 * - Radiation: Curiosity RAD measured ~0.64 mSv/day at the surface of
 *   Gale crater (Hassler et al., Science 2014); thinner air above adds a
 *   little dose. Solar particle events can add much more.
 */

export const DEFAULT_EVA = Object.freeze({
  walkSpeed: 0.9, // m/s on flat ground
  roverSpeed: 2.5, // m/s, pressurised-rover cruise
  maxSlopeWalk: 15, // degrees
  maxSlopeRover: 25,
  maxRoughness: 0.6, // m (std. dev. in a 5×5-cell window)
  restMetabolicW: 300,
  walkMetabolicW: 420,
  uphillWPerDeg: 35,
  o2HoursAt300W: 8, // suit consumable autonomy at 300 W
  reservePct: 20,
  stopMinutes: 20,
  maxEvaHours: 7,
  commsMastHeight: 6, // habitat antenna height (m)
  mode: 'walk', // walk | rover
  priority: 'safety', // safety | balanced | fast (route cost weights, routing.js)
});

const O2_KG_PER_W_H = 0.000247;

/** Suit O₂ capacity (kg) implied by the autonomy parameter. */
export function o2Capacity(p = DEFAULT_EVA) {
  return p.o2HoursAt300W * 300 * O2_KG_PER_W_H;
}

/** Walking speed (m/s) on a signed slope (degrees, + uphill), Tobler. */
export function walkingSpeed(slopeDeg, p = DEFAULT_EVA) {
  const tan = Math.tan((slopeDeg * Math.PI) / 180);
  const factor = Math.exp(-3.5 * Math.abs(tan + 0.05)) / Math.exp(-3.5 * 0.05);
  return Math.max(0.2, p.walkSpeed * factor);
}

/** Metabolic rate (W) while walking on a signed slope. */
export function walkingMetabolic(slopeDeg, p = DEFAULT_EVA) {
  const uphill = Math.max(0, slopeDeg);
  const downhill = Math.max(0, -slopeDeg);
  return p.walkMetabolicW + uphill * p.uphillWPerDeg + Math.max(0, downhill - 10) * 10;
}

/** Radiation dose-equivalent rate (mSv/day) at an elevation (m). */
export function surfaceDoseRate(elevationM) {
  const base = 0.64; // RAD, Gale crater at ~−4.5 km
  return base * (1 + 0.03 * ((elevationM + 4500) / 1000));
}

/** Mean surface pressure (Pa) at an elevation and season (estimate). */
export function surfacePressure(elevationM, Ls = 0) {
  const seasonal = 1 + 0.08 * Math.cos(((Ls - 255) * Math.PI) / 180);
  return 610 * Math.exp(-elevationM / 11100) * seasonal;
}

/**
 * Evaluate a route.
 * @param {{d:number, h:number}[]} profile samples along the route (distance m, height m)
 * @param {{d:number, minutes?:number}[]} stops science stops (distance along route)
 * @param {object} p EVA parameters
 * @param {(d:number)=>number} [slopeAt] optional terrain slope lookup (deg) for limits
 */
export function evaluateRoute(profile, stops = [], p = DEFAULT_EVA) {
  const legs = [];
  let time = 0; // s
  let o2 = 0; // kg
  let climb = 0;
  let descent = 0;
  let maxGrade = 0;
  const rover = p.mode === 'rover';
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    const run = b.d - a.d;
    if (run <= 0) continue;
    const rise = b.h - a.h;
    const grade = (Math.atan2(rise, run) * 180) / Math.PI;
    maxGrade = Math.max(maxGrade, Math.abs(grade));
    if (rise > 0) climb += rise;
    else descent -= rise;
    const dist = Math.hypot(run, rise);
    const speed = rover ? p.roverSpeed * Math.max(0.3, 1 - Math.abs(grade) / 40) : walkingSpeed(grade, p);
    const dt = dist / speed;
    const watts = rover ? p.restMetabolicW * 0.8 : walkingMetabolic(grade, p);
    time += dt;
    o2 += watts * (dt / 3600) * O2_KG_PER_W_H;
    legs.push({ d: b.d, t: time, o2 });
  }
  const length = profile.length ? profile[profile.length - 1].d : 0;
  const stopSeconds = stops.reduce((s, x) => s + (x.minutes ?? p.stopMinutes) * 60, 0);
  const stopO2 = stops.reduce((s, x) => s + p.restMetabolicW * ((x.minutes ?? p.stopMinutes) / 60) * O2_KG_PER_W_H, 0);
  const totalSeconds = time + stopSeconds;
  const totalO2 = o2 + stopO2;
  const capacity = o2Capacity(p) * (rover ? 1.6 : 1); // rover carries extra consumables
  const usable = capacity * (1 - p.reservePct / 100);
  return {
    length,
    climb,
    descent,
    maxGrade,
    moveSeconds: time,
    stopSeconds,
    totalSeconds,
    o2Kg: totalO2,
    o2CapacityKg: capacity,
    o2UsablePct: (totalO2 / usable) * 100,
    o2RemainingPct: Math.max(0, 100 - (totalO2 / capacity) * 100),
    withinO2: totalO2 <= usable,
    withinTime: totalSeconds / 3600 <= p.maxEvaHours,
    legs,
  };
}

/**
 * "Point of no return" check: walking out to each sample and back
 * along the same path must fit inside the usable O₂.
 * Returns the farthest distance along the route that is still safe.
 */
export function pointOfNoReturn(profile, p = DEFAULT_EVA) {
  const usable = o2Capacity(p) * (1 - p.reservePct / 100) * (p.mode === 'rover' ? 1.6 : 1);
  const rover = p.mode === 'rover';
  const segO2 = (run, rise) => {
    const grade = (Math.atan2(rise, run) * 180) / Math.PI;
    const speed = rover ? p.roverSpeed * Math.max(0.3, 1 - Math.abs(grade) / 40) : walkingSpeed(grade, p);
    const watts = rover ? p.restMetabolicW * 0.8 : walkingMetabolic(grade, p);
    return watts * (Math.hypot(run, rise) / speed / 3600) * O2_KG_PER_W_H;
  };
  // Linear scan: O₂ out to sample i plus O₂ back along the same path
  let out = 0;
  let back = 0;
  let safe = 0;
  for (let i = 1; i < profile.length; i++) {
    const run = profile[i].d - profile[i - 1].d;
    if (run <= 0) continue;
    const rise = profile[i].h - profile[i - 1].h;
    out += segO2(run, rise);
    back += segO2(run, -rise);
    if (out + back <= usable) safe = profile[i].d;
    else break;
  }
  return safe;
}

/**
 * Score a plan 0..100 in three dimensions (gamified, but every input is a
 * real quantity of the plan). When a science coverage is supplied (0..1, from
 * planner/scout.js) it replaces the stop-count proxy.
 */
export function scorePlan({
  evaluation,
  maxSlope,
  slopeLimit,
  commsCoverage,
  stops,
  scienceStops,
  scienceCoverage,
  straightLine,
  doseMsv,
}) {
  const o2 = evaluation.withinO2 ? Math.min(1, (100 - evaluation.o2UsablePct) / 40 + 0.5) : 0;
  const slope = maxSlope <= slopeLimit ? 1 - (maxSlope / slopeLimit) * 0.5 : 0;
  const comms = Math.max(0, Math.min(1, commsCoverage));
  const dose = Math.max(0, 1 - doseMsv / 1.5);
  const safety = Math.round(100 * (0.4 * o2 + 0.3 * slope + 0.2 * comms + 0.1 * dose));
  const science = Number.isFinite(scienceCoverage)
    ? Math.round(100 * Math.max(0, Math.min(1, scienceCoverage)))
    : Math.round(100 * Math.min(1, (scienceStops * 0.25 + Math.min(stops, 6) * 0.05) / 1));
  const efficiency = straightLine > 0 && evaluation.length > 0 ? Math.round(100 * Math.min(1, straightLine / evaluation.length)) : 0;
  const total = Math.round(safety * 0.5 + science * 0.3 + efficiency * 0.2);
  return { safety, science, efficiency, total };
}
