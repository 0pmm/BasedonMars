/**
 * "Science" tab: pick a scientific objective, rank landing sites by how well
 * they serve it, inspect why, and turn the best site (or a data-discovered
 * zone) into a Marswalk in the route planner.
 *
 * Every score is the project's transparent model (src/game/siteFit.js); the
 * weights and the source of each attribute are shown in the panel.
 */
import { h, $, clear } from '../core/dom.js';
import { t, tr } from '../core/i18n.js';
import { on } from '../core/events.js';
import { orbitView } from '../orbit/orbitView.js';
import { toast } from './feedback.js';
import { switchTab } from './dashboard.js';
import { setRoute, setEditing } from './routePanel.js';
import { OBJECTIVES, fitSite, rankSites, objectiveById } from '../game/siteFit.js';
import { landability, landingConfidence } from '../game/landability.js';
import { buildSciencePlan, bestBasePoint } from '../planner/scout.js';
import { loadSite } from '../planner/site.js';
import { distanceM } from '../geo/mars.js';
import sitesData from '../data/scienceSites.json';
import prospects from '../data/prospects.json';

const SITES = sitesData.sites;
const MISSIONS = sitesData.missions;

const S = {
  objective: 'life',
  view: 'sites',
  selectedSite: null,
  selectedZone: null,
  hideExplored: true,
  landing: null, // {zoneId, status, metrics, error}
  busy: false,
};

let root = null;

export function initSciencePanel() {
  root = $('#science-panel');
  S.selectedSite = 'jezero';
  render();
  on('language:change', render);
}

/* ------------------------------ helpers ------------------------------ */

function confidenceLabel(value) {
  if (value == null) return t('science.confidence.unknown');
  if (value >= 0.8) return t('science.confidence.high');
  if (value >= 0.55) return t('science.confidence.medium');
  return t('science.confidence.low');
}

function confidenceIcon(value) {
  if (value == null) return '⚠';
  return value >= 0.8 ? '✓' : value >= 0.55 ? '≈' : '⚠';
}

function kindBadge(kind) {
  return h('span.sci-kind', { attrs: { title: t(`science.kind.${kind}`) } }, t(`science.kind.${kind}`));
}

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function bar(value, label) {
  return h(
    'span.sci-track',
    {
      attrs: {
        role: 'meter',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(value * 100)),
        'aria-label': label,
      },
    },
    h('span.sci-fill', { style: { width: `${Math.round(value * 100)}%` } })
  );
}

function siteMission(siteId) {
  return MISSIONS.filter((m) => m.siteId === siteId);
}

function zoneName(zone) {
  if (zone.near) {
    return t('science.zoneNear', { name: zone.near.name, km: zone.near.km });
  }
  const lat = Math.abs(zone.lat).toFixed(1);
  const lon = Math.abs(zone.lon).toFixed(1);
  return `${lat}°${zone.lat >= 0 ? 'N' : 'S'} ${lon}°${zone.lon >= 0 ? 'E' : 'W'}`;
}

function zoneFit(zone, objectiveId) {
  if (objectiveId === 'survival') return null;
  // Zones come from hydrated-mineral clusters: a direct proxy for the life
  // objective, an alteration proxy for the geological one.
  return objectiveId === 'life' ? zone.score : Math.round(zone.score * 85) / 100;
}

/* ------------------------------- render ------------------------------ */

