/**
 * Helmet HUD of the first-person route rehearsal: route progress, EVA
 * clock, O₂, dose, next stop, local solar time, time factor, compass,
 * route minimap and ground-data status.
 */
import { $, h, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { on } from '../core/events.js';
import { getSettings } from '../core/settings.js';
import { formatDistance, formatElevation, formatTemperature } from '../core/units.js';
import { isPointerLocked } from '../core/input.js';
import { isTouchDevice } from '../core/quality.js';
import { angleDiff } from '../core/math.js';
import { formatHours } from '../geo/mars24.js';
import { caption } from './feedback.js';

const COMPASS_FOV = Math.PI * 0.9;
const ICONS = { base: '🏠', stop: '🚩', science: '🔬', done: '✅' };

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function initHud() {
  on('sound:caption', (key) => caption(key));
  on('settings:change', () => applyHudSettings());
  on('input:pointerlock', ({ locked }) => {
    $('#click-hint').hidden = locked || isTouchDevice();
  });
  buildCompassTicks();
}

export function showHud(visible) {
  $('#surface-hud').hidden = !visible;
  applyHudSettings(visible);
}

function applyHudSettings(visible = !$('#surface-hud').hidden) {
  const s = getSettings();
  $('#visor').hidden = !(visible && s.helmetOverlay);
  $('#minimap').hidden = !s.showMinimap;
  $('#mobile-controls').hidden = !isTouchDevice();
  $('#click-hint').hidden = isTouchDevice() || isPointerLocked();
}

export function setLocation(label, sub = '') {
  $('#hud-location').textContent = label;
  $('#hud-chapter').textContent = sub;
}

/** @param {number} level 0..100 */
export function setOxygen(level) {
  const gauge = $('#o2-gauge');
  $('#o2-fill').style.width = `${Math.max(0, level)}%`;
  $('#o2-value').textContent = `${Math.round(level)}%`;
  gauge.setAttribute('aria-valuenow', String(Math.round(level)));
  gauge.classList.toggle('low', level < 30);
}

/** Per-frame HUD update from traverse.update(). */
export function updateHud(info, markers, player) {
  if (!info) return;
  const units = getSettings().units;
  setOxygen(info.o2Pct);
  $('#hud-dose').textContent = `${info.doseMsv.toFixed(2)} mSv`;
  $('#hud-timer').textContent = formatClock(info.evaSeconds);
  const pct = info.total > 0 ? Math.round((info.s / info.total) * 100) : 0;
  const parts = [
    info.mode === 'follow'
      ? `🧭 ${formatDistance(info.s, units)} / ${formatDistance(info.total, units)} (${pct}%)`
      : `🚶 ${t('tr.free')} · ${formatDistance(info.walked, units)}`,
    info.nextStop
      ? `${info.nextStop.science ? '🔬' : '🚩'} ${info.nextStop.i}: ${formatDistance(info.nextStop.dist, units)}`
      : `🏠 ${formatDistance(info.base.dist, units)}`,
    `⛰ ${formatElevation(info.altitude, units)} · ${info.slope.toFixed(0)}°`,
    `☀ ${formatHours(info.ltst)}`,
    `⏩ ×${info.timeScale}`,
  ];
  const el = $('#eva-hud');
  el.hidden = false;
  el.textContent = parts.join('  ·  ');
  const status = $('#hazard-banner');
  status.classList.toggle('info', !!(info.atStop || info.finished));
  if (info.paused) {
    status.hidden = false;
    status.textContent = `⏸ ${t('tr.paused')}`;
  } else if (info.atStop) {
    status.hidden = false;
    status.textContent = `${info.atStop.science ? '🔬' : '🚩'} ${t('tr.working', { i: info.atStop.i, time: formatClock(info.atStop.remaining) })}`;
  } else if (info.finished) {
    status.hidden = false;
    status.textContent = `✅ ${t('tr.finished', { time: formatClock(info.finished.evaSeconds), time2: formatClock(info.finished.planned) })}`;
  } else if (info.waiting) {
    status.hidden = false;
    status.textContent = `⏳ ${t('tr.loadingGround')}`;
  } else status.hidden = true;
  const ch = info.chunk;
  $('#objective-status').textContent = ch
    ? `${t('tr.ground')}: ${t('tr.terrainLevel', { z: ch.level })} · ${
        ch.layer ? `${ch.layer.instrument} ${ch.mpp.toFixed(1)} m/px` : t('tr.noImage')
      }${ch.rocks ? ` · ${t('tr.rocks', { n: ch.rocks })}` : ''}`
    : t('tr.loadingGround');
  const e = info.env;
  const env = [
    e.temp != null ? `🌡 ${formatTemperature(e.temp, units)} (${t('pl.estimate')})` : null,
    `${Math.round(e.pressure)} Pa`,
    `τ ${e.tau.toFixed(2)} · ${t('tr.haze', { km: Math.round(e.haze / 1000) })}`,
    info.trackDist != null && info.trackDist < 400 ? `🛞 ${t('tr.tracks', { d: formatDistance(info.trackDist, units) })}` : null,
  ].filter(Boolean);
  $('#objective-distance').textContent = env.join('  ·  ');
  updateCompass(player, markers);
  drawMinimap(markers, player);
}

/* ---------------- Compass ---------------- */
function buildCompassTicks() {
  const strip = $('#compass-strip');
  clear(strip);
  const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let deg = 0; deg < 360; deg += 15) {
    strip.append(
      h('span.compass-tick', { class: labels[deg] && deg % 90 === 0 ? 'cardinal' : '', dataset: { deg: String(deg) } }, labels[deg] || '·')
    );
  }
}

