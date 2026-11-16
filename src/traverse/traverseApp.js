/**
 * Glue between the route panel, the first-person rehearsal (traverse.js)
 * and the helmet HUD: entering/leaving, keyboard/touch actions, pause,
 * time factor, stop notifications.
 */
import { on, emit } from '../core/events.js';
import { t } from '../core/i18n.js';
import { getState } from '../core/state.js';
import * as input from '../core/input.js';
import { isModalOpen } from '../ui/modal.js';
import { toast, announce } from '../ui/feedback.js';
import { showHud, updateHud, setLocation, setMinimapRoute } from '../ui/hud.js';
import { updateSettings, getSettings } from '../core/settings.js';
import { formatLatLon } from '../geo/mars.js';
import { formatHours } from '../geo/mars24.js';
import { formatDistance, formatElevation } from '../core/units.js';
import { formatClock } from '../ui/hud.js';
import { traverse, TIME_SCALES } from './traverse.js';
import { helpButton } from '../ui/genie.js';

let nav = { show: async () => true, exitTo: () => {} };
let active = false;
let lastInfo = null;

export function initTraverseApp(navigation) {
  nav = navigation;
  on('input:action', ({ action }) => {
    if (!active || getState() !== 'surface' || isModalOpen()) return;
    const w = traverse.world;
    if (!w) return;
    if (action === 'interact') {
      traverse.setMode(w.mode === 'follow' ? 'free' : 'follow');
      toast(w.mode === 'follow' ? t('tr.followOn') : t('tr.freeOn'), { type: 'info', duration: 1800 });
    } else if (action === 'pause') {
      w.paused = !w.paused;
      if (w.paused) input.exitPointerLock();
    } else if (action === 'speedUp' || action === 'speedDown') {
      traverse.setTimeScaleIndex(w.speedIndex + (action === 'speedUp' ? 1 : -1));
      announce(`×${traverse.timeScale}`);
      toast(traverse.timeScale === 1 ? t('tr.realTime') : t('tr.timeFactor', { x: traverse.timeScale }), { type: 'info', duration: 1600 });
    } else if (action === 'map') updateSettings({ showMinimap: !getSettings().showMinimap });
  });
  for (const [id, action] of [
    ['#btn-slower', 'speedDown'],
    ['#btn-faster', 'speedUp'],
  ])
    document.querySelector(id)?.addEventListener('click', () => emit('input:action', { action }));
  // GENIE "?" on the helmet HUD
  const hud = [
    ['#o2-gauge', 'hudO2'],
    ['#hud-dose', 'hudDose'],
    ['#hud-timer', 'hudClock'],
    ['#objective-status', 'hudGround'],
    ['#objective-distance', 'hudEnv'],
  ];
  for (const [sel, topic] of hud) {
    const el = document.querySelector(sel);
    const host = el?.closest('.hud-stat, .gauge') || el;
    if (!host) continue;
    const b = helpButton(topic, { targets: () => [host] });
    b.classList.add('genie-q-hud');
    host.after(b);
  }
  // the rehearsal pauses while GENIE talks
  on('genie:open', () => {
    if (!active || !traverse.world) return;
    input.exitPointerLock();
    if (!traverse.world.paused) traverse.world.paused = 'genie';
  });
  on('genie:close', () => {
    if (traverse.world?.paused === 'genie') traverse.world.paused = false;
  });
  on('traverse:mode', ({ mode }) => {
    const b = document.querySelector('#mobile-controls [data-action="interact"] span');
    if (b) b.textContent = mode === 'follow' ? '▶' : '◎';
  });
}

export function isTraverseActive() {
  return active;
}

/**
 * Enter first person on a computed route.
 * @param {{route:any, points:any[], heightAtLL?:Function, startD?:number}} plan
 */
export async function startTraverse(plan, origin = 'dashboard') {
  if (!plan?.route?.path?.length) return false;
  active = true;
  const ok = await nav.show(
    'surface',
    async () => {
      await traverse.build(plan);
      const b = plan.points[0];
      setLocation(`${t('tr.title')} · ${formatLatLon(b.lat, b.lon, 3)}`, t('tr.sub'));
      setMinimapRoute(traverse.world.local);
      showHud(true);
      toast(t('tr.intro'), { type: 'info', duration: 6500 });
    },
    origin
  );
  if (!ok) active = false;
  return ok;
}

export function updateTraverse(dt) {
  if (!active) return;
  const info = traverse.update(dt);
  if (!info) return;
  lastInfo = info;
  updateHud(info, traverse.markers(), traverse.player);
  if (info.arrivedStop) {
    const st = info.arrivedStop;
    toast(t('tr.stop', { i: st.i, min: st.minutes }), { type: 'success', duration: 3500 });
  }
  if (info.atEnd && !traverse.world.endAnnounced) {
    traverse.world.endAnnounced = true;
    toast(t('tr.end'), { type: 'success', duration: 8000 });
  }
}

/** Back to the globe, right above where the walker stands. */
export function exitTraverse() {
  if (!active) return;
  const where = traverse.where();
  active = false;
  input.exitPointerLock();
  showHud(false);
  traverse.dispose();
  nav.exitTo('dashboard', where);
  emit('traverse:exit', where);
}

export { TIME_SCALES };

/** Trip card for screenshots taken during the rehearsal. */
export function traverseCard() {
  const w = traverse.world;
  const i = lastInfo;
  if (!active || !w || !i) return null;
  const units = getSettings().units;
  const ground = i.chunk?.layer ? `${i.chunk.layer.instrument.replace(/ \(.*\)/, '')} ${i.chunk.mpp.toFixed(1)} m/px` : t('tr.noImage');
  return {
    title: t('snap.evaTitle'),
    subtitle: `${formatLatLon(i.latLon.lat, i.latLon.lon, 5)} · ${i.mode === 'follow' ? t('tr.followOn') : t('tr.freeOn')} · ×${i.timeScale}`,
    rows: [
      [t('snap.progress'), `${formatDistance(i.s, units)} / ${formatDistance(i.total, units)}`],
      [t('snap.evaClock'), formatClock(i.evaSeconds)],
      ['O₂', `${i.o2Pct.toFixed(0)}%`],
      [t('pl.sum.dose'), `${i.doseMsv.toFixed(3)} mSv`],
      [t('snap.altitude'), formatElevation(i.altitude, units)],
      [t('snap.slope'), `${i.slope.toFixed(1)}°`],
      [t('pl.env.ltst'), formatHours(i.ltst)],
      i.nextStop
        ? [t('snap.nextStop'), `${i.nextStop.science ? '◆' : '▲'}${i.nextStop.i} · ${formatDistance(i.nextStop.dist, units)}`]
        : [t('snap.base'), formatDistance(i.base.dist, units)],
      [t('tr.ground'), ground],
      [t('snap.walked'), formatDistance(i.walked, units)],
    ],
    profile: { pts: w.route.profile, pnr: w.route.pnr, stops: w.stops.map((s) => s.d), marker: i.s },
  };
}

/** Latest HUD values (GENIE explanations). */
export function lastTraverseInfo() {
  return lastInfo;
}
