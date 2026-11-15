/**
 * Route planning inside the globe ("Rota" tab).
 *
 * Mark a base and stops anywhere on Mars by clicking the globe (at any
 * zoom), drag the pins to adjust, and the safest route is computed on real
 * NASA terrain (planner/route.js) and drawn on the globe. The panel shows
 * distance, duration, O₂, point of no return, radio coverage, shadow, dose
 * and score; routes can be saved, compared and exported, and walked in
 * first person ("Percorrer a rota").
 */
import { h, $, clear } from '../core/dom.js';
import { t, tr, getLocale } from '../core/i18n.js';
import { on, emit } from '../core/events.js';
import { getState } from '../core/state.js';
import { getSettings } from '../core/settings.js';
import { load, save } from '../core/storage.js';
import { formatDistance, formatElevation, formatTemperature, formatPressure } from '../core/units.js';
import { toast } from './feedback.js';
import { orbitView } from '../orbit/orbitView.js';
import { createRouteLayer } from '../orbit/routeLayer.js';
import { formatLatLon, distanceM } from '../geo/mars.js';
import {
  sunPosition,
  localSolarTime,
  sunriseSunset,
  timestampForLocalTime,
  seasonKey,
  isDustSeason,
  formatHours,
  solarIrradiance,
} from '../geo/mars24.js';
import { loadWeather, loadSpaceWeather } from '../geo/missionData.js';
import { computeRoute, rangeRadius, MAX_LEG_M } from '../planner/route.js';
import { DEFAULT_EVA, surfaceDoseRate, surfacePressure } from '../planner/eva.js';
import { RAMPS, rampColor } from '../planner/overlays.js';
import sites from '../data/sites.json';

const ROUTES_KEY = 'routes.v1';

/** "1 h 12 min" / "18 min". */
export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

const R = {
  points: [],
  returnToBase: true,
  params: { ...DEFAULT_EVA },
  crew: 2,
  timeMs: Date.now(),
  editing: false,
  result: null,
  computing: null,
  progress: 0,
  stage: '',
  error: null,
  weather: null,
  space: null,
  sciencePotential: null,
};

let nav = { traverse: () => {} };
let layer = null;
let root = null;
let profileCanvas = null;
let timer = 0;

/* ======================================================================
 * Public API
 * ==================================================================== */

export function initRoutePanel(navigation) {
  nav = navigation;
  root = $('#route-panel');
  layer = createRouteLayer(orbitView.frame, { heightAt: (la, lo) => orbitView.terrain.heightAt(la, lo) });
  on('orbit:groundClick', (e) => {
    if (!R.editing || getState() !== 'dashboard') return;
    e.handled.value = true;
    addPoint({ lat: e.lat, lon: e.lon, h: e.h });
  });
  on('route:add', (ll) => {
    addPoint(ll);
    toast(t('rt.added'), { type: 'success' });
  });
  on('language:change', render);
  on('settings:change', render);
  bindPinDrag();
  loadWeather()
    .then((w) => ((R.weather = w), render()))
    .catch(() => ((R.weather = 'error'), render()));
  loadSpaceWeather()
    .then((s) => ((R.space = s), render()))
    .catch(() => ((R.space = 'error'), render()));
  render();
}

/** Per-frame: keep the route lines above the (level-of-detail) terrain. */
export function updateRouteLayer() {
  layer?.update(orbitView.controls.altitude());
}

export function setRouteLayerVisible(v) {
  layer?.setVisible(v);
}

export function isEditingRoute() {
  return R.editing;
}

export function setEditing(on) {
  R.editing = on;
  orbitView.cursor = on ? 'crosshair' : null;
  orbitView.renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  render();
}

/**
 * Replace the whole route from code (science panel, deep links). Points may
 * carry `science`, `value`, `targetId` and `label`; `sciencePotential` is the
 * sum of the best target values for the objective, used for coverage.
 * @param {Array<object>} points
 * @param {{params?:object, returnToBase?:boolean, crew?:number, sciencePotential?:number, compute?:boolean}} [opts]
 */
export function setRoute(points, opts = {}) {
  R.computing?.abort();
  R.computing = null;
  R.points = points.map((p, i) => ({
    lat: p.lat,
    lon: p.lon,
    h: p.h,
    science: !!p.science,
    value: p.value,
    targetId: p.targetId,
    label: p.label,
    kinds: p.kinds,
    minutes: p.minutes ?? (i === 0 ? 0 : R.params.stopMinutes),
    note: p.note || '',
  }));
  if (opts.params) R.params = { ...DEFAULT_EVA, ...opts.params };
  if (typeof opts.returnToBase === 'boolean') R.returnToBase = opts.returnToBase;
  if (Number.isFinite(opts.crew)) R.crew = opts.crew;
  R.sciencePotential = Number.isFinite(opts.sciencePotential) ? opts.sciencePotential : null;
  R.editing = false;
  R.result = null;
  R.error = null;
  changed();
}

