/**
 * Live data from NASA Mars mission feeds (fetched at run time):
 * - Perseverance waypoints and traverse (JPL MMGIS)
 * - Perseverance raw images (mars.nasa.gov raw image API)
 * - MEDA weather report (mars.nasa.gov)
 * - Space weather (NASA DONKI solar energetic particle events)
 */
import { fetchWithTimeout } from './trek.js';

export const MMGIS_WAYPOINTS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';
export const MMGIS_TRAVERSE = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json';
export const RAW_IMAGES_API = 'https://mars.nasa.gov/rss/api/';
export const DONKI_SEP = 'https://api.nasa.gov/DONKI/SEP';
export const DONKI_FLR = 'https://api.nasa.gov/DONKI/FLR';

const ALLOWED_IMAGE_HOST = 'mars.nasa.gov';

let waypointsPromise = null;
let traversePromise = null;

/**
 * Perseverance waypoints: {sol, site, drive, lat, lon, elev, yaw}
 * @returns {Promise<Array<{sol:number, site:number, drive:number, lat:number, lon:number, elev:number, yaw:number}>>}
 */
export function loadWaypoints() {
  waypointsPromise ??= (async () => {
    const res = await fetchWithTimeout(MMGIS_WAYPOINTS, {}, 25000);
    if (!res.ok) throw new Error(`waypoints HTTP ${res.status}`);
    const json = await res.json();
    return parseWaypoints(json);
  })().catch((err) => {
    waypointsPromise = null;
    throw err;
  });
  return waypointsPromise;
}

/** Validate and normalise the MMGIS waypoint GeoJSON (exported for tests). */
export function parseWaypoints(json) {
  const out = [];
  for (const f of json?.features || []) {
    const p = f?.properties || {};
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      sol: Number(p.sol) || 0,
      site: Number(p.site) || 0,
      drive: Number(p.drive) || 0,
      lat,
      lon,
      elev: Number(p.elev_geoid),
      yaw: Number(p.yaw) || 0,
    });
  }
  return out;
}

/** Perseverance traverse as a list of [lon, lat] polylines. */
export function loadTraverse() {
  traversePromise ??= (async () => {
    const res = await fetchWithTimeout(MMGIS_TRAVERSE, {}, 25000);
    if (!res.ok) throw new Error(`traverse HTTP ${res.status}`);
    const json = await res.json();
    const lines = [];
    for (const f of json.features || []) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'LineString') lines.push(g.coordinates);
      else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    }
    return lines;
  })().catch((err) => {
    traversePromise = null;
    throw err;
  });
  return traversePromise;
}

/** Only accept image URLs served by mars.nasa.gov over HTTPS. */
export function safeImageUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === ALLOWED_IMAGE_HOST ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Raw images taken on a given sol, optionally filtered by camera.
 * @returns {Promise<Array<{id:string, sol:number, site:number, drive:number, camera:string, mastAz:number|null, small:string, large:string, date:string, caption:string, link:string|null}>>}
 */
export async function loadRawImages({ sol, camera = '', num = 24, signal } = {}) {
  const params = new URLSearchParams({
    feed: 'raw_images',
    category: 'mars2020',
    feedtype: 'json',
    ver: '1.2',
    num: String(num),
    page: '0',
    order: 'sol desc',
  });
  if (sol != null) {
    params.set('condition_2', `${sol}:sol:gte`);
    params.set('condition_3', `${sol}:sol:lte`);
  }
  if (camera) params.set('search', `|${camera}`);
  const res = await fetchWithTimeout(`${RAW_IMAGES_API}?${params}`, { signal });
  if (!res.ok) throw new Error(`raw images HTTP ${res.status}`);
  const json = await res.json();
  return parseRawImages(json);
}

/** Validate the raw image feed (exported for tests). */
export function parseRawImages(json) {
  const out = [];
  for (const img of json?.images || []) {
    const small = safeImageUrl(img?.image_files?.medium || img?.image_files?.small);
    const large = safeImageUrl(img?.image_files?.large || img?.image_files?.medium);
    if (!small || !large) continue;
    const az = Number(img?.extended?.mastAz);
    out.push({
      id: String(img.imageid || ''),
      sol: Number(img.sol) || 0,
      site: Number(img.site) || 0,
      drive: Number(img.drive) || 0,
      camera: String(img?.camera?.instrument || ''),
      mastAz: Number.isFinite(az) ? az : null,
      small,
      large,
      date: String(img.date_taken_utc || ''),
      caption: String(img.title || ''),
      link: safeImageUrl(img.link || ''),
    });
  }
  return out;
}

