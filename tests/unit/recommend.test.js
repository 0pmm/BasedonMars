import { describe, it, expect } from 'vitest';
import scienceData from '../../src/data/scienceSites.json';
import prospects from '../../src/data/prospects.json';
import { siteFilters, rankSitesBy, highlights, rankZones, zoneReasons, ZONE_FILTERS, sunlight } from '../../src/game/recommend.js';

const SITES = scienceData.sites;
const ZONES = prospects.zones;

describe('site recommendation', () => {
  it('offers the overall view plus the main criteria of each objective', () => {
    expect(siteFilters('geology')[0]).toBe('general');
    expect(siteFilters('geology')).toContain('unitDiversity');
    expect(siteFilters('survival')).toContain('waterAccess');
    expect(siteFilters('free')).toEqual([]);
  });

  it('each filter puts the best site in that criterion first', () => {
    for (const objective of ['geology', 'survival']) {
      for (const f of siteFilters(objective).slice(1)) {
        const ranked = rankSitesBy(SITES, objective, f);
        const best = Math.max(...SITES.map((s) => s.attributes[f].v));
        expect(ranked[0].site.attributes[f].v).toBe(best);
        expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
      }
    }
  });

  it('filters really change the recommendation (not always the same place)', () => {
    const winners = new Set(siteFilters('survival').map((f) => rankSitesBy(SITES, 'survival', f)[0].site.id));
    expect(winners.size).toBeGreaterThan(1);
  });

  it('highlights are the strongest criteria of the site', () => {
    const [a, b] = highlights(SITES[0], 'geology', 2);
    expect(a.value).toBeGreaterThanOrEqual(b.value);
  });
});

describe('zone recommendation', () => {
  it('survival weighs sunlight in, geology does not', () => {
    const geo = rankZones(ZONES, 'geology')[0].zone;
    expect(geo.score).toBe(Math.max(...ZONES.map((z) => z.score)));
    const surv = rankZones(ZONES, 'survival');
    expect(sunlight(surv[0].zone.lat)).toBeGreaterThan(0.7);
  });

  it('the unexplored filter only lists never-visited zones', () => {
    expect(rankZones(ZONES, 'geology', 'unexplored').every((r) => !r.zone.explored)).toBe(true);
    expect(ZONE_FILTERS).toContain('detections');
    const det = rankZones(ZONES, 'geology', 'detections');
    expect(det[0].zone.detections).toBe(Math.max(...ZONES.map((z) => z.detections)));
  });

  it('explains a zone in plain language, with the downsides marked', () => {
    const reasons = zoneReasons({ ...ZONES[0], confidence: 'medium', explored: true, lat: 70 }, 'survival');
    expect(reasons[0].key).toBe('rec.zone.water');
    expect(reasons.filter((r) => r.minus).map((r) => r.key)).toEqual(['rec.zone.sunLow', 'rec.zone.confMedium', 'rec.zone.explored']);
  });
});
