/**
 * Tiny publish/subscribe event bus used to decouple modules.
 * Modules never call each other's internals directly for cross-cutting
 * concerns (logging, settings changes, achievements, sound captions...).
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string} event
 * @param {(payload: any) => void} handler
 * @returns {() => void} unsubscribe function
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

/**
 * @param {string} event
 * @param {(payload: any) => void} handler
 */
export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/**
 * Emit an event. Handler errors are isolated so one faulty listener
 * never breaks the others.
 * @param {string} event
 * @param {any} [payload]
 */
export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[events] handler for "${event}" failed`, err);
    }
  }
}

/** Removes every listener (used by tests). */
export function clearAllListeners() {
  listeners.clear();
}