function render() {
  if (!root) return;
  clear(root);
  const objective = objectiveById(S.objective);

  root.append(
    h('div.sci-head', null, h('h3', null, `🔬 ${t('science.title')}`), h('p.sci-sub', null, t('science.subtitle'))),
    h(
      'div.sci-objectives',
      { attrs: { role: 'tablist', 'aria-label': t('science.objective') } },
      ...OBJECTIVES.map((o) =>
        h(
          'button.sci-obj',
          {
            attrs: {
              type: 'button',
              role: 'tab',
              'aria-selected': String(o.id === S.objective),
              title: tr(o.short),
            },
            on: {
              click: () => {
                S.objective = o.id;
                S.selectedSite = S.selectedSite || 'jezero';
                S.landing = null;
                render();
              },
            },
          },
          h('span.sci-obj-icon', { attrs: { 'aria-hidden': 'true' } }, o.icon),
          h('strong', null, tr(o.name))
        )
      )
    ),
    h('p.sci-question', null, `❓ ${tr(objective.question)}`),
    h('p.sci-short', null, tr(objective.short)),
    h(
      'p.sci-missions',
      null,
      h('strong', null, `${t('science.realMissions')}: `),
      MISSIONS.filter((m) => m.objective === S.objective)
        .map((m) => `${m.name} (${m.year})`)
        .join(' · ')
    ),
    h(
      'div.sci-views',
      { attrs: { role: 'group', 'aria-label': t('science.view') } },
      viewButton('sites', `📍 ${t('science.view.sites')}`),
      viewButton('zones', `🛰️ ${t('science.view.zones')}`)
    )
  );

  if (S.view === 'zones') {
    renderZones();
  } else {
    renderSites();
  }

  root.append(h('p.sci-disclaimer', null, t('science.disclaimer')));
}

function viewButton(id, label) {
  return h(
    'button.sci-view',
    {
      attrs: { type: 'button', 'aria-pressed': String(S.view === id) },
      on: { click: () => ((S.view = id), (S.landing = null), render()) },
    },
    label
  );
}

function renderSites() {
  const ranked = rankSites(SITES, S.objective);
  if (!S.selectedSite) S.selectedSite = ranked[0]?.site.id || null;

  root.append(
    h(
      'ol.sci-list',
      null,
      ...ranked.map(({ rank, site, fit }) => {
        const missions = siteMission(site.id);
        return h(
          'li',
          null,
          h(
            'button.sci-row',
            {
              attrs: {
                type: 'button',
                'aria-pressed': String(S.selectedSite === site.id),
                'aria-label': `${site.name}: ${t('science.fit')} ${fit.score}/100`,
              },
              on: { click: () => ((S.selectedSite = site.id), render()) },
            },
            h('span.sci-rank', null, `#${rank}`),
            h(
              'span.sci-row-main',
              null,
              h(
                'span.sci-row-title',
                null,
                site.name,
                missions.length
                  ? h('span.sci-dot', { attrs: { title: t('science.explored') } }, '●')
                  : h('span.sci-dot.unexplored', { attrs: { title: t('science.unexplored') } }, '○')
              ),
              h('small', null, tr(site.region)),
              bar(fit.score / 100, `${site.name} ${fit.score}/100`)
            ),
            h('span.sci-score', null, String(fit.score))
          )
        );
      })
    )
  );
  const site = SITES.find((s) => s.id === S.selectedSite);
  if (site) root.append(renderSiteDetail(site));
}

