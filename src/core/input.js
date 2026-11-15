/**
 * Unified input manager: keyboard (remappable), mouse + pointer lock,
 * gamepad and the on-screen touch controls all feed the same actions.
 *
 * Game code only asks: isDown('jump'), moveAxis(), consumeLook().
 * One-shot presses are broadcast as `input:action` events.
 */
import { emit } from './events.js';
import { getSettings } from './settings.js';
import { isTypingTarget } from './dom.js';
import { clamp } from './math.js';

const MOUSE_BASE = 0.0026;
const GAMEPAD_LOOK = 2.6; // rad/s at full deflection
const DEADZONE = 0.18;

const keys = new Set();
const virtual = new Map(); // action → pressed (touch buttons)
let touchMove = { x: 0, y: 0 };
const look = { dx: 0, dy: 0 };
let canvasEl = null;
let enabled = true;
let gamepadPrev = {};
let captureResolver = null;

/** @returns {string | null} action bound to a key code */
function actionForCode(code) {
  const b = getSettings().bindings;
  for (const [action, codes] of Object.entries(b)) if (codes.includes(code)) return action;
  return null;
}

export function initInput(canvas) {
  canvasEl = canvas;

  window.addEventListener('keydown', (e) => {
    if (captureResolver) {
      e.preventDefault();
      const resolve = captureResolver;
      captureResolver = null;
      resolve(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (isTypingTarget(e.target)) return;
    const action = actionForCode(e.code);
    if (action && enabled && ['forward', 'back', 'left', 'right', 'jump'].includes(action) && isGameplayFocus()) {
      e.preventDefault();
    }
    if (e.code === 'F1') e.preventDefault();
    keys.add(e.code);
    if (!e.repeat && action) emit('input:action', { action, source: 'keyboard' });
    if (!e.repeat && e.code === 'Escape') emit('input:escape');
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    virtual.clear();
  });

  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvasEl) return;
    look.dx += e.movementX * MOUSE_BASE;
    look.dy += e.movementY * MOUSE_BASE;
  });

  document.addEventListener('pointerlockchange', () => {
    emit('input:pointerlock', { locked: document.pointerLockElement === canvasEl });
  });
}

/** True while the canvas (not a form field / button) has the user's attention. */
function isGameplayFocus() {
  const a = document.activeElement;
  return !a || a === document.body || a === canvasEl;
}

export function setInputEnabled(value) {
  enabled = value;
  if (!value) {
    keys.clear();
    virtual.clear();
    touchMove = { x: 0, y: 0 };
  }
}

/** @param {string} action */
export function isDown(action) {
  if (!enabled) return false;
  if (virtual.get(action)) return true;
  const codes = getSettings().bindings[action] || [];
  for (const c of codes) if (keys.has(c)) return true;
  return !!gamepadPrev[action];
}

/**
 * Movement intent: x = strafe right (+), y = forward (+), length ≤ 1.
 * @returns {{x:number, y:number}}
 */
export function moveAxis() {
  if (!enabled) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  if (isDown('forward')) y += 1;
  if (isDown('back')) y -= 1;
  if (isDown('right')) x += 1;
  if (isDown('left')) x -= 1;
  x += touchMove.x;
  y += touchMove.y;
  const pad = readGamepadAxes();
  x += pad.lx;
  y -= pad.ly;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

/**
 * Accumulated look delta since the last call (radians), already scaled by
 * sensitivity and inversion settings.
 */
export function consumeLook(dt = 0) {
  const s = getSettings();
  const pad = readGamepadAxes();
  look.dx += pad.rx * GAMEPAD_LOOK * dt;
  look.dy += pad.ry * GAMEPAD_LOOK * dt;
  const out = {
    dx: look.dx * s.mouseSensitivity,
    dy: look.dy * s.mouseSensitivity * (s.invertY ? -1 : 1),
  };
  look.dx = 0;
  look.dy = 0;
  return enabled ? out : { dx: 0, dy: 0 };
}

/* ---------- Touch controls API ---------- */
export function setTouchMove(x, y) {
  touchMove = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
}
export function addLook(dx, dy) {
  look.dx += dx;
  look.dy += dy;
}
/** @param {string} action @param {boolean} down */
export function setVirtualAction(action, down) {
  const was = virtual.get(action);
  virtual.set(action, down);
  if (down && !was) emit('input:action', { action, source: 'touch' });
}

/* ---------- Pointer lock ---------- */
export function requestPointerLock() {
  if (!canvasEl?.requestPointerLock || document.pointerLockElement === canvasEl) return;
  try {
    const p = canvasEl.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* not allowed (e.g. no user gesture) */
  }
}
export function exitPointerLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
export function isPointerLocked() {
  return document.pointerLockElement === canvasEl;
}

/* ---------- Gamepad ---------- */
function getPad() {
  try {
    return [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected) || null;
  } catch {
    return null;
  }
}
function dz(v) {
  return Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}
function readGamepadAxes() {
  const pad = getPad();
  if (!pad) return { lx: 0, ly: 0, rx: 0, ry: 0 };
  return { lx: dz(pad.axes[0] || 0), ly: dz(pad.axes[1] || 0), rx: dz(pad.axes[2] || 0), ry: dz(pad.axes[3] || 0) };
}

/** Standard-mapping buttons → actions. */
const PAD_BUTTONS = { 0: 'jump', 2: 'interact', 1: 'speedUp', 4: 'sprint', 10: 'sprint', 9: 'pause', 8: 'help', 3: 'map' };

/** Poll the gamepad once per frame and emit presses. */
export function updateInput() {
  const pad = getPad();
  if (!pad) {
    gamepadPrev = {};
    return;
  }
  const now = {};
  for (const [idx, action] of Object.entries(PAD_BUTTONS)) {
    if (pad.buttons[idx]?.pressed) now[action] = true;
  }
  for (const action of Object.keys(now)) {
    if (!gamepadPrev[action] && enabled) emit('input:action', { action, source: 'gamepad' });
  }
  gamepadPrev = now;
}

/**
 * Wait for the next key press (used by the key-remapping UI).
 * Resolves with the key code, or null when Escape cancels.
 * @returns {Promise<string|null>}
 */
export function captureNextKey() {
  return new Promise((resolve) => {
    captureResolver = resolve;
  });
}

/** Human-readable key label. */
export function keyLabel(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('ShiftLeft', 'Shift')
    .replace('ShiftRight', 'Shift R')
    .replace('Slash', '?')
    .replace('Space', 'Space');
}
