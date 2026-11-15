/**
 * Build src/data/scienceSites.json from curated facts + live NASA/JPL Mars Trek
 * services (CRISM/OMEGA hydrated-mineral detections and the USGS global
 * geology map). Run with: node scripts/build-science-data.mjs
 *
 * The output is committed so the app works offline for the curated sites; the
 * script records its own provenance and can be re-run when the services change.
 */
/* global process */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES, MISSIONS, IMAGERY, HYDRATION, TARGETS } from './curated.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HYDROUS = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer/0/query';
const GEOLOGY = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/SIM3292_Global_Geology/MapServer/identify';

const R = 3396190;
const rad = (d) => (d * Math.PI) / 180;

function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.min(1, Math.sqrt(s)))) / 1000;
}

async function getJson(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'mars-explorer-science-build/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

async function hydrousAround(site, radiusKm = 140) {
  const dLat = radiusKm / 111;
  const dLon = Math.min(30, dLat / Math.max(0.2, Math.cos(rad(site.lat))));
  const bbox = [site.lon - dLon, site.lat - dLat, site.lon + dLon, site.lat + dLat].map((v) => v.toFixed(4)).join(',');
  const url =
    `${HYDROUS}?where=1%3D1&geometry=${encodeURIComponent(bbox)}&geometryType=esriGeometryEnvelope` +
    `&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Latitude,Longitude,Instrument` +
    `&returnGeometry=false&f=json`;
  const json = await getJson(url);
  const points = (json.features || []).map((f) => ({
    lat: Number(f.attributes?.Latitude),
    lon: Number(f.attributes?.Longitude),
    instrument: String(f.attributes?.Instrument || ''),
  }));
  const crism = points.filter((p) => p.instrument.toUpperCase().includes('CRISM')).length;
  const omega = points.filter((p) => p.instrument.toUpperCase().includes('OMEGA')).length;
  let nearestKm = null;
  for (const p of points) {
    const d = distanceKm(site, p);
    if (nearestKm == null || d < nearestKm) nearestKm = d;
  }
  return { count: points.length, crism, omega, nearestKm: nearestKm == null ? null : Math.round(nearestKm) };
}

async function geologyAt(site) {
  const extent = [site.lon - 0.05, site.lat - 0.05, site.lon + 0.05, site.lat + 0.05].map((v) => v.toFixed(4)).join(',');
  const url =
    `${GEOLOGY}?geometry=${site.lon}%2C${site.lat}&geometryType=esriGeometryPoint&sr=4326&layers=all` +
    `&tolerance=2&mapExtent=${encodeURIComponent(extent)}&imageDisplay=400%2C400%2C96&returnGeometry=false&f=json`;
  const json = await getJson(url);
  const a = json.results?.[0]?.attributes || {};
  return { unit: a.Unit ? String(a.Unit) : null, description: a.UnitDesc ? String(a.UnitDesc) : null };
}

const sites = [];
for (const site of SITES) {
  process.stdout.write(`- ${site.id}: `);
  const hydrous = await hydrousAround(site);
  const geology = await geologyAt(site);
  const hydration = {
    v: HYDRATION[site.id],
    kind: 'literature',
    source: `Published mineralogy; ${hydrous.count} CRISM/OMEGA detections within 140 km`,
  };
  const attributes = { ...site.attributes, hydration };
  const targets = (TARGETS[site.id] || []).map((tt) => ({ ...tt }));
  sites.push({ ...site, attributes, targets, data: { hydrous, geology } });
  console.log(
    `${hydrous.count} detections (CRISM ${hydrous.crism}, OMEGA ${hydrous.omega}), unit ${geology.unit || '?'}, hydration ${hydration.v}`
  );
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  method:
    'Sites curated from published mission/orbital studies. Hydration is a literature-based value corroborated at build time by the CRISM/OMEGA hydrated-mineral detections within 140 km (NASA/JPL Mars Trek). Geology unit from the USGS SIM 3292 map service. Other attribute values are literature-based planning judgements (0..1), not official NASA ratings.',
  sources: [
    'NASA/JPL Mars Trek — Hydrous Mineral Detections (OMEGA/CRISM)',
    'USGS SIM 3292 global geology (Tanaka et al. 2014)',
    'NASA NSSDCA mission catalog',
  ],
  imagery: IMAGERY,
  sites,
  missions: MISSIONS,
};

writeFileSync(join(ROOT, 'src/data/scienceSites.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWrote src/data/scienceSites.json (${sites.length} sites, ${MISSIONS.length} missions).`);
