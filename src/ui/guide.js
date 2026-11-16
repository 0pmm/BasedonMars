/**
 * Mission guide in the right panel: 1 objective, 2 place, 3 route; the final
 * rehearsal is a popup at the end of the route that leads into the
 * first-person walk. The globe layer (ranked
 * places and candidate areas) reacts to the same mission state.
 *
 * "Places" are one list: the curated sites and the candidate areas found in
 * the hydrated-mineral detections (game/recommend.js). The place step shows
 * the single best one for the objective, with its reasons collapsed; "Change"
 * opens every place over a blurred screen, with filters.
 */
import { h, $, clear } from '../core/dom.js';
import { t, tr } from '../core/i18n.js';
import { on } from '../core/events.js';
import { getState } from '../core/state.js';
import { orbitView } from '../orbit/orbitView.js';
import { toast } from './feedback.js';
import { openSheet } from './dashboard.js';
import { openDialog } from './modal.js';
import { setRoute, getRouteSummary, walkCurrentRoute, setEditing, formatDuration } from './routePanel.js';
import { getMission, setStep, setObjective, selectSite, selectZone, objective as currentObjective } from '../core/mission.js';
import { getSettings } from '../core/settings.js';
import { ALL_OBJECTIVES as OBJECTIVES, objectiveById } from '../game/siteFit.js';
import { icon, OBJECTIVE_ICON } from './icons.js';
import { helpButton } from './genie.js';
import { openPicker } from './picker.js';
import { siteFilters, highlights, places, rankPlaces, EXPLORED_FILTERS } from '../game/recommend.js';
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
  filter: 'general', // criterion that ranks the places ("highlight by")
  explored: 'all', // all | explored | unexplored
  landing: null,
  busy: false,
  shown: null, // last place the camera flew to (objective:id)
  dashboard: false,
  routeWasOpen: false,
};

let siteRoot = null;
let objectiveRoot = null;
let rehearsal = null;

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

const coords = (lat, lon) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;

/** Display name of a place: the site name, or "Candidate area 0.3°N 3.7°E". */
function placeName(p) {
  return p.kind === 'site' ? p.site.name : t('rec.zoneTitle', { coords: coords(p.lat, p.lon) });
}

const missionList = (missions) => missions.map((m) => `${m.name} · ${m.year}`).join(', ');
const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Source of an attribute: data text, or an i18n key for the values the app derives itself. */
const sourceOf = (f) => (f.sourceKey ? t(f.sourceKey, f.sourceVars || {}) : f.source);

/** Missions keep their historical objective, even ones the app no longer offers (e.g. ancient life). */
function missionObjectiveName(m) {
  const known = OBJECTIVES.find((o) => o.id === m.objective);
  return known ? tr(known.name) : t(`science.objLegacy.${m.objective}`);
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
  objectiveRoot = $('#guide-objective');
  S.dashboard = getState() === 'dashboard';

  document.querySelectorAll('.guide-step-btn').forEach((btn) => {
    btn.addEventListener('click', () => setStep(btn.dataset.step));
  });
  $('#btn-change-objective')?.addEventListener('click', () => setStep('objective'));

  initZonesLayer({
    onZone: (zone) => pick({ id: zone.id, kind: 'zone', lat: zone.lat, lon: zone.lon, zone }),
    onSite: (site) => pick({ id: site.id, kind: 'site', lat: site.lat, lon: site.lon, site }),
  });

  on('mission:change', (mission) => {
    render();
    if (mission.step !== 'try') openSheet('right-panel');
  });
  on('language:change', render);
  on('dashboard:visible', (visible) => {
    const entering = visible && !S.dashboard;
    S.dashboard = visible;
    // entering the map: show the recommended place (render flies to it once)
    if (entering) render();
    else syncRoute();
  });
  on('route:open', () => setStep('route'));
  render();
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

  // three tabs: objective, place, route (the rehearsal is a popup over the route)
  const panelStep = mission.step === 'try' ? 'route' : mission.step;
  document.querySelectorAll('.guide-step').forEach((el) => {
    el.hidden = el.dataset.step !== panelStep;
  });
  document.querySelectorAll('.guide-step-btn').forEach((btn) => {
    const active = btn.dataset.step === panelStep;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });

  if (panelStep === 'objective') renderObjective();
  if (panelStep === 'site') renderSite();
  syncRoute();
}