function renderSiteDetail(site) {
  const fit = fitSite(site, S.objective);
  const objective = objectiveById(S.objective);
  const missions = siteMission(site.id);
  const imagery = sitesData.imagery?.[site.id];
  const box = h('div.sci-detail');

  box.append(
    h(
      'div.sci-detail-head',
      null,
      h('h4', null, site.name),
      h(
        'div.sci-badges',
        null,
        h(
          'span.sci-badge',
          { attrs: { title: t('science.confidence') } },
          `${confidenceIcon(fit.confidence)} ${confidenceLabel(fit.confidence)}`
        ),
        site.visited
          ? h('span.sci-badge.explored', null, `● ${t('science.explored')}`)
          : h('span.sci-badge.unexplored', null, `○ ${t('science.unexplored')}`)
      )
    ),
    h('p.sci-note', null, tr(site.note)),
    h(
      'div.sci-fit',
      null,
      h('div.sci-fit-score', null, h('strong', null, String(fit.score)), h('small', null, `/100 · ${t('science.grade')} ${fit.grade}`)),
      bar(fit.score / 100, `${t('science.fit')} ${fit.score}`)
    ),
    h('p.sci-coords', null, `${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}° · ${site.elevationM} m · ${imagery ? imagery.label : ''}`)
  );

  if (fit.missing.length) {
    box.append(h('p.sci-warn', null, `⚠ ${t('science.missing', { keys: fit.missing.map((k) => t(`science.attr.${k}`)).join(', ') })}`));
  }

  box.append(
    h('h5', null, t('science.why')),
    h(
      'ul.sci-why',
      null,
      ...fit.drivers.map((f) =>
        h(
          'li.plus',
          null,
          h('strong', null, `+ ${t(`science.attr.${f.key}`)}`),
          h('span', null, ` ${pct(f.value)} · ${t('science.weight')} ${pct(f.weight)}`),
          h('small', null, f.source)
        )
      ),
      ...fit.limits.map((f) =>
        h(
          'li.minus',
          null,
          h('strong', null, `− ${t(`science.attr.${f.key}`)}`),
          h('span', null, ` ${pct(f.value)} · ${t('science.weight')} ${pct(f.weight)}`),
          h('small', null, f.source)
        )
      )
    ),
    h('h5', null, t('science.attributes')),
    h(
      'div.sci-attrs',
      null,
      ...Object.entries(objective.weights).map(([key, weight]) => {
        const attr = site.attributes[key];
        if (!attr) return null;
        return h(
          'div.sci-attr',
          null,
          h('span.sci-attr-name', null, t(`science.attr.${key}`), ' ', kindBadge(attr.kind || 'literature')),
          bar(attr.v, t(`science.attr.${key}`)),
          h('span.sci-attr-val', null, pct(attr.v)),
          h('small', null, `${t('science.weight')} ${pct(weight)} · ${attr.source}`)
        );
      })
    )
  );

  if (missions.length) {
    box.append(
      h('h5', null, t('science.mission')),
      ...missions.map((m) =>
        h(
          'div.sci-mission',
          null,
          h('strong', null, `${m.name} · ${m.year}`),
          h('p', null, tr(m.result)),
          h(
            'small',
            null,
            `${t('science.objective')}: ${tr(objectiveById(m.objective).name)}${m.validation === 'vintage' ? ` · ${t('science.vintage')}` : ''}`
          )
        )
      )
    );
  }

  box.append(
    h(
      'div.sci-actions',
      null,
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => flyTo(site) } }, `🌍 ${t('science.flyTo')}`),
      h('button.btn.primary', { attrs: { type: 'button' }, on: { click: () => planFromSite(site) } }, `🥾 ${t('science.planEva')}`),
      h(
        'a.btn.ghost',
        { attrs: { href: `https://science.nasa.gov/mars/`, target: '_blank', rel: 'noopener noreferrer' } },
        `📚 ${t('science.learnMore')} ↗`
      )
    )
  );
  if (site.confidence < 0.6) box.append(h('p.sci-warn', null, `⚠ ${t('science.preliminary')}`));
  return box;
}

function renderZones() {
  if (S.objective === 'survival') {
    root.append(
      h('p.sci-note', null, t('science.zones.survival')),
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => ((S.view = 'sites'), render()) } }, `📍 ${t('science.view.sites')}`)
    );
    return;
  }
  const zones = prospects.zones.filter((z) => (S.hideExplored ? !z.explored : true));
  root.append(
    h('p.sci-note', null, t('science.zones.note', { n: prospects.totalDetections, date: prospects.generated })),
    h(
      'label.sci-check',
      null,
      h('input', {
        attrs: { type: 'checkbox', checked: S.hideExplored },
        on: { change: (e) => ((S.hideExplored = e.target.checked), render()) },
      }),
      ` ${t('science.zones.hideExplored')}`
    ),
    h(
      'ol.sci-list',
      null,
      ...zones.slice(0, 25).map((zone) => {
        const value = zoneFit(zone, S.objective);
        return h(
          'li',
          null,
          h(
            'button.sci-row',
            {
              attrs: {
                type: 'button',
                'aria-pressed': String(S.selectedZone === zone.id),
                'aria-label': `${zoneName(zone)}: ${t('science.fit')} ${Math.round(value * 100)}`,
              },
              on: { click: () => ((S.selectedZone = zone.id), (S.landing = null), render()) },
            },
            h('span.sci-rank', null, '🛰️'),
            h(
              'span.sci-row-main',
              null,
              h('span.sci-row-title', null, zoneName(zone)),
              h('small', null, `${zone.detections} ${t('science.zones.detections')} · CRISM ${zone.crism} · OMEGA ${zone.omega}`),
              bar(value, zoneName(zone))
            ),
            h('span.sci-score', null, String(Math.round(value * 100)))
          )
        );
      })
    )
  );
  const zone = prospects.zones.find((z) => z.id === S.selectedZone) || zones[0];
  if (zone) root.append(renderZoneDetail(zone));
}

