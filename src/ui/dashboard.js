/**
 * Free-exploration dashboard UI: data layers, location list (search +
 * filters), details (photos, base viability, compare), telemetry (clearly
 * labelled as simulated), mission log, focus/measure HUDs and tooltips.
 */
import { $, $$, h, clear } from '../core/dom.js';
import { t, tr, getLocale } from '../core/i18n.js';
import { on, emit } from '../core/events.js';
import { getSettings, updateSettings } from '../core/settings.js';
import { formatElevation, formatPressure, formatTemperature } from '../core/units.js';
import { baseViability } from '../game/scoring.js';
import { setHash } from '../core/deeplink.js';
import { safe } from '../core/errors.js';
import { orbitView } from '../orbit/orbitView.js';
import { renderPhotos } from './photos.js';
import { toast, announce } from './feedback.js';
import catalog from '../data/catalog.json';
import pois from '../data/pois.json';
import { findLayer } from '../geo/trek.js';
import { formatLatLon } from '../geo/mars.js';
import { localSolarTime, missionSol, PERSEVERANCE_LANDING_MS, marsTime, seasonKey, formatHours } from '../geo/mars24.js';
import { loadWeather } from '../geo/missionData.js';
import { RAMPS, cssGradient } from '../planner/overlays.js';
import { setEditing, isEditingRoute } from './routePanel.js';

/** Layers computed in the globe shader from the real terrain heights. */
const COMPUTED = [
  { id: 'slope', icon: '📐' },
  { id: 'hazard', icon: '⛔' },
  { id: 'elevation', icon: '🗻' },
  { id: 'contours', icon: '〰️' },
];

const JEZERO = { lat: 18.4446, lon: 77.4509 };
let weather = null;

const TYPES = Object.keys(catalog.types);
const state = {
  layer: 'none',
  search: '',
  types: new Set(TYPES),
  selected: null,
  compare: [],
  logFilter: 'all',
  log: [],
  opacity: 0.75,
  clock: { teleAcc: 0 },
};

/** Hooks provided by main.js (navigation between modes). */
let nav = { goHome: () => {}, screenshot: () => {} };

export function initDashboard(navigation) {
  nav = navigation;
  buildLayerButtons();
  buildFilters();
  bindControls();
  bindTabs();
  bindLog();
  renderPoiList();
  renderCompare();
  setLayer('none');

  on('orbit:hover', (info) => showTooltip(info));
  on('orbit:poiClick', (poi) => openDetails(poi));
  on('orbit:focus', (poi) => updateFocusHud(poi));
  on('orbit:autorotate', (v) => setPressed($('#btn-rotate'), v));
  on('orbit:cursor', (ll) => {
    const el = $('#globe-cursor');
    if (el) el.textContent = ll ? `${t('globe.cursor')}: ${formatLatLon(ll.lat, ll.lon, 2)}` : t('globe.noCursor');
  });
  loadWeather()
    .then((w) => {
      weather = w.find((s) => s.maxTemp != null || s.pressure != null) || null;
      updateTelemetry();
    })
    .catch(() => {});
  on('language:change', () => refreshTexts());
  on('settings:change', ({ patch }) => {
    if ('units' in patch) refreshTexts();
  });
  updateTelemetry();
}

