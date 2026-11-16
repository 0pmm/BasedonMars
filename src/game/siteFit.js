/**
 * Objective-to-site fit: how well a landing site supports a scientific
 * objective. Pure and unit-tested.
 *
 * Every number here is a planning judgement built from the attribute values
 * in src/data/scienceSites.json (derived from NASA/JPL Mars Trek layers and
 * published studies). The result is NOT an official NASA site ranking; it is
 * the project's transparent model, with the weights published in the UI.
 */
import data from '../data/objectives.json';

export const OBJECTIVES = Object.freeze(data.objectives);

/**
 * Free exploration: no scientific goal. Sites are listed, not ranked, and the
 * globe shows every place without zones or scores.
 */
export const FREE_EXPLORATION = Object.freeze({
  id: 'free',
  icon: 'free',
  free: true,
  name: { en: 'Free exploration', pt: 'Exploração livre' },
  question: { en: 'What is out there?', pt: 'O que existe por lá?' },
  short: {
    en: 'No goal set: fly anywhere, zoom down to the ground, mark any route and walk it out of curiosity.',
    pt: 'Sem objetivo definido: voe para qualquer lugar, desça até o chão, marque qualquer rota e percorra por curiosidade.',
  },
});

/** The three scientific objectives plus free exploration. */
export const ALL_OBJECTIVES = Object.freeze([...OBJECTIVES, FREE_EXPLORATION]);
export const ATTRIBUTES = Object.freeze(data.attributes);

/** @param {string} id */
export function objectiveById(id) {
  if (id === 'free') return FREE_EXPLORATION;
  return OBJECTIVES.find((o) => o.id === id) || OBJECTIVES[0];
}

/** Clamp helper. */
function clamp01(v) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Normalised weights (guards against hand-edited data that does not sum to 1). */
export function normalisedWeights(objective) {
  const entries = Object.entries(objective?.weights || {}).filter(([, w]) => Number.isFinite(w) && w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  return Object.fromEntries(entries.map(([k, w]) => [k, w / total]));
}

/**
 * Fit of one site for one objective.
 * @param {{id:string, attributes:Record<string,{v:number,kind?:string,source?:string}>, confidence?:number}} site
 * @param {string} objectiveId
 * @returns {{siteId:string, objectiveId:string, score:number, grade:string, factors:Array,
 *            drivers:Array, limits:Array, missing:string[], confidence:number}}
 */
export function fitSite(site, objectiveId) {
  const objective = objectiveById(objectiveId);
  const weights = normalisedWeights(objective);
  const factors = [];
  const missing = [];
  for (const [key, weight] of Object.entries(weights)) {
    const attr = site?.attributes?.[key];
    if (!attr || !Number.isFinite(attr.v)) {
      missing.push(key);
      continue;
    }
    const value = clamp01(attr.v);
    factors.push({
      key,
      value,
      weight,
      contribution: value * weight,
      kind: attr.kind || 'literature',
      source: attr.source || ATTRIBUTES[key]?.source || '',
      sourceKey: attr.sourceKey,
      sourceVars: attr.sourceVars,
    });
  }
  // Share of the objective's criteria that have data. A place known only from
  // orbit (a candidate area) is scored on what is known, scaled down for what
  // is not: unknowns are never filled in, and never count as perfect either.
  const coverage = factors.reduce((s, f) => s + f.weight, 0);
  const known = coverage > 0 ? factors.reduce((s, f) => s + f.contribution, 0) / coverage : 0;
  const score = Math.round(Math.max(0, Math.min(1, known * (0.6 + 0.4 * coverage))) * 100);
  const drivers = [...factors].sort((a, b) => b.contribution - a.contribution).slice(0, 2);
  const weak = factors
    .filter((f) => f.value < 0.85)
    .map((f) => ({ ...f, gap: (1 - f.value) * f.weight }))
    .sort((a, b) => b.gap - a.gap);
  const limits = weak.slice(0, 2);
  if (limits.length < 2) {
    const rest = factors
      .filter((f) => !limits.some((l) => l.key === f.key))
      .map((f) => ({ ...f, gap: (1 - f.value) * f.weight }))
      .sort((a, b) => a.value - b.value);
    limits.push(...rest.slice(0, 2 - limits.length));
  }
  return {
    siteId: site?.id,
    objectiveId,
    score,
    grade: gradeOf(score),
    factors: factors.sort((a, b) => b.contribution - a.contribution),
    drivers,
    limits,
    missing,
    coverage,
    confidence: clamp01(site?.confidence ?? 0.5),
  };
}

/** @param {number} score */
export function gradeOf(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

/**
 * Rank curated sites for an objective.
 * @param {Array} sites
 * @param {string} objectiveId
 * @returns {Array<{rank:number, site:object, fit:ReturnType<typeof fitSite>}>}
 */
export function rankSites(sites, objectiveId) {
  // free exploration does not rank: alphabetical, no fit
  if (objectiveId === 'free')
    return sites
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((site, i) => ({ site, fit: null, rank: i + 1 }));
  return sites
    .map((site) => ({ site, fit: fitSite(site, objectiveId) }))
    .sort((a, b) => b.fit.score - a.fit.score || a.site.name.localeCompare(b.site.name))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/** Rank of one site inside the curated list (1 = best), or null. */
export function rankOf(sites, objectiveId, siteId) {
  const row = rankSites(sites, objectiveId).find((r) => r.site.id === siteId);
  return row ? row.rank : null;
}

/** Missions whose stated objective is this one. */
export function missionsForObjective(missions, objectiveId) {
  return missions.filter((m) => m.objective === objectiveId);
}
