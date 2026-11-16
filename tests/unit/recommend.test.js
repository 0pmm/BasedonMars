import { describe, it, expect } from 'vitest';
import scienceData from '../../src/data/scienceSites.json';
import prospects from '../../src/data/prospects.json';
import {
  siteFilters,
  rankSitesBy,
  highlights,
  rankZones,
  zoneReasons,
  ZONE_FILTERS,
  sunlight,
  places,
  rankPlaces,
  NEAR_KM,
} from '../../src/game/recommend.js';

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

describe('one list of places (sites + candidate areas)', () => {
  const list = places(SITES, ZONES, scienceData.missions, 'geology');

  it('holds every site and every candidate area once', () => {
    expect(list).toHaveLength(SITES.length + ZONES.length);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
  });

  it('scores candidate areas only on what orbit tells, scaled down for the unknowns', () => {
    const area = list.find((p) => p.kind === 'zone');
    expect(Object.keys(area.attributes).sort()).toEqual(['hydration', 'power', 'waterAccess']);
    expect(area.fit.coverage).toBeLessThan(0.5);
    // a perfectly scored partial place still cannot beat what a full assessment could give
    const best = rankPlaces(list)[0];
    expect(best.kind).toBe('site');
    expect(best.fit.coverage).toBeCloseTo(1, 5);
  });

  it('filters explored / never explored, with the missions of the explored ones', () => {
    const explored = rankPlaces(list, { explored: 'explored' });
    expect(explored.length).toBeGreaterThan(0);
    expect(explored.every((p) => p.visited)).toBe(true);
    const jezero = explored.find((p) => p.id === 'jezero');
    expect(jezero.missions.map((m) => m.name).join()).toMatch(/Perseverance/);
    expect(rankPlaces(list, { explored: 'unexplored' }).every((p) => !p.visited)).toBe(true);
  });

  it('tells how far an unexplored place is from the nearest explored site', () => {
    const nili = list.find((p) => p.id === 'nili');
    expect(nili.near?.name).toBe('Jezero Crater');
    expect(nili.near.km).toBeLessThan(NEAR_KM);
    expect(list.find((p) => p.id === 'jezero').near).toBeNull();
  });

  it('a criterion filter puts places without that data last', () => {
    const ranked = rankPlaces(list, { filter: 'unitDiversity' });
    const firstUnknown = ranked.findIndex((p) => p.key < 0);
    expect(firstUnknown).toBeGreaterThan(0);
    expect(ranked.slice(firstUnknown).every((p) => p.key < 0)).toBe(true);
  });
});
