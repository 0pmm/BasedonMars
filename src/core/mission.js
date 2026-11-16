/**
 * Mission state: the scientific objective is the backbone of the app.
 *
 * Everything the guide shows (ranking, zones on the globe, the Marswalk) is
 * derived from the objective chosen here. The state is persisted so a reload
 * keeps the mission, and mirrored in the URL hash by main.js for deep links.
 */
import { emit } from './events.js';
import { load, save } from './storage.js';
import { ALL_OBJECTIVES, objectiveById } from '../game/siteFit.js';

const KEY = 'mission.v1';
export const STEPS = Object.freeze(['objective', 'site', 'route', 'try']);

const DEFAULT = Object.freeze({
  objective: 'geology',
  step: 'objective',
  siteId: null,
  zoneId: null,
  started: false,
});

function sanitise(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    objective: ALL_OBJECTIVES.some((o) => o.id === v.objective) ? v.objective : DEFAULT.objective,
    step: STEPS.includes(v.step) ? v.step : DEFAULT.step,
    siteId: typeof v.siteId === 'string' ? v.siteId : null,
    zoneId: typeof v.zoneId === 'string' ? v.zoneId : null,
    started: !!v.started,
  };
}

let state = sanitise(load(KEY, DEFAULT));

function commit(patch) {
  state = sanitise({ ...state, ...patch });
  save(KEY, state);
  emit('mission:change', getMission());
  return getMission();
}

/** @returns {{objective:string, step:string, siteId:string|null, zoneId:string|null, started:boolean}} */
export function getMission() {
  return { ...state };
}

export function hasMission() {
  return state.started;
}

export function objective() {
  return objectiveById(state.objective);
}

/** Choose the objective and enter the guide at the site step. */
export function startMission(objectiveId) {
  if (!ALL_OBJECTIVES.some((o) => o.id === objectiveId)) return getMission();
  // free exploration starts on the map, ready to mark points; the others choose a site first
  // a new objective starts from its own recommendation, not from the previous choice
  return commit({ objective: objectiveId, started: true, step: objectiveId === 'free' ? 'route' : 'site', siteId: null, zoneId: null });
}

/** Change objective: the guide goes back to that objective's recommendation. */
export function setObjective(objectiveId) {
  if (!ALL_OBJECTIVES.some((o) => o.id === objectiveId)) return getMission();
  if (objectiveId === state.objective) return commit({ started: true });
  return commit({ objective: objectiveId, started: true, siteId: null, zoneId: null });
}

export function setStep(step) {
  if (!STEPS.includes(step)) return getMission();
  return commit({ step });
}

export function selectSite(siteId) {
  return commit({ siteId, zoneId: null, step: 'site', started: true });
}

export function selectZone(zoneId) {
  return commit({ zoneId, siteId: null, step: 'site', started: true });
}

export function resetMission() {
  state = { ...DEFAULT };
  save(KEY, state);
  emit('mission:change', getMission());
  return getMission();
}

/** True when the user explores without a scientific goal. */
export function isFreeExploration() {
  return state.objective === 'free';
}
