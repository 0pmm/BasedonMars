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
import { ALL_OBJECTIVES as OBJECTIVES, fitSite, objectiveById } from '../game/siteFit.js';
import { icon, OBJECTIVE_ICON } from './icons.js';
import { helpButton } from './genie.js';
import { openPicker } from './picker.js';
import { siteFilters, rankSitesBy, highlights, rankZones, zoneValue, zoneReasons, ZONE_FILTERS } from '../game/recommend.js';
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
  siteFilter: 'general',
  zoneFilter: 'general',
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

/** Cards used by the start screen and the objective step. */
export function objectiveCards(onPick, variant = 'start') {
  const cls = variant === 'start' ? 'start-objective' : 'objective-card';
  return OBJECTIVES.map((o) =>
    h(
      'button',
      {
        class: `${cls}${o.free ? ' objective-free' : ''}`,
        attrs: { type: 'button', 'data-objective': o.id },
        on: { click: () => onPick(o.id) },
      },
      h('span.objective-icon', null, icon(OBJECTIVE_ICON[o.id] || 'free', { size: 22 })),
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

  const iconEl = $('#guide-objective-icon');
  const name = $('#guide-objective-name');
  const headerIcon = $('#header-objective-icon');
  const headerName = $('#header-objective-name');
  if (iconEl) iconEl.replaceChildren(icon(OBJECTIVE_ICON[objective.id] || 'free', { size: 20 }));
  if (name) name.textContent = tr(objective.name);
  if (headerIcon) headerIcon.replaceChildren(icon(OBJECTIVE_ICON[objective.id] || 'free', { size: 16 }));
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
    h('h3', null, t('guide.chooseTitle'), ' ', helpButton('objective', { label: t('guide.chooseTitle') })),
    h('p.sci-sub', null, t('guide.chooseSub')),
    h(
      'div.objective-grid',
      null,
      ...OBJECTIVES.map((o) =>
        h(
          'button',
          {
            class: `objective-card${o.free ? ' objective-free' : ''}${o.id === mission.objective ? ' active' : ''}`,
            attrs: { type: 'button', 'aria-pressed': String(o.id === mission.objective) },
            on: {
              click: () => {
                setObjective(o.id);
                setStep(o.free ? 'route' : 'site');
              },
            },
          },
          h('span.objective-icon', null, icon(OBJECTIVE_ICON[o.id] || 'free', { size: 22 })),
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
        { attrs: { type: 'button' }, on: { click: () => setStep(objective.free ? 'route' : 'site') } },
        `${tr(objective.name)} → ${t(objective.free ? 'guide.step.route' : 'guide.step.site')}`
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
  if (objectiveId === 'free') return renderFreeSites();

  siteRoot.append(
    h(
      'div.sci-views',
      { attrs: { role: 'group', 'aria-label': t('science.view') } },
      viewButton('sites', t('science.view.sites')),
      viewButton('zones', t('science.view.zones')),
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

const siteFilterLabel = (f) => (f === 'general' ? t('rec.filter.general') : t(`science.attr.${f}`));
const zoneFilterLabel = (f) => t(`rec.zfilter.${f}`);

/** "Highlight by" chips: the general recommendation or the best in one criterion. */
function filterChips(filters, current, labelOf, onChange) {
  return h(
    'div.rec-filters',
    { attrs: { role: 'radiogroup', 'aria-label': t('rec.highlightBy') } },
    h('span.rec-filters-label', null, t('rec.highlightBy'), ' ', helpButton('recFilter', { label: t('rec.highlightBy') })),
    h(
      'div.rec-chips',
      null,
      ...filters.map((f) =>
        h(
          'button.rec-chip',
          {
            attrs: { type: 'button', role: 'radio', 'aria-checked': String(f === current), 'data-filter': f },
            on: { click: () => onChange(f) },
          },
          labelOf(f)
        )
      )
    )
  );
}

/** Kicker line of a recommendation card: recommended (by filter) or the user's own pick. */
function recKicker(kind, picked, filterLabel, onBack) {
  const objective = currentObjective();
  return h(
    'div.rec-kicker',
    null,
    picked
      ? h('span.rec-tag.picked', null, t('rec.kicker.picked'))
      : h('span.rec-tag', null, icon('target', { size: 13 }), ` ${t(`rec.kicker.${kind}`, { obj: tr(objective.name) })}`),
    !picked && filterLabel ? h('span.rec-filter-note', null, t('rec.kicker.filter', { f: filterLabel })) : null,
    picked ? h('button.link-btn', { attrs: { type: 'button' }, on: { click: onBack } }, t('rec.backToBest')) : null
  );
}

function reasonList(items) {
  return h(
    'ul.rec-why',
    null,
    ...items.map((it) =>
      h(
        `li.${it.minus ? 'minus' : 'plus'}`,
        null,
        h('span.rec-mark', { attrs: { 'aria-hidden': 'true' } }, it.minus ? '–' : '+'),
        h('span.rec-reason', null, h('span', null, it.text), it.detail ? h('small', null, it.detail) : null)
      )
    )
  );
}

function renderSites(objectiveId) {
  const ranked = rankSitesBy(SITES, objectiveId, S.siteFilter);
  const pickedId = getMission().siteId;
  const picked = pickedId ? SITES.find((s) => s.id === pickedId) : null;
  const site = picked || ranked[0]?.site;
  if (!site) return;
  S.selectedSite = site.id;
  const key = `${objectiveId}:${site.id}`;
  if (S.shown !== key) {
    S.shown = key;
    flyTo(site);
  }
  refreshZones(objectiveId, site.id);
  siteRoot.append(
    filterChips(siteFilters(objectiveId), S.siteFilter, siteFilterLabel, (f) => {
      S.siteFilter = f;
      if (getMission().siteId) selectSite(null);
      else renderSite();
    }),
    renderSiteDetail(site, { picked: !!picked, filter: S.siteFilter, count: ranked.length })
  );
}

function openSitePicker() {
  const objectiveId = getMission().objective;
  const objective = currentObjective();
  openPicker({
    id: 'site-picker',
    title: t('rec.picker.siteTitle', { obj: tr(objective.name) }),
    intro: t('rec.picker.siteIntro'),
    filterLabel: t('rec.highlightBy'),
    filters: siteFilters(objectiveId).map((f) => ({ id: f, label: siteFilterLabel(f) })),
    filter: S.siteFilter,
    items: (f) => rankSitesBy(SITES, objectiveId, f),
    idOf: (r) => r.site.id,
    selectedId: S.selectedSite,
    countLabel: (n) => t('rec.options', { n }),
    onFilter: (f) => (S.siteFilter = f),
    renderItem: (r, { filter, index }) => {
      const missions = missionsAt(r.site.id);
      const value = filter === 'general' ? r.fit.score : Math.round((r.key ?? 0) * 100);
      return [
        h('span.pk-rank', null, String(r.rank).padStart(2, '0')),
        h(
          'span.pk-main',
          null,
          h(
            'span.pk-title',
            null,
            r.site.name,
            index === 0 ? h('span.pk-tag.best', null, t('rec.recommended')) : null,
            r.site.id === S.selectedSite ? h('span.pk-tag', null, t('rec.current')) : null
          ),
          h(
            'span.pk-sub',
            null,
            tr(r.site.region),
            ' · ',
            missions.length ? missions.map((m) => m.name).join(', ') : t('science.unexplored')
          ),
          h(
            'span.pk-highlights',
            null,
            h('span.pk-hl-label', null, `${t('rec.standsOut')}: `),
            highlights(r.site, objectiveId, 2)
              .map((x) => `${t(`science.attr.${x.key}`)} ${pct(x.value)}`)
              .join(' · ')
          ),
          h('small.pk-note', null, tr(r.site.note))
        ),
        h(
          'span.pk-score',
          null,
          h('strong', null, String(value)),
          h('small', null, filter === 'general' ? t('rec.score') : t(`science.attr.${filter}`))
        ),
      ];
    },
    onPick: (r) => {
      S.selectedSite = r.site.id;
      selectSite(r.site.id);
      flyTo(r.site);
    },
  });
}

function renderSiteDetail(site, { picked, filter, count }) {
  const objectiveId = getMission().objective;
  const fit = fitSite(site, objectiveId);
  const objective = objectiveById(objectiveId);
  const missions = missionsAt(site.id);
  const imagery = sitesData.imagery?.[site.id];
  const box = h('div.sci-detail.rec-card', { attrs: { 'data-genie-target': '' } });
  const reason = (f, minus) => ({
    text: t(`rec.${minus ? 'watchFor' : 'why'}.${f.key}`),
    detail: `${t(`science.attr.${f.key}`)} ${pct(f.value)} · ${f.source}`,
    minus,
  });
  // strengths: the clearly good criteria (>= 70 %), weightiest first; at least the two drivers
  const strong = fit.factors.filter((f) => f.value >= 0.7).slice(0, 3);
  const plus = strong.length ? strong : fit.drivers;
  const minus = fit.limits.filter((f) => f.value < 0.7 && !plus.some((p) => p.key === f.key));

  box.append(
    recKicker('site', picked, filter !== 'general' ? siteFilterLabel(filter) : '', () => selectSite(null)),
    h(
      'div.rec-head',
      null,
      h('div', null, h('h4', null, site.name), h('p.rec-meta', null, tr(site.region))),
      h(
        'div.rec-score',
        { attrs: { title: t('science.fit') } },
        h('strong', null, String(fit.score)),
        h('small', null, '/100'),
        helpButton('fitScore', { label: t('science.fit'), targets: () => [box], ctx: () => ({ site, fit }) })
      )
    ),
    bar(fit.score / 100, `${t('science.fit')} ${fit.score}`),
    h(
      'div.sci-badges',
      null,
      missions.length
        ? h('span.sci-badge.explored', null, `${t('science.explored')} · ${missions.map((m) => m.name).join(', ')}`)
        : h('span.sci-badge.unexplored', null, t('science.unexplored')),
      h('span.sci-badge', { attrs: { title: t('science.confidence') } }, confidenceLabel(fit.confidence))
    ),
    h('p.sci-note', null, tr(site.note)),
    h('h5', null, picked ? t('rec.strengths') : t('rec.whyBest')),
    reasonList(plus.map((f) => reason(f, false))),
    ...(minus.length ? [h('h5', null, t('rec.watch')), reasonList(minus.map((f) => reason(f, true)))] : [])
  );

  if (fit.missing.length) {
    box.append(h('p.sci-warn', null, `${t('science.missing', { keys: fit.missing.map((k) => t(`science.attr.${k}`)).join(', ') })}`));
  }

  box.append(
    h(
      'details.rec-attrs',
      null,
      h('summary', null, t('rec.allAttrs', { n: Object.keys(objective.weights).length })),
      h(
        'div.sci-attrs',
        null,
        ...Object.entries(objective.weights).map(([key, weight]) => {
          const attr = site.attributes[key];
          if (!attr) return null;
          const row = h('div.sci-attr');
          row.append(
            h(
              'span.sci-attr-name',
              null,
              t(`science.attr.${key}`),
              ' ',
              helpButton('criterion', { label: t(`science.attr.${key}`), targets: () => [row], ctx: () => ({ key, value: attr.v, site }) })
            ),
            bar(attr.v, t(`science.attr.${key}`)),
            h('span.sci-attr-val', null, pct(attr.v)),
            h('small', null, `${t('science.weight')} ${pct(weight)} · ${kindLabel(attr.kind)} · ${attr.source}`)
          );
          return row;
        })
      ),
      h(
        'p.sci-coords',
        null,
        `${site.lat.toFixed(3)}°, ${site.lon.toFixed(3)}° · ${site.elevationM} m${imagery ? ` · ${imagery.label}` : ''}`
      )
    )
  );

  if (missions.length) {
    box.append(
      h(
        'details.rec-attrs',
        null,
        h('summary', null, t('science.mission')),
        ...missions.map((m) =>
          h(
            'div.sci-mission',
            null,
            h('strong', null, `${m.name} · ${m.year}`),
            h('p', null, tr(m.result)),
            h(
              'small',
              null,
              `${t('science.objective')}: ${missionObjectiveName(m)}${m.validation === 'vintage' ? ` · ${t('science.vintage')}` : ''}`
            )
          )
        )
      )
    );
  }

  box.append(
    h(
      'div.sci-actions.rec-actions',
      null,
      h(
        'button.btn.primary',
        { attrs: { type: 'button' }, on: { click: () => planFromSite(site) } },
        icon('route'),
        ` ${t('science.planEva')}`
      ),
      h(
        'button.btn',
        { attrs: { type: 'button', id: 'btn-change-site' }, on: { click: openSitePicker } },
        icon('list'),
        ` ${t('rec.change.site')}`,
        h('small.btn-count', null, String(count))
      ),
      h('button.btn.ghost', { attrs: { type: 'button' }, on: { click: () => flyTo(site) } }, icon('target'), ` ${t('science.flyTo')}`)
    )
  );
  if (site.confidence < 0.6) box.append(h('p.sci-warn', null, `${t('science.preliminary')}`));
  return box;
}

function kindLabel(kind) {
  return t(`science.kind.${kind || 'literature'}`);
}

/** Missions keep their historical objective, even ones the app no longer offers (e.g. ancient life). */
function missionObjectiveName(m) {
  const known = OBJECTIVES.find((o) => o.id === m.objective);
  return known ? tr(known.name) : t(`science.objLegacy.${m.objective}`);
}

function renderZones(objectiveId) {
  const ranked = rankZones(prospects.zones, objectiveId, S.zoneFilter);
  const pickedId = getMission().zoneId;
  const pickedZone = pickedId ? prospects.zones.find((z) => z.id === pickedId) : null;
  const zone = pickedZone || ranked[0]?.zone;
  siteRoot.append(
    h(
      'p.rec-intro',
      null,
      t(objectiveId === 'survival' ? 'rec.zones.introSurvival' : 'rec.zones.introGeology'),
      ' ',
      helpButton('zones', { label: t('science.view.zones') })
    ),
    filterChips(ZONE_FILTERS, S.zoneFilter, zoneFilterLabel, (f) => {
      S.zoneFilter = f;
      S.landing = null;
      if (getMission().zoneId) selectZone(null);
      else renderSite();
    })
  );
  if (!zone) return;
  S.selectedZone = zone.id;
  const key = `${objectiveId}:${zone.id}`;
  if (S.shown !== key) {
    S.shown = key;
    flyTo(zone);
  }
  siteRoot.append(renderZoneDetail(zone, { picked: !!pickedZone, count: ranked.length }));
}

function openZonePicker() {
  const objectiveId = getMission().objective;
  const objective = currentObjective();
  openPicker({
    id: 'zone-picker',
    title: t('rec.picker.zoneTitle', { obj: tr(objective.name) }),
    intro: t('rec.picker.zoneIntro', { n: prospects.totalDetections }),
    filterLabel: t('rec.highlightBy'),
    filters: ZONE_FILTERS.map((f) => ({ id: f, label: zoneFilterLabel(f) })),
    filter: S.zoneFilter,
    items: (f) => rankZones(prospects.zones, objectiveId, f),
    idOf: (r) => r.zone.id,
    selectedId: S.selectedZone,
    countLabel: (n) => t('rec.options', { n }),
    onFilter: (f) => (S.zoneFilter = f),
    renderItem: (r, { filter, index }) => {
      const z = r.zone;
      const overall = filter === 'general' || filter === 'unexplored';
      const shown = filter === 'detections' ? String(z.detections) : String(Math.round((overall ? r.value : r.key) * 100));
      const tags = [
        t(`rec.ztag.conf.${z.confidence}`),
        z.explored ? t('science.explored') : t('rec.ztag.new'),
        t('rec.ztag.lat', { lat: `${Math.abs(z.lat).toFixed(1)}°${z.lat >= 0 ? 'N' : 'S'}` }),
      ];
      return [
        h('span.pk-rank', null, String(r.rank).padStart(2, '0')),
        h(
          'span.pk-main',
          null,
          h(
            'span.pk-title',
            null,
            zoneName(z),
            index === 0 ? h('span.pk-tag.best', null, t('rec.recommended')) : null,
            z.id === S.selectedZone ? h('span.pk-tag', null, t('rec.current')) : null
          ),
          h(
            'span.pk-sub',
            null,
            `${z.detections} ${t('science.zones.detections')} · CRISM ${z.crism} · OMEGA ${z.omega} · ${t('science.zones.radius', { km: z.radiusKm })}`
          ),
          h('span.pk-highlights', null, tags.join(' · '))
        ),
        h(
          'span.pk-score',
          null,
          h('strong', null, shown),
          h('small', null, filter === 'detections' ? t('science.zones.detections') : overall ? t('rec.score') : zoneFilterLabel(filter))
        ),
      ];
    },
    onPick: (r) => {
      S.selectedZone = r.zone.id;
      S.landing = null;
      selectZone(r.zone.id);
      flyTo(r.zone);
    },
  });
}

function renderZoneDetail(zone, { picked, count }) {
  const objectiveId = getMission().objective;
  const box = h('div.sci-detail.rec-card', { attrs: { 'data-genie-target': '' } });
  const value = Math.round(zoneValue(zone, objectiveId) * 100);
  const reasons = zoneReasons(zone, objectiveId).map((r) => ({ text: t(r.key, r.vars || {}), minus: r.minus }));
  const plus = reasons.filter((r) => !r.minus);
  const minus = reasons.filter((r) => r.minus);
  box.append(
    recKicker(
      'zone',
      picked,
      S.zoneFilter !== 'general' ? zoneFilterLabel(S.zoneFilter) : '',
      () => ((S.landing = null), selectZone(null))
    ),
    h(
      'div.rec-head',
      null,
      h(
        'div',
        null,
        h('h4', null, zoneName(zone)),
        h('p.rec-meta', null, `${t('science.zones.radius', { km: zone.radiusKm })} · ${zone.detections} ${t('science.zones.detections')}`)
      ),
      h('div.rec-score', null, h('strong', null, String(value)), h('small', null, '/100'))
    ),
    bar(value / 100, `${t('science.fit')} ${value}`),
    h('h5', null, picked ? t('rec.strengths') : t('rec.whyBestZone')),
    reasonList(plus),
    ...(minus.length ? [h('h5', null, t('rec.watch')), reasonList(minus)] : []),
    h(
      'dl.sci-kv',
      null,
      h('div', null, h('dt', null, 'CRISM'), h('dd', null, String(zone.crism))),
      h('div', null, h('dt', null, 'OMEGA'), h('dd', null, String(zone.omega))),
      h('div', null, h('dt', null, t('science.confidence')), h('dd', null, t(`rec.ztag.conf.${zone.confidence}`)))
    ),
    h('p.sci-disclaimer', null, t('science.zones.bias'))
  );

  const landing = S.landing && S.landing.zoneId === zone.id ? S.landing : null;
  if (landing?.status === 'loading') box.append(h('p.rec-loading', { attrs: { role: 'status' } }, t('rec.landing.loading')));
  if (landing?.status === 'done' && landing.base) {
    const land = landing.base.landability;
    box.append(
      h('h5', null, t('science.zones.landing'), ' ', helpButton('landing', { label: t('science.zones.landing') })),
      h(
        'div.rec-head.rec-landing',
        null,
        h(
          'p.sci-coords',
          null,
          `${landing.base.lat.toFixed(3)}°, ${landing.base.lon.toFixed(3)}° · ${t('science.maxSlope')}: ${landing.base.maxSlopeDeg.toFixed(1)}° · ${t('science.roughness')}: ${landing.base.roughnessM.toFixed(2)} m`
        ),
        h('div.rec-score', null, h('strong', null, String(land.score)), h('small', null, `/100 · ${land.grade}`))
      ),
      bar(land.score / 100, t('science.zones.landing')),
      landing.confidence.level !== 'high'
        ? h('p.sci-warn', null, `${t('science.zones.preliminary', { level: landing.confidence.level })}`)
        : null
    );
  } else if (landing?.status === 'error') {
    box.append(h('p.sci-warn', null, `${t('science.zones.noLanding')}`));
  }

  const actions = [];
  if (landing?.base) {
    actions.push(
      h(
        'button.btn.primary',
        { attrs: { type: 'button' }, on: { click: () => useZoneAsBase(landing.base) } },
        icon('flag'),
        ` ${t('science.zones.useBase')}`
      )
    );
  } else {
    actions.push(
      h(
        'button.btn.primary',
        { attrs: { type: 'button', disabled: S.busy }, on: { click: () => checkLanding(zone) } },
        icon('target'),
        ` ${t('science.zones.checkLanding')}`
      )
    );
  }
  actions.push(
    h(
      'button.btn',
      { attrs: { type: 'button', id: 'btn-change-zone' }, on: { click: openZonePicker } },
      icon('list'),
      ` ${t('rec.change.zone')}`,
      h('small.btn-count', null, String(count))
    ),
    h('button.btn.ghost', { attrs: { type: 'button' }, on: { click: () => flyTo(zone) } }, icon('target'), ` ${t('science.flyTo')}`)
  );
  box.append(h('div.sci-actions.rec-actions', null, ...actions));
  return box;
}

function renderTry() {
  if (!tryRoot) return;
  clear(tryRoot);
  const sum = getRouteSummary();
  if (!sum) {
    tryRoot.append(
      h('h3', null, t('guide.try.title')),
      h('p.sci-sub', null, t('guide.try.noRoute')),
      h('button.btn.primary', { attrs: { type: 'button' }, on: { click: () => setStep('route') } }, t('guide.step.route'))
    );
    return;
  }
  tryRoot.append(
    h('h3', null, t('guide.try.title')),
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
      h('button.btn.primary', { attrs: { type: 'button' }, on: { click: () => walkCurrentRoute() } }, icon('walk'), ` ${t('rt.walk')}`),
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => setStep('route') } }, t('guide.backToRoute'))
    ),
    h('p.sci-disclaimer', null, t('guide.try.note'))
  );
}

/* ------------------------------ actions ------------------------------ */

function flyTo(target) {
  // sites: close enough to see the landscape, far enough to see the context around it
  const range = target.radiusKm ? Math.max(12000, target.radiusKm * 1000 * 2.4) : 30000;
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

/** Free exploration: every place, no ranking, no zones — just go and look. */
function renderFreeSites() {
  siteRoot.append(
    h('h3', null, t('guide.free.title')),
    h('p.sci-sub', null, t('guide.free.sub')),
    h(
      'div.sci-actions',
      null,
      h(
        'button.btn.primary',
        {
          attrs: { type: 'button' },
          on: {
            click: () => {
              setStep('route');
              setEditing(true);
            },
          },
        },
        icon('edit'),
        ` ${t('guide.free.mark')}`
      )
    ),
    h(
      'ul.free-list',
      null,
      ...SITES.slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((site) => {
          const missions = missionsAt(site.id);
          return h(
            'li',
            null,
            h(
              'button.free-row',
              { attrs: { type: 'button' }, on: { click: () => flyTo(site) } },
              h('span.free-name', null, site.name),
              h('span.free-meta', null, tr(site.region)),
              h(
                'span.free-coord.mono',
                null,
                `${Math.abs(site.lat).toFixed(1)}°${site.lat >= 0 ? 'N' : 'S'} ${Math.abs(site.lon).toFixed(1)}°${site.lon >= 0 ? 'E' : 'W'}`
              ),
              missions.length ? h('span.free-missions', null, missions.map((m) => m.name).join(', ')) : null
            )
          );
        })
    )
  );
}