function renderZoneDetail(zone) {
  const box = h('div.sci-detail');
  const confValue = zone.confidence === 'high' ? 0.9 : zone.confidence === 'medium' ? 0.6 : 0.35;
  const conf = confidenceLabel(confValue);
  box.append(
    h(
      'div.sci-detail-head',
      null,
      h('h4', null, zoneName(zone)),
      h(
        'div.sci-badges',
        null,
        h('span.sci-badge', null, `${confidenceIcon(confValue)} ${conf}`),
        zone.explored
          ? h('span.sci-badge.explored', null, `● ${t('science.explored')}`)
          : h('span.sci-badge.unexplored', null, `○ ${t('science.unexplored')}`)
      )
    ),
    h(
      'p.sci-coords',
      null,
      `${zone.lat.toFixed(2)}°, ${zone.lon.toFixed(2)}° · ${t('science.zones.radius', { km: zone.radiusKm })} · ${t('science.zones.detections')}: ${zone.detections}`
    ),
    h(
      'dl.sci-kv',
      null,
      h('div', null, h('dt', null, 'CRISM'), h('dd', null, String(zone.crism))),
      h('div', null, h('dt', null, 'OMEGA'), h('dd', null, String(zone.omega))),
      h('div', null, h('dt', null, t('science.confidence')), h('dd', null, conf))
    ),
    h('p.sci-note', null, t('science.zones.bias'))
  );

  const landing = S.landing && S.landing.zoneId === zone.id ? S.landing : null;
  if (landing?.status === 'done' && landing.base) {
    box.append(
      h('h5', null, t('science.zones.landing')),
      h(
        'p.sci-fit',
        null,
        h(
          'div.sci-fit-score',
          null,
          h('strong', null, String(landing.base.landability.score)),
          h('small', null, `/100 · ${landing.base.landability.grade}`)
        ),
        bar(landing.base.landability.score / 100, t('science.zones.landing'))
      ),
      h(
        'p.sci-coords',
        null,
        `${landing.base.lat.toFixed(3)}°, ${landing.base.lon.toFixed(3)}° · ${t('science.maxSlope')}: ${landing.base.maxSlopeDeg.toFixed(1)}° · ${t('science.roughness')}: ${landing.base.roughnessM.toFixed(2)} m`
      ),
      landing.confidence.level !== 'high'
        ? h('p.sci-warn', null, `⚠ ${t('science.zones.preliminary', { level: landing.confidence.level })}`)
        : null
    );
  } else if (landing?.status === 'error') {
    box.append(h('p.sci-warn', null, `⚠ ${t('science.zones.noLanding')}`));
  }

  const actions = [
    h('button.btn', { attrs: { type: 'button' }, on: { click: () => flyTo(zone) } }, `🌍 ${t('science.flyTo')}`),
    h(
      'button.btn',
      {
        attrs: { type: 'button', disabled: S.busy },
        on: { click: () => checkLanding(zone) },
      },
      `🛬 ${t('science.zones.checkLanding')}`
    ),
  ];
  if (landing?.base) {
    actions.push(
      h(
        'button.btn.primary',
        { attrs: { type: 'button' }, on: { click: () => useZoneAsBase(landing.base) } },
        `🥾 ${t('science.zones.useBase')}`
      )
    );
  }
  box.append(h('div.sci-actions', null, ...actions));
  return box;
}

/* ------------------------------ actions ------------------------------ */

function flyTo(target) {
  const range = target.radiusKm ? Math.max(12000, target.radiusKm * 1000 * 2.4) : 6000;
  orbitView.flyTo({ lat: target.lat, lon: target.lon, range, heading: 0, tilt: 55 }, 2400);
}

