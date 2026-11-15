/**
 * Unit formatting (metric / imperial). Pure functions.
 */

const M_TO_FT = 3.28084;
const KM_TO_MI = 0.621371;

/**
 * Format a distance given in metres.
 * @param {number} metres
 * @param {'metric'|'imperial'} units
 */
export function formatDistance(metres, units = 'metric') {
  if (units === 'imperial') {
    const ft = metres * M_TO_FT;
    if (ft < 1000) return `${Math.round(ft)} ft`;
    return `${((metres / 1000) * KM_TO_MI).toFixed(2)} mi`;
  }
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** Format a distance given in kilometres. */
export function formatKm(km, units = 'metric', digits = 1) {
  if (units === 'imperial') return `${(km * KM_TO_MI).toFixed(digits)} mi`;
  return `${km.toFixed(digits)} km`;
}

/** Elevation in metres (signed). */
export function formatElevation(metres, units = 'metric') {
  const sign = metres > 0 ? '+' : '';
  if (units === 'imperial') return `${sign}${Math.round(metres * M_TO_FT).toLocaleString('en-US')} ft`;
  return `${sign}${Math.round(metres).toLocaleString('en-US')} m`;
}

/** Temperature in °C. */
export function formatTemperature(celsius, units = 'metric') {
  if (units === 'imperial') return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  return `${Math.round(celsius)}°C`;
}

/** Speed in m/s. */
export function formatSpeed(ms, units = 'metric') {
  if (units === 'imperial') return `${(ms * 2.23694).toFixed(1)} mph`;
  return `${ms.toFixed(1)} m/s`;
}

/** Pressure in pascal (same in both systems, Pa is the scientific norm). */
export function formatPressure(pa) {
  return `${Math.round(pa)} Pa`;
}

/** Duration in seconds → "m:ss". */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
