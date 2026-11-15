import { describe, it, expect } from 'vitest';
import scienceData from '../../src/data/scienceSites.json';
import prospects from '../../src/data/prospects.json';
import objectivesData from '../../src/data/objectives.json';
import { fitSite, rankSites, rankOf, objectiveById, normalisedWeights } from '../../src/game/siteFit.js';
import { landability, landingConfidence } from '../../src/game/landability.js';
import { selectTargets, sequenceStops, scienceCoverage, bestBasePoint } from '../../src/planner/scout.js';
import { scorePlan } from '../../src/planner/eva.js';
import { distanceM } from '../../src/geo/mars.js';

const SITES = scienceData.sites;
const MISSIONS = scienceData.missions;
const OBJECTIVES = objectivesData.objectives;

describe('science data', () => {
  it('has the agreed catalogue: 3 objectives, 12 sites, 8 missions', () => {
    expect(OBJECTIVES).toHaveLength(3);
    expect(SITES).toHaveLength(12);
    expect(MISSIONS).toHaveLength(8);
    expect(new Set(SITES.map((s) => s.id)).size).toBe(12);
  });

  it('every objective weight maps to an attribute of every site', () => {
    for (const objective of OBJECTIVES) {
      for (const site of SITES) {
        for (const key of Object.keys(objective.weights)) {
          expect(site.attributes[key], `${site.id}.${key}`).toBeTruthy();
          expect(site.attributes[key].v).toBeGreaterThanOrEqual(0);
          expect(site.attributes[key].v).toBeLessThanOrEqual(1);
          expect(site.attributes[key].source).toBeTruthy();
        }
      }
    }
  });

  it('missions reference existing sites and objectives', () => {
    for (const mission of MISSIONS) {
      expect(
        SITES.some((s) => s.id === mission.siteId),
        mission.id
      ).toBe(true);
      expect(
        OBJECTIVES.some((o) => o.id === mission.objective),
        mission.id
      ).toBe(true);
    }
  });

  it('every site has science targets within a realistic walk', () => {
    for (const site of SITES) {
      expect(site.targets.length, site.id).toBeGreaterThan(0);
      for (const target of site.targets) {
        expect(distanceM(site.lat, site.lon, target.lat, target.lon), `${site.id}/${target.id}`).toBeLessThan(250e3);
        expect(target.kinds.length).toBeGreaterThan(0);
      }
    }
  });

  it('records the provenance of the derived data', () => {
    expect(scienceData.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(scienceData.method.length).toBeGreaterThan(80);
    expect(scienceData.sources.length).toBeGreaterThan(0);
    for (const site of SITES) {
      expect(site.data.hydrous.count).toBeGreaterThanOrEqual(0);
      expect(site.data.geology.unit || site.data.geology.description).toBeTruthy();
    }
  });
});

describe('site fit', () => {
  it('normalises weights and scores 0..100', () => {
    const objective = objectiveById('life');
    const w = normalisedWeights(objective);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    for (const site of SITES) {
      const fit = fitSite(site, 'life');
      expect(fit.score).toBeGreaterThanOrEqual(0);
      expect(fit.score).toBeLessThanOrEqual(100);
      expect(fit.drivers).toHaveLength(2);
      expect(fit.limits).toHaveLength(2);
    }
  });

  it('ranks every site once and explains the result', () => {
    const ranked = rankSites(SITES, 'geology');
    expect(ranked.map((r) => r.site.id).sort()).toEqual(SITES.map((s) => s.id).sort());
    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    expect(ranked[0].fit.score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].fit.score);
    for (const row of ranked) {
      for (const f of row.fit.factors) expect(f.weight).toBeGreaterThan(0);
    }
  });

  it('reproduces the modern mission choices (regression guard)', () => {
    // Modern missions were sited with modern orbital data; this is the model's
    // sanity check. 1970s sites are excluded on purpose (engineering, not science).
    expect(rankOf(SITES, 'life', 'jezero')).toBeLessThanOrEqual(2);
    expect(rankOf(SITES, 'life', 'gale')).toBeLessThanOrEqual(4);
    expect(rankOf(SITES, 'survival', 'elysium')).toBeLessThanOrEqual(3);
    expect(rankOf(SITES, 'geology', 'meridiani')).toBeLessThanOrEqual(7);
    expect(rankOf(SITES, 'geology', 'gusev')).toBeLessThanOrEqual(9);
  });

  it('surfaces unexplored candidates for ancient life', () => {
    const top = rankSites(SITES, 'life').slice(0, 5);
    expect(top.some((r) => !r.site.visited)).toBe(true);
    expect(top.some((r) => r.site.id === 'mawrth' || r.site.id === 'oxia')).toBe(true);
  });

  it('reports missing attributes instead of inventing them', () => {
    const site = { id: 'x', name: 'X', attributes: {}, confidence: 0.5 };
    const fit = fitSite(site, 'life');
    expect(fit.score).toBe(0);
    expect(fit.missing.length).toBeGreaterThan(0);
    expect(fit.factors).toHaveLength(0);
  });
});