/** Bearing (north = −Z, east = +X, clockwise). Player forward = (sin yaw, cos yaw). */
export function bearingOf(dx, dz) {
  return Math.atan2(dx, -dz);
}

function updateCompass(player, markers) {
  const strip = $('#compass-strip');
  if (!strip) return;
  const heading = bearingOf(Math.sin(player.yaw), Math.cos(player.yaw));
  const place = (el, bearing) => {
    const d = angleDiff(bearing, heading);
    const visible = Math.abs(d) < COMPASS_FOV / 2;
    el.style.display = visible ? '' : 'none';
    if (visible) el.style.left = `${50 + (d / COMPASS_FOV) * 100}%`;
  };
  for (const tick of strip.querySelectorAll('.compass-tick')) place(tick, (Number(tick.dataset.deg) * Math.PI) / 180);
  strip.querySelectorAll('.compass-marker').forEach((m) => m.remove());
  for (const m of markers) {
    if (m.kind === 'done') continue;
    const el = h('span.compass-marker', null, ICONS[m.kind] || '•');
    strip.append(el);
    place(el, bearingOf(m.x - player.x, m.z - player.z));
  }
}

/* ---------------- Minimap (route, north-up) ---------------- */
let routeRef = null;
export function setMinimapRoute(local) {
  routeRef = local;
}

function drawMinimap(markers, player) {
  const canvas = /** @type {HTMLCanvasElement} */ ($('#minimap'));
  if (!canvas || canvas.hidden) return;
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const range = 350; // metres from centre to edge
  const scale = S / 2 / range;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(40,20,12,0.75)';
  ctx.fillRect(0, 0, S, S);
  if (routeRef?.length > 1) {
    ctx.strokeStyle = '#4fd1ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    routeRef.forEach((p, i) => {
      const x = S / 2 + (p.x - player.x) * scale;
      const y = S / 2 + (p.z - player.z) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const m of markers) {
    const x = Math.max(9, Math.min(S - 9, S / 2 + (m.x - player.x) * scale));
    const y = Math.max(9, Math.min(S - 9, S / 2 + (m.z - player.z) * scale));
    ctx.fillText(ICONS[m.kind] || '•', x, y);
  }
  ctx.restore();
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(bearingOf(Math.sin(player.yaw), Math.cos(player.yaw)));
  ctx.fillStyle = '#ff6b35';
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', S / 2, 10);
  ctx.fillText(formatDistance(range, getSettings().units), S / 2, S - 8);
}