/* ======================= Layers ======================= */
/** One compact select box instead of a button per layer (11 layers no longer fit as buttons). */
function buildLayerButtons() {
  const list = $('#layers-list');
  clear(list);
  const opt = (id, icon) => h('option', { attrs: { value: id, selected: id === state.layer } }, `${icon} ${t(`layer.${id}`)}`);
  const select = h(
    'select#layer-select.layer-select',
    { attrs: { 'aria-label': t('panel.layers') }, on: { change: safe((e) => setLayer(e.target.value), 'setLayer') } },
    opt('none', '🛰️'),
    h('optgroup', { attrs: { label: t('layer.group.computed') } }, ...COMPUTED.map((c) => opt(c.id, c.icon))),
    h(
      'optgroup',
      { attrs: { label: t('layer.group.nasa') } },
      ...catalog.layers.filter((l) => l.id !== 'none').map((l) => opt(l.id, l.icon))
    )
  );
  const opacity = h(
    'label.layer-opacity',
    null,
    h('span', null, t('pl.opacity')),
    h('input#layer-opacity', {
      attrs: { type: 'range', min: 0.1, max: 1, step: 0.05, value: state.opacity, 'aria-label': t('pl.opacity') },
      on: {
        input: (e) => {
          state.opacity = Number(e.target.value);
          orbitView.setLayer(undefined, { opacity: state.opacity });
        },
      },
    })
  );
  list.append(select, opacity);
}

function setLayer(id) {
  state.layer = id;
  const select = $('#layer-select');
  if (select) select.value = id;
  const computed = COMPUTED.some((c) => c.id === id);
  orbitView.setLayer(id, { opacity: state.opacity, slopeLimit: 15, contourStep: 100 });
  $('#layer-opacity')
    ?.closest('label')
    ?.toggleAttribute('hidden', id === 'none');
  const def = findLayer(id);
  $('#legend-title').textContent = t(`layer.${id}`);
  const badge = $('#legend-badge');
  badge.hidden = id === 'none';
  if (def) {
    badge.textContent = def.measured ? t('pl.measured') : t('pl.interpreted');
    badge.title = def.measured ? t('legend.measured') : t('legend.interpreted');
  } else if (computed) {
    badge.textContent = t('pl.computed');
    badge.title = t('legend.computed');
  }
  const grad = $('#legend-gradient');
  if (def?.legend) {
    grad.style.background = def.legend.gradient;
    $('#legend-min').textContent = def.legend.min ?? (def.legend.minKey ? t(def.legend.minKey) : '');
    $('#legend-max').textContent = def.legend.max ?? (def.legend.maxKey ? t(def.legend.maxKey) : '');
  } else if (computed) {
    grad.style.background =
      id === 'hazard'
        ? 'linear-gradient(90deg, transparent, #ff1f33)'
        : id === 'contours'
          ? 'repeating-linear-gradient(90deg, #fff3 0 6px, #fff 6px 8px)'
          : cssGradient(RAMPS.slope);
    $('#legend-min').textContent = t(`legend.${id}.min`);
    $('#legend-max').textContent = t(`legend.${id}.max`);
  } else {
    grad.style.background = '';
    $('#legend-min').textContent = t('legend.photo');
    $('#legend-max').textContent = '';
  }
  $('#legend-source').textContent = def
    ? `${t('pl.source')}: ${def.instrument} · ${def.resolution} · NASA/JPL Mars Trek`
    : computed
      ? t('legend.computedSource')
      : t('legend.baseSource');
  if (id !== 'none') log('data', t('log.layer', { layer: t(`layer.${id}`) }));
}

/* ======================= Location list ======================= */
function buildFilters() {
  const root = $('#type-filters');
  clear(root);
  for (const type of TYPES) {
    const chip = h(
      'button.chip',
      {
        attrs: { type: 'button', 'aria-pressed': 'true' },
        style: { borderColor: catalog.types[type].color },
        on: {
          click: () => {
            if (state.types.has(type) && state.types.size > 1) state.types.delete(type);
            else state.types.add(type);
            $$('#type-filters .chip').forEach((c, i) => c.setAttribute('aria-pressed', String(state.types.has(TYPES[i]))));
            orbitView.markers.setTypeFilter(state.types);
            renderPoiList();
          },
        },
      },
      `${catalog.types[type].icon} ${t(`type.${type}`)}`
    );
    root.append(chip);
  }
}