/** Leaving the route stops point editing; the "try" step opens the rehearsal popup (map screen only). */
function syncRoute() {
  const open = S.dashboard && routeStep();
  if (!open && S.routeWasOpen) setEditing(false);
  S.routeWasOpen = open;
  if (S.dashboard && getMission().step === 'try') openRehearsal();
  else if (rehearsal) rehearsal.close();
}

const routeStep = () => ['route', 'try'].includes(getMission().step);

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

/* ------------------------------- places ------------------------------ */

const filterLabel = (f) => (f === 'general' ? t('rec.filter.general') : t(`science.attr.${f}`));
const exploredLabel = (f) => t(`rec.explored.${f}`);

/** Chip row (radio group). */
function chipRow(label, help, options, current, labelOf, onChange, cls = '') {
  return h(
    `div.rec-filters${cls ? `.${cls}` : ''}`,
    { attrs: { role: 'radiogroup', 'aria-label': label } },
    h('span.rec-filters-label', null, label, help ? ' ' : null, help),
    h(
      'div.rec-chips',
      null,
      ...options.map((o) =>
        h(
          'button.rec-chip',
          {
            attrs: { type: 'button', role: 'radio', 'aria-checked': String(o === current), 'data-filter': o },
            on: { click: () => onChange(o) },
          },
          labelOf(o)
        )
      )
    )
  );
}

function allPlaces() {
  return places(SITES, prospects.zones, MISSIONS, getMission().objective);
}

/** Pick a place (from the chooser or the globe). */
function pick(p) {
  S.landing = null;
  if (p.kind === 'zone') selectZone(p.id);
  else selectSite(p.id);
  flyTo(p);
  openSheet('right-panel');
}

function renderSite() {
  if (!siteRoot) return;
  clear(siteRoot);
  const mission = getMission();
  const objectiveId = mission.objective;
  if (objectiveId === 'free') return renderFreeSites();

  const list = allPlaces();
  const ranked = rankPlaces(list, { filter: S.filter, explored: S.explored });
  const pickedId = mission.siteId || mission.zoneId;
  const picked = pickedId ? list.find((p) => p.id === pickedId) : null;
  const place = picked || ranked[0];
  const counts = {
    all: list.length,
    explored: list.filter((p) => p.visited).length,
    unexplored: list.filter((p) => !p.visited).length,
  };

  siteRoot.append(
    chipRow(
      t('rec.exploredLabel'),
      helpButton('explored', { label: t('rec.exploredLabel') }),
      EXPLORED_FILTERS,
      S.explored,
      (f) => `${exploredLabel(f)} · ${counts[f]}`,
      (f) => {
        S.explored = f;
        S.landing = null;
        clearPick();
      },
      'rec-explored'
    )
  );
  // already explored: their names (and missions) right away, each one clickable
  if (S.explored === 'explored') {
    siteRoot.append(
      h(
        'ul.rec-names',
        null,
        ...ranked.map((p) =>
          h(
            'li',
            null,
            h(
              'button.rec-name',
              { attrs: { type: 'button', 'aria-pressed': String(place?.id === p.id) }, on: { click: () => pick(p) } },
              h('strong', null, placeName(p)),
              h(
                'small',
                null,
                p.missions.length ? p.missions.map((m) => m.name).join(', ') : p.near ? p.near.missions.map((m) => m.name).join(', ') : ''
              )
            )
          )
        )
      )
    );
  }
  siteRoot.append(
    chipRow(
      t('rec.highlightBy'),
      helpButton('recFilter', { label: t('rec.highlightBy') }),
      siteFilters(objectiveId),
      S.filter,
      filterLabel,
      (f) => {
        S.filter = f;
        S.landing = null;
        clearPick();
      }
    ),
    h(
      'label.sci-check.rec-map',
      null,
      h('input', { attrs: { type: 'checkbox', checked: isZonesVisible() }, on: { change: (e) => setZonesVisible(e.target.checked) } }),
      ` ${t('rec.mapToggle')}`
    )
  );
  if (!place) {
    siteRoot.append(h('p.sci-sub', null, t('rec.none')));
    return;
  }
  refreshZones(objectiveId, place.kind === 'site' ? place.id : null);
  const key = `${objectiveId}:${place.id}`;
  // only on the map screen: the start screen keeps the whole planet in view
  if (S.dashboard && S.shown !== key) {
    S.shown = key;
    flyTo(place);
  }
  siteRoot.append(placeCard(place, { picked: !!picked, count: ranked.length }));
}

