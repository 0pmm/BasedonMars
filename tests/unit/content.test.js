import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../../src/i18n/en.js';
import pt from '../../src/i18n/pt.js';
import pois from '../../src/data/pois.json';
import catalog from '../../src/data/catalog.json';
import { DEFAULT_BINDINGS } from '../../src/core/settings.js';
import { formatDistance, formatTemperature, formatElevation, formatDuration } from '../../src/core/units.js';
import { parseHash } from '../../src/core/deeplink.js';
import { isAllowedImageUrl, parseNasaResponse } from '../../src/ui/photos.js';

const SRC = join(__dirname, '../../src');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

describe('i18n dictionaries', () => {
  it('English and Portuguese have exactly the same keys', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty translations', () => {
    for (const [k, v] of Object.entries(pt)) expect(v.trim(), k).not.toBe('');
    for (const [k, v] of Object.entries(en)) expect(v.trim(), k).not.toBe('');
  });

  it('every literal key used in the code and HTML exists', () => {
    const used = new Set();
    for (const file of walk(SRC)) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    }
    const html = readFileSync(join(SRC, '../index.html'), 'utf8');
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1]);
    const missing = [...used].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('dynamic keys exist for every data value', () => {
    const dynamic = [
      ...Object.keys(catalog.types).map((k) => `type.${k}`),
      ...catalog.layers.map((l) => `layer.${l.id}`),
      ...['slope', 'hazard', 'elevation', 'contours'].flatMap((l) => [`layer.${l}`, `legend.${l}.min`, `legend.${l}.max`]),
      ...Object.keys(DEFAULT_BINDINGS).map((a) => `action.${a}`),
      ...['water', 'radiation', 'terrain', 'sunlight', 'temperature'].map((k) => `base.${k}`),
      ...['general', 'graphics', 'audio', 'controls', 'accessibility', 'about'].map((s) => `settings.tab.${s}`),
      ...['terrain', 'imagery', 'analysis', 'done'].map((s) => `pl.loading.${s}`),
    ];
    expect(dynamic.filter((k) => !(k in en))).toEqual([]);
  });
});

describe('content data', () => {
  const localized = (v) => typeof v === 'object' && !!v.en && !!v.pt;

  it('locations are valid and fully translated', () => {
    const ids = new Set();
    for (const p of pois) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThanOrEqual(180);
      expect(catalog.types[p.type]).toBeDefined();
      for (const k of ['mission', 'description', 'hazard', 'resource']) expect(localized(p[k]), `${p.id}.${k}`).toBe(true);
      expect(p.learnMore).toMatch(/^https:\/\//);
    }
  });
});

describe('units', () => {
  it('formats metric and imperial', () => {
    expect(formatDistance(500)).toBe('500 m');
    expect(formatDistance(1500)).toBe('1.50 km');
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
    expect(formatTemperature(0, 'imperial')).toBe('32°F');
    expect(formatElevation(21900)).toBe('+21,900 m');
    expect(formatDuration(75)).toBe('1:15');
  });
});

describe('security helpers', () => {
  it('deep links only accept safe values', () => {
    expect(parseHash('#poi=jezero')).toEqual({ poi: 'jezero' });
    expect(parseHash('#poi=<script>')).toEqual({});
    expect(parseHash('#chapter=3')).toEqual({ chapter: 3 });
    expect(parseHash('#chapter=abc')).toEqual({});
  });

  it('only https NASA image URLs are accepted', () => {
    expect(isAllowedImageUrl('https://images-assets.nasa.gov/image/x/x~thumb.jpg')).toBe(true);
    expect(isAllowedImageUrl('http://images-assets.nasa.gov/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://evil.com/nasa.gov.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://nasa.gov.evil.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
  });

  it('parses and filters the NASA API response', () => {
    const json = {
      collection: {
        items: [
          { links: [{ href: 'https://evil.com/a.jpg' }], data: [{ title: 'bad', nasa_id: 'x' }] },
          { links: [{ href: 'https://images-assets.nasa.gov/a.jpg', render: 'image' }], data: [{ title: 'ok', nasa_id: 'PIA123' }] },
          { links: [{ href: 'https://images-assets.nasa.gov/b.jpg' }], data: [{ title: 'id', nasa_id: '../../x' }] },
        ],
      },
    };
    const out = parseNasaResponse(json);
    expect(out.map((o) => o.title)).toEqual(['ok', 'id']);
    expect(out[1].nasaId).toBe('');
    expect(parseNasaResponse(null)).toEqual([]);
  });
});