/** Search matches name, description or "lat, lon" coordinates. */
export function matchesSearch(poi, query) {
  if (!query) return true;
  const coord = query.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (coord) {
    const [lat, lon] = [Number(coord[1]), Number(coord[2])];
    return Math.abs(poi.lat - lat) < 10 && Math.abs(poi.lon - lon) < 10;
  }
  const hay = `${poi.name} ${tr(poi.description)} ${tr(poi.mission)} ${poi.id}`.toLowerCase();
  return hay.includes(query);
}

function renderPoiList() {
  const list = $('#poi-list');
  clear(list);
  const items = pois.filter((p) => state.types.has(p.type) && matchesSearch(p, state.search));
  $('#poi-count').textContent = t('search.count', { n: items.length });
  for (const poi of items) {
    const type = catalog.types[poi.type];
    list.append(
      h(
        'li.poi-item',
        null,
        h(
          'span.type-tag',
          { style: { background: `${type.color}22`, color: type.color, border: `1px solid ${type.color}66` } },
          `${type.icon} ${t(`type.${poi.type}`)}`
        ),
        h('h3', null, poi.name),
        h('p', null, tr(poi.description)),
        h(
          'div.poi-actions',
          null,
          h('button.btn', { attrs: { type: 'button' }, on: { click: safe(() => focusPoi(poi.id), 'focus') } }, `🎯 ${t('details.focus')}`),
          h(
            'button.btn.primary',
            { attrs: { type: 'button' }, on: { click: safe(() => openDetails(poi), 'details') } },
            `📷 ${t('details.open')}`
          )
        )
      )
    );
  }
  if (!items.length) list.append(h('li.empty', null, t('search.none')));
}

function focusPoi(id) {
  orbitView.focusPoi(id);
  closeSheetsOnMobile();
}

/* ======================= Details ======================= */
export function openDetails(poi) {
  state.selected = poi;
  orbitView.selectPoi(poi.id);
  setHash({ poi: poi.id });
  renderDetails();
  switchTab('info');
  openSheet('right-panel');
  announce(t('details.opened', { name: poi.name }));
}

function renderDetails() {
  const poi = state.selected;
  const el = $('#info-content');
  if (!poi) return;
  const units = getSettings().units;
  $('#info-empty').hidden = true;
  el.hidden = false;
  clear(el);
  const type = catalog.types[poi.type];
  const via = baseViability(poi.base);
  const photos = h('div');
  const factorRow = (key, value) =>
    h(
      'div.bar',
      null,
      h('span', null, t(`base.${key}`)),
      h(
        'span.bar-track',
        {
          attrs: {
            role: 'meter',
            'aria-valuemin': '0',
            'aria-valuemax': '100',
            'aria-valuenow': String(Math.round(value * 100)),
            'aria-label': t(`base.${key}`),
          },
        },
        h('span.bar-fill', { style: { width: `${value * 100}%` } })
      ),
      h('span', null, `${Math.round(value * 100)}`)
    );
  el.append(
    h('h3', null, `${type.icon} ${poi.name}`),
    h(
      'span.type-tag',
      { style: { background: `${type.color}22`, color: type.color, border: `1px solid ${type.color}66` } },
      t(`type.${poi.type}`)
    ),
    photos,
    h('div.info-row', null, h('span', null, t('details.coords')), h('span', null, `${poi.lat.toFixed(2)}°, ${poi.lon.toFixed(2)}°`)),
    h(
      'div.info-row',
      null,
      h('span', null, t('details.elevation')),
      h('span', null, `${formatElevation(poi.elevation, units)} ${t('details.approx')}`)
    ),
    h('div.info-row', null, h('span', null, t('details.mission')), h('span', null, tr(poi.mission))),
    h('p.info-desc', null, tr(poi.description)),
    h('p.hazard-box', null, `⚠️ ${t('details.hazard')}: `, tr(poi.hazard)),
    h('p.resource-box', null, `💠 ${t('details.resources')}: `, tr(poi.resource)),
    h(
      'div.viability',
      null,
      h('div.viability-head', null, h('span', null, `🏗️ ${t('base.title')}`), h('span', null, `${via.score}/100`)),
      Object.entries(via.factors).map(([k, v]) => factorRow(k, v)),
      h('small', { style: { color: 'var(--muted)' } }, t('base.note'))
    ),
    h(
      'div.detail-actions',
      null,
      h(
        'button.btn.primary',
        {
          attrs: { type: 'button' },
          on: { click: safe(() => (emit('route:add', { lat: poi.lat, lon: poi.lon }), switchTab('route')), 'route') },
        },
        `➕ ${t('rt.addHere')}`
      ),
      h(
        'button.btn',
        {
          attrs: { type: 'button' },
          on: {
            click: safe(
              () => (closeSheetsOnMobile(), orbitView.flyTo({ lat: poi.lat, lon: poi.lon, range: 6000, heading: 0, tilt: 60 }, 2800)),
              'ground'
            ),
          },
        },
        `🛬 ${t('rt.flyGround')}`
      ),
      h('button.btn', { attrs: { type: 'button' }, on: { click: safe(() => focusPoi(poi.id), 'focus') } }, `🎯 ${t('details.focusLong')}`),
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => addToCompare(poi) } }, `⚖️ ${t('details.compare')}`),
      h('button.btn', { attrs: { type: 'button' }, on: { click: () => shareLink(poi) } }, `🔗 ${t('details.share')}`),
      h('a.btn.ghost', { attrs: { href: poi.learnMore, target: '_blank', rel: 'noopener noreferrer' } }, `📚 ${t('details.learnMore')} ↗`)
    )
  );
  renderPhotos(photos, poi.photoQuery);
}