/** Hooks for automated tests (dev server only). */
export const routeDebug = {
  state: R,
  add: (lat, lon) => addPoint({ lat, lon }),
  clear: () => clearRoute(),
  compute: () => compute(),
};

/* ======================================================================
 * Editing
 * ==================================================================== */

function addPoint(p) {
  R.sciencePotential = null;
  R.points.push({
    lat: p.lat,
    lon: p.lon,
    h: p.h,
    minutes: R.points.length ? R.params.stopMinutes : 0,
    science: R.points.length > 0,
    note: '',
  });
  changed();
}

function changed() {
  R.result = null;
  R.error = null;
  layer.set({ points: R.points, path: null, returnToBase: R.returnToBase, ring: R.points.length ? rangeRadius(R.params) : null });
  render();
  clearTimeout(timer);
  if (R.points.length >= 2) timer = setTimeout(compute, 450);
}

function clearRoute() {
  R.computing?.abort();
  R.computing = null;
  R.points = [];
  R.sciencePotential = null;
  changed();
}

function bindPinDrag() {
  const el = orbitView.renderer.domElement;
  let drag = null;
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (getState() !== 'dashboard' || !R.points.length || e.button !== 0) return;
      const idx = layer.pickPin(orbitView.rayFrom(e.clientX, e.clientY));
      if (idx == null) return;
      e.stopImmediatePropagation();
      el.setPointerCapture?.(e.pointerId);
      drag = { idx, id: e.pointerId, moved: false, last: 0 };
    },
    { capture: true }
  );
  el.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.stopImmediatePropagation();
      const now = performance.now();
      if (now - drag.last < 40) return;
      drag.last = now;
      const ll = orbitView.latLonAtClient(e.clientX, e.clientY);
      if (!ll) return;
      drag.moved = true;
      Object.assign(R.points[drag.idx], { lat: ll.lat, lon: ll.lon, h: ll.h });
      layer.set({ points: R.points, path: null });
    },
    { capture: true }
  );
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopImmediatePropagation();
    const moved = drag.moved;
    drag = null;
    if (moved) changed();
  };
  el.addEventListener('pointerup', end, { capture: true });
  el.addEventListener('pointercancel', end, { capture: true });
}

/* ======================================================================
 * Computing
 * ==================================================================== */

async function compute() {
  if (R.points.length < 2) return;
  R.computing?.abort();
  const ctrl = new AbortController();
  R.computing = ctrl;
  R.progress = 0;
  R.stage = 'terrain';
  R.error = null;
  render();
  try {
    const result = await computeRoute(R.points, {
      params: R.params,
      returnToBase: R.returnToBase,
      crew: R.crew,
      timeMs: R.timeMs,
      sciencePotential: R.sciencePotential,
      signal: ctrl.signal,
      onProgress: (f, stage) => {
        R.progress = f;
        R.stage = stage;
        renderProgress();
      },
    });
    if (ctrl.signal.aborted) return;
    R.result = result;
    const e = result.evaluation;
    layer.set({
      points: R.points,
      path: result.path,
      color: result.failedLeg ? 0xff3b5c : e.withinO2 ? 0x4fd1ff : 0xffb020,
      returnToBase: R.returnToBase,
      ring: rangeRadius(R.params),
    });
  } catch (err) {
    // only a calculation that WE cancelled is silent; anything else is reported
    if (err?.name === 'AbortError' && ctrl.signal.aborted) return;
    console.error('[route] failed', err);
    R.error = t('rt.error');
    toast(t('rt.error'), { type: 'error', duration: 6000 });
  } finally {
    if (R.computing === ctrl) R.computing = null;
    render();
    emit('route:change', getRouteSummary());
  }
}

/* ======================================================================
 * Camera helpers
 * ==================================================================== */

function fitRoute() {
  const pts = R.result?.path?.length ? R.result.path : R.points;
  if (!pts.length) return;
  const c = { lat: 0, lon: 0 };
  const ref = pts[0];
  for (const p of pts) {
    let dl = p.lon - ref.lon;
    if (dl > 180) dl -= 360;
    if (dl < -180) dl += 360;
    c.lat += p.lat;
    c.lon += ref.lon + dl;
  }
  c.lat /= pts.length;
  c.lon /= pts.length;
  let ext = 0;
  for (const p of pts) ext = Math.max(ext, distanceM(c.lat, c.lon, p.lat, p.lon));
  orbitView.flyTo({ lat: c.lat, lon: c.lon, range: Math.max(700, ext * 3.2), heading: 0, tilt: ext < 300e3 ? 40 : 0 });
}

