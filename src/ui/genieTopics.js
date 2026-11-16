/**
 * What GENIE says about each indicator. Every explanation has a simple
 * general part plus, when there is data on screen, a sentence about the
 * CURRENT value (your route, the layer you chose, the HUD), so the answer is
 * never generic. Texts live in i18n/genie.*.js.
 */
import { t } from '../core/i18n.js';
import { getSettings } from '../core/settings.js';
import { formatDistance, formatElevation } from '../core/units.js';
import { formatHours } from '../geo/mars24.js';
import { registerTopics } from './genie.js';
import { routeState, formatDuration, currentSlopeLimit } from './routePanel.js';
import { currentLayer } from './dashboard.js';
import { lastTraverseInfo } from '../traverse/traverseApp.js';
import { findLayer } from '../geo/trek.js';
import { rangeRadius } from '../planner/route.js';

const units = () => getSettings().units;
const dist = (m) => formatDistance(m, units());
const elev = (m) => formatElevation(m, units());

/** title + text (+ "now" sentence when `now` vars exist) + optional extra. */
function topic(id, now, extraVars) {
  return () => {
    const vars = typeof now === 'function' ? now() : null;
    const base = t(`genie.${id}.text`);
    const current = vars ? ` ${t(`genie.${id}.now`, vars)}` : '';
    const ex = t(`genie.${id}.extra`, extraVars?.() || {});
    return { title: t(`genie.${id}.title`), text: base + current, extra: ex.startsWith('genie.') ? null : ex };
  };
}

const result = () => routeState().result;
const ev = () => result()?.evaluation;

export function initGenieTopics() {
  registerTopics({
    // ---- route metrics
    distance: topic('distance', () => ev() && { d: dist(ev().length) }),
    duration: topic(
      'duration',
      () =>
        ev() && {
          total: formatDuration(ev().totalSeconds),
          move: formatDuration(ev().moveSeconds),
          stops: formatDuration(ev().stopSeconds),
        }
    ),
    climb: topic('climb', () => ev() && { up: elev(ev().climb), down: elev(ev().descent) }),
    maxSlope: topic('maxSlope', () => result() && { max: result().maxSlope.toFixed(1), lim: currentSlopeLimit() }),
    o2: topic(
      'o2',
      () => ev() && { pct: ev().o2UsablePct.toFixed(0), g: (ev().o2Kg * 1000).toFixed(0), reserve: routeState().params.reservePct }
    ),
    pnr: topic('pnr', () => result() && { d: dist(result().pnr), total: dist(ev().length) }),
    shelter: topic('shelter', () => result() && { t: formatDuration(result().shelterS) }),
    range: topic('range', () => ({ d: dist(rangeRadius(routeState().params)) })),
    comms: topic('comms', () => result() && { pct: Math.round(result().coverage * 100), mast: routeState().params.commsMastHeight }),
    dose: topic('dose', () => result() && { msv: result().doseMsv.toFixed(3) }),
    score: topic(
      'score',
      () => result() && { total: result().score.total, s: result().score.safety, c: result().score.science, e: result().score.efficiency }
    ),
    profile: topic('profile', () => result() && { pnr: dist(result().pnr) }),
    why: topic('why', () => {
      const w = result()?.why;
      if (!w) return null;
      return { saved: w.direct.cost > 0 ? Math.round((1 - w.route.cost / w.direct.cost) * 100) : 0, blocked: dist(w.direct.blocked) };
    }),
    priority: topic('priority', () => ({ p: t(`rt.priority.${routeState().params.priority || 'safety'}`) })),
    mode: topic('mode', () => ({
      m: routeState().params.mode === 'rover' ? t('pl.mode.rover') : t('pl.mode.walk'),
      lim: currentSlopeLimit(),
    })),
    crew: topic('crew'),
    returnToBase: topic('returnToBase'),
    ltst: topic('ltst'),
    params: topic('params', () => {
      const p = routeState().params;
      return { speed: p.walkSpeed, o2h: p.o2HoursAt300W, lim: p.maxSlopeWalk };
    }),
    // ---- environment
    season: topic('season'),
    sun: topic('sun'),
    daylight: topic('daylight'),
    irradiance: topic('irradiance'),
    pressure: topic('pressure'),
    doseRate: topic('doseRate'),
    // ---- globe layers (contextual to the selected layer)
    layer: () => {
      const id = currentLayer();
      const computed = ['slope', 'hazard', 'elevation', 'contours'].includes(id);
      if (id === 'none' || computed) {
        const key = id === 'none' ? 'layerNone' : `layer_${id}`;
        return {
          title: t(`genie.${key}.title`),
          text: `${t(`genie.${key}.text`, { lim: currentSlopeLimit() })} ${computed ? t('genie.layerScale') : ''}`.trim(),
        };
      }
      const def = findLayer(id);
      return {
        title: t(`layer.${id}`),
        text: t(`genie.layerKind.${def?.kind || 'optical'}`, {
          name: t(`layer.${id}`),
          inst: def?.instrument || '',
          res: def?.resolution || '',
        }),
        extra: def?.measured === false ? t('genie.layerInterpreted') : t('genie.layerMeasured'),
      };
    },
    layers: topic('layers'),
    // ---- guide: objective, site and zone recommendations
    objective: topic('objective'),
    recFilter: topic('recFilter'),
    zones: topic('zones'),
    landing: topic('landing'),
    modes: topic('modes'),
    fitScore: (ctx) => {
      const best = ctx?.fit?.drivers?.map((f) => t(`science.attr.${f.key}`)).join(', ');
      return {
        title: t('genie.fitScore.title'),
        text: `${t('genie.fitScore.text')}${ctx?.site ? ` ${t('genie.fitScore.now', { name: ctx.site.name, score: ctx.fit.score, best })}` : ''}`,
      };
    },
    criterion: (ctx) => ({
      title: t(`science.attr.${ctx?.key}`),
      text: `${t(`genie.criterion.${ctx?.key}`)}${Number.isFinite(ctx?.value) ? ` ${t('genie.criterion.now', { value: Math.round(ctx.value * 100) })}` : ''}`,
    }),
    // ---- telemetry (globe footer)
    sol: topic('sol', () => ({ v: document.querySelector('#tele-sol')?.textContent || '—' })),
    localTime: topic('localTime', () => ({ v: document.querySelector('#tele-time')?.textContent || '—' })),
    temperature: topic('temperature', () => ({ v: document.querySelector('#tele-temp')?.textContent || '—' })),
    telePressure: topic('telePressure', () => ({ v: document.querySelector('#tele-pressure')?.textContent || '—' })),
    radiation: topic('radiation'),
    teleSeason: topic('season'),
    // ---- first-person HUD
    hudO2: topic('hudO2', () => {
      const i = lastTraverseInfo();
      return i && { pct: i.o2Pct.toFixed(0) };
    }),
    hudDose: topic('hudDose', () => {
      const i = lastTraverseInfo();
      return i && { msv: i.doseMsv.toFixed(3) };
    }),
    hudClock: topic('hudClock', () => {
      const i = lastTraverseInfo();
      return i && { x: i.timeScale };
    }),
    hudGround: topic('hudGround', () => {
      const i = lastTraverseInfo();
      return i?.chunk && { z: i.chunk.level, src: i.chunk.layer?.instrument || t('tr.noImage') };
    }),
    hudEnv: topic('hudEnv', () => {
      const i = lastTraverseInfo();
      return i && { tau: i.env.tau.toFixed(2), km: Math.round(i.env.haze / 1000), ltst: formatHours(i.ltst) };
    }),
  });
}