async function shareLink(poi) {
  const url = `${location.origin}${location.pathname}#poi=${poi.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast(t('details.linkCopied'), { type: 'success' });
  } catch {
    toast(url);
  }
}

/* ======================= Compare ======================= */
function addToCompare(poi) {
  state.compare = [...state.compare.filter((p) => p.id !== poi.id), poi].slice(-2);
  renderCompare();
  switchTab('compare');
  if (state.compare.length < 2) toast(t('compare.pickAnother'));
}

function renderCompare() {
  const root = $('#compare-content');
  clear(root);
  if (state.compare.length < 2) {
    root.append(h('p.empty', null, state.compare.length ? t('compare.oneMore', { name: state.compare[0].name }) : t('compare.empty')));
    return;
  }
  const [a, b] = state.compare;
  const units = getSettings().units;
  const va = baseViability(a.base);
  const vb = baseViability(b.base);
  const row = (label, x, y, better) =>
    h(
      'tr',
      null,
      h('th', { attrs: { scope: 'row' } }, label),
      h('td', { class: better === 0 ? 'win' : '' }, x),
      h('td', { class: better === 1 ? 'win' : '' }, y)
    );
  root.append(
    h(
      'table.compare-table',
      null,
      h('caption.sr-only', null, t('tab.compare')),
      h(
        'thead',
        null,
        h('tr', null, h('th', null, ''), h('th', { attrs: { scope: 'col' } }, a.name), h('th', { attrs: { scope: 'col' } }, b.name))
      ),
      h(
        'tbody',
        null,
        row(t('details.type'), t(`type.${a.type}`), t(`type.${b.type}`)),
        row(t('details.elevation'), formatElevation(a.elevation, units), formatElevation(b.elevation, units)),
        row(t('details.mission'), tr(a.mission), tr(b.mission)),
        row(t('base.title'), `${va.score}/100`, `${vb.score}/100`, va.score === vb.score ? -1 : va.score > vb.score ? 0 : 1),
        ...Object.keys(va.factors).map((k) =>
          row(
            t(`base.${k}`),
            Math.round(va.factors[k] * 100),
            Math.round(vb.factors[k] * 100),
            va.factors[k] === vb.factors[k] ? -1 : va.factors[k] > vb.factors[k] ? 0 : 1
          )
        ),
        row(t('details.hazard'), tr(a.hazard), tr(b.hazard)),
        row(t('details.resources'), tr(a.resource), tr(b.resource))
      )
    ),
    h(
      'button.btn.ghost',
      { attrs: { type: 'button' }, style: { marginTop: '10px' }, on: { click: () => ((state.compare = []), renderCompare()) } },
      t('compare.clear')
    )
  );
}

/* ======================= Tabs ======================= */
function bindTabs() {
  $$('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $('#right-panel .tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = $$('.tab-btn');
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    switchTab(next.dataset.tab);
  });
}

export function switchTab(id) {
  $$('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === id;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $$('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${id}`));
}