function goToSite(s) {
  orbitView.flyTo({ lat: s.lat, lon: s.lon, range: 2600, heading: 0, tilt: 55 }, 2600);
  if (!R.editing) setEditing(true);
}

/* ======================================================================
 * Saved routes / export
 * ==================================================================== */

function summary() {
  const r = R.result;
  return r
    ? {
        length: r.evaluation.length,
        hours: r.evaluation.totalSeconds / 3600,
        o2: r.evaluation.o2UsablePct,
        maxSlope: r.maxSlope,
        coverage: r.coverage,
        scienceCoverage: r.scienceCoverage,
        dose: r.doseMsv,
        score: r.score.total,
      }
    : null;
}

function saveRoute() {
  if (!R.result) return toast(t('pl.toast.noRoute'), { type: 'warn' });
  const list = load(ROUTES_KEY, []);
  const b = R.points[0];
  list.unshift({
    id: Date.now().toString(36),
    name: `${formatLatLon(b.lat, b.lon, 2)} · ${new Date().toLocaleString(getLocale())}`,
    points: R.points,
    params: R.params,
    returnToBase: R.returnToBase,
    crew: R.crew,
    timeMs: R.timeMs,
    summary: summary(),
  });
  save(ROUTES_KEY, list.slice(0, 30));
  toast(t('pl.toast.saved'), { type: 'success' });
  render();
}

function openRoute(r) {
  R.points = r.points.map((p) => ({ ...p }));
  R.params = { ...DEFAULT_EVA, ...r.params };
  R.returnToBase = r.returnToBase;
  R.crew = r.crew ?? 2;
  R.timeMs = r.timeMs ?? Date.now();
  changed();
  fitRoute();
}

