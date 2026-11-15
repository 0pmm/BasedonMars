/**
 * Mars geodesy helpers (pure, unit-tested).
 *
 * Coordinates follow the IAU Mars 2000 planetocentric convention used by
 * NASA Mars Trek: latitude in degrees north, longitude in degrees EAST
 * (-180..180). Local site frames are east/north metres around an origin
 * (small-area equirectangular approximation, error < 0.1 % for a few km).
 */

/** Mars 2000 IAU reference sphere radius used by Trek's equirectangular products (m). */
export const MARS_SPHERE_RADIUS_M = 3396190;

/**
 * Offset between the heights stored in the Mars Trek terrain tiles and
 * elevation above the MOLA areoid. Calibrated against the Perseverance
 * landing waypoint (sol 13: −2569.9 m) and checked at the Spirit and
 * Curiosity landing sites (±10 m). Absolute values are approximate
 * (±~100 m far from the equator); relative heights are exact.
 */
export const TREK_HEIGHT_OFFSET_M = 8205;

const DEG = Math.PI / 180;

/** Metres per degree of latitude. */
export function metresPerDegLat() {
  return MARS_SPHERE_RADIUS_M * DEG;
}

/** Metres per degree of longitude at a latitude. */
export function metresPerDegLon(lat) {
  return MARS_SPHERE_RADIUS_M * DEG * Math.cos(lat * DEG);
}

/** Wrap a longitude to -180..180. */
export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Convert lat/lon to local east/north metres relative to an origin.
 * @param {{lat:number, lon:number}} origin
 * @returns {{e:number, n:number}}
 */
export function toLocal(lat, lon, origin) {
  return {
    e: wrapLon(lon - origin.lon) * metresPerDegLon(origin.lat),
    n: (lat - origin.lat) * metresPerDegLat(),
  };
}

/** Inverse of toLocal. */
export function toLatLon(e, n, origin) {
  return {
    lat: origin.lat + n / metresPerDegLat(),
    lon: wrapLon(origin.lon + e / metresPerDegLon(origin.lat)),
  };
}

/** Great-circle distance in metres (haversine on the reference sphere). */
export function distanceM(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_SPHERE_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Bearing (degrees clockwise from north) from point 1 to point 2. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * DEG) * Math.cos(lat2 * DEG);
  const x = Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) - Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos((lon2 - lon1) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Format a coordinate pair like "18.4446° N, 77.4509° E". */
export function formatLatLon(lat, lon, digits = 4) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}

/** Bounding box (degrees) of a square of `sizeM` metres centred on a point. */
export function bboxAround(lat, lon, sizeM) {
  const dLat = sizeM / 2 / metresPerDegLat();
  const dLon = sizeM / 2 / metresPerDegLon(lat);
  return { west: lon - dLon, east: lon + dLon, south: lat - dLat, north: lat + dLat };
}
