/**
 * Entry point: bootstraps settings, i18n, renderer, the globe (where Mars
 * is explored and routes are planned) and the first-person route
 * rehearsal; owns navigation between app states and the animation loop.
 */
// Self-hosted fonts, Latin subset only (covers English and Portuguese)
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/share-tech-mono/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';
import './styles/dashboard.css';
import './styles/surface.css';
import './styles/dialogs.css';
import './styles/responsive.css';
import './styles/planner.css';

import { $, $$ } from './core/dom.js';
import { on, emit } from './core/events.js';
import { getState, setState, isSurfaceState } from './core/state.js';
import { initSettings, getSettings, updateSettings, prefersReducedMotion } from './core/settings.js';
import { setLanguage, applyTranslations, t, getLanguage, LANGUAGES } from './core/i18n.js';
import { initErrorCapture } from './core/errors.js';
import { createRenderer, applyRendererQuality, captureFrame, getRenderer } from './core/renderer.js';
import { getQuality, isTouchDevice, isIOS } from './core/quality.js';
import * as input from './core/input.js';
import { audio } from './core/audio.js';
import { parseHash, setHash } from './core/deeplink.js';
import { orbitView, homeView } from './orbit/orbitView.js';
import { traverse } from './traverse/traverse.js';
import { initTraverseApp, startTraverse, updateTraverse, exitTraverse, isTraverseActive, traverseCard } from './traverse/traverseApp.js';
import { getSurfaceTextures } from './surface/textures.js';
import { initRoutePanel, updateRouteLayer, setRouteLayerVisible, routeDebug, routeCard } from './ui/routePanel.js';
import { openSnapshot } from './ui/snapshot.js';
import { formatLatLon } from './geo/mars.js';
import { formatDistance } from './core/units.js';
import { openSources } from './ui/sources.js';
import { marsTime, localSolarTime, formatHours, seasonKey } from './geo/mars24.js';
import { initDashboard, updateDashboard, showDashboardUI, handleDashboardEscape, openDetails, switchTab } from './ui/dashboard.js';
import { initHud, showHud } from './ui/hud.js';
import { initMobileControls } from './ui/mobileControls.js';
import { openSettings, openHelp } from './ui/menus.js';
import { isModalOpen } from './ui/modal.js';
import { toast } from './ui/feedback.js';
import pois from './data/pois.json';
import sites from './data/sites.json';

const canvas = /** @type {HTMLCanvasElement} */ ($('#scene'));
let quality;
let mobile;
let lastTime = performance.now();
let fps = { frames: 0, acc: 0 };

/* ============================ Loading ============================ */
const loading = {
  total: 0,
  done: 0,
  track(promise, messageKey) {
    this.total++;
    return Promise.resolve(promise).finally(() => {
      this.done++;
      this.render(messageKey);
    });
  },
  render(messageKey) {
    const pct = Math.round((this.done / Math.max(1, this.total)) * 100);
    $('#progress-bar').style.width = `${pct}%`;
    $('#loading .progress-track').setAttribute('aria-valuenow', String(pct));
    if (messageKey) $('#loading-msg').textContent = t(messageKey);
  },
  finish(errorMessage) {
    $('#progress-bar').style.width = '100%';
    $('#loading-msg').textContent = errorMessage ? `${t('loading.simplified')} (${errorMessage})` : t('loading.ready');
    setTimeout(() => $('#loading').classList.add('done'), errorMessage ? 1200 : 350);
  },
};

/* ============================ Settings → DOM ============================ */
function applyGlobalSettings(patch = getSettings()) {
  const s = getSettings();
  const root = document.documentElement;
  if ('language' in patch) {
    setLanguage(s.language);
    applyTranslations();
    $('#language-label').textContent = getLanguage().toUpperCase();
    $('#start-screen .lead').textContent = t('start.lead');
  }
  root.classList.toggle('hc', s.highContrast);
  root.classList.toggle('reduce-motion', prefersReducedMotion());
  root.classList.toggle('motion-ok', s.reducedMotion === 'off');
  root.style.setProperty('--font-scale', String(s.fontScale));
  $('#fps-meter').hidden = !s.showFps;
  audio.applySettings(s);
  if ('quality' in patch && getRenderer()) {
    quality = getQuality(getRenderer().capabilities.maxTextureSize);
    applyRendererQuality(quality);
    traverse.setQuality(quality);
    orbitView.planet.loadTexture(quality.planetTexture);
  }
}

/* ============================ Navigation ============================ */
async function fade(on) {
  const el = $('#fade');
  el.classList.toggle('on', on);
  if (!prefersReducedMotion()) await new Promise((r) => setTimeout(r, 450));
}

