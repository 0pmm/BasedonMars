/**
 * Conditions at the place shown in the header telemetry (the base of the
 * route, or Jezero when there is no route). Pure and unit-tested.
 *
 * Only Jezero has a weather station (MEDA, Perseverance), and the surface
 * dose (0.64 mSv/day) is RAD's measurement (Curiosity). Elsewhere the values
 * are ESTIMATES, anchored on those measurements:
 *   - temperature: Jezero's MEDA min/max shifted by the latitude difference
 *     (mean insolation) and the elevation difference (~1.2 °C colder per km);
 *   - pressure: hydrostatic estimate from the elevation and season (eva.js);
 *   - dose: RAD's 0.64 mSv/day scaled by the air column above (eva.js).
 * Local solar time and season are exact for any place (Mars24).
 */
import { surfacePressure, surfaceDoseRate } from '../planner/eva.js';

export const JEZERO = Object.freeze({ lat: 18.4446, lon: 77.4509, h: -2570 });

/** Within this distance of Jezero the measured values are shown as they are. */
export const MEASURED_KM = 30;

const R_KM = 3389.5;

export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mean daytime temperature term from latitude (°C), same shape as the globe's climate layer. */
const latitudeTerm = (lat) => 15 - 125 * Math.pow(Math.abs(lat) / 90, 1.6);
const LAPSE_C_PER_KM = 1.2;

/**
 * @param {{lat:number, lon:number, h?:number|null}|null} place null = Jezero
 * @param {{Ls:number, weather?:{minTemp?:number|null, maxTemp?:number|null, pressure?:number|null}|null}} ctx
 * @returns {{measured:boolean, minT:number|null, maxT:number|null, pressure:number|null, dose:number|null}}
 */
export function localConditions(place, { Ls, weather = null }) {
  const w = weather || {};
  if (!place || distanceKm(place, JEZERO) <= MEASURED_KM) {
    return { measured: true, minT: w.minTemp ?? null, maxT: w.maxTemp ?? null, pressure: w.pressure ?? null, dose: 0.64 };
  }
  const h = Number.isFinite(place.h) ? place.h : null;
  const dT = latitudeTerm(place.lat) - latitudeTerm(JEZERO.lat) - (h != null ? (LAPSE_C_PER_KM * (h - JEZERO.h)) / 1000 : 0);
  const shift = (v) => (Number.isFinite(v) ? v + dT : null);
  return {
    measured: false,
    minT: shift(w.minTemp),
    maxT: shift(w.maxTemp),
    pressure: h != null ? surfacePressure(h, Ls) : null,
    dose: h != null ? surfaceDoseRate(h) : null,
  };
}
