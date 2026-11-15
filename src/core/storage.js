/**
 * Safe wrapper around localStorage. Every access is guarded: private
 * windows, blocked storage or quota errors simply fall back to defaults.
 */
const PREFIX = 'mars-explorer:';

/** @returns {Storage | null} */
function backend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function load(key, fallback) {
  try {
    const raw = backend()?.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean} whether it was persisted
 */
export function save(key, value) {
  try {
    backend()?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** @param {string} key */
export function remove(key) {
  try {
    backend()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
