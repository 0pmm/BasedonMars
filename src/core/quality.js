/**
 * Device capability detection → default quality tier.
 */
import { QUALITY_PRESETS } from '../config.js';
import { getSettings } from './settings.js';

let detected = null;

/** True on touch-first devices (phones/tablets). */
export function isTouchDevice() {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

/** True on iOS, where the Fullscreen API is not available for pages. */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/**
 * Heuristic device tier.
 * @param {number} [maxTextureSize]
 * @returns {'low'|'medium'|'high'}
 */
export function detectTier(maxTextureSize = 8192) {
  if (detected) return detected;
  const memory = /** @type {any} */ (navigator).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (isTouchDevice() || memory <= 2 || cores <= 2 || maxTextureSize < 4096) detected = 'low';
  else if (memory <= 4 || cores <= 4) detected = 'medium';
  else detected = 'high';
  return detected;
}

/**
 * Effective quality preset after resolving "auto".
 * @param {number} [maxTextureSize]
 */
export function getQualityName(maxTextureSize) {
  const q = getSettings().quality;
  if (q !== 'auto' && QUALITY_PRESETS[q]) return q;
  return detectTier(maxTextureSize);
}

/** @param {number} [maxTextureSize] */
export function getQuality(maxTextureSize) {
  const name = getQualityName(maxTextureSize);
  const preset = { ...QUALITY_PRESETS[name] };
  // Never request a texture the GPU cannot hold.
  if (preset.planetTexture === '8k' && maxTextureSize && maxTextureSize < 8192) preset.planetTexture = '4k';
  if (preset.planetTexture === '4k' && maxTextureSize && maxTextureSize < 4096) preset.planetTexture = '2k';
  return preset;
}