function deleteRoute(id) {
  save(
    ROUTES_KEY,
    load(ROUTES_KEY, []).filter((p) => p.id !== id)
  );
  render();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { attrs: { href: url, download: name } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportGeoJSON() {
  const r = R.result;
  if (!r) return toast(t('pl.toast.noRoute'), { type: 'warn' });
  const ll = (p) => [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7)), Number((p.h ?? 0).toFixed(1))];
  const fc = {
    type: 'FeatureCollection',
    name: 'mars-explorer-route',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:IAU:49900 (Mars 2000, planetocentric, east longitude)' } },
    features: [
      {
        type: 'Feature',
        properties: {
          kind: 'route',
          length_m: Math.round(r.evaluation.length),
          duration_h: Number((r.evaluation.totalSeconds / 3600).toFixed(2)),
          o2_used_pct_of_usable: Number(r.evaluation.o2UsablePct.toFixed(1)),
          max_slope_deg: Number(r.maxSlope.toFixed(1)),
          comms_coverage_pct: Math.round(r.coverage * 100),
          dose_mSv: Number(r.doseMsv.toFixed(3)),
          grid_cell_m: [Number(r.finestCell.toFixed(1)), Number(r.coarsestCell.toFixed(1))],
          planned_for_utc: new Date(R.timeMs).toISOString(),
          mode: R.params.mode,
          sources: 'NASA/JPL Mars Trek terrain & imagery; analysis by Mars Explorer',
        },
        geometry: { type: 'LineString', coordinates: r.path.map(ll) },
      },
      ...R.points.map((p, i) => ({
        type: 'Feature',
        properties: { kind: i === 0 ? 'base' : 'stop', order: i, science: !!p.science, minutes: p.minutes, note: p.note },
        geometry: { type: 'Point', coordinates: ll({ ...p, h: p.h ?? 0 }) },
      })),
    ],
  };
  download('mars-route.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
}

function checklistText() {
  const r = R.result;
  const units = getSettings().units;
  const b = R.points[0];
  const lines = [`# ${t('pl.checklist.title')} — ${formatLatLon(b.lat, b.lon)}`, ''];
  lines.push(`${t('pl.env.time')}: ${new Date(R.timeMs).toISOString()} · LTST ${formatHours(localSolarTime(R.timeMs, b.lon).ltst)}`);
  if (r) {
    lines.push(
      `${t('pl.sum.length')}: ${formatDistance(r.evaluation.length, units)} · ${t('pl.sum.duration')}: ${formatDuration(r.evaluation.totalSeconds)}`
    );
    lines.push(`${t('pl.sum.o2')}: ${r.evaluation.o2UsablePct.toFixed(0)}% · ${t('pl.sum.pnr')}: ${formatDistance(r.pnr, units)}`);
    lines.push(
      `${t('pl.sum.maxSlope')}: ${r.maxSlope.toFixed(1)}° · ${t('pl.sum.comms')}: ${Math.round(r.coverage * 100)}% · ${t('pl.sum.dose')}: ${r.doseMsv.toFixed(3)} mSv`
    );
  }
  lines.push('', `## ${t('pl.checklist.before')}`);
  for (const k of ['suit', 'o2', 'comms', 'weather', 'space', 'buddy', 'tools']) lines.push(`- [ ] ${t(`pl.check.${k}`)}`);
  if (r) lines.push(`- [ ] ${t('pl.check.shelter', { min: Math.round(r.shelterS / 60) })}`);
  lines.push('', `## ${t('pl.checklist.stops')}`);
  R.points.forEach((p, i) =>
    lines.push(
      `${i}. ${i === 0 ? '🏠' : p.science ? '🔬' : '🚩'} ${formatLatLon(p.lat, p.lon)}${i ? ` · ${p.minutes} min` : ''}${p.note ? ` · ${p.note}` : ''}`
    )
  );
  lines.push('', `## ${t('pl.checklist.abort')}`);
  for (const k of ['o2', 'storm', 'sep', 'comms', 'injury']) lines.push(`- ${t(`pl.abort.${k}`)}`);
  lines.push('', t('pl.checklist.disclaimer'));
  return lines.join('\n');
}

/* ======================================================================
 * Rendering
 * ==================================================================== */

const kv = (k, v) => [h('dt', null, k), h('dd', null, v)];
const btn = (label, onClick, cls = 'pl-btn', attrs = {}) =>
  h(`button.${cls.split(' ').join('.')}`, { attrs: { type: 'button', ...attrs }, on: { click: onClick } }, label);

function renderProgress() {
  const bar = root?.querySelector('.rt-progress-bar');
  const txt = root?.querySelector('.rt-progress-text');
  if (bar) bar.style.width = `${Math.round(R.progress * 100)}%`;
  if (txt) txt.textContent = t(`pl.loading.${R.stage}`) || '';
}

function render() {
  if (!root) return;
  clear(root);
  const units = getSettings().units;

  // --- Tools
  root.append(
    h(
      'div.rt-tools',
      null,
      btn(R.editing ? `✅ ${t('rt.editing')}` : `✏️ ${t('rt.edit')}`, () => setEditing(!R.editing), 'pl-btn primary', {
        'aria-pressed': String(R.editing),
        id: 'rt-edit',
      }),
      btn(`🎯 ${t('rt.fit')}`, fitRoute, 'pl-btn', { disabled: !R.points.length }),
      btn(`🗑 ${t('pl.clear')}`, clearRoute, 'pl-btn', { disabled: !R.points.length })
    ),
    h('p.pl-hint', null, R.editing ? t('rt.hintEditing') : t('rt.hint'))
  );

  // Walk button right at the top once a route exists
  if (R.result) root.append(btn(`🚶 ${t('rt.walk')}`, () => walkCurrentRoute(), 'pl-btn primary big', { id: 'rt-walk' }));

  // --- Suggested places (empty route)
  if (!R.points.length) {
    const list = h('div.rt-sites');
    for (const s of sites) list.append(btn(`📍 ${tr(s.name)}`, () => goToSite(s), 'pl-btn small', { title: tr(s.goal) || '' }));
    root.append(h('h3.rt-h', null, t('rt.suggested')), list);
  }

  // --- Points
  if (R.points.length) {
    const ol = h('ol.pl-stops.rt-points');
    R.points.forEach((p, i) => {
      const fly = () => orbitView.flyTo({ lat: p.lat, lon: p.lon, range: 1500, tilt: 45 });
      ol.append(
        h(
          'li',
          null,
          i === 0
            ? h('span.pl-icon', { attrs: { title: t('rt.base') } }, '🏠')
            : btn(p.science ? '🔬' : '🚩', () => ((p.science = !p.science), changed()), 'pl-icon', {
                title: t('pl.science'),
                'aria-pressed': String(!!p.science),
              }),
          btn(i === 0 ? p.label || t('rt.base') : p.label || formatLatLon(p.lat, p.lon, 3), fly, 'rt-coord', {
            title: `${p.label ? `${p.label} · ` : ''}${formatLatLon(p.lat, p.lon, 5)}`,
          }),
          i > 0
            ? h('input', {
                attrs: { type: 'number', min: 0, max: 240, step: 5, value: p.minutes, 'aria-label': t('pl.stopMinutes') },
                on: { change: (e) => ((p.minutes = Math.max(0, Number(e.target.value) || 0)), changed()) },
              })
            : null,
          i > 0 ? h('span.pl-unit', null, 'min') : null,
          i > 1
            ? btn('↑', () => (([R.points[i - 1], R.points[i]] = [R.points[i], R.points[i - 1]]), changed()), 'pl-icon', {
                title: t('pl.up'),
              })
            : null,
          btn('✕', () => (R.points.splice(i, 1), changed()), 'pl-icon', { title: t('pl.remove') })
        )
      );
    });
    root.append(ol);
    if (R.points.length === 1) root.append(h('p.pl-empty', null, t('rt.addStop')));
  }

  // --- Options
  const modeSel = h(
    'div.pl-seg',
    { attrs: { role: 'radiogroup', 'aria-label': t('pl.mode') } },
    ...['walk', 'rover'].map((m) =>
      btn(m === 'walk' ? `🚶 ${t('pl.mode.walk')}` : `🚙 ${t('pl.mode.rover')}`, () => ((R.params.mode = m), changed()), 'pl-btn', {
        role: 'radio',
        'aria-checked': String(R.params.mode === m),
      })
    )
  );
  const ret = h(
    'label.pl-check',
    null,
    h('input', {
      attrs: { type: 'checkbox', checked: R.returnToBase },
      on: { change: (e) => ((R.returnToBase = e.target.checked), changed()) },
    }),
    ` ${t('pl.returnToBase')}`
  );
  const crew = h(
    'label.pl-param',
    null,
    h('span', null, t('pl.crew')),
    h(
      'select',
      { on: { change: (e) => ((R.crew = Number(e.target.value)), changed()) } },
      h('option', { attrs: { value: 2, selected: R.crew === 2 } }, t('pl.crew.pair')),
      h('option', { attrs: { value: 1, selected: R.crew === 1 } }, t('pl.crew.solo'))
    )
  );
  const base = R.points[0];
  const lt = base ? localSolarTime(R.timeMs, base.lon) : null;
  const time = h(
    'label.pl-param',
    null,
    h('span', null, t('rt.ltst')),
    h('input', {
      attrs: {
        type: 'range',
        min: 0,
        max: 24,
        step: 0.25,
        value: lt ? lt.ltst.toFixed(2) : 12,
        disabled: !base,
        'aria-label': t('rt.ltst'),
      },
      on: {
        change: (e) => {
          R.timeMs = timestampForLocalTime(R.timeMs, base.lon, Number(e.target.value));
          changed();
        },
      },
    }),
    h('span.pl-unit', null, lt ? formatHours(lt.ltst) : '—')
  );
  root.append(h('div.rt-options', null, modeSel, ret, crew, time));

  // --- Progress / errors
  if (R.computing) {
    root.append(
      h(
        'div.pl-loading.rt-progress',
        { attrs: { role: 'status' } },
        h('span.rt-progress-text', null, t(`pl.loading.${R.stage}`) || ''),
        h(
          'div.pl-loading-track',
          null,
          h('div.pl-loading-bar.rt-progress-bar', { attrs: { style: `width:${Math.round(R.progress * 100)}%` } })
        )
      )
    );
  }
  if (R.error) root.append(h('p.pl-warn', { attrs: { role: 'alert' } }, `⚠️ ${R.error}`));

  // --- Results
  const r = R.result;
  if (r) {
    const e = r.evaluation;
    const warn = (cond, text) => (cond ? h('p.pl-warn', { attrs: { role: 'alert' } }, `⚠️ ${text}`) : null);
    const lim = R.params.mode === 'rover' ? R.params.maxSlopeRover : R.params.maxSlopeWalk;
    root.append(
      ...[
        warn(r.tooLong, t('rt.warn.tooLong', { km: MAX_LEG_M / 1000 })),
        warn(r.failedLeg, t('pl.warn.noPath')),
        warn(!e.withinO2, t('pl.warn.o2')),
        warn(!e.withinTime, t('pl.warn.time', { h: R.params.maxEvaHours })),
        warn(r.coverage < 0.8, t('pl.warn.comms', { pct: Math.round(r.coverage * 100) })),
        warn(r.shadowPct != null && r.shadowPct > 0.3, t('pl.warn.shadow', { pct: Math.round(r.shadowPct * 100) })),
        warn(r.shelterS > 30 * 60, t('pl.warn.shelter', { min: Math.round(r.shelterS / 60) })),
        warn(R.crew < 2, t('pl.warn.solo')),
      ].filter(Boolean),
      h(
        'p.pl-meta',
        null,
        t('rt.resolution', {
          a: r.finestCell < 10 ? r.finestCell.toFixed(1) : Math.round(r.finestCell),
          b: r.coarsestCell < 10 ? r.coarsestCell.toFixed(1) : Math.round(r.coarsestCell),
        }),
        r.coarsestCell > 20 ? ` ${t('rt.refine')}` : ''
      ),
      h(
        'dl.pl-kv',
        null,
        ...kv(t('pl.sum.length'), formatDistance(e.length, units)),
        ...kv(t('pl.sum.duration'), `${formatDuration(e.totalSeconds)} (${formatDuration(e.moveSeconds)} ${t('pl.sum.moving')})`),
        ...kv(t('pl.sum.climb'), `↑ ${formatElevation(e.climb, units)} · ↓ ${formatElevation(e.descent, units)}`),
        ...kv(t('pl.sum.maxSlope'), `${r.maxSlope.toFixed(1)}° / ${lim}°`),
        ...kv(t('pl.sum.o2'), `${e.o2UsablePct.toFixed(0)}% ${t('pl.sum.ofUsable')} (${(e.o2Kg * 1000).toFixed(0)} g)`),
        ...kv(t('pl.sum.pnr'), formatDistance(r.pnr, units)),
        ...kv(t('pl.sum.shelter'), formatDuration(r.shelterS)),
        ...kv(t('pl.sum.range'), formatDistance(rangeRadius(R.params), units)),
        ...kv(t('pl.sum.comms'), `${Math.round(r.coverage * 100)}%`),
        ...(Number.isFinite(r.scienceCoverage) ? kv(t('pl.sum.scienceCoverage'), `${Math.round(r.scienceCoverage * 100)}%`) : []),
        ...kv(t('pl.sum.dose'), `${r.doseMsv.toFixed(3)} mSv`)
      )
    );
    profileCanvas = h('canvas.pl-profile', { attrs: { width: 320, height: 120, role: 'img', 'aria-label': t('pl.profile') } });
    root.append(
      profileCanvas,
      h(
        'div.pl-score',
        { attrs: { title: t('pl.score.help') } },
        h('strong', null, `${t('pl.score.total')}: ${r.score.total}`),
        h('span', null, `🛡 ${t('pl.score.safety')} ${r.score.safety}`),
        h('span', null, `🔬 ${t('pl.score.science')} ${r.score.science}`),
        h('span', null, `⚡ ${t('pl.score.efficiency')} ${r.score.efficiency}`)
      ),
      h(
        'div.pl-row',
        null,
        btn(`💾 ${t('pl.save')}`, saveRoute),
        btn('⬇ GeoJSON', exportGeoJSON),
        btn(`☑ ${t('pl.checklist.short')}`, () => download('eva-checklist.md', checklistText(), 'text/markdown'))
      )
    );
    drawProfile();
  }

  // --- Suit parameters
  const params = h('details.rt-details', null, h('summary', null, `⚙️ ${t('pl.paramsTitle')}`));
  const fields = [
    ['walkSpeed', 0.3, 2, 0.05, 'm/s'],
    ['roverSpeed', 0.5, 6, 0.1, 'm/s'],
    ['maxSlopeWalk', 5, 35, 1, '°'],
    ['maxSlopeRover', 5, 35, 1, '°'],
    ['maxRoughness', 0.1, 2, 0.05, 'm'],
    ['o2HoursAt300W', 2, 12, 0.5, 'h'],
    ['reservePct', 0, 50, 5, '%'],
    ['maxEvaHours', 1, 10, 0.5, 'h'],
    ['stopMinutes', 0, 120, 5, 'min'],
    ['commsMastHeight', 1, 30, 1, 'm'],
  ];
  for (const [k, min, max, step, unit] of fields)
    params.append(
      h(
        'label.pl-param',
        null,
        h('span', null, t(`pl.param.${k}`)),
        h('input', {
          attrs: { type: 'number', min, max, step, value: R.params[k] },
          on: {
            change: (e) => {
              R.params[k] = Math.min(max, Math.max(min, Number(e.target.value) || min));
              changed();
            },
          },
        }),
        h('span.pl-unit', null, unit)
      )
    );
  params.append(
    h('p.pl-meta', null, t('pl.param.note')),
    btn(`↺ ${t('pl.param.reset')}`, () => ((R.params = { ...DEFAULT_EVA, mode: R.params.mode }), changed()))
  );
  root.append(params);

  // --- Environment at the base
  if (base) root.append(renderEnvironment(base));

  // --- Saved routes
  const saved = load(ROUTES_KEY, []);
  const plans = h('details.rt-details', null, h('summary', null, `💾 ${t('rt.saved')} (${saved.length})`));
  if (!saved.length) plans.append(h('p.pl-meta', null, t('pl.plans.none')));
  else
    plans.append(
      h(
        'div.pl-table-wrap',
        null,
        h(
          'table.pl-compare',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ...['pl.plans.name', 'pl.sum.length', 'pl.sum.duration', 'pl.sum.o2', 'pl.score.total', ''].map((k) =>
                h('th', { attrs: { scope: 'col' } }, k ? t(k) : '')
              )
            )
          ),
          h(
            'tbody',
            null,
            ...saved.map((p) =>
              h(
                'tr',
                null,
                h('td', null, p.name),
                h('td', null, p.summary ? formatDistance(p.summary.length, units) : '—'),
                h('td', null, p.summary ? formatDuration(p.summary.hours * 3600) : '—'),
                h('td', null, p.summary ? `${p.summary.o2.toFixed(0)}%` : '—'),
                h('td', null, p.summary ? String(p.summary.score) : '—'),
                h(
                  'td',
                  null,
                  btn('📂', () => openRoute(p), 'pl-icon', { title: t('pl.plans.open') }),
                  btn('✕', () => deleteRoute(p.id), 'pl-icon', { title: t('pl.remove') })
                )
              )
            )
          )
        )
      )
    );
  root.append(plans);
}