/* ======================= Controls ======================= */
function setPressed(btn, on) {
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(!!on));
  btn.classList.toggle('on', !!on);
}

function bindControls() {
  const search = $('#poi-search');
  search.addEventListener('input', () => {
    state.search = search.value.trim().toLowerCase();
    renderPoiList();
  });
  $('#btn-rotate').addEventListener('click', () => {
    const v = !orbitView.controls.autoRotate;
    orbitView.setAutoRotate(v);
    updateSettings({ autoRotate: v });
  });
  $('#btn-reset').addEventListener('click', () => orbitView.resetView());
  $('#btn-labels').addEventListener('click', (e) => {
    const v = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setPressed(e.currentTarget, v);
    orbitView.markers.setLabelsAlways(v);
  });
  $('#btn-orbiters').addEventListener('click', (e) => {
    const v = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setPressed(e.currentTarget, v);
    orbitView.setOrbitersVisible(v);
    if (v) log('data', t('log.orbiters'));
  });
  $('#btn-markers').addEventListener('click', (e) => {
    const v = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setPressed(e.currentTarget, v);
    orbitView.setMarkersVisible(v);
  });
  $('#btn-north').addEventListener('click', () => orbitView.controls.resetNorth());
  $('#btn-screenshot').addEventListener('click', () => nav.screenshot());
  const fs = $('#btn-fullscreen');
  if (!document.fullscreenEnabled) fs.hidden = true;
  fs.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  });
  $('#btn-unfocus').addEventListener('click', () => orbitView.unfocus());
  $('#btn-home').addEventListener('click', () => nav.goHome());
  $('#btn-open-route').addEventListener('click', () => {
    switchTab('route');
    openSheet('right-panel');
    if (!isEditingRoute()) setEditing(true);
  });

  // Mobile bottom sheets
  $$('#mobile-toggles [data-panel]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.panel)));
  $$('[data-close-panel]').forEach((b) => b.addEventListener('click', () => b.closest('.panel')?.classList.remove('open')));
}

function isMobileLayout() {
  return matchMedia('(max-width: 800px)').matches;
}
function openSheet(id) {
  if (!isMobileLayout()) return;
  $$('#layers-panel, #right-panel').forEach((p) => p.classList.toggle('open', p.id === id));
}
function closeSheetsOnMobile() {
  if (isMobileLayout()) $$('#layers-panel, #right-panel').forEach((p) => p.classList.remove('open'));
}

/** Escape handling while on the dashboard. Returns true when consumed. */
export function handleDashboardEscape() {
  if (isEditingRoute()) {
    setEditing(false);
    return true;
  }
  if (orbitView.focus.id) {
    orbitView.unfocus();
    return true;
  }
  const open = $$('#layers-panel.open, #right-panel.open');
  if (open.length) {
    open.forEach((p) => p.classList.remove('open'));
    return true;
  }
  return false;
}

/* ======================= HUD bits ======================= */
function showTooltip(info) {
  const tip = $('#tooltip');
  if (!info) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = `${catalog.types[info.poi.type].icon} ${info.poi.name} · ${t(`type.${info.poi.type}`)}`;
  if (info.x != null) {
    tip.style.left = `${info.x}px`;
    tip.style.top = `${info.y}px`;
  }
}

