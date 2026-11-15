/**
 * Application state machine.
 *
 *  loading → start ⇄ dashboard ⇄ surface
 *
 * `dashboard` = the globe, where Mars is explored AND routes are planned
 * (the view zooms continuously from orbit to the ground),
 * `surface` = first-person rehearsal of a planned route.
 */
import { emit } from './events.js';

export const STATES = Object.freeze(['loading', 'start', 'dashboard', 'surface']);

export const TRANSITIONS = Object.freeze({
  loading: ['start', 'dashboard', 'surface'],
  start: ['dashboard', 'surface'],
  dashboard: ['start', 'surface'],
  surface: ['dashboard', 'start'],
});

/**
 * Creates an isolated state machine (exported for unit tests).
 * @param {string} initial
 * @param {Record<string, string[]>} transitions
 * @param {(change: {from: string, to: string}) => void} [onChange]
 */
export function createStateMachine(initial, transitions, onChange) {
  let current = initial;
  return {
    get current() {
      return current;
    },
    can(to) {
      return (transitions[current] || []).includes(to);
    },
    set(to) {
      if (to === current && !(transitions[current] || []).includes(to)) return false;
      if (!(transitions[current] || []).includes(to)) {
        console.warn(`[state] invalid transition ${current} → ${to}`);
        return false;
      }
      const from = current;
      current = to;
      onChange?.({ from, to });
      return true;
    },
  };
}

const machine = createStateMachine('loading', TRANSITIONS, (change) => emit('state:change', change));

/** @returns {string} */
export function getState() {
  return machine.current;
}

/** @param {string} to */
export function setState(to) {
  return machine.set(to);
}

/** True while the first-person surface view is active. */
export function isSurfaceState(state = machine.current) {
  return state === 'surface';
}

/** True while the orbital globe is the active view. */
export function isOrbitState(state = machine.current) {
  return state === 'start' || state === 'dashboard' || state === 'loading';
}