/** Back to the recommendation (filters changed or the user asked for it). */
function clearPick() {
  const m = getMission();
  if (m.siteId) selectSite(null);
  else if (m.zoneId) selectZone(null);
  else render();
}

/** Plain-language strengths and watch-outs of a place. */
function placeReasons(p, objectiveId) {
  const fit = p.fit;
  const reason = (f, minus) => ({
    text: t(`rec.${minus ? 'watchFor' : 'why'}.${f.key}`),
    detail: `${t(`science.attr.${f.key}`)} ${pct(f.value)} · ${sourceOf(f)}`,
    minus,
  });
  const strong = fit.factors.filter((f) => f.value >= 0.7).slice(0, 3);
  const plus = (strong.length ? strong : fit.drivers).map((f) => reason(f, false));
  const minus = fit.limits.filter((f) => f.value < 0.7 && !strong.some((s) => s.key === f.key)).map((f) => reason(f, true));
  if (!p.visited && objectiveId === 'geology') plus.push({ text: t('rec.place.new') });
  if (p.near && objectiveId === 'survival' && p.near.km <= 300)
    plus.push({ text: t('rec.place.nearSurvival', { name: p.near.name, km: p.near.km }) });
  if (fit.coverage < 0.999) {
    const total = Object.keys(objectiveById(objectiveId).weights).length;
    minus.push({ text: t('rec.place.partial', { n: fit.factors.length, m: total }), minus: true });
  }
  if (p.kind === 'zone' && p.zone.confidence !== 'high') minus.push({ text: t('rec.zone.confMedium'), minus: true });
  return { plus, minus };
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

/** Collapsible section (closed by default). */
function fold(summary, count, ...content) {
  return h(
    'details.rec-attrs',
    null,
    h('summary', null, summary, count != null ? h('span.rec-count', null, String(count)) : null),
    ...content
  );
}

function placeCard(p, { picked, count }) {
  const objectiveId = getMission().objective;
  const objective = objectiveById(objectiveId);
  const fit = p.fit;
  const box = h('div.sci-detail.rec-card', { attrs: { 'data-genie-target': '', 'data-place': p.id } });
  const { plus, minus } = placeReasons(p, objectiveId);
  const exploredBy = p.missions.length
    ? t('rec.place.exploredBy', { missions: missionList(p.missions) })
    : p.visited && p.near
      ? t('rec.place.exploredNear', { name: p.near.name, missions: missionList(p.near.missions) })
      : t('rec.place.never');

  box.append(
    h(
      'div.rec-kicker',
      null,
      picked
        ? h('span.rec-tag.picked', null, t('rec.kicker.picked'))
        : h('span.rec-tag', null, icon('target', { size: 13 }), ` ${t('rec.kicker.site', { obj: tr(objective.name) })}`),
      !picked && S.filter !== 'general' ? h('span.rec-filter-note', null, t('rec.kicker.filter', { f: filterLabel(S.filter) })) : null,
      picked ? h('button.link-btn', { attrs: { type: 'button' }, on: { click: clearPick } }, t('rec.backToBest')) : null
    ),
    h(
      'div.rec-head',
      null,
      h(
        'div',
        null,
        h('span.rec-kind', null, t(`rec.kind.${p.kind}`)),
        h('h4', null, placeName(p)),
        h('p.rec-meta', null, p.kind === 'site' ? tr(p.site.region) : t('science.zones.radius', { km: p.zone.radiusKm }))
      ),
      h(
        'div.rec-score',
        { attrs: { title: t('science.fit') } },
        h('strong', null, String(fit.score)),
        h('small', null, '/100'),
        helpButton('fitScore', { label: t('science.fit'), targets: () => [box], ctx: () => ({ site: { name: placeName(p) }, fit }) })
      )
    ),
    bar(fit.score / 100, `${t('science.fit')} ${fit.score}`),
    h(
      'ul.rec-facts',
      null,
      h('li', { class: p.visited ? 'explored' : 'unexplored' }, exploredBy),
      p.near && !p.missions.length && !p.visited ? h('li', null, t('rec.place.nearKnown', { name: p.near.name, km: p.near.km })) : null,
      h('li', null, capitalise(confidenceLabel(fit.confidence)))
    ),
    h('p.sci-note', null, p.kind === 'site' ? tr(p.site.note) : t('rec.zoneNote', { n: p.zone.detections, km: p.zone.radiusKm })),
    fold(picked ? t('rec.strengths') : t('rec.whyBest'), plus.length, reasonList(plus))
  );
  if (minus.length) box.append(fold(t('rec.watch'), minus.length, reasonList(minus)));

  box.append(
    fold(
      t('rec.allAttrsTitle'),
      Object.keys(objective.weights).length,
      h(
        'div.sci-attrs',
        null,
        ...Object.entries(objective.weights).map(([key, weight]) => {
          const attr = p.attributes?.[key];
          const row = h('div.sci-attr');
          row.append(
            h(
              'span.sci-attr-name',
              null,
              t(`science.attr.${key}`),
              ' ',
              helpButton('criterion', { label: t(`science.attr.${key}`), targets: () => [row], ctx: () => ({ key, value: attr?.v }) })
            ),
            attr ? bar(attr.v, t(`science.attr.${key}`)) : h('span.sci-track.unknown'),
            h('span.sci-attr-val', null, attr ? pct(attr.v) : '—'),
            h(
              'small',
              null,
              attr
                ? `${t('science.weight')} ${pct(weight)} · ${t(`science.kind.${attr.kind || 'literature'}`)} · ${sourceOf(attr)}`
                : `${t('science.weight')} ${pct(weight)} · ${t('rec.unknown')}`
            )
          );
          return row;
        })
      ),
      h('p.sci-coords', null, `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°${p.kind === 'site' ? ` · ${p.site.elevationM} m` : ''}`)
    )
  );

  if (p.missions.length) {
    box.append(
      fold(
        t('science.mission'),
        p.missions.length,
        ...p.missions.map((m) =>
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

  if (p.kind === 'zone') box.append(...landingBlock(p.zone));
  box.append(placeActions(p, count));
  if (p.kind === 'site' && p.site.confidence < 0.6) box.append(h('p.sci-warn', null, t('science.preliminary')));
  return box;
}

function landingBlock(zone) {
  const landing = S.landing && S.landing.zoneId === zone.id ? S.landing : null;
  if (landing?.status === 'loading') return [h('p.rec-loading', { attrs: { role: 'status' } }, t('rec.landing.loading'))];
  if (landing?.status === 'error') return [h('p.sci-warn', null, t('science.zones.noLanding'))];
  if (landing?.status !== 'done' || !landing.base) return [];
  const land = landing.base.landability;
  return [
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
    ...(landing.confidence.level !== 'high'
      ? [h('p.sci-warn', null, t('science.zones.preliminary', { level: landing.confidence.level }))]
      : []),
  ];
}

function placeActions(p, count) {
  const actions = [];
  if (p.kind === 'site') {
    actions.push(
      h(
        'button.btn.primary',
        { attrs: { type: 'button' }, on: { click: () => planFromSite(p.site) } },
        icon('route'),
        ` ${t('science.planEva')}`
      )
    );
  } else {
    const landing = S.landing && S.landing.zoneId === p.id ? S.landing : null;
    actions.push(
      landing?.base
        ? h(
            'button.btn.primary',
            { attrs: { type: 'button' }, on: { click: () => useZoneAsBase(landing.base) } },
            icon('flag'),
            ` ${t('science.zones.useBase')}`
          )
        : h(
            'button.btn.primary',
            { attrs: { type: 'button', disabled: S.busy }, on: { click: () => checkLanding(p.zone) } },
            icon('target'),
            ` ${t('science.zones.checkLanding')}`
          )
    );
  }
  actions.push(
    h(
      'button.btn',
      { attrs: { type: 'button', id: 'btn-change-site' }, on: { click: () => openPlacePicker() } },
      icon('list'),
      ` ${t('rec.change.site')}`,
      h('small.btn-count', null, String(count))
    ),
    h('button.btn.ghost', { attrs: { type: 'button' }, on: { click: () => flyTo(p) } }, icon('target'), ` ${t('science.flyTo')}`)
  );
  return h('div.sci-actions.rec-actions', null, ...actions);
}

function openPlacePicker() {
  const objectiveId = getMission().objective;
  const objective = currentObjective();
  const list = allPlaces();
  const current = getMission().siteId || getMission().zoneId || rankPlaces(list, { filter: S.filter, explored: S.explored })[0]?.id;
  openPicker({
    id: 'site-picker',
    title: t('rec.picker.siteTitle', { obj: tr(objective.name) }),
    intro: t('rec.picker.placesIntro'),
    groups: [
      { key: 'explored', label: t('rec.exploredLabel'), options: EXPLORED_FILTERS.map((f) => ({ id: f, label: exploredLabel(f) })) },
      { key: 'filter', label: t('rec.highlightBy'), options: siteFilters(objectiveId).map((f) => ({ id: f, label: filterLabel(f) })) },
    ],
    state: { explored: S.explored, filter: S.filter },
    items: (st) => rankPlaces(list, st),
    idOf: (p) => p.id,
    selectedId: current,
    countLabel: (n) => t('rec.options', { n }),
    onChange: (st) => {
      S.explored = st.explored;
      S.filter = st.filter;
    },
    renderItem: (p, { state, index }) => {
      const value = state.filter === 'general' ? p.fit.score : p.key >= 0 ? Math.round(p.key * 100) : '—';
      const hl = highlights(p, objectiveId, 2);
      return [
        h('span.pk-rank', null, String(p.rank).padStart(2, '0')),
        h(
          'span.pk-main',
          null,
          h(
            'span.pk-title',
            null,
            placeName(p),
            h(`span.pk-tag.kind-${p.kind}`, null, t(`rec.kind.${p.kind}`)),
            index === 0 ? h('span.pk-tag.best', null, t('rec.recommended')) : null,
            p.id === current ? h('span.pk-tag', null, t('rec.current')) : null
          ),
          h(
            'span.pk-sub',
            null,
            p.missions.length
              ? t('rec.place.exploredBy', { missions: missionList(p.missions) })
              : p.visited && p.near
                ? t('rec.place.exploredNear', { name: p.near.name, missions: missionList(p.near.missions) })
                : `${t('rec.place.never')}${p.near ? ` · ${t('rec.place.nearShort', { name: p.near.name, km: p.near.km })}` : ''}`
          ),
          hl.length
            ? h(
                'span.pk-highlights',
                null,
                h('span.pk-hl-label', null, `${t('rec.standsOut')}: `),
                hl.map((x) => `${t(`science.attr.${x.key}`)} ${pct(x.value)}`).join(' · ')
              )
            : null,
          h('small.pk-note', null, p.kind === 'site' ? tr(p.site.note) : t('rec.zoneNote', { n: p.zone.detections, km: p.zone.radiusKm }))
        ),
        h(
          'span.pk-score',
          null,
          h('strong', null, String(value)),
          h('small', null, state.filter === 'general' ? t('rec.score') : t(`science.attr.${state.filter}`))
        ),
      ];
    },
    onPick: (p) => pick(p),
  });
}

/* ----------------------------- rehearsal ----------------------------- */

/** Final step: a popup with the plan summary that leads into the first-person walk. */
function openRehearsal() {
  if (rehearsal) return;
  const sum = getRouteSummary();
  let go = false;
  const units = getSettings().units;
  const body = sum
    ? h(
        'div.rehearsal',
        null,
        h('p.sci-sub', null, t('guide.try.sub')),
        h(
          'dl.sci-kv.guide-report',
          null,
          h('div', null, h('dt', null, t('pl.sum.length')), h('dd', null, formatDistance(sum.length, units))),
          h('div', null, h('dt', null, t('pl.sum.duration')), h('dd', null, formatDuration(sum.seconds))),
          h('div', null, h('dt', null, t('pl.sum.o2')), h('dd', null, `${sum.o2Pct.toFixed(0)}%`)),
          h('div', null, h('dt', null, t('pl.score.total')), h('dd', null, String(sum.score.total))),
          ...(Number.isFinite(sum.coverage)
            ? [h('div', null, h('dt', null, t('pl.sum.scienceCoverage')), h('dd', null, `${Math.round(sum.coverage * 100)}%`))]
            : [])
        ),
        h('p.sci-disclaimer', null, t('guide.try.note'))
      )
    : h('p.sci-sub', null, t('guide.try.noRoute'));
  rehearsal = openDialog({
    id: 'rehearsal-dialog',
    title: t('guide.try.title'),
    body,
    actions: sum
      ? [{ label: t('guide.backToRoute') }, { label: t('rt.walk'), primary: true, id: 'btn-walk-go', onClick: () => (go = true) }]
      : [{ label: t('guide.backToRoute'), primary: true }],
    onClose: () => {
      rehearsal = null;
      if (getMission().step === 'try') setStep('route');
      if (go) walkCurrentRoute();
    },
  });
}

/* ------------------------------ actions ------------------------------ */

function flyTo(target) {
  const lat = target.lat;
  const lon = target.lon;
  const radiusKm = target.radiusKm ?? target.zone?.radiusKm;
  // sites: close enough to see the landscape, far enough to see the context around it
  const range = radiusKm ? Math.max(12000, radiusKm * 1000 * 2.4) : 30000;
  orbitView.flyTo({ lat, lon, range, heading: 0, tilt: 55 }, 2400);
}

function planFromSite(target) {
  const objective = currentObjective();
  // The EVA starts from the site's base (its landing point, an "access" target) when it has one:
  // a site's reference point can be the middle of a crater (Gale: Mount Sharp, 40+ km from the targets).
  const baseTarget = (target.targets || []).find((tt) => tt.kinds?.includes('access'));
  const baseOnly = baseTarget && baseTarget.kinds.every((k) => k === 'access' || k === 'survival');
  const site = baseTarget ? { ...target, lat: baseTarget.lat, lon: baseTarget.lon } : target;
  const targets = (target.targets || [])
    .filter((tt) => !(baseOnly && tt.id === baseTarget.id))
    .map((tt) => ({ ...tt, h: target.elevationM }));
  const planningObjective =
    objective.id === 'survival' ? { ...objective, targetKinds: [...new Set(targets.flatMap((tt) => tt.kinds || []))] } : objective;
  const walk = buildSciencePlan({ site, targets, objective: planningObjective, maxStops: 4, maxRadiusM: 6000 });
  const rover = buildSciencePlan({ site, targets, objective: planningObjective, maxStops: 4, maxRadiusM: 30000 });
  const walkValue = walk.targets.reduce((s, tt) => s + tt.value, 0);
  const roverValue = rover.targets.reduce((s, tt) => s + tt.value, 0);
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
          const missions = MISSIONS.filter((m) => m.siteId === site.id);
          return h(
            'li',
            null,
            h(
              'button.free-row',
              { attrs: { type: 'button' }, on: { click: () => flyTo(site) } },
              h('span.free-name', null, site.name),
              h('span.free-meta', null, tr(site.region)),
              h('span.free-coord.mono', null, coords(site.lat, site.lon)),
              missions.length ? h('span.free-missions', null, missions.map((m) => m.name).join(', ')) : null
            )
          );
        })
    )
  );
}
