/**
 * Dashboard around the globe: data layers, telemetry, focus HUD and the
 * camera controls. Decision-making lives in the mission guide (ui/guide.js);
 * this module only owns the map and its environment readouts.
 */
import { $, $$ } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { on, emit } from '../core/events.js';
import { getSettings, updateSettings } from '../core/settings.js';
import { formatPressure, formatTemperature } from '../core/units.js';
import { orbitView } from '../orbit/orbitView.js';
import catalog from '../data/catalog.json';
import { findLayer } from '../geo/trek.js';
import { missionSol, localSolarTime, PERSEVERANCE_LANDING_MS, marsTime, seasonKey, formatHours } from '../geo/mars24.js';
import { loadWeather } from '../geo/missionData.js';
import { RAMPS, cssGradient } from '../planner/overlays.js';
import { setEditing, isEditingRoute, currentSlopeLimit } from './routePanel.js';
import { helpButton } from './genie.js';

/** Layers computed in the globe shader from the real terrain heights. */
const COMPUTED = [{ id: 'slope' }, { id: 'hazard' }, { id: 'elevation' }, { id: 'contours' }];

const JEZERO = { lat: 18.4446, lon: 77.4509 };
let weather = null;

const state = {
  layer: 'none',
  opacity: 0.75,
  clock: { teleAcc: 0 },
};

/** Hooks provided by main.js (navigation between modes). */
let nav = { goHome: () => {}, screenshot: () => {} };

export function initDashboard(navigation) {
  nav = navigation;
  buildLayerButtons();
  bindControls();
  setLayer('none');
  addHelpButtons();
  updateTelemetry();

  on('orbit:hover', (info) => showTooltip(info));
  on('orbit:focus', (poi) => updateFocusHud(poi));
  on('orbit:autorotate', (v) => setPressed($('#btn-rotate'), v));
  on('orbit:cursor', (ll) => {
    const el = $('#globe-cursor');
    if (el) el.textContent = ll ? `${t('globe.cursor')}: ${ll.lat.toFixed(2)}°, ${ll.lon.toFixed(2)}°` : t('globe.noCursor');
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
}

/* ======================= Layers ======================= */
/** One compact select box instead of a button per layer. */
function buildLayerButtons() {
  const list = $('#layers-list');
  if (!list) return;
  list.replaceChildren();
  const opt = (id) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t(`layer.${id}`);
    if (id === state.layer) o.selected = true;
    return o;
  };
  const select = document.createElement('select');
  select.id = 'layer-select';
  select.className = 'layer-select';
  select.setAttribute('aria-label', t('panel.layers'));
  select.addEventListener('change', (e) => setLayer(e.target.value));
  const computed = document.createElement('optgroup');
  computed.label = t('layer.group.computed');
  computed.append(...COMPUTED.map((c) => opt(c.id)));
  const nasa = document.createElement('optgroup');
  nasa.label = t('layer.group.nasa');
  nasa.append(...catalog.layers.filter((l) => l.id !== 'none').map((l) => opt(l.id)));
  select.append(opt('none'), computed, nasa);

  const opacity = document.createElement('label');
  opacity.className = 'layer-opacity';
  const span = document.createElement('span');
  span.textContent = t('pl.opacity');
  const input = document.createElement('input');
  input.id = 'layer-opacity';
  input.type = 'range';
  input.min = '0.1';
  input.max = '1';
  input.step = '0.05';
  input.value = String(state.opacity);
  input.addEventListener('input', (e) => {
    state.opacity = Number(e.target.value);
    orbitView.setLayer(undefined, { opacity: state.opacity });
  });
  opacity.append(span, input);
  list.append(select, opacity);
}

function setLayer(id) {
  state.layer = id;
  const select = $('#layer-select');
  if (select) select.value = id;
  const computed = COMPUTED.some((c) => c.id === id);
  orbitView.setLayer(id, { opacity: state.opacity, slopeLimit: currentSlopeLimit(), contourStep: 100 });
  $('#layer-opacity')
    ?.closest('label')
    ?.toggleAttribute('hidden', id === 'none');
  const def = findLayer(id);
  const legend = $('#legend-box');
  if (legend) legend.hidden = id === 'none';
  const title = $('#legend-title');
  if (title) title.textContent = t(`layer.${id}`);
  const badge = $('#legend-badge');
  if (badge) {
    badge.hidden = id === 'none';
    if (def) {
      badge.textContent = def.measured ? t('pl.measured') : t('pl.interpreted');
      badge.title = def.measured ? t('legend.measured') : t('legend.interpreted');
    } else if (computed) {
      badge.textContent = t('pl.computed');
      badge.title = t('legend.computed');
    }
  }
  const grad = $('#legend-gradient');
  if (grad) {
    if (def?.legend) {
      grad.style.background = def.legend.gradient;
      const min = $('#legend-min');
      const max = $('#legend-max');
      if (min) min.textContent = def.legend.min ?? (def.legend.minKey ? t(def.legend.minKey) : '');
      if (max) max.textContent = def.legend.max ?? (def.legend.maxKey ? t(def.legend.maxKey) : '');
    } else if (computed) {
      grad.style.background =
        id === 'hazard'
          ? 'linear-gradient(90deg, transparent, #ff1f33)'
          : id === 'contours'
            ? 'repeating-linear-gradient(90deg, #fff3 0 6px, #fff 6px 8px)'
            : cssGradient(RAMPS.slope);
      const min = $('#legend-min');
      const max = $('#legend-max');
      if (min) min.textContent = t(`legend.${id}.min`);
      if (max)
        max.textContent =
          id === 'hazard'
            ? `> ${currentSlopeLimit()}°`
            : id === 'slope'
              ? `≥ ${Math.round(currentSlopeLimit() * 1.5)}°`
              : t(`legend.${id}.max`);
    } else {
      grad.style.background = '';
      const min = $('#legend-min');
      const max = $('#legend-max');
      if (min) min.textContent = t('legend.photo');
      if (max) max.textContent = '';
    }
  }
  const src = $('#legend-source');
  if (src) {
    src.textContent = def
      ? `${t('pl.source')}: ${def.instrument} · ${def.resolution} · NASA/JPL Mars Trek`
      : computed
        ? t('legend.computedSource')
        : t('legend.baseSource');
  }
}

/* ======================= Controls ======================= */
function setPressed(btn, on) {
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(!!on));
  btn.classList.toggle('on', !!on);
}