/**
 * Locate each image on the map: images carry the rover's site/drive
 * counters, which match the waypoint list exactly.
 */
export function placeImages(images, waypoints) {
  const index = new Map(waypoints.map((w) => [`${w.site}:${w.drive}`, w]));
  const bySol = new Map();
  for (const w of waypoints) bySol.set(w.sol, w);
  return images.map((img) => {
    const w = index.get(`${img.site}:${img.drive}`) || bySol.get(img.sol) || null;
    const azimuth = w && img.mastAz != null ? (((w.yaw + img.mastAz) % 360) + 360) % 360 : null;
    return { ...img, lat: w?.lat ?? null, lon: w?.lon ?? null, azimuth, exact: !!index.get(`${img.site}:${img.drive}`) };
  });
}

/** Latest MEDA weather report (only sols with data). */
let weatherPromise = null;

export function loadWeather() {
  weatherPromise ??= (async () => {
    const res = await fetchWithTimeout(`${RAW_IMAGES_API}?feed=weather&category=mars2020&feedtype=json`);
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
    return parseWeather(await res.json());
  })().catch((err) => {
    weatherPromise = null;
    throw err;
  });
  return weatherPromise;
}

/** Exported for tests. */
export function parseWeather(json) {
  const num = (v) => (typeof v === 'number' ? v : Number.isFinite(Number(v)) && v !== '--' && v !== '' ? Number(v) : null);
  return (json?.sols || [])
    .map((s) => ({
      sol: Number(s.sol),
      date: String(s.terrestrial_date || ''),
      Ls: num(s.ls),
      season: String(s.season || ''),
      minTemp: num(s.min_temp),
      maxTemp: num(s.max_temp),
      pressure: num(s.pressure),
      sunrise: String(s.sunrise || ''),
      sunset: String(s.sunset || ''),
    }))
    .filter((s) => Number.isFinite(s.sol))
    .sort((a, b) => b.sol - a.sol);
}

/**
 * Recent solar energetic particle events and strong flares (last 30 days).
 * Uses the public DEMO_KEY (rate-limited); failures are reported, never hidden.
 */
let spaceCache = null; // { at, promise } — DEMO_KEY is rate-limited, so reuse for 30 min

export function loadSpaceWeather(signal, now = Date.now()) {
  if (spaceCache && now - spaceCache.at < 30 * 60000) return spaceCache.promise;
  const promise = fetchSpaceWeather(signal, now);
  spaceCache = { at: now, promise };
  promise.catch(() => {
    // keep failures for 5 minutes to avoid hammering the API
    spaceCache = { at: now - 25 * 60000, promise };
  });
  return promise;
}

async function fetchSpaceWeather(signal, now) {
  const fmt = (d) => new Date(d).toISOString().slice(0, 10);
  const range = `startDate=${fmt(now - 30 * 86400000)}&endDate=${fmt(now)}&api_key=DEMO_KEY`;
  const [sep, flr] = await Promise.all(
    [DONKI_SEP, DONKI_FLR].map(async (base) => {
      const res = await fetchWithTimeout(`${base}?${range}`, { signal });
      if (!res.ok) throw new Error(`DONKI HTTP ${res.status}`);
      const text = await res.text();
      return text ? JSON.parse(text) : [];
    })
  );
  return {
    sep: (Array.isArray(sep) ? sep : []).map((e) => ({
      time: String(e.eventTime || ''),
      id: String(e.sepID || ''),
      link: String(e.link || ''),
    })),
    flares: (Array.isArray(flr) ? flr : [])
      .filter((f) => /^[MX]/.test(String(f.classType || '')))
      .map((f) => ({ time: String(f.peakTime || f.beginTime || ''), cls: String(f.classType || ''), link: String(f.link || '') })),
  };
}
