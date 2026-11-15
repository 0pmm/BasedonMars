/**
 * User settings: defaults, persistence and change notifications.
 */
import { emit } from './events.js';
import { load, save } from './storage.js';

export const DEFAULT_BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'KeyF'],
  speedUp: ['BracketRight', 'Equal', 'NumpadAdd'],
  speedDown: ['BracketLeft', 'Minus', 'NumpadSubtract'],
  pause: ['KeyP'],
  map: ['KeyM'],
  screenshot: ['KeyK'],
  help: ['Slash', 'F1'],
});

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'auto', // auto | en | pt
  units: 'metric', // metric | imperial
  quality: 'auto', // auto | low | medium | high | ultra
  mouseSensitivity: 1,
  invertY: false,
  masterVolume: 0.8,
  sfxVolume: 0.8,
  ambientVolume: 0.6,
  musicVolume: 0.4,
  muted: false,
  soundCaptions: true,
  reducedMotion: 'auto', // auto | on | off
  highContrast: false,
  fontScale: 1, // 1 | 1.15 | 1.3
  helmetOverlay: true,
  showMinimap: true,
  showFps: false,
  autoRotate: true,
  bindings: DEFAULT_BINDINGS,
});

let settings = structuredCloneSafe(DEFAULT_SETTINGS);

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Loads persisted settings, filling missing keys with defaults. */
export function initSettings() {
  const stored = load('settings', {});
  settings = {
    ...structuredCloneSafe(DEFAULT_SETTINGS),
    ...stored,
    bindings: { ...structuredCloneSafe(DEFAULT_BINDINGS), ...(stored.bindings || {}) },
  };
  return settings;
}

/** @returns {typeof DEFAULT_SETTINGS} */
export function getSettings() {
  return settings;
}

/**
 * Merge a patch into the settings, persist and notify.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  save('settings', settings);
  emit('settings:change', { settings, patch });
}

export function resetSettings() {
  settings = structuredCloneSafe(DEFAULT_SETTINGS);
  save('settings', settings);
  emit('settings:change', { settings, patch: settings });
}

/** Resolves the "auto" reduced motion setting using the OS preference. */
export function prefersReducedMotion() {
  if (settings.reducedMotion === 'on') return true;
  if (settings.reducedMotion === 'off') return false;
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
