/**
 * Guided tour: GENIE walks through the app in a few short steps, blurring
 * everything except the part being explained. Steps that show the map enter
 * it with the geological-history objective; "Back" returns to the start
 * screen when needed. Escape, ✕ or a click outside ends the tour.
 */
import { $ } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { getState } from '../core/state.js';
import { startMission, setStep, getMission } from '../core/mission.js';
import { showGenie, closeGenie } from './genie.js';
import { openSheet } from './dashboard.js';

/** @type {{enterMap:()=>void, goHome:()=>void} | null} */
let app = null;
let index = -1;

const onStart = () => {
  if (getState() !== 'start') app.goHome();
};
const onMap = (step) => () => {
  if (getState() !== 'dashboard') {
    if (getMission().objective === 'free' || !getMission().started) startMission('geology');
    app.enterMap();
  }
  if (step && getMission().step !== step) setStep(step);
  if (step) openSheet('right-panel');
};

const STEPS = [
  { id: 'welcome', before: onStart, targets: () => [$('#start-content .start-title')] },
  { id: 'objectives', before: onStart, targets: () => [$('#start-objectives')] },
  { id: 'globe', before: onMap(null), targets: () => [], dim: false },
  { id: 'header', before: onMap(null), targets: () => [$('#app-header')] },
  { id: 'rail', before: onMap(null), targets: () => [$('#layers-panel')] },
  { id: 'guide', before: onMap('site'), targets: () => [$('#right-panel')] },
  { id: 'route', before: onMap('route'), targets: () => [$('#right-panel')] },
  // the rehearsal is a popup at the end of the route panel: point at its button
  { id: 'walk', before: onMap('route'), targets: () => [$('#rt-walk') || $('#right-panel')] },
];

/** @param {{enterMap:()=>void, goHome:()=>void}} hooks */
export function initTour(hooks) {
  app = hooks;
}

export function isTourRunning() {
  return index >= 0;
}

export function startTour() {
  if (!app) return;
  go(0);
}

function end(finished) {
  index = -1;
  closeGenie();
  // finishing leaves the user on the site step, ready to choose
  if (finished && getState() === 'dashboard') setStep('site');
}

function go(i) {
  index = i;
  const step = STEPS[i];
  step.before?.();
  const last = i === STEPS.length - 1;
  const actions = [];
  if (i > 0) actions.push({ label: t('tour.prev'), onClick: () => go(i - 1) });
  else actions.push({ label: t('tour.skip'), onClick: () => end(false) });
  actions.push({ label: last ? t('tour.done') : t('tour.next'), primary: true, onClick: () => (last ? end(true) : go(i + 1)) });
  // let the screen change (start ↔ map, guide step) before measuring the targets
  requestAnimationFrame(() => {
    if (index !== i) return;
    showGenie(
      {
        topic: `tour:${step.id}`,
        title: t(`tour.${step.id}.title`),
        text: t(`tour.${step.id}.text`),
        step: t('tour.step', { i: i + 1, n: STEPS.length }),
        dim: step.dim,
        actions,
        onClose: () => {
          index = -1;
        },
      },
      step.targets().filter(Boolean)
    );
  });
}
