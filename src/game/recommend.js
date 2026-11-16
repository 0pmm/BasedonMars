/**
 * Recommendations for the guide: the single best site / zone for the
 * objective, optionally "highlighted by" one criterion (filters), plus what
 * each option stands out in. Pure and unit-tested; the numbers come from
 * siteFit.js (sites) and prospects.json (zones of hydrated-mineral detections).
 */
import { rankSites, objectiveById } from './siteFit.js';

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