function planFromSite(site) {
  const objective = objectiveById(S.objective);
  const targets = (site.targets || []).map((tt) => ({ ...tt, h: site.elevationM }));
  // Survival walks are operational patrols: any target is a valid checkpoint
  // for terrain, power and comms, not a sample site.
  const planningObjective =
    S.objective === 'survival' ? { ...objective, targetKinds: [...new Set(targets.flatMap((tt) => tt.kinds || []))] } : objective;
  // A walking EVA needs at least two targets close to the base; a rover wins
  // when it adds a large share of the objective (e.g. a distant delta).
  const walk = buildSciencePlan({ site, targets, objective: planningObjective, maxStops: 4, maxRadiusM: 6000 });
  const rover = buildSciencePlan({ site, targets, objective: planningObjective, maxStops: 4, maxRadiusM: 30000 });
  const walkValue = walk.targets.reduce((s, t) => s + t.value, 0);
  const roverValue = rover.targets.reduce((s, t) => s + t.value, 0);
  // Estimated round trip on straight lines: past ~9 km on foot the suit
  // consumables rarely close, so the rover is the honest recommendation.
  let walkLength = 0;
  let prev = { lat: site.lat, lon: site.lon };
  for (const t of walk.targets) {
    walkLength += distanceM(prev.lat, prev.lon, t.lat, t.lon);
    prev = t;
  }
  if (walk.targets.length) walkLength += distanceM(prev.lat, prev.lon, site.lat, site.lon);
  let mode = 'walk';
  let plan = walk;
  if (walk.targets.length < 2 || walkLength > 9000 || roverValue > walkValue + 0.7) {
    mode = 'rover';
    plan = rover;
  }
  if (plan.points.length < 2) {
    toast(t('science.err.noTargets'), { type: 'warn' });
    return;
  }
  // Coverage is always measured against the rover-reachable targets, so a
  // walking plan honestly shows what it leaves for a later traverse.
  const coverage = rover.potential > 0 ? Math.min(1, (mode === 'rover' ? roverValue : walkValue) / rover.potential) : 0;
  setRoute(plan.points, {
    params: { mode },
    returnToBase: true,
    sciencePotential: rover.potential,
  });
  switchTab('route');
  flyTo(site);
  toast(t('science.planReady', { n: plan.targets.length, pct: Math.round(coverage * 100), mode: t(`pl.mode.${mode}`) }), {
    type: 'success',
    duration: 6000,
  });
}

async function checkLanding(zone) {
  if (S.busy) return;
  S.busy = true;
  S.landing = { zoneId: zone.id, status: 'loading' };
  render();
  try {
    const site = await loadSite(
      { lat: zone.lat, lon: zone.lon },
      { sizeM: 12000, cells: 160, imagePx: 0, rocks: false, maxTerrainTiles: 120 }
    );
    const base = bestBasePoint({ ...site, origin: { lat: zone.lat, lon: zone.lon }, resolutionM: null }, { maxSlopeDeg: 12, step: 2 });
    if (!base) throw new Error('no flat cell');
    const confidence = landingConfidence({ resolutionM: zone.confidence === 'high' ? 6 : zone.confidence === 'medium' ? 30 : 200 });
    const land = landability({
      elevationM: base.elevationM,
      maxSlopeDeg: base.maxSlopeDeg,
      meanSlopeDeg: base.meanSlopeDeg,
      roughnessM: base.roughnessM,
      latitude: base.lat,
    });
    S.landing = { zoneId: zone.id, status: 'done', base: { ...base, landability: land }, confidence };
  } catch (err) {
    console.warn('[science] landing check failed', err);
    S.landing = { zoneId: zone.id, status: 'error' };
  } finally {
    S.busy = false;
    render();
  }
}

function useZoneAsBase(base) {
  setRoute([{ lat: base.lat, lon: base.lon, h: base.elevationM, label: t('science.zones.baseLabel') }], {
    params: { mode: 'walk' },
    returnToBase: true,
  });
  setEditing(true);
  switchTab('route');
  flyTo(base);
  toast(t('science.zones.baseReady'), { type: 'success', duration: 6000 });
}