function bindControls() {
  $('#btn-rotate')?.addEventListener('click', () => {
    const v = !orbitView.controls.autoRotate;
    orbitView.setAutoRotate(v);
    updateSettings({ autoRotate: v });
  });
  $('#btn-reset')?.addEventListener('click', () => orbitView.resetView());
  $('#btn-labels')?.addEventListener('click', (e) => {
    const v = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setPressed(e.currentTarget, v);
    orbitView.markers.setLabelsAlways(v);
  });
  $('#btn-orbiters')?.addEventListener('click', (e) => {
    const v = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setPressed(e.currentTarget, v);
    orbitView.setOrbitersVisible(v);
  });
  $('#btn-markers')?.addEventListener('click', (e) => {
    const v = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    setPressed(e.currentTarget, v);
    orbitView.setMarkersVisible(v);
  });
  $('#btn-north')?.addEventListener('click', () => orbitView.controls.resetNorth());
  $('#btn-screenshot')?.addEventListener('click', () => nav.screenshot());
  const fs = $('#btn-fullscreen');
  if (fs) {
    if (!document.fullscreenEnabled) fs.hidden = true;
    fs.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    });
  }
  $('#btn-unfocus')?.addEventListener('click', () => orbitView.unfocus());
  $('#btn-home')?.addEventListener('click', () => nav.goHome());

  // Layer flyout (opens from the tool rail; on phones it is a bottom sheet)
  $('#btn-layers')?.addEventListener('click', () => toggleLayers());
  // Mobile bottom sheets
  $$('#mobile-toggles [data-panel]').forEach((b) =>
    b.addEventListener('click', () => (b.dataset.panel === 'layers-panel' ? toggleLayers(true) : openSheet(b.dataset.panel)))
  );
  $$('[data-close-panel]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.closest('#layer-flyout')) toggleLayers(false);
      else b.closest('.panel')?.classList.remove('open');
    })
  );
}

function isMobileLayout() {
  return matchMedia('(max-width: 800px)').matches;
}
/** Open/close the data-layer flyout. */
export function toggleLayers(force) {
  const fly = $('#layer-flyout');
  const btn = $('#btn-layers');
  if (!fly) return;
  const open = force ?? fly.hidden;
  fly.hidden = !open;
  btn?.setAttribute('aria-expanded', String(open));
  btn?.classList.toggle('on', open);
  if (open) $('#layer-select')?.focus({ preventScroll: true });
}