function renderEnvironment(base) {
  const units = getSettings().units;
  const { lat, lon } = base;
  const lt = localSolarTime(R.timeMs, lon);
  const sun = sunPosition(R.timeMs, lat, lon);
  const rs = sunriseSunset(R.timeMs, lat, lon);
  const elev = base.h ?? R.result?.path?.[0]?.h ?? orbitView.terrain.heightAt(lat, lon) ?? 0;
  const irr = solarIrradiance(sun.helioDistanceAU);
  const box = h('details.rt-details', { attrs: { open: true } }, h('summary', null, `🌡 ${t('pl.env.title')}`));
  box.append(
    h(
      'dl.pl-kv',
      null,
      ...kv(t('pl.env.ltst'), `${formatHours(lt.ltst)} (LMST ${formatHours(lt.lmst)})`),
      ...kv(t('pl.env.season'), `${t(`season.${seasonKey(sun.Ls, lat)}`)} · Ls ${sun.Ls.toFixed(1)}°`),
      ...kv(t('pl.env.sun'), `${t('pl.env.elev')} ${sun.elevation.toFixed(1)}° · az ${sun.azimuth.toFixed(0)}°`),
      ...kv(t('pl.env.daylight'), `${formatHours(rs.sunrise)} → ${formatHours(rs.sunset)}`),
      ...kv(t('pl.env.irradiance'), `${Math.round(irr)} W/m² (${t('pl.env.toa')})`),
      ...kv(t('pl.env.pressure'), `≈ ${formatPressure(surfacePressure(elev, sun.Ls))} (${t('pl.estimate')})`),
      ...kv(t('pl.env.dose'), `${surfaceDoseRate(elev).toFixed(2)} mSv/${t('pl.env.day')} (RAD, ${t('pl.estimate')})`)
    )
  );
  if (isDustSeason(sun.Ls)) box.append(h('p.pl-warn', null, `🌪 ${t('pl.env.dustSeason')}`));
  if (R.weather === 'error') box.append(h('p.pl-meta', null, `🌡 MEDA: ${t('pl.unavailable')}`));
  else if (Array.isArray(R.weather)) {
    const w = R.weather.find((s) => s.maxTemp != null || s.pressure != null);
    if (w)
      box.append(
        h(
          'p.pl-meta',
          null,
          `🌡 MEDA (Perseverance) · Sol ${w.sol} · ${w.date}: `,
          w.minTemp != null ? `${formatTemperature(w.minTemp, units)} / ` : '',
          w.maxTemp != null ? `${formatTemperature(w.maxTemp, units)} · ` : '',
          w.pressure != null ? formatPressure(w.pressure) : '',
          ` — ${t('pl.env.medaNote')}`
        )
      );
  }
  if (R.space === 'error') box.append(h('p.pl-meta', null, `☀️ DONKI: ${t('pl.unavailable')}`));
  else if (R.space) {
    const n = R.space.sep.length;
    box.append(
      h(
        n ? 'p.pl-warn' : 'p.pl-meta',
        null,
        `☀️ DONKI (30 ${t('pl.env.days')}): ${t('pl.env.sep', { n })} · ${t('pl.env.flares', { n: R.space.flares.length })}`,
        n ? ` — ${t('pl.env.sepAdvice')}` : ''
      )
    );
  }
  return box;
}