describe('landability', () => {
  it('prefers flat, low, smooth ground', () => {
    const good = landability({ elevationM: -3000, maxSlopeDeg: 2, roughnessM: 0.1, rocksPerKm2: 2, latitude: 10 });
    const bad = landability({ elevationM: 2000, maxSlopeDeg: 20, roughnessM: 1.5, rocksPerKm2: 60, latitude: 75 });
    expect(good.score).toBeGreaterThan(80);
    expect(bad.score).toBeLessThan(30);
    expect(good.grade).toBe('A');
    expect(bad.limits.length).toBe(2);
  });

  it('scales confidence with image resolution', () => {
    expect(landingConfidence({ resolutionM: 1 }).level).toBe('high');
    expect(landingConfidence({ resolutionM: 6 }).level).toBe('medium');
    expect(landingConfidence({ resolutionM: 200 }).level).toBe('very-low');
  });
});

describe('science scouting', () => {
  const base = { lat: 0, lon: 0 };
  const objective = { targetKinds: ['hydration', 'aqueous'] };

  it('only picks targets that serve the objective and are in range', () => {
    const targets = [
      { id: 'a', lat: 0.01, lon: 0, value: 0.9, kinds: ['hydration'] },
      { id: 'b', lat: 0.02, lon: 0, value: 0.8, kinds: ['aqueous'] },
      { id: 'c', lat: 0.5, lon: 0, value: 1.0, kinds: ['hydration'] }, // ~30 km away
      { id: 'd', lat: 0.01, lon: 0.01, value: 1.0, kinds: ['survival'] },
    ];
    const picked = selectTargets({ targets, objective, base, maxStops: 2, maxRadiusM: 5000 });
    expect(picked.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('orders stops without losing any', () => {
    const stops = [
      { id: 'east', lat: 0, lon: 0.01 },
      { id: 'west', lat: 0, lon: -0.01 },
      { id: 'north', lat: 0.01, lon: 0 },
    ];
    const ordered = sequenceStops(base, stops);
    expect(ordered).toHaveLength(3);
    expect(new Set(ordered.map((s) => s.id))).toEqual(new Set(['east', 'west', 'north']));
  });

  it('measures coverage against the best possible set', () => {
    const available = [1, 0.9, 0.8, 0.7, 0.6].map((v, i) => ({ id: String(i), value: v }));
    const selected = [{ value: 1 }, { value: 0.5 }];
    expect(scienceCoverage(selected, available, 4)).toBeCloseTo(1.5 / 3.4, 3);
    expect(scienceCoverage([], available, 4)).toBe(0);
    expect(scienceCoverage(available, available, 5)).toBe(1);
  });

  it('finds a flat base point in a synthetic grid', () => {
    const size = 21;
    const grid = { size, cell: 10, half: 105, data: new Float32Array(size * size).fill(-2500) };
    const slope = new Float32Array(size * size).fill(1);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < 5; i++) slope[j * size + i] = 20; // steep west side
    }
    const roughness = new Float32Array(size * size).fill(0.05);
    const best = bestBasePoint({ grid, slope, roughness, origin: { lat: 0, lon: 0 } }, { step: 1 });
    expect(best).toBeTruthy();
    expect(best.i).toBeGreaterThanOrEqual(5);
    expect(best.landability.score).toBeGreaterThan(60);
  });
});

describe('route science score', () => {
  it('uses science coverage when supplied and falls back otherwise', () => {
    const evaluation = {
      withinO2: true,
      o2UsablePct: 40,
      length: 1000,
      legs: [{ t: 600 }],
    };
    const common = {
      evaluation,
      maxSlope: 4,
      slopeLimit: 15,
      commsCoverage: 1,
      stops: 2,
      scienceStops: 2,
      straightLine: 900,
      doseMsv: 0.2,
    };
    expect(scorePlan({ ...common, scienceCoverage: 0.8 }).science).toBe(80);
    expect(scorePlan(common).science).toBeGreaterThan(0);
  });
});

describe('prospect zones', () => {
  it('are valid, compact and mostly unexplored', () => {
    expect(prospects.zones.length).toBeGreaterThan(10);
    for (const zone of prospects.zones) {
      expect(zone.lat).toBeGreaterThanOrEqual(-90);
      expect(zone.lat).toBeLessThanOrEqual(90);
      expect(zone.lon).toBeGreaterThanOrEqual(-180);
      expect(zone.lon).toBeLessThanOrEqual(180);
      expect(zone.score).toBeGreaterThan(0);
      expect(zone.score).toBeLessThanOrEqual(1);
      expect(zone.crism + zone.omega).toBeLessThanOrEqual(zone.detections);
      expect(zone.radiusKm).toBeGreaterThan(0);
      expect(zone.radiusKm).toBeLessThanOrEqual(100);
      expect(['high', 'medium', 'low']).toContain(zone.confidence);
    }
    expect(prospects.zones.some((z) => !z.explored)).toBe(true);
    expect(prospects.totalDetections).toBeGreaterThan(1000);
  });
});