export function openSheet(id) {
  if (!isMobileLayout()) return;
  $$('#layers-panel, #right-panel').forEach((p) => p.classList.toggle('open', p.id === id));
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
  if (!$('#layer-flyout')?.hidden) {
    toggleLayers(false);
    return true;
  }
  const open = $$('#layers-panel.open, #right-panel.open');
  if (open.length) {
    open.forEach((p) => p.classList.remove('open'));
    return true;
  }
  return false;
}

/* ======================= HUD ======================= */
function showTooltip(info) {
  const tip = $('#tooltip');
  if (!tip) return;
  if (!info) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = `${info.poi.name} · ${t(`type.${info.poi.type}`)}`;
  if (info.x != null) {
    tip.style.left = `${info.x}px`;
    tip.style.top = `${info.y}px`;
  }
}

function updateFocusHud(poi) {
  const hud = $('#focus-hud');
  if (!hud) return;
  hud.hidden = !poi;
  if (poi) {
    const label = $('#focus-hud-label');
    if (label) label.textContent = poi.name;
  }
}

/* ======================= Telemetry (Jezero now) ======================= */
function updateTelemetry() {
  const units = getSettings().units;
  const now = Date.now();
  const lt = localSolarTime(now, JEZERO.lon);
  const Ls = marsTime(now).Ls;
  const set = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };
  set('#tele-sol', String(missionSol(now, PERSEVERANCE_LANDING_MS, JEZERO.lon)));
  set('#tele-time', formatHours(lt.ltst));
  set('#tele-wind', `${t(`season.${seasonKey(Ls, JEZERO.lat)}`)} · Ls ${Ls.toFixed(0)}°`);
  set(
    '#tele-temp',
    weather?.maxTemp != null
      ? `${formatTemperature(weather.minTemp ?? weather.maxTemp, units)} / ${formatTemperature(weather.maxTemp, units)}`
      : '—'
  );
  set('#tele-pressure', weather?.pressure != null ? formatPressure(weather.pressure) : '—');
  set('#tele-rad', `0.64 mSv/${t('tele.day')}`);
  const note = $('#tele-note');
  if (note) note.textContent = weather ? t('tele.note', { sol: weather.sol, date: weather.date }) : t('tele.noteNoWeather');
}

/** Real local solar time at Jezero. */
export function getMarsHour() {
  return localSolarTime(Date.now(), JEZERO.lon).ltst;
}

/** Called every frame while the dashboard is visible. */
export function updateDashboard(dt) {
  state.clock.teleAcc += dt;
  if (state.clock.teleAcc > 1) {
    state.clock.teleAcc = 0;
    updateTelemetry();
  }
}

/* ======================= i18n ======================= */
function refreshTexts() {
  buildLayerButtons();
  setLayer(state.layer);
  updateTelemetry();
}

export function showDashboardUI(visible) {
  for (const id of ['app-header', 'layers-panel', 'right-panel', 'telemetry', 'mobile-toggles', 'map-readout']) {
    const el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }
  if (!visible) {
    const tip = $('#tooltip');
    if (tip) tip.hidden = true;
    const hud = $('#focus-hud');
    if (hud) hud.hidden = true;
    $$('#layers-panel, #right-panel').forEach((p) => p.classList.remove('open'));
  }
  emit('dashboard:visible', visible);
}

/** Read-only: id of the layer shown on the globe (GENIE). */
export function currentLayer() {
  return state.layer;
}

/** "?" next to the layer legend and each telemetry value. */
function addHelpButtons() {
  const head = $('#legend-box .legend-head');
  if (head) head.append(helpButton('layer', { targets: () => [$('#legend-box')], label: t('panel.layers') }));
  const flyHead = $('#layer-flyout .panel-title');
  if (flyHead) flyHead.after(helpButton('layers', { targets: () => [$('#layer-flyout')], label: t('panel.layers') }));
  const tele = {
    'tele-sol': 'sol',
    'tele-time': 'localTime',
    'tele-temp': 'temperature',
    'tele-wind': 'teleSeason',
    'tele-pressure': 'telePressure',
    'tele-rad': 'radiation',
  };
  for (const [id, topic] of Object.entries(tele)) {
    const item = document.getElementById(id)?.closest('.tele-item');
    // on the item, not inside the label: translated labels get their text replaced
    if (item) item.append(helpButton(topic, { targets: () => [item], label: item.querySelector('.t-label')?.textContent }));
  }
}
