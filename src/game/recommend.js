/**
 * Recommendations for the guide: the single best site / zone for the
 * objective, optionally "highlighted by" one criterion (filters), plus what
 * each option stands out in. Pure and unit-tested; the numbers come from
 * siteFit.js (sites) and prospects.json (zones of hydrated-mineral detections).
 */
import { rankSites, objectiveById, fitSite } from './siteFit.js';

/** Minimum weight for a criterion to become a filter of its own. */
const FILTER_MIN_WEIGHT = 0.1;

/** Filters for sites: 'general' plus the objective's main criteria, heaviest first. */
export function siteFilters(objectiveId) {
  const objective = objectiveById(objectiveId);
  if (objective.free) return [];
  const keys = Object.entries(objective.weights || {})
    .filter(([, w]) => w >= FILTER_MIN_WEIGHT)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  return ['general', ...keys];
}

/**
 * Sites ranked for an objective. With a criterion filter the order follows
 * that criterion (ties broken by the overall fit), so each filter shows where
 * a different site stands out.
 * @returns {Array<{rank:number, site:object, fit:object, key:number|null}>}
 */
export function rankSitesBy(sites, objectiveId, filter = 'general') {
  const ranked = rankSites(sites, objectiveId);
  if (!filter || filter === 'general') return ranked.map((r) => ({ ...r, key: null }));
  return ranked
    .map((r) => ({ ...r, key: r.site.attributes?.[filter]?.v ?? 0 }))
    .sort((a, b) => b.key - a.key || b.fit.score - a.fit.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** The strongest criteria of a site for the objective (best first). */
export function highlights(site, objectiveId, n = 2) {
  const objective = objectiveById(objectiveId);
  return Object.keys(objective.weights || {})
    .map((key) => ({ key, value: site.attributes?.[key]?.v }))
    .filter((x) => Number.isFinite(x.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/* ------------------------------- zones -------------------------------- */

export const ZONE_FILTERS = Object.freeze(['general', 'detections', 'confidence', 'sunlight', 'unexplored']);

/** Year-round sunlight proxy from latitude (1 at the equator, 0 at the poles). */
export const sunlight = (lat) => Math.max(0, Math.cos((lat * Math.PI) / 180));

const CONFIDENCE = { high: 1, medium: 0.6, low: 0.35 };
export const confidenceValue = (c) => CONFIDENCE[c] ?? 0.35;

/**
 * Overall value of a zone for an objective (0..1).
 * Geology: the detection score (hydrated minerals record water in the planet's past).
 * Survival: hydrated minerals are water a base could extract, and a base also
 * needs sunlight for power, so latitude weighs in.
 */
export function zoneValue(zone, objectiveId) {
  if (objectiveId === 'survival') return 0.55 * zone.score + 0.45 * sunlight(zone.lat);
  return zone.score;
}

/**
 * Zones ranked for an objective and filter.
 * @returns {Array<{rank:number, zone:object, value:number, key:number}>}
 */
export function rankZones(zones, objectiveId, filter = 'general') {
  const maxDet = Math.max(1, ...zones.map((z) => z.detections || 0));
  const keyOf = (z) => {
    if (filter === 'detections') return (z.detections || 0) / maxDet;
    if (filter === 'confidence') return confidenceValue(z.confidence);
    if (filter === 'sunlight') return sunlight(z.lat);
    return zoneValue(z, objectiveId);
  };
  return zones
    .filter((z) => (filter === 'unexplored' ? !z.explored : true))
    .map((zone) => ({ zone, value: zoneValue(zone, objectiveId), key: keyOf(zone) }))
    .sort((a, b) => b.key - a.key || b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ------------------------------- places -------------------------------
 * One list for the guide: the curated sites and the candidate areas (clusters
 * of hydrated-mineral detections) are all "places". A candidate area carries
 * only what orbit can tell (water-bearing minerals, sunlight from latitude);
 * the other criteria stay unknown and the fit is scaled down for them
 * (siteFit.js), so it is never presented as better known than it is.
 */

export const EXPLORED_FILTERS = Object.freeze(['all', 'explored', 'unexplored']);

const round2 = (v) => Math.round(v * 100) / 100;

/** A candidate area as a place. Attribute sources are i18n keys (sourceKey/sourceVars). */
export function zoneAsPlace(zone) {
  const sun = sunlight(zone.lat);
  return {
    id: zone.id,
    kind: 'zone',
    zone,
    lat: zone.lat,
    lon: zone.lon,
    visited: !!zone.explored,
    confidence: round2(confidenceValue(zone.confidence) * 0.7),
    attributes: {
      hydration: { v: zone.score, kind: 'derived', sourceKey: 'rec.src.hydration', sourceVars: { n: zone.detections, km: zone.radiusKm } },
      waterAccess: { v: round2(zone.score * 0.9), kind: 'derived', sourceKey: 'rec.src.water' },
      power: { v: round2(0.9 * sun), kind: 'derived', sourceKey: 'rec.src.power', sourceVars: { lat: Math.abs(zone.lat).toFixed(1) } },
    },
  };
}

/** Great-circle distance in km (Mars radius), kept local so this module stays pure. */
function km(a, b) {
  const R = 3389.5;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Within this distance an explored site is worth mentioning ("120 km from Jezero"). */
export const NEAR_KM = 600;

/**
 * Every place for an objective: fit, exploration status, the missions that
 * explored it and, for the others, the nearest explored site.
 */
export function places(sites, zones, missions, objectiveId) {
  const explored = sites.filter((s) => s.visited);
  const missionsAt = (id) => missions.filter((m) => m.siteId === id);
  const list = [
    ...sites.map((s) => ({
      id: s.id,
      kind: 'site',
      site: s,
      lat: s.lat,
      lon: s.lon,
      visited: !!s.visited,
      attributes: s.attributes,
      confidence: s.confidence,
    })),
    ...zones.map(zoneAsPlace),
  ];
  return list.map((p) => {
    let near = null;
    if (!(p.kind === 'site' && p.visited)) {
      for (const s of explored) {
        const d = km(p, s);
        if (d <= NEAR_KM && (!near || d < near.km)) near = { id: s.id, name: s.name, km: Math.round(d), missions: missionsAt(s.id) };
      }
    }
    return { ...p, fit: fitSite(p, objectiveId), missions: p.kind === 'site' ? missionsAt(p.id) : [], near };
  });
}

/**
 * Places ranked by the overall fit or by one criterion, optionally only the
 * explored / never-explored ones. Places without data for the criterion go last.
 */
export function rankPlaces(list, { filter = 'general', explored = 'all' } = {}) {
  const keyOf = (p) => (filter === 'general' ? p.fit.score / 100 : (p.attributes?.[filter]?.v ?? -1));
  return list
    .filter((p) => explored === 'all' || (explored === 'explored' ? p.visited : !p.visited))
    .map((p) => ({ ...p, key: keyOf(p) }))
    .sort((a, b) => b.key - a.key || b.fit.score - a.fit.score || (a.kind === b.kind ? 0 : a.kind === 'site' ? -1 : 1))
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Plain-language reasons for a zone (i18n keys + vars), strongest first. */
export function zoneReasons(zone, objectiveId) {
  const out = [];
  out.push({ key: objectiveId === 'survival' ? 'rec.zone.water' : 'rec.zone.past', vars: { n: zone.detections, km: zone.radiusKm } });
  if (zone.confidence === 'high') out.push({ key: 'rec.zone.confHigh' });
  if (!zone.explored) out.push({ key: 'rec.zone.new' });
  const sun = sunlight(zone.lat);
  out.push({ key: sun >= 0.85 ? 'rec.zone.sunGood' : 'rec.zone.sunLow', vars: { lat: Math.abs(zone.lat).toFixed(1) }, minus: sun < 0.85 });
  if (zone.confidence !== 'high') out.push({ key: 'rec.zone.confMedium', minus: true });
  if (zone.explored) out.push({ key: 'rec.zone.explored', minus: true });
  return out;
}
