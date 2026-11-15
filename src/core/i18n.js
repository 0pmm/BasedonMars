/**
 * Internationalisation (English / Brazilian Portuguese).
 *
 * - UI strings live in src/i18n/{en,pt}.js as flat "section.key" maps.
 * - Static HTML uses data-i18n="key" (text) and
 *   data-i18n-attr="aria-label:key;title:key" (attributes).
 * - Content data (locations, narrative) stores { en, pt } objects,
 *   resolved with `tr()`.
 */
import en from '../i18n/en.js';
import pt from '../i18n/pt.js';
import { emit } from './events.js';

export const DICTIONARIES = Object.freeze({ en, pt });
export const LANGUAGES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português (Brasil)' },
]);

let current = 'en';

/** Resolve "auto" using the browser language. */
export function resolveLanguage(pref) {
  if (pref && pref !== 'auto' && DICTIONARIES[pref]) return pref;
  const nav = (globalThis.navigator?.language || 'en').toLowerCase();
  return nav.startsWith('pt') ? 'pt' : 'en';
}

/** @param {string} pref "auto" | "en" | "pt" */
export function setLanguage(pref) {
  current = resolveLanguage(pref);
  if (globalThis.document) document.documentElement.lang = current === 'pt' ? 'pt-BR' : 'en';
  emit('language:change', current);
  return current;
}

export function getLanguage() {
  return current;
}

/** Locale tag for Intl APIs. */
export function getLocale() {
  return current === 'pt' ? 'pt-BR' : 'en-US';
}

/**
 * Translate a UI key. Missing keys fall back to English, then to the key.
 * @param {string} key
 * @param {Record<string, string|number>} [vars] values for {placeholders}
 */
export function t(key, vars) {
  const str = DICTIONARIES[current]?.[key] ?? DICTIONARIES.en[key] ?? key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/**
 * Resolve a localised content value ({en, pt} object or plain string).
 * @param {string | Record<string,string> | undefined} value
 */
export function tr(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[current] ?? value.en ?? '';
}

/** Apply translations to every annotated element under `root`. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
