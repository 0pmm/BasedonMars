/**
 * Pure math helpers (no Three.js / DOM dependency, fully unit-tested).
 */
import { MARS_RADIUS_KM } from '../config.js';

export const DEG = Math.PI / 180;

/** @param {number} v @param {number} min @param {number} max */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Hermite smoothstep between edge0 and edge1. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** @param {number} t in [0,1] */
export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Latitude/longitude (degrees) → cartesian point on a sphere.
 * Matches Three.js SphereGeometry UV layout, so a standard
 * equirectangular map (lon -180 at u = 0) lines up with markers.
 * @returns {{x:number, y:number, z:number}}
 */
export function latLonToXYZ(lat, lon, radius) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * Inverse of {@link latLonToXYZ}.
 * @returns {{lat:number, lon:number}}
 */
export function xyzToLatLon(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z) || 1;
  const lat = 90 - Math.acos(clamp(y / r, -1, 1)) / DEG;
  let lon = Math.atan2(z, -x) / DEG - 180;
  if (lon < -180) lon += 360;
  if (lon >= 180) lon -= 360;
  return { lat, lon };
}

/**
 * Longitude/latitude → equirectangular texture coordinates.
 * u = 0 at lon -180 (west edge), v = 0 at the north pole (top row).
 * This is the mapping used by every procedural canvas so overlays align
 * with the sphere and with the real photographic texture.
 */
export function lonLatToUV(lon, lat) {
  const u = ((((lon + 180) / 360) % 1) + 1) % 1;
  const v = (90 - lat) / 180;
  return { u, v };
}

/** Pixel position of a lon/lat on a w×h equirectangular canvas. */
export function lonLatToPixel(lon, lat, w, h) {
  const { u, v } = lonLatToUV(lon, lat);
  return { x: u * w, y: v * h };
}

/**
 * Great-circle distance in km between two lat/lon points on Mars.
 */
export function haversineKm(lat1, lon1, lat2, lon2, radius = MARS_RADIUS_KM) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Points along the great circle between two lat/lon points
 * (spherical linear interpolation), used by the measuring tool.
 * @returns {{lat:number, lon:number}[]}
 */
export function greatCirclePoints(lat1, lon1, lat2, lon2, steps = 64) {
  const a = latLonToXYZ(lat1, lon1, 1);
  const b = latLonToXYZ(lat2, lon2, 1);
  const dot = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1);
  const omega = Math.acos(dot);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let p;
    if (omega < 1e-6) p = a;
    else {
      const s1 = Math.sin((1 - t) * omega) / Math.sin(omega);
      const s2 = Math.sin(t * omega) / Math.sin(omega);
      p = { x: a.x * s1 + b.x * s2, y: a.y * s1 + b.y * s2, z: a.z * s1 + b.z * s2 };
    }
    out.push(xyzToLatLon(p.x, p.y, p.z));
  }
  return out;
}

/** Shortest signed angle difference a-b in radians, in [-π, π]. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