/** Toggle every piece of UI for the given state. */
function applyStateUI(state) {
  $('#start-screen').hidden = state !== 'start';
  showDashboardUI(state === 'dashboard');
  showHud(isSurfaceState(state));
  setRouteLayerVisible(state === 'dashboard');
  orbitView.setDashboardMode(state === 'dashboard');
  orbitView.controls.enabled = state === 'start' || state === 'dashboard';
  if (state === 'start' || state === 'dashboard') {
    audio.startMusic();
    if (state === 'start') orbitView.controls.autoRotate = getSettings().autoRotate && !prefersReducedMotion();
  } else audio.stopMusic();
  canvas.style.cursor = isSurfaceState(state) ? 'crosshair' : 'grab';
  mobile?.checkOrientation();
}

/**
 * Switch to the first-person state, building the world behind a fade.
 * @returns {Promise<boolean>} false when the world could not be built
 */
async function showSurface(state, build, fallback = 'dashboard') {
  await fade(true);
  let ok = true;
  try {
    await build();
    setState(state);
    applyStateUI(state);
  } catch (err) {
    console.error(err);
    ok = false;
    toast(t('error.surface'), { type: 'error' });
    setState(fallback);
    applyStateUI(fallback);
  }
  await fade(false);
  return ok;
}

/** Leave first person: back to the globe, right above the walker. */
function exitTo(_origin, where) {
  input.exitPointerLock();
  setState('dashboard');
  applyStateUI('dashboard');
  setHash(null);
  if (where) {
    orbitView.controls.jumpTo({ lat: where.lat, lon: where.lon, range: 60, heading: where.heading, tilt: 78 });
    orbitView.flyTo({ lat: where.lat, lon: where.lon, range: 1800, heading: where.heading, tilt: 55 }, 2200);
  }
}

function goHome() {
  setState('start');
  applyStateUI('start');
  setHash(null);
  orbitView.flyTo(homeView(), 1400);
}

function openDashboard() {
  setState('dashboard');
  applyStateUI('dashboard');
  orbitView.setAutoRotate(false);
  emit('log', { type: 'system', key: 'log.explore' });
}

/** Card for a globe screenshot without a computed route: where the camera is. */
function globeCard() {
  const st = orbitView.controls.state;
  const now = Date.now();
  const m = marsTime(now);
  const units = getSettings().units;
  return {
    title: t('snap.globeTitle'),
    subtitle: formatLatLon(st.lat, st.lon, 4),
    rows: [
      [t('snap.cameraAlt'), formatDistance(orbitView.controls.altitude(), units)],
      [t('snap.groundAlt'), `${Math.round(orbitView.terrain.heightAt(st.lat, st.lon) ?? 0)} m`],
      [t('pl.env.ltst'), formatHours(localSolarTime(now, st.lon).ltst)],
      [t('pl.env.season'), `${t(`season.${seasonKey(m.Ls, st.lat)}`)} · Ls ${m.Ls.toFixed(0)}°`],
    ],
  };
}

/** Capture the view and show it with the trip data before saving. */
function screenshot() {
  const surface = isSurfaceState();
  if (surface) {
    input.exitPointerLock();
    if (traverse.world && !traverse.world.paused) traverse.world.paused = 'snapshot';
  }
  const frame = captureFrame(() => (surface ? traverse.render() : orbitView.render()));
  audio.shutter();
  const card = surface ? traverseCard() : routeCard() || globeCard();
  const dlg = openSnapshot(frame, card, { onSaved: () => toast(t('screenshot.saved'), { type: 'success' }) });
  dlg.dialog.addEventListener('close', () => {
    if (traverse.world?.paused === 'snapshot') traverse.world.paused = false;
  });
}

