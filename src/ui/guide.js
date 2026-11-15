/**
 * Mission guide: the backbone of the app. The chosen scientific objective
 * drives a four-step flow — objective, site, route, walk — and the globe
 * layer (candidate zones + ranked sites) reacts to the same state.
 */
import { h, $, clear } from '../core/dom.js';
import { t, tr } from '../core/i18n.js';
import { on } from '../core/events.js';
import { orbitView } from '../orbit/orbitView.js';
import { toast } from './feedback.js';
import { openSheet } from './dashboard.js';
import { setRoute, getRouteSummary, walkCurrentRoute, setEditing, formatDuration } from './routePanel.js';
import { getMission, setStep, setObjective, selectSite, selectZone, objective as currentObjective } from '../core/mission.js';
import { getSettings } from '../core/settings.js';
import { OBJECTIVES, fitSite, rankSites, objectiveById } from '../game/siteFit.js';
import { landability, landingConfidence } from '../game/landability.js';
import { buildSciencePlan, bestBasePoint } from '../planner/scout.js';
import { loadSite } from '../planner/site.js';
import { distanceM } from '../geo/mars.js';
import { formatDistance } from '../core/units.js';
import { initZonesLayer, refreshZones, setZonesVisible, isZonesVisible } from '../orbit/zonesLayer.js';
import sitesData from '../data/scienceSites.json';
import prospects from '../data/prospects.json';

const SITES = sitesData.sites;
const MISSIONS = sitesData.missions;

const S = {
  view: 'sites',
  hideExplored: true,
  landing: null,
  busy: false,
  selectedSite: null,
  selectedZone: null,
};

let siteRoot = null;
let tryRoot = null;
let objectiveRoot = null;

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

const pct = (v) => `${Math.round(v * 100)}%`;

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

function missionsAt(siteId) {
  return MISSIONS.filter((m) => m.siteId === siteId);
}

function zoneName(zone) {
  if (zone.near) return t('science.zoneNear', { name: zone.near.name, km: zone.near.km });
  const lat = Math.abs(zone.lat).toFixed(1);
  const lon = Math.abs(zone.lon).toFixed(1);
  return `${lat}°${zone.lat >= 0 ? 'N' : 'S'} ${lon}°${zone.lon >= 0 ? 'E' : 'W'}`;
}

function zoneFit(zone, objectiveId) {
  if (objectiveId === 'survival') return null;
  return objectiveId === 'life' ? zone.score : Math.round(zone.score * 85) / 100;
}

/** Cards used by the start screen and the objective step. */
export function objectiveCards(onPick, variant = 'start') {
  const cls = variant === 'start' ? 'start-objective' : 'objective-card';
  return OBJECTIVES.map((o) =>
    h(
      'button',
      {
        class: cls,
        attrs: { type: 'button', 'data-objective': o.id },
        on: { click: () => onPick(o.id) },
      },
      h('span.objective-icon', { attrs: { 'aria-hidden': 'true' } }, o.icon),
      h('strong', null, tr(o.name)),
      h('span.objective-question', null, tr(o.question)),
      h('small', null, tr(o.short))
    )
  );
}

/* ------------------------------- init -------------------------------- */

export function initGuide() {
  siteRoot = $('#guide-site');
  tryRoot = $('#guide-try');
  objectiveRoot = $('#guide-objective');

  document.querySelectorAll('.guide-step-btn').forEach((btn) => {
    btn.addEventListener('click', () => setStep(btn.dataset.step));
  });
  $('#btn-change-objective')?.addEventListener('click', () => setStep('objective'));

  initZonesLayer({
    onZone: (zone) => {
      S.view = 'zones';
      S.selectedZone = zone.id;
      S.landing = null;
      selectZone(zone.id);
      setStep('site');
      flyTo(zone);
      openSheet('right-panel');
    },
    onSite: (site) => {
      S.view = 'sites';
      S.selectedSite = site.id;
      selectSite(site.id);
      setStep('site');
      flyTo(site);
      openSheet('right-panel');
    },
  });

  on('mission:change', (mission) => {
    if (mission.siteId) S.selectedSite = mission.siteId;
    if (mission.zoneId) S.selectedZone = mission.zoneId;
    refreshZones(mission.objective, mission.siteId);
    render();
    if (mission.step !== 'objective') openSheet('right-panel');
  });
  on('language:change', render);
  on('route:change', () => {
    if (getMission().step === 'try') renderTry();
  });
  render();
  refreshZones(getMission().objective, getMission().siteId);
}

/* ------------------------------- render ------------------------------ */