function updateFocusHud(poi) {
  const hud = $('#focus-hud');
  hud.hidden = !poi;
  if (poi) {
    $('#focus-hud-label').textContent = `${catalog.types[poi.type].icon} ${poi.name}`;
    log('data', t('log.focus', { name: poi.name }));
  }
}

/* ======================= Telemetry (real: Jezero right now) ======================= */
function updateTelemetry() {
  const units = getSettings().units;
  const now = Date.now();
  const lt = localSolarTime(now, JEZERO.lon);
  const Ls = marsTime(now).Ls;
  $('#tele-sol').textContent = String(missionSol(now, PERSEVERANCE_LANDING_MS, JEZERO.lon));
  $('#tele-time').textContent = formatHours(lt.ltst);
  $('#tele-wind').textContent = `${t(`season.${seasonKey(Ls, JEZERO.lat)}`)} · Ls ${Ls.toFixed(0)}°`;
  $('#tele-temp').textContent =
    weather?.maxTemp != null
      ? `${formatTemperature(weather.minTemp ?? weather.maxTemp, units)} / ${formatTemperature(weather.maxTemp, units)}`
      : '—';
  $('#tele-pressure').textContent = weather?.pressure != null ? formatPressure(weather.pressure) : '—';
  $('#tele-rad').textContent = `0.64 mSv/${t('tele.day')}`;
  const note = $('#tele-note');
  if (note) note.textContent = weather ? t('tele.note', { sol: weather.sol, date: weather.date }) : t('tele.noteNoWeather');
}

/** Real local solar time at Jezero (used by free surface lighting). */
export function getMarsHour() {
  return localSolarTime(Date.now(), JEZERO.lon).ltst;
}

/** Called every frame while the dashboard is visible. */
export function updateDashboard(dt) {
  const c = state.clock;
  c.teleAcc += dt;
  if (c.teleAcc > 1) {
    c.teleAcc = 0;
    updateTelemetry();
  }
}

/* ======================= Mission log ======================= */
function bindLog() {
  on('log', (entry) => {
    const text = entry.text ?? t(entry.key, entry.vars);
    log(entry.type || 'system', text);
  });
  $$('[data-log-filter]').forEach((chip) =>
    chip.addEventListener('click', () => {
      state.logFilter = chip.dataset.logFilter;
      $$('[data-log-filter]').forEach((c) => c.classList.toggle('active', c === chip));
      renderLog();
    })
  );
}

/**
 * Add a line to the mission log.
 * @param {'system'|'mission'|'data'} type
 * @param {string} text
 */
export function log(type, text) {
  const time = new Date().toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  state.log.push({ type, text, time });
  if (state.log.length > 60) state.log.shift();
  renderLog();
}

function renderLog() {
  const box = $('#log-lines');
  if (!box) return;
  clear(box);
  for (const l of state.log) {
    if (state.logFilter !== 'all' && l.type !== state.logFilter) continue;
    box.append(h('div.log-line', { dataset: { type: l.type } }, h('span.ts', null, `[${l.time}]`), l.text));
  }
  box.scrollTop = box.scrollHeight;
}

/* ======================= i18n refresh ======================= */
function refreshTexts() {
  buildLayerButtons();
  setLayer(state.layer);
  buildFilters();
  renderPoiList();
  if (state.selected) renderDetails();
  renderCompare();
  updateTelemetry();
}

export function showDashboardUI(visible) {
  for (const id of ['app-header', 'layers-panel', 'right-panel', 'telemetry', 'mobile-toggles']) {
    const el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }
  if (!visible) {
    $('#tooltip').hidden = true;
    $('#focus-hud').hidden = true;
    $$('#layers-panel, #right-panel').forEach((p) => p.classList.remove('open'));
  }
  emit('dashboard:visible', visible);
}