/* ============================ Global input ============================ */
function bindGlobal() {
  const unlockAudio = () => audio.unlock();
  addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
  addEventListener('keydown', unlockAudio, { passive: true });

  $('#btn-start-explore').addEventListener('click', () => {
    openDashboard();
    switchTab('route');
  });
  $('#btn-language').addEventListener('click', () => {
    const codes = LANGUAGES.map((l) => l.code);
    const next = codes[(codes.indexOf(getLanguage()) + 1) % codes.length];
    updateSettings({ language: next });
  });
  $$('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const what = b.dataset.open;
      if (what === 'settings') openSettings();
      else if (what === 'help') openHelp();
      else if (what === 'sources') openSources();
    })
  );
  $('#btn-surface-exit').addEventListener('click', () => exitTraverse());
  $('#btn-pause').addEventListener('click', () => emit('input:action', { action: 'pause' }));

  // Click on the 3D view captures the mouse in first person (desktop)
  canvas.addEventListener('click', () => {
    if (isSurfaceState() && !isModalOpen() && !isTouchDevice()) input.requestPointerLock();
  });

  on('input:action', ({ action }) => {
    if (isModalOpen()) return;
    if (action === 'help') openHelp();
    else if (action === 'screenshot') screenshot();
  });
  on('input:escape', () => {
    if (isModalOpen()) return;
    if (getState() === 'dashboard') handleDashboardEscape();
  });

  on('settings:change', ({ patch }) => applyGlobalSettings(patch));
  on('error:captured', () => toast(t('error.generic'), { type: 'error' }));
  on('ui:sources', () => openSources());
  on('modal:change', ({ open }) => input.setInputEnabled(!open));

  // Pause the rehearsal when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isSurfaceState() && traverse.world && !traverse.world.paused) emit('input:action', { action: 'pause' });
  });

  addEventListener('hashchange', () => {
    const s = getState();
    if (!isModalOpen() && (s === 'start' || s === 'dashboard')) handleDeepLink();
  });

  if (isIOS()) $('#btn-fullscreen').hidden = true;
}

/* ============================ Loop ============================ */
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  input.updateInput();
  const state = getState();
  if (state === 'surface' && isTraverseActive()) {
    updateTraverse(dt);
    traverse.render();
  } else {
    orbitView.update(dt);
    if (state === 'dashboard') {
      updateDashboard(dt);
      updateRouteLayer();
    }
    orbitView.render();
  }
  if (getSettings().showFps) {
    fps.frames++;
    fps.acc += dt;
    if (fps.acc >= 0.5) {
      $('#fps-meter').textContent = `${Math.round(fps.frames / fps.acc)} FPS · ${getRenderer().info.render.calls} draws`;
      fps = { frames: 0, acc: 0 };
    }
  }
}

/* ============================ Deep links ============================ */
function handleDeepLink() {
  const link = parseHash();
  const site = link.site && sites.find((s) => s.id === link.site);
  const at = site ? { lat: site.lat, lon: site.lon } : link.at;
  if (at) {
    openDashboard();
    switchTab('route');
    orbitView.flyTo({ lat: at.lat, lon: at.lon, range: 3000, heading: 0, tilt: 55 }, 2600);
    return true;
  }
  if (link.poi) {
    const poi = pois.find((p) => p.id === link.poi);
    if (poi) {
      openDashboard();
      openDetails(poi);
      setTimeout(() => orbitView.focusPoi(poi.id), 300);
      return true;
    }
  }
  return false;
}

/* ============================ Boot ============================ */
async function boot() {
  initSettings();
  initErrorCapture();
  applyGlobalSettings({ language: true });

  let errorMessage = null;
  try {
    const renderer = createRenderer(canvas);
    quality = getQuality(renderer.capabilities.maxTextureSize);
    applyRendererQuality(quality);
    loading.render('loading.init');
    input.initInput(canvas);

    const planetReady = loading.track(orbitView.init(renderer, quality), 'loading.planet');
    traverse.init(renderer, orbitView.glowTexture, quality);
    const fonts = loading.track(document.fonts?.ready, 'loading.fonts');
    // Warm up the soil/rock textures in a Web Worker (not awaited)
    getSurfaceTextures().catch(() => {});

    // The globe is lit from the real subsolar point, updated every minute
    const updateSun = () => {
      const m = marsTime(Date.now());
      orbitView.setSubsolar(m.declination, m.subsolarLonEast);
    };
    updateSun();
    setInterval(updateSun, 60000);

    initDashboard({ goHome, screenshot });
    initRoutePanel({ traverse: (plan) => startTraverse(plan, 'dashboard') });
    initHud();
    mobile = initMobileControls();
    initTraverseApp({ show: showSurface, exitTo });
    bindGlobal();

    requestAnimationFrame(loop);
    await Promise.race([Promise.all([planetReady, fonts]), new Promise((r) => setTimeout(r, 15000))]);
  } catch (err) {
    console.error('Critical init error', err);
    errorMessage = err?.message || 'WebGL';
  }

  setState('start');
  applyStateUI('start');
  loading.finish(errorMessage);
  if (!errorMessage && !handleDeepLink()) $('#start-content')?.focus({ preventScroll: true });

  // Offline support (production builds only)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  }
  // Debug hooks for automated end-to-end tests (dev server only)
  if (import.meta.env.DEV) window.__mars = { orbitView, traverse, getState, route: routeDebug, startTraverse };
}

boot();
