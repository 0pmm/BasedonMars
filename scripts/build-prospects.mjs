/**
 * Build src/data/prospects.json: data-driven candidate zones for the
 * "ancient life" objective, from the CRISM/OMEGA hydrated-mineral detections
 * published by NASA/JPL Mars Trek.
 *
 * Method: download every detection (the service caps a single response at
 * 1000, so the planet is split into sectors), bucket them on a 1.5 degree
 * grid, merge adjacent buckets into clusters, and keep the clusters with at
 * least four detections. The score is a relative prospectivity index, not an
 * official NASA ranking. Absence of detections is NOT absence of minerals:
 * CRISM/OMEGA only observed selected targets.
 *
 * Run with: node scripts/build-prospects.mjs
 */
/* global process */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from './curated.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUERY = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query';
const R = 3396190;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = (d) => (d * Math.PI) / 180;

function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  let dLon = b.lon - a.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  dLon = rad(dLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.min(1, Math.sqrt(s)))) / 1000;
}

const SECTORS = [];
for (const [s, n] of [
  [-90, -30],
  [-30, 0],
  [0, 30],
  [30, 90],
]) {
  for (const [w, e] of [
    [-180, -90],
    [-90, 0],
    [0, 90],
    [90, 180],
  ])
    SECTORS.push([w, s, e, n]);
}

async function fetchSector([w, s, e, n]) {
  const bbox = [w, s, e, n].join(',');
  const url =
    `${QUERY}?where=1%3D1&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope` +
    `&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Latitude,Longitude,Instrument&returnGeometry=false&f=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'mars-explorer-science-build/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json.features || []).map((f) => ({
        lat: Number(f.attributes?.Latitude),
        lon: Number(f.attributes?.Longitude),
        instrument: String(f.attributes?.Instrument || ''),
      }));
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return [];
}

const seen = new Map();
let requests = 0;
for (const sector of SECTORS) {
  const points = await fetchSector(sector);
  requests++;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const key = `${p.lat.toFixed(3)}|${p.lon.toFixed(3)}|${p.instrument}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  process.stdout.write(`sector ${requests}/${SECTORS.length}: ${points.length} points\n`);
}
const points = [...seen.values()];
console.log(`Total unique detections: ${points.length}`);

/* ------------------------- Clustering ------------------------- */
/**
 * Greedy density clustering: repeatedly take the point with the most
 * neighbours within RADIUS_KM and absorb them, so every zone is compact
 * (radius <= RADIUS_KM) instead of chaining across the planet.
 */
const RADIUS_KM = 100;
const neighbours = points.map(() => []);
for (let i = 0; i < points.length; i++) {
  for (let j = i + 1; j < points.length; j++) {
    if (distanceKm(points[i], points[j]) <= RADIUS_KM) {
      neighbours[i].push(j);
      neighbours[j].push(i);
    }
  }
}

const remaining = new Set(points.map((_, i) => i));
const zones = [];
while (remaining.size >= 4) {
  let seed = -1;
  let bestCount = 0;
  for (const i of remaining) {
    let count = 0;
    for (const j of neighbours[i]) if (remaining.has(j)) count++;
    if (count > bestCount) {
      bestCount = count;
      seed = i;
    }
  }
  if (seed < 0 || bestCount < 3) break; // seed + >=3 neighbours = 4 detections
  const members = [seed, ...neighbours[seed].filter((j) => remaining.has(j))];
  for (const i of members) remaining.delete(i);

  const list = members.map((i) => points[i]);
  const lat = list.reduce((s, p) => s + p.lat, 0) / list.length;
  let lon = list.reduce((s, p) => s + p.lon, 0) / list.length;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const center = { lat, lon };
  let radius = 0;
  for (const p of list) radius = Math.max(radius, distanceKm(center, p));
  const crism = list.filter((p) => p.instrument.toUpperCase().includes('CRISM')).length;
  const omega = list.filter((p) => p.instrument.toUpperCase().includes('OMEGA')).length;
  const score = clamp(0.65 * (crism / list.length) + 0.35 * Math.min(1, list.length / 20), 0, 1);
  const confidence = crism >= 8 ? 'high' : crism >= 3 ? 'medium' : 'low';

  let near = null;
  for (const site of SITES) {
    const km = distanceKm(center, site);
    if (!near || km < near.km) near = { siteId: site.id, name: site.name, km: Math.round(km), visited: !!site.visited };
  }

  zones.push({
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(lon * 1000) / 1000,
    radiusKm: Math.round(clamp(radius, 5, RADIUS_KM)),
    detections: list.length,
    crism,
    omega,
    score: Math.round(score * 100) / 100,
    confidence,
    explored: !!(near && near.visited && near.km <= 150),
    near: near && near.km <= 500 ? near : null,
  });
}

zones.sort((a, b) => b.score - a.score || b.detections - a.detections);
const top = zones.slice(0, 40).map((z, i) => ({ id: `zone-${String(i + 1).padStart(2, '0')}`, ...z }));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  method:
    'Candidate zones for hydrated-mineral exploration, clustered from every CRISM/OMEGA hydrated-mineral detection published by NASA/JPL Mars Trek (1.5 degree buckets, clusters with >=4 detections). Score is a relative prospectivity index (CRISM share + cluster size), not an official NASA ranking. Detections only exist where the instruments observed: absence is not evidence of absence.',
  source: 'NASA/JPL Mars Trek - Hydrous Mineral Detections (OMEGA/CRISM)',
  totalDetections: points.length,
  zones: top,
};

writeFileSync(join(ROOT, 'src/data/prospects.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote src/data/prospects.json (${top.length} zones). Best: ${top[0]?.score} at ${top[0]?.lat},${top[0]?.lon}`);
