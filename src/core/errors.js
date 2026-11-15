/**
 * Global error capture: uncaught errors and promise rejections are logged
 * to the console and to the in-app mission log, and the user gets a single
 * friendly toast instead of a silently broken page. Nothing is sent to any
 * external service (privacy by default).
 */
import { emit } from './events.js';
import { load, save } from './storage.js';

const MAX_STORED = 20;
const seen = new Set();

function record(message, source) {
  const entry = { message: String(message).slice(0, 300), source, at: new Date().toISOString() };
  const list = load('errors', []);
  list.push(entry);
  save('errors', list.slice(-MAX_STORED));
  emit('log', { type: 'system', text: `⚠️ ${entry.message}` });
  if (!seen.has(entry.message)) {
    seen.add(entry.message);
    emit('error:captured', entry);
  }
}

export function initErrorCapture() {
  window.addEventListener('error', (e) => {
    // Resource loading errors (img/script) bubble without a message.
    if (!e.message) return;
    console.error('[uncaught]', e.error || e.message);
    record(e.message, 'error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    console.error('[unhandled rejection]', e.reason);
    record(reason, 'promise');
  });
}

/** Last captured errors (shown in Settings → About for bug reports). */
export function getStoredErrors() {
  return load('errors', []);
}

export function clearStoredErrors() {
  save('errors', []);
}

/**
 * Wrap a UI handler so a failure is reported instead of silently ignored.
 * @template {(...args: any[]) => any} F
 * @param {F} fn
 * @param {string} label
 * @returns {F}
 */
export function safe(fn, label) {
  return /** @type {F} */ (
    (...args) => {
      try {
        return fn(...args);
      } catch (err) {
        console.error(`[safe] ${label}`, err);
        record(`${label}: ${err?.message ?? err}`, 'handler');
        return undefined;
      }
    }
  );
}