function render() {
  const mission = getMission();
  const objective = currentObjective();

  const icon = $('#guide-objective-icon');
  const name = $('#guide-objective-name');
  const headerIcon = $('#header-objective-icon');
  const headerName = $('#header-objective-name');
  if (icon) icon.textContent = objective.icon;
  if (name) name.textContent = tr(objective.name);
  if (headerIcon) headerIcon.textContent = objective.icon;
  if (headerName) headerName.textContent = tr(objective.name);

  document.querySelectorAll('.guide-step').forEach((el) => {
    el.hidden = el.dataset.step !== mission.step;
  });
  document.querySelectorAll('.guide-step-btn').forEach((btn) => {
    const active = btn.dataset.step === mission.step;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  if (mission.step === 'objective') renderObjective();
  if (mission.step === 'site') renderSite();
  if (mission.step === 'try') renderTry();
}

function renderObjective() {
  if (!objectiveRoot) return;
  clear(objectiveRoot);
  const mission = getMission();
  const objective = currentObjective();
  objectiveRoot.append(
    h('h3', null, `🔬 ${t('guide.chooseTitle')}`),
    h('p.sci-sub', null, t('guide.chooseSub')),
    h(
      'div.objective-grid',
      null,
      ...OBJECTIVES.map((o) =>
        h(
          'button',
          {
            class: `objective-card${o.id === mission.objective ? ' active' : ''}`,
            attrs: { type: 'button', 'aria-pressed': String(o.id === mission.objective) },
            on: {
              click: () => {
                setObjective(o.id);
                setStep('site');
              },
            },
          },
          h('span.objective-icon', { attrs: { 'aria-hidden': 'true' } }, o.icon),
          h('strong', null, tr(o.name)),
          h('span.objective-question', null, tr(o.question)),
          h('small', null, tr(o.short))
        )
      )
    ),
    h(
      'p.sci-missions',
      null,
      h('strong', null, `${t('science.realMissions')}: `),
      MISSIONS.filter((m) => m.objective === mission.objective)
        .map((m) => `${m.name} (${m.year})`)
        .join(' · ')
    ),
    h(
      'div.sci-actions',
      null,
      h(
        'button.btn.primary',
        { attrs: { type: 'button' }, on: { click: () => setStep('site') } },
        `${tr(objective.name)} → ${t('guide.step.site')}`
      )
    ),
    h('p.sci-disclaimer', null, t('science.disclaimer'))
  );
}

function renderSite() {
  if (!siteRoot) return;
  clear(siteRoot);
  const mission = getMission();
  const objectiveId = mission.objective;

  siteRoot.append(
    h(
      'div.sci-views',
      { attrs: { role: 'group', 'aria-label': t('science.view') } },
      viewButton('sites', `📍 ${t('science.view.sites')}`),
      viewButton('zones', `🛰️ ${t('science.view.zones')}`),
      h(
        'label.sci-check',
        { attrs: { title: t('guide.zonesOnMap') } },
        h('input', {
          attrs: { type: 'checkbox', checked: isZonesVisible() },
          on: { change: (e) => setZonesVisible(e.target.checked) },
        }),
        ` ${t('guide.zonesOnMap')}`
      )
    )
  );

  if (S.view === 'zones') renderZones(objectiveId);
  else renderSites(objectiveId);
}

function viewButton(id, label) {
  return h(
    'button.sci-view',
    {
      attrs: { type: 'button', 'aria-pressed': String(S.view === id) },
      on: { click: () => ((S.view = id), (S.landing = null), renderSite()) },
    },
    label
  );
}

function renderSites(objectiveId) {
  const ranked = rankSites(SITES, objectiveId);
  const selected = S.selectedSite || getMission().siteId || ranked[0]?.site.id;
  siteRoot.append(
    h(
      'ol.sci-list',
      null,
      ...ranked.map(({ rank, site, fit }) => {
        const missions = missionsAt(site.id);
        return h(
          'li',
          null,
          h(
            'button.sci-row',
            {
              attrs: {
                type: 'button',
                'aria-pressed': String(selected === site.id),
                'aria-label': `${site.name}: ${t('science.fit')} ${fit.score}/100`,
              },
              on: {
                click: () => {
                  S.selectedSite = site.id;
                  selectSite(site.id);
                  flyTo(site);
                  renderSite();
                },
              },
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
  const site = SITES.find((s) => s.id === selected);
  if (site) siteRoot.append(renderSiteDetail(site));
}

function renderSiteDetail(site) {
  const objectiveId = getMission().objective;
  const fit = fitSite(site, objectiveId);
  const objective = objectiveById(objectiveId);
  const missions = missionsAt(site.id);
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
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => setStep('route') } }, `🧭 ${t('guide.step.route')}`)
    )
  );
  if (site.confidence < 0.6) box.append(h('p.sci-warn', null, `⚠ ${t('science.preliminary')}`));
  return box;
}

function renderZones(objectiveId) {
  if (objectiveId === 'survival') {
    siteRoot.append(
      h('p.sci-note', null, t('science.zones.survival')),
      h(
        'button.btn',
        { attrs: { type: 'button' }, on: { click: () => ((S.view = 'sites'), renderSite()) } },
        `📍 ${t('science.view.sites')}`
      )
    );
    return;
  }
  const zones = prospects.zones.filter((z) => (S.hideExplored ? !z.explored : true));
  siteRoot.append(
    h('p.sci-note', null, t('science.zones.note', { n: prospects.totalDetections, date: prospects.generated })),
    h(
      'label.sci-check',
      null,
      h('input', {
        attrs: { type: 'checkbox', checked: S.hideExplored },
        on: { change: (e) => ((S.hideExplored = e.target.checked), renderSite()) },
      }),
      ` ${t('science.zones.hideExplored')}`
    ),
    h(
      'ol.sci-list',
      null,
      ...zones.slice(0, 25).map((zone) => {
        const value = zoneFit(zone, objectiveId);
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
              on: {
                click: () => {
                  S.selectedZone = zone.id;
                  S.landing = null;
                  selectZone(zone.id);
                  flyTo(zone);
                  renderSite();
                },
              },
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
  const zone = prospects.zones.find((z) => z.id === (S.selectedZone || getMission().zoneId)) || zones[0];
  if (zone) {
    S.selectedZone = zone.id;
    siteRoot.append(renderZoneDetail(zone));
  }
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
      { attrs: { type: 'button', disabled: S.busy }, on: { click: () => checkLanding(zone) } },
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

function renderTry() {
  if (!tryRoot) return;
  clear(tryRoot);
  const sum = getRouteSummary();
  if (!sum) {
    tryRoot.append(
      h('h3', null, `🥾 ${t('guide.try.title')}`),
      h('p.sci-sub', null, t('guide.try.noRoute')),
      h('button.btn.primary', { attrs: { type: 'button' }, on: { click: () => setStep('route') } }, `🧭 ${t('guide.step.route')}`)
    );
    return;
  }
  tryRoot.append(
    h('h3', null, `🥾 ${t('guide.try.title')}`),
    h('p.sci-sub', null, t('guide.try.sub')),
    h(
      'dl.sci-kv.guide-report',
      null,
      h('div', null, h('dt', null, t('pl.sum.length')), h('dd', null, formatDistance(sum.length, getSettings().units))),
      h('div', null, h('dt', null, t('pl.sum.duration')), h('dd', null, formatDuration(sum.seconds))),
      h('div', null, h('dt', null, t('pl.sum.o2')), h('dd', null, `${sum.o2Pct.toFixed(0)}%`)),
      h('div', null, h('dt', null, t('pl.score.total')), h('dd', null, String(sum.score.total))),
      ...(Number.isFinite(sum.coverage)
        ? [h('div', null, h('dt', null, t('pl.sum.scienceCoverage')), h('dd', null, `${Math.round(sum.coverage * 100)}%`))]
        : [])
    ),
    h(
      'div.sci-actions',
      null,
      h('button.btn.primary', { attrs: { type: 'button' }, on: { click: () => walkCurrentRoute() } }, `🚶 ${t('rt.walk')}`),
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => setStep('route') } }, `🧭 ${t('guide.backToRoute')}`)
    ),
    h('p.sci-disclaimer', null, t('guide.try.note'))
  );
}

/* ------------------------------ actions ------------------------------ */

function flyTo(target) {
  const range = target.radiusKm ? Math.max(12000, target.radiusKm * 1000 * 2.4) : 6000;
  orbitView.flyTo({ lat: target.lat, lon: target.lon, range, heading: 0, tilt: 55 }, 2400);
}

function planFromSite(site) {
  const objective = currentObjective();
  const targets = (site.targets || []).map((tt) => ({ ...tt, h: site.elevationM }));
  const planningObjective =
    objective.id === 'survival' ? { ...objective, targetKinds: [...new Set(targets.flatMap((tt) => tt.kinds || []))] } : objective;
  const walk = buildSciencePlan({ site, targets, objective: planningObjective, maxStops: 4, maxRadiusM: 6000 });
  const rover = buildSciencePlan({ site, targets, objective: planningObjective, maxStops: 4, maxRadiusM: 30000 });
  const walkValue = walk.targets.reduce((s, t) => s + t.value, 0);
  const roverValue = rover.targets.reduce((s, t) => s + t.value, 0);
  let walkLength = 0;
  let prev = { lat: site.lat, lon: site.lon };
  for (const tt of walk.targets) {
    walkLength += distanceM(prev.lat, prev.lon, tt.lat, tt.lon);
    prev = tt;
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
  const coverage = rover.potential > 0 ? Math.min(1, (mode === 'rover' ? roverValue : walkValue) / rover.potential) : 0;
  setRoute(plan.points, { params: { mode }, returnToBase: true, sciencePotential: rover.potential });
  setStep('route');
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
  renderSite();
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
    console.warn('[guide] landing check failed', err);
    S.landing = { zoneId: zone.id, status: 'error' };
  } finally {
    S.busy = false;
    renderSite();
  }
}

function useZoneAsBase(base) {
  setRoute([{ lat: base.lat, lon: base.lon, h: base.elevationM, label: t('science.zones.baseLabel') }], {
    params: { mode: 'walk' },
    returnToBase: true,
  });
  setStep('route');
  setEditing(true);
  flyTo(base);
  toast(t('science.zones.baseReady'), { type: 'success', duration: 6000 });
}
