/**
 * Simplified, ILLUSTRATIVE global model of Mars used to paint the data
 * layers. It reproduces the major real features (hemispheric dichotomy,
 * Tharsis, Olympus Mons, Elysium, Hellas, Argyre, Isidis, Valles
 * Marineris, polar ice) but it is NOT measured data — the UI labels these
 * layers as illustrative. Pure functions, unit-tested.
 */
import { DEG, clamp } from '../core/math.js';

/** Angular distance in degrees between two lat/lon points. */
function angDist(lat1, lon1, lat2, lon2) {
  const a =
    Math.sin(((lat2 - lat1) * DEG) / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(((lon2 - lon1) * DEG) / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / DEG;
}

const gauss = (d, r) => Math.exp(-(d * d) / (2 * r * r));

/** Approximate elevation in km relative to the Martian datum. */
export function elevationKm(lat, lon) {
  // Hemispheric dichotomy: northern lowlands ~ -4 km, southern highlands ~ +1.5 km
  const boundary = 5 + 18 * Math.sin((lon + 60) * DEG);
  // Smooth 5° transition across the boundary scarp
  const s = clamp((lat - boundary) / 5, -1, 1);
  let e = 1.5 - (s + 1) * 2.75;
  e += 6 * gauss(angDist(lat, lon, 2, -112), 22); // Tharsis rise
  e += 19 * gauss(angDist(lat, lon, 18.65, -133.8), 3.2); // Olympus Mons
  for (const [la, lo] of [
    [-8.35, -120.1],
    [1.48, -112.96],
    [11.92, -104.08],
  ])
    e += 12 * gauss(angDist(lat, lon, la, lo), 2.5); // Tharsis Montes
  e += 5 * gauss(angDist(lat, lon, 25, 147), 6); // Elysium Mons
  e -= 8 * gauss(angDist(lat, lon, -42.4, 70.5), 15); // Hellas
  e -= 4 * gauss(angDist(lat, lon, -49.7, -43.4), 9); // Argyre
  e -= 3 * gauss(angDist(lat, lon, 12.9, 87), 8); // Isidis
  // Valles Marineris trench
  if (lon > -105 && lon < -30) {
    const lat0 = -13 + Math.sin(lon * 0.055) * 3.6;
    e -= 6 * gauss(lat - lat0, 1.6);
  }
  if (lat > 80) e += 2.5 * ((lat - 80) / 10); // Planum Boreum
  if (lat < -80) e += 3 * ((-80 - lat) / 10); // Planum Australe
  return clamp(e, -8.2, 21.9);
}

/** Approximate mean daytime surface temperature in °C. */
export function temperatureC(lat, lon) {
  const latitudinal = 15 - 125 * Math.pow(Math.abs(lat) / 90, 1.6);
  const altitude = -2 * elevationKm(lat, lon); // colder at altitude
  return clamp(latitudinal + altitude * 0.6, -125, 20);
}

/** Approximate surface radiation dose in mSv/day (thinner air above → more dose). */
export function radiationMsv(lat, lon) {
  const e = elevationKm(lat, lon);
  return clamp(0.55 + e * 0.02, 0.2, 0.9);
}

/** Relative likelihood (0..1) of near-surface water ice. */
export function waterIce(lat, lon) {
  const a = Math.abs(lat);
  let p = a > 75 ? 1 : a > 55 ? 0.65 + (a - 55) * 0.0175 : a > 38 ? 0.25 + (a - 38) * 0.024 : 0.04;
  p += 0.35 * gauss(angDist(lat, lon, 45, 110), 12); // Utopia buried ice
  p += 0.3 * gauss(angDist(lat, lon, 45, -150), 12); // Arcadia
  return clamp(p, 0, 1);
}