function drawProfile() {
  const c = profileCanvas;
  const r = R.result;
  if (!c || !r || r.profile.length < 2) return;
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  const prof = r.profile;
  let min = Infinity;
  let max = -Infinity;
  for (const p of prof) {
    min = Math.min(min, p.h);
    max = Math.max(max, p.h);
  }
  const pad = Math.max(2, (max - min) * 0.1);
  min -= pad;
  max += pad;
  const L = r.evaluation.length || 1;
  const x = (d) => 40 + (d / L) * (W - 48);
  const y = (hh) => 8 + (1 - (hh - min) / (max - min)) * (H - 26);
  ctx.fillStyle = 'rgba(255,107,53,0.22)';
  ctx.beginPath();
  ctx.moveTo(x(0), H - 18);
  for (const p of prof) ctx.lineTo(x(p.d), y(p.h));
  ctx.lineTo(x(L), H - 18);
  ctx.fill();
  const lim = R.params.mode === 'rover' ? R.params.maxSlopeRover : R.params.maxSlopeWalk;
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1];
    const b = prof[i];
    const g = Math.abs((Math.atan2(b.h - a.h, b.d - a.d || 1) * 180) / Math.PI);
    ctx.strokeStyle = `rgb(${rampColor(RAMPS.slope, g / (lim * 1.5)).join(',')})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(a.d), y(a.h));
    ctx.lineTo(x(b.d), y(b.h));
    ctx.stroke();
  }
  // stops
  ctx.fillStyle = '#ffcc33';
  for (const d of r.stopD.slice(0, R.points.length - 1)) ctx.fillRect(x(d) - 1, 6, 2, H - 24);
  ctx.strokeStyle = '#ff3b5c';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(x(r.pnr), 6);
  ctx.lineTo(x(r.pnr), H - 18);
  ctx.stroke();
  ctx.setLineDash([]);
  const units = getSettings().units;
  ctx.fillStyle = '#ddd';
  ctx.font = '11px "Share Tech Mono", monospace';
  ctx.fillText(formatElevation(max - pad, units), 2, 14);
  ctx.fillText(formatElevation(min + pad, units), 2, H - 20);
  ctx.fillText('0', 40, H - 4);
  ctx.fillText(formatDistance(L, units), W - 64, H - 4);
  ctx.fillStyle = '#ff3b5c';
  ctx.fillText(t('pl.pnrShort'), Math.min(W - 40, x(r.pnr) + 3), 18);
}

/** Trip card for screenshots (null when no route is computed). */
export function routeCard() {
  const r = R.result;
  if (!r || !R.points.length) return null;
  const units = getSettings().units;
  const e = r.evaluation;
  const b = R.points[0];
  const lt = localSolarTime(R.timeMs, b.lon);
  const sun = sunPosition(R.timeMs, b.lat, b.lon);
  const mode = R.params.mode === 'rover' ? t('pl.mode.rover') : t('pl.mode.walk');
  const lim = R.params.mode === 'rover' ? R.params.maxSlopeRover : R.params.maxSlopeWalk;
  return {
    title: t('snap.routeTitle'),
    subtitle: `🏠 ${formatLatLon(b.lat, b.lon, 4)} · ${t('snap.stops', { n: R.points.length - 1 })} · ${mode} · ${
      R.crew < 2 ? t('pl.crew.solo') : t('pl.crew.pair')
    }`,
    rows: [
      [t('pl.sum.length'), formatDistance(e.length, units)],
      [t('pl.sum.duration'), formatDuration(e.totalSeconds)],
      [t('pl.sum.climb'), `↑${formatElevation(e.climb, units)} ↓${formatElevation(e.descent, units)}`],
      [t('pl.sum.maxSlope'), `${r.maxSlope.toFixed(1)}° / ${lim}°`],
      [t('pl.sum.o2'), `${e.o2UsablePct.toFixed(0)}% (${(e.o2Kg * 1000).toFixed(0)} g)`],
      [t('pl.sum.pnr'), formatDistance(r.pnr, units)],
      [t('pl.sum.shelter'), formatDuration(r.shelterS)],
      [t('pl.sum.comms'), `${Math.round(r.coverage * 100)}%`],
      ...(Number.isFinite(r.scienceCoverage) ? [[t('pl.sum.scienceCoverage'), `${Math.round(r.scienceCoverage * 100)}%`]] : []),
      [t('pl.sum.dose'), `${r.doseMsv.toFixed(3)} mSv`],
      [t('pl.score.total'), `${r.score.total}/100`],
      [t('rt.ltst'), `${formatHours(lt.ltst)} · Ls ${sun.Ls.toFixed(0)}°`],
      [t('snap.date'), new Date(R.timeMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
    ],
    profile: { pts: r.profile, pnr: r.pnr, stops: r.stopD.slice(0, R.points.length - 1) },
  };
}

/** Compact summary for the guide's "walk" step (null before a route exists). */
export function getRouteSummary() {
  const r = R.result;
  if (!r) return null;
  return {
    length: r.evaluation.length,
    seconds: r.evaluation.totalSeconds,
    o2Pct: r.evaluation.o2UsablePct,
    dose: r.doseMsv,
    pnr: r.pnr,
    score: r.score,
    coverage: r.scienceCoverage,
    mode: R.params.mode,
    points: R.points.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label, science: p.science })),
    failed: r.failedLeg,
    tooLong: r.tooLong,
  };
}

/** Start the first-person rehearsal of the current route. */
export function walkCurrentRoute() {
  if (!R.result) return false;
  nav.traverse({
    route: R.result,
    points: R.points.map((p) => ({ ...p })),
    heightAtLL: (la, lo) => orbitView.terrain.heightAt(la, lo),
  });
  return true;
}
