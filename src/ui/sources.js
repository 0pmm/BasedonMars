/**
 * "Sources & methodology" dialog: every dataset the app shows, where it
 * comes from, what is computed by the app and the known limitations.
 */
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { openDialog } from './modal.js';
import { TREK_CATALOG } from '../geo/trek.js';

const FEEDS = [
  ['Mars Trek terrain (quantized-mesh)', 'NASA/JPL Solar System Treks', 'https://trek.nasa.gov/mars/'],
  ['Perseverance waypoints & traverse (MMGIS)', 'NASA/JPL-Caltech', 'https://mars.nasa.gov/mars2020/mission/where-is-the-rover/'],
  ['Perseverance raw images', 'NASA/JPL-Caltech', 'https://mars.nasa.gov/mars2020/multimedia/raw-images/'],
  ['MEDA weather reports', 'NASA/JPL-Caltech/CAB', 'https://mars.nasa.gov/mars2020/weather/'],
  ['DONKI space weather (SEP, flares)', 'NASA CCMC', 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/'],
  ['Hydrous mineral detections (CRISM/OMEGA)', 'NASA/JPL Mars Trek', 'https://trek.nasa.gov/mars/'],
  ['Global geology map (USGS SIM 3292)', 'USGS / NASA/JPL Mars Trek', 'https://trek.nasa.gov/mars/'],
  ['NASA Image and Video Library', 'NASA', 'https://images.nasa.gov/'],
  ['Mars24 Sunclock algorithm', 'NASA GISS', 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html'],
];

export function openSources() {
  const layers = [...TREK_CATALOG.global, ...TREK_CATALOG.regional];
  const link = (href, text) => h('a', { attrs: { href, target: '_blank', rel: 'noopener noreferrer' } }, `${text} ↗`);
  const body = h(
    'div.sources',
    null,
    h('p', null, t('src.intro')),
    h('h3', null, t('src.data')),
    h(
      'ul.src-list',
      null,
      ...layers.map((l) =>
        h(
          'li',
          null,
          h('strong', null, l.instrument),
          ` · ${l.resolution} · `,
          h('code', null, l.trek),
          l.measured === false ? ` · ${t('pl.interpreted')}` : ''
        )
      ),
      ...FEEDS.map(([name, who, url]) => h('li', null, h('strong', null, name), ` · ${who} · `, link(url, new URL(url).hostname)))
    ),
    h('h3', null, t('src.methods')),
    h('ul.src-list', null, ...['slope', 'route', 'eva', 'sun', 'rad', 'comms', 'rocks'].map((k) => h('li', null, t(`src.m.${k}`)))),
    h('h3', null, t('src.limits')),
    h('ul.src-list', null, ...[1, 2, 3, 4].map((k) => h('li', null, t(`src.l.${k}`))))
  );
  openDialog({ title: `${t('src.title')}`, body, wide: true });
}
