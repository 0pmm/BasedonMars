/**
 * User feedback primitives: toasts, screen-reader announcements and
 * sound captions.
 */
import { h, $ } from '../core/dom.js';
import { t } from '../core/i18n.js';

/**
 * Show a toast notification.
 * @param {string} text
 * @param {{type?: 'info'|'success'|'warn'|'error'|'achievement', duration?: number}} [opts]
 */
export function toast(text, { type = 'info', duration = 3800 } = {}) {
  const root = $('#toasts');
  if (!root) return;
  const el = h('div.toast', { class: type, attrs: { role: type === 'error' ? 'alert' : 'status' } }, text);
  root.append(el);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(() => el.remove(), duration);
}

/** Announce a message to screen readers only. */
export function announce(text) {
  const el = $('#announcer');
  if (!el) return;
  el.textContent = '';
  // Re-set on next frame so identical consecutive messages are re-read
  requestAnimationFrame(() => (el.textContent = text));
}

/** Show a short visual caption for a sound (accessibility). */
export function caption(key) {
  const root = $('#captions');
  if (!root || root.closest('[hidden]')) return;
  const el = h('div.caption', null, `[${t(key)}]`);
  root.append(el);
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => el.remove(), 2600);
}
