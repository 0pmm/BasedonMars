/**
 * Site model: everything the planner and the first-person view need
 * about a real place on Mars, built from NASA data at run time.
 */
import { bboxAround, toLocal } from '../geo/mars.js';
import { loadTerrainGrid, loadImageryMosaic, bestOpticalLayer, findLayer, loadHydrousMinerals, layerCovers } from '../geo/trek.js';
import { slopeMap, roughnessMap, gridStats, sampleHeight } from '../geo/heightGrid.js';
import { detectRocks } from './rocks.js';

const siteCache = new Map();

/**
 * @typedef {object} SiteModel
 * @property {{lat:number, lon:number}} origin
 * @property {number} sizeM
 * @property {object} grid elevation grid (heightGrid.js)
 * @property {Float32Array} slope
 * @property {Float32Array} roughness
 * @property {{min:number, max:number}} stats
 * @property {HTMLCanvasElement} image base orthophoto covering the site
 * @property {object} imageLayer catalog entry of the base image
 * @property {number} imageMpp metres per pixel of the base image
 * @property {{e:number, n:number, d:number}[]} rocks boulders detected in the image
 * @property {{level:number, maxLevel:number, spacingM:number, tiles:number, failed:number}} terrainInfo
 * @property {(e:number, n:number)=>number} height
 */

/**
 * Load (or reuse) a site.
 * @param {{lat:number, lon:number}} origin
 * @param {{sizeM?:number, cells?:number, imagePx?:number, rocks?:boolean, signal?:AbortSignal, onProgress?:(stage:string, f:number)=>void}} [opts]
 * @returns {Promise<SiteModel>}
 */
export async function loadSite(origin, opts = {}) {
  const sizeM = opts.sizeM ?? 2000;
  const cells = opts.cells ?? 320;
  const imagePx = opts.imagePx ?? 2048;
  const key = `${origin.lat.toFixed(5)},${origin.lon.toFixed(5)},${sizeM},${cells},${imagePx}`;
  if (siteCache.has(key)) return siteCache.get(key);
  const promise = buildSite(origin, { ...opts, sizeM, cells, imagePx });
  siteCache.set(key, promise);
  promise.catch(() => siteCache.delete(key));
  if (siteCache.size > 6) siteCache.delete(siteCache.keys().next().value);
  return promise;
}

async function buildSite(origin, opts) {
  const { sizeM, cells, imagePx, signal, onProgress, rocks: wantRocks = true } = opts;
  const progress = (stage, f) => onProgress?.(stage, f);
  const bbox = bboxAround(origin.lat, origin.lon, sizeM);
  const imageLayer = bestOpticalLayer(origin.lat, origin.lon, sizeM);

  const [terrain, imagery] = await Promise.all([
    loadTerrainGrid(origin, {
      sizeM,
      cells,
      signal,
      maxTiles: opts.maxTerrainTiles ?? 160,
      onProgress: (d, t) => progress('terrain', d / t),
    }),
    imagePx > 0
      ? loadImageryMosaic(imageLayer, bbox, { targetPx: imagePx, signal, onProgress: (d, t) => progress('imagery', d / t) }).catch(
          (err) => {
            console.warn('[site] imagery failed', err);
            return null;
          }
        )
      : Promise.resolve(null),
  ]);
  const { grid } = terrain;
  progress('analysis', 0);
  const slope = slopeMap(grid);
  const roughness = roughnessMap(grid);
  const stats = gridStats(grid);

  let rocks = [];
  if (wantRocks && imagery && imagery.metresPerPixel <= 1.5) {
    const ctx = imagery.canvas.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, imagery.canvas.width, imagery.canvas.height);
    rocks = detectRocks(data, width, height, imagery.metresPerPixel).map((r) => ({
      e: (r.x / width - 0.5) * sizeM,
      n: (0.5 - r.y / height) * sizeM,
      d: r.d,
    }));
  }
  progress('analysis', 1);

  return {
    origin,
    sizeM,
    bbox,
    grid,
    slope,
    roughness,
    stats,
    image: imagery?.canvas ?? null,
    imageLayer: imagery ? imageLayer : null,
    imageMpp: imagery?.metresPerPixel ?? null,
    rocks,
    terrainInfo: {
      level: terrain.level,
      maxLevel: terrain.maxLevel,
      spacingM: terrain.spacingM,
      tiles: terrain.tiles,
      failed: terrain.failed,
    },
    height: (e, n) => sampleHeight(grid, e, n),
  };
}

/**
 * Overlay image of a Trek layer for a site (cached per site).
 * @returns {Promise<HTMLCanvasElement|null>}
 */
export async function loadSiteLayer(site, layerId, signal) {
  site.layerCache ??= new Map();
  if (site.layerCache.has(layerId)) return site.layerCache.get(layerId);
  const layer = findLayer(layerId);
  if (!layer || !layerCovers(layer, site.origin.lat, site.origin.lon)) return null;
  const p = loadImageryMosaic(layer, site.bbox, { targetPx: 1024, signal, maxTiles: 64 })
    .then((r) => (r.loaded ? r.canvas : null))
    .catch(() => null);
  site.layerCache.set(layerId, p);
  return p;
}

/** Hydrous-mineral detections near a site, in local metres. */
export async function loadSiteMinerals(site, signal) {
  const pad = 1.5; // degrees: these detections are regional context
  const b = site.bbox;
  const pts = await loadHydrousMinerals({ west: b.west - pad, east: b.east + pad, south: b.south - pad, north: b.north + pad }, signal);
  return pts.map((p) => ({ ...p, ...toLocal(p.lat, p.lon, site.origin) }));
}

/** Convert a list of [lon, lat] to local points clipped to the site. */
export function lineToLocal(site, coords) {
  const half = site.sizeM / 2;
  const out = [];
  for (const [lon, lat] of coords) {
    const p = toLocal(lat, lon, site.origin);
    if (Math.abs(p.e) <= half && Math.abs(p.n) <= half) out.push(p);
  }
  return out;
}
