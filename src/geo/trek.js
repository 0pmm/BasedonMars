/**
 * Browser-side access to NASA/JPL Mars Trek: terrain tiles, imagery
 * tiles and feature services. Everything is fetched at run time straight
 * from trek.nasa.gov (CORS enabled); nothing is redistributed.
 */
import catalog from '../data/trekLayers.json';
import { decodeQuantizedMesh } from './quantizedMesh.js';
import { createGrid, rasterizeTile, fillGaps } from './heightGrid.js';
import { bboxAround, TREK_HEIGHT_OFFSET_M, metresPerDegLat, toLatLon } from './mars.js';
import {
  imageryTileRange,
  imageryTileUrl,
  terrainTileRange,
  terrainTileUrl,
  maxTerrainLevelAt,
  tileDeg,
  TILE_PX,
  TREK_TERRAIN,
} from './tiles.js';

const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;

export const TREK_CATALOG = catalog;

/** Find a layer definition by id in the catalog. */
export function findLayer(id) {
  return catalog.global.find((l) => l.id === id) || catalog.regional.find((l) => l.id === id) || null;
}

async function fetchWithTimeout(url, opts = {}, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const outer = opts.signal;
  if (outer) outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, mode: 'cors', credentials: 'omit' });
  } finally {
    clearTimeout(timer);
  }
}

/** Run async jobs with a concurrency limit. */
export async function pool(items, limit, worker, onProgress) {
  let next = 0;
  let done = 0;
  const results = new Array(items.length);
  async function run() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = { error: err };
      }
      done++;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/* ---------------------------- Terrain ---------------------------- */

let availability = null;

/** Terrain tileset metadata (cached). */
export async function terrainAvailability(signal) {
  if (availability) return availability;
  const res = await fetchWithTimeout(`${TREK_TERRAIN}/layer.json`, { signal });
  if (!res.ok) throw new Error(`terrain metadata HTTP ${res.status}`);
  availability = (await res.json()).available;
  return availability;
}

