/**
 * Mars time and Sun position — the NASA GISS "Mars24" algorithm
 * (Allison & McEwen 2000, Planet. Space Sci. 48, 215; Mars24 technical
 * notes). Pure functions, unit-tested against the published examples.
 *
 * Longitudes are planetocentric EAST (the app's convention); the original
 * algorithm uses west longitudes, so the signs are adapted here.
 */

const DEG = Math.PI / 180;
const mod = (a, n) => ((a % n) + n) % n;

/** TT − UTC in seconds (leap seconds 37 s + 32.184 s). */
export const TT_MINUS_UTC = 69.184;

/** Julian date (UT) of a JS timestamp. */
export function julianDateUT(ms) {
  return 2440587.5 + ms / 86400000;
}

/** Core quantities for a UTC timestamp. */
export function marsTime(ms) {
  const jdTT = julianDateUT(ms) + TT_MINUS_UTC / 86400;
  const dt = jdTT - 2451545.0;
  const M = mod(19.3871 + 0.52402073 * dt, 360);
  const alphaFMS = mod(270.3871 + 0.524038496 * dt, 360);
  const pbs = [
    [0.0071, 2.2353, 49.409],
    [0.0057, 2.7543, 168.173],
    [0.0039, 1.1177, 191.837],
    [0.0037, 15.7866, 21.736],
    [0.0021, 2.1354, 15.704],
    [0.002, 2.4694, 95.528],
    [0.0018, 32.8493, 49.095],
  ].reduce((s, [a, tau, phi]) => s + a * Math.cos(((0.985626 * dt) / tau + phi) * DEG), 0);
  const Mr = M * DEG;
  const nuMinusM =
    (10.691 + 3.0e-7 * dt) * Math.sin(Mr) +
    0.623 * Math.sin(2 * Mr) +
    0.05 * Math.sin(3 * Mr) +
    0.005 * Math.sin(4 * Mr) +
    0.0005 * Math.sin(5 * Mr) +
    pbs;
  const Ls = mod(alphaFMS + nuMinusM, 360);
  const LsR = Ls * DEG;
  const eot = 2.861 * Math.sin(2 * LsR) - 0.071 * Math.sin(4 * LsR) + 0.002 * Math.sin(6 * LsR) - nuMinusM; // degrees
  const msd = (jdTT - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
  const mst = mod(24 * msd, 24); // Mean Solar Time at the prime meridian (hours)
  const declination = Math.asin(0.42565 * Math.sin(LsR)) / DEG + 0.25 * Math.sin(LsR);
  const subsolarLonEast = mod(-(mst * 15 + eot + 180) + 180, 360) - 180;
  const helioDistanceAU =
    1.5236 * (1.00436 - 0.09309 * Math.cos(Mr) - 0.004336 * Math.cos(2 * Mr) - 0.00031 * Math.cos(3 * Mr) - 0.00003 * Math.cos(4 * Mr));
  return { jdTT, msd, mst, Ls, eot, declination, subsolarLonEast, helioDistanceAU };
}

/** Local mean / true solar time (hours) at an east longitude. */
export function localSolarTime(ms, lonEast) {
  const t = marsTime(ms);
  const lmst = mod(t.mst + lonEast / 15, 24);
  const ltst = mod(lmst + t.eot / 15, 24);
  return { lmst, ltst, ...t };
}

/**
 * Sun elevation and azimuth (degrees, azimuth clockwise from north) seen
 * from a site.
 */
export function sunPosition(ms, lat, lonEast) {
  const t = marsTime(ms);
  const H = (lonEast - t.subsolarLonEast) * DEG; // hour angle
  const d = t.declination * DEG;
  const p = lat * DEG;
  const east = -Math.cos(d) * Math.sin(H);
  const north = Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(H);
  const up = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  return {
    elevation: Math.asin(Math.max(-1, Math.min(1, up))) / DEG,
    azimuth: mod(Math.atan2(east, north) / DEG, 360),
    Ls: t.Ls,
    helioDistanceAU: t.helioDistanceAU,
  };
}

/** Top-of-atmosphere solar irradiance (W/m²) for the current Mars–Sun distance. */
export function solarIrradiance(helioDistanceAU) {
  return 1361 / helioDistanceAU ** 2;
}

/** Length of a sol in Earth milliseconds. */
export const SOL_MS = 88775244;

/**
 * Timestamp of a given local true solar time on the same sol as `ms` at a
 * longitude (iterates because EOT drifts slowly).
 */
export function timestampForLocalTime(ms, lonEast, hour) {
  let t = ms;
  for (let k = 0; k < 4; k++) {
    const { ltst } = localSolarTime(t, lonEast);
    let diff = hour - ltst;
    if (diff > 12) diff -= 24;
    if (diff < -12) diff += 24;
    t += (diff / 24) * SOL_MS;
  }
  return t;
}

/** Sunrise and sunset (local true solar time, hours) by scanning the sol. */
export function sunriseSunset(ms, lat, lonEast) {
  const start = timestampForLocalTime(ms, lonEast, 0);
  let rise = null;
  let set = null;
  let prev = sunPosition(start, lat, lonEast).elevation;
  for (let m = 1; m <= 24 * 60; m += 2) {
    const t = start + (m / (24 * 60)) * SOL_MS;
    const el = sunPosition(t, lat, lonEast).elevation;
    if (prev < 0 && el >= 0 && rise == null) rise = m / 60;
    if (prev >= 0 && el < 0 && rise != null) set = m / 60;
    prev = el;
  }
  return { sunrise: rise, sunset: set };
}

/** Mission sol counter (sol 0 = landing sol, as NASA numbers them). */
export function missionSol(ms, landingMs, lonEast) {
  const local = (x) => marsTime(x).msd + lonEast / 360;
  return Math.floor(local(ms)) - Math.floor(local(landingMs));
}

/** Perseverance landing (2021-02-18 20:55 UTC) in Jezero. */
export const PERSEVERANCE_LANDING_MS = Date.UTC(2021, 1, 18, 20, 55, 0);

/** Northern-hemisphere season name key for a solar longitude. */
export function seasonKey(Ls, lat) {
  const north = ['spring', 'summer', 'autumn', 'winter'][Math.floor(mod(Ls, 360) / 90)];
  if (lat >= 0) return north;
  return { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }[north];
}

/** True during the dust-storm season (Ls 180–330: perihelion, southern spring/summer). */
export function isDustSeason(Ls) {
  return Ls >= 180 && Ls <= 330;
}

/** Format decimal hours as "HH:MM". */
export function formatHours(h) {
  if (h == null || Number.isNaN(h)) return '--:--';
  const m = Math.round(mod(h, 24) * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
