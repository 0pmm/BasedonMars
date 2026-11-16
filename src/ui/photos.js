/**
 * Real photos from the NASA Image and Video Library API.
 * - request timeout (AbortController)
 * - response validation: only https URLs on *.nasa.gov hosts are used
 * - in-memory cache, retry button, small gallery with lightbox
 */
import { ALLOWED_IMAGE_HOST_SUFFIX, NASA_IMAGES_API, NASA_IMAGES_DETAILS, PHOTO_TIMEOUT_MS } from '../config.js';
import { h, clear } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { openDialog } from './modal.js';

/** @type {Map<string, Promise<PhotoItem[]>>} */
const cache = new Map();

/** @typedef {{src:string, title:string, nasaId:string, center?:string, date?:string}} PhotoItem */

/** Returns true for https URLs on an allowed NASA host. */
export function isAllowedImageUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'nasa.gov' || u.hostname.endsWith(ALLOWED_IMAGE_HOST_SUFFIX));
  } catch {
    return false;
  }
}

/** Parse and validate the API response into a safe list. */
export function parseNasaResponse(json, limit = 6) {
  const items = json?.collection?.items;
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    const link = Array.isArray(it?.links) ? it.links.find((l) => l?.render === 'image' || l?.href) : null;
    const meta = Array.isArray(it?.data) ? it.data[0] : null;
    if (!link || !meta || !isAllowedImageUrl(link.href)) continue;
    const nasaId = typeof meta.nasa_id === 'string' && /^[\w.-]{1,120}$/.test(meta.nasa_id) ? meta.nasa_id : '';
    out.push({
      src: link.href,
      title: String(meta.title || '').slice(0, 160),
      nasaId,
      center: typeof meta.center === 'string' ? meta.center.slice(0, 40) : undefined,
      date: typeof meta.date_created === 'string' ? meta.date_created.slice(0, 10) : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * @param {string} query
 * @returns {Promise<PhotoItem[]>}
 */
export function fetchNasaPhotos(query) {
  if (cache.has(query)) return cache.get(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS);
  const url = `${NASA_IMAGES_API}?q=${encodeURIComponent(query)}&media_type=image`;
  const p = fetch(url, { signal: controller.signal, referrerPolicy: 'no-referrer', credentials: 'omit' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((json) => parseNasaResponse(json))
    .finally(() => clearTimeout(timer));
  cache.set(query, p);
  p.catch(() => cache.delete(query)); // allow retry
  return p;
}

function openLightbox(item) {
  openDialog({
    title: item.title || t('photo.title'),
    wide: true,
    body: [
      h('img', {
        attrs: { src: item.src, alt: item.title, referrerpolicy: 'no-referrer' },
        style: { width: '100%', borderRadius: '10px' },
      }),
      h(
        'p.photo-caption',
        null,
        [item.center, item.date].filter(Boolean).join(' · '),
        item.nasaId ? ' · ' : '',
        item.nasaId
          ? h(
              'a',
              { attrs: { href: NASA_IMAGES_DETAILS + encodeURIComponent(item.nasaId), target: '_blank', rel: 'noopener noreferrer' } },
              t('photo.viewOnNasa')
            )
          : null
      ),
    ],
  });
}

/**
 * Render a photo gallery for a query into a container.
 * @param {HTMLElement} container
 * @param {string} query
 * @param {{gallery?: boolean}} [opts]
 */
export function renderPhotos(container, query, { gallery = true } = {}) {
  const token = Symbol('photo');
  container._photoToken = token;
  clear(container);
  const frame = h('figure.photo-frame.loading', { attrs: { 'aria-busy': 'true' } });
  const caption = h('figcaption.photo-caption', null, t('photo.searching'));
  container.append(frame, caption);

  fetchNasaPhotos(query)
    .then((items) => {
      if (container._photoToken !== token) return;
      frame.classList.remove('loading');
      frame.removeAttribute('aria-busy');
      if (!items.length) {
        frame.append(h('div.photo-fallback', null, h('span', null, t('photo.none'))));
        caption.textContent = t('photo.noneCaption');
        return;
      }
      const show = (item, btn) => {
        clear(frame);
        const img = h('img', {
          attrs: { src: item.src, alt: item.title || t('photo.title'), loading: 'lazy', referrerpolicy: 'no-referrer' },
          on: { click: () => openLightbox(item) },
          style: { cursor: 'zoom-in' },
        });
        frame.append(img);
        caption.textContent = `${item.title} — ${t('photo.source')}`;
        thumbs?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b === btn)));
      };
      let thumbs = null;
      if (gallery && items.length > 1) {
        thumbs = h(
          'div.thumbs',
          { attrs: { role: 'list', 'aria-label': t('photo.gallery') } },
          items.map((item, i) => {
            const b = h(
              'button',
              { attrs: { type: 'button', role: 'listitem', 'aria-label': `${t('photo.title')} ${i + 1}: ${item.title}` } },
              h('img', { attrs: { src: item.src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } })
            );
            b.addEventListener('click', () => show(item, b));
            return b;
          })
        );
        container.append(thumbs);
      }
      show(items[0], thumbs?.querySelector('button'));
    })
    .catch(() => {
      if (container._photoToken !== token) return;
      frame.classList.remove('loading');
      frame.removeAttribute('aria-busy');
      frame.append(
        h(
          'div.photo-fallback',
          null,
          h('span', null, t('photo.error')),
          h(
            'button.btn',
            { attrs: { type: 'button' }, on: { click: () => renderPhotos(container, query, { gallery }) } },
            t('common.retry')
          )
        )
      );
      caption.textContent = t('photo.noneCaption');
    });
}