async function gunzipIfNeeded(buffer) {
  const head = new Uint8Array(buffer, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buffer;
  if (typeof DecompressionStream === 'undefined') throw new Error('gzip not supported');
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const terrainCache = new Map();

export async function fetchTerrainTile(z, x, y, signal) {
  const key = `${z}/${x}/${y}`;
  if (terrainCache.has(key)) return terrainCache.get(key);
  const promise = (async () => {
    const res = await fetchWithTimeout(terrainTileUrl(z, x, y), { signal });
    if (!res.ok) throw new Error(`terrain tile ${key} HTTP ${res.status}`);
    return decodeQuantizedMesh(await gunzipIfNeeded(await res.arrayBuffer()));
  })();
  terrainCache.set(key, promise);
  promise.catch(() => terrainCache.delete(key));
  if (terrainCache.size > 1500) terrainCache.delete(terrainCache.keys().next().value);
  return promise;
}

/** Approximate ground spacing (m) between terrain vertices at a level. */
export function terrainSpacing(z) {
  return (tileDeg(z) * metresPerDegLat()) / 14;
}

/**
 * Load a real elevation grid around a point.
 * @param {{lat:number, lon:number}} origin
 * @param {{sizeM:number, cells:number, signal?:AbortSignal, onProgress?:(d:number,t:number)=>void, maxTiles?:number}} opts
 * @returns {Promise<{grid:ReturnType<typeof createGrid>, level:number, maxLevel:number, spacingM:number, tiles:number, failed:number}>}
 */
export async function loadTerrainGrid(origin, { sizeM, cells, signal, onProgress, maxTiles = 260 }) {
  const available = await terrainAvailability(signal);
  const maxLevel = maxTerrainLevelAt(available, origin.lat, origin.lon);
  const bbox = bboxAround(origin.lat, origin.lon, sizeM);
  const cell = sizeM / cells;
  // Finest level that is available, useful for this cell size and within the tile budget
  let level = 0;
  for (let z = 0; z <= maxLevel; z++) {
    const r = terrainTileRange(bbox, z);
    const count = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    if (count > maxTiles) break;
    level = z;
    if (terrainSpacing(z) <= cell) break;
  }
  const r = terrainTileRange(bbox, level);
  const tiles = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) tiles.push({ z: level, x, y });
  const grid = createGrid(cells, cell);
  const results = await pool(
    tiles,
    CONCURRENCY,
    async (t) => {
      const mesh = await fetchTerrainTile(t.z, t.x, t.y, signal);
      rasterizeTile(grid, mesh, t, origin, TREK_HEIGHT_OFFSET_M);
      return true;
    },
    onProgress
  );
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const failed = results.filter((x) => x?.error).length;
  if (failed === tiles.length) throw new Error('no terrain tiles could be loaded');
  fillGaps(grid);
  return { grid, level, maxLevel, spacingM: Math.max(cell, terrainSpacing(level)), tiles: tiles.length, failed };
}

/**
 * Heights at the VERTICES of a square patch, in the local frame of a fixed
 * origin (used by the first-person chunks so neighbouring chunks share
 * exactly the same edge positions).
 * @param {{lat:number, lon:number}} origin frame origin
 * @param {{e:number, n:number}} centre patch centre (m, east/north of the origin)
 * @param {number} sizeM patch side (m)
 * @param {number} n segments per side → (n+1)² vertices, row 0 = north
 * @returns {Promise<{grid:ReturnType<typeof createGrid>, level:number, failed:number, tiles:number}>}
 */
export async function loadPatchGrid(origin, centre, sizeM, n, { signal, maxTiles = 36 } = {}) {
  const available = await terrainAvailability(signal);
  const ll = toLatLon(centre.e, centre.n, origin);
  const maxLevel = maxTerrainLevelAt(available, ll.lat, ll.lon);
  const cell = sizeM / n;
  const c0 = toLatLon(centre.e - sizeM / 2, centre.n - sizeM / 2, origin);
  const c1 = toLatLon(centre.e + sizeM / 2, centre.n + sizeM / 2, origin);
  const bbox = { west: c0.lon, east: c1.lon, south: c0.lat, north: c1.lat };
  let level = 0;
  for (let z = 0; z <= maxLevel; z++) {
    const r = terrainTileRange(bbox, z);
    if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > maxTiles) break;
    level = z;
    if (terrainSpacing(z) <= cell) break;
  }
  const r = terrainTileRange(bbox, level);
  const tiles = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) tiles.push({ z: level, x, y });
  const grid = createGrid(n + 1, cell);
  const results = await pool(tiles, CONCURRENCY, async (t) => {
    const mesh = await fetchTerrainTile(t.z, t.x, t.y, signal);
    rasterizeTile(grid, mesh, t, origin, TREK_HEIGHT_OFFSET_M, centre);
    return true;
  });
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const failed = results.filter((x) => x?.error).length;
  if (failed === tiles.length) throw new Error('no terrain tiles could be loaded');
  fillGaps(grid);
  return { grid, level, failed, tiles: tiles.length, bbox };
}

/* ---------------------------- Imagery ---------------------------- */

export function layerTileUrl(layer, z, row, col) {
  if (layer.url) return layer.url.replace('{z}', z).replace('{row}', row).replace('{col}', col);
  return imageryTileUrl(layer.trek, z, row, col, layer.ext);
}

export function loadImage(url, signal) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('timeout'));
    }, TIMEOUT_MS);
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`image ${url}`));
    };
    img.src = url;
  });
}

/** True when a regional layer covers the point. */
export function layerCovers(layer, lat, lon, marginDeg = 0) {
  if (!layer.bbox) return true;
  const [w, s, e, n] = layer.bbox;
  return lon >= w + marginDeg && lon <= e - marginDeg && lat >= s + marginDeg && lat <= n - marginDeg;
}

/**
 * Best optical base layer for a site (highest resolution that covers it).
 */
export function bestOpticalLayer(lat, lon, sizeM) {
  const margin = sizeM / 2 / metresPerDegLat();
  const regional = catalog.regional.filter((l) => l.kind === 'optical' && layerCovers(l, lat, lon, margin));
  regional.sort((a, b) => b.maxZ - a.maxZ);
  return regional[0] || catalog.global.find((l) => l.id === 'viking');
}

/**
 * Stitch imagery tiles into a canvas that exactly covers a bbox.
 * @param {object} layer catalog entry
 * @param {{west:number,east:number,south:number,north:number}} bbox
 * @param {{targetPx?:number, signal?:AbortSignal, onProgress?:Function, maxTiles?:number}} opts
 * @returns {Promise<{canvas:HTMLCanvasElement, z:number, metresPerPixel:number, loaded:number, total:number}>}
 */
export async function loadImageryMosaic(layer, bbox, { targetPx = 2048, signal, onProgress, maxTiles = 120 } = {}) {
  const widthDeg = bbox.east - bbox.west;
  // Level whose native resolution best matches targetPx across the bbox
  let z = 0;
  for (let k = 0; k <= layer.maxZ; k++) {
    const r = imageryTileRange(bbox, k);
    if ((r.c1 - r.c0 + 1) * (r.r1 - r.r0 + 1) > maxTiles) break;
    z = k;
    if ((widthDeg / tileDeg(k)) * TILE_PX >= targetPx) break;
  }
  const r = imageryTileRange(bbox, z);
  const cols = r.c1 - r.c0 + 1;
  const rows = r.r1 - r.r0 + 1;
  const full = document.createElement('canvas');
  full.width = cols * TILE_PX;
  full.height = rows * TILE_PX;
  const fctx = full.getContext('2d');
  const jobs = [];
  for (let row = r.r0; row <= r.r1; row++) for (let col = r.c0; col <= r.c1; col++) jobs.push({ row, col });
  const results = await pool(
    jobs,
    CONCURRENCY,
    async ({ row, col }) => {
      const img = await loadImage(layerTileUrl(layer, z, row, col), signal);
      fctx.drawImage(img, (col - r.c0) * TILE_PX, (row - r.r0) * TILE_PX);
      return true;
    },
    onProgress
  );
  const loaded = results.filter((x) => x === true).length;
  // Crop to the bbox
  const pxPerDeg = TILE_PX / tileDeg(z);
  const sx = (bbox.west - r.west) * pxPerDeg;
  const sy = (r.north - bbox.north) * pxPerDeg;
  const sw = widthDeg * pxPerDeg;
  const sh = (bbox.north - bbox.south) * pxPerDeg;
  const outW = Math.max(1, Math.min(4096, Math.round(sw)));
  const outH = Math.max(1, Math.min(4096, Math.round(sh)));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  canvas.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, outW, outH);
  const metresPerPixel = ((bbox.north - bbox.south) * metresPerDegLat()) / outH;
  return { canvas, z, metresPerPixel, loaded, total: jobs.length };
}

/**
 * Whole-planet equirectangular texture of a global layer.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function loadGlobalLayer(layer, z = 2, opts = {}) {
  const level = Math.min(z, layer.maxZ);
  const { canvas } = await loadImageryMosaic(
    layer,
    { west: -180, east: 180, south: -90, north: 90 },
    { ...opts, targetPx: TILE_PX * 2 ** (level + 1), maxTiles: 2 ** (2 * level + 1) }
  );
  return canvas;
}

/* ---------------------------- Features ---------------------------- */

/**
 * Hydrous-mineral detections (CRISM/OMEGA) inside a bbox, as GeoJSON points.
 * @returns {Promise<{lat:number, lon:number, instrument:string}[]>}
 */
export async function loadHydrousMinerals(bbox, signal) {
  const url = new URL(catalog.features.hydrous.url);
  url.search = new URLSearchParams({
    where: '1=1',
    outFields: 'Instrument,Type',
    returnGeometry: 'true',
    f: 'geojson',
    geometry: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
  }).toString();
  const res = await fetchWithTimeout(url.toString(), { signal });
  if (!res.ok) throw new Error(`features HTTP ${res.status}`);
  const json = await res.json();
  return (json.features || [])
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], instrument: String(f.properties?.Instrument || '') }));
}

export { fetchWithTimeout };
