/**
 * CPU texture generation for the surface (ground + rock). Pure: runs in a
 * Web Worker (textures.worker.js) and falls back to the main thread.
 * Output: RGBA byte arrays for colour and bump maps.
 */
import { fractalNoise, hashNoise, intHash, samplePalette, tileableNoise } from '../core/noise.js';

/**
 * Seamless (tileable) ground texture.
 * @param {number} size power of two
 * @param {number} seed
 */
export function generateGround(size = 512, seed = 41) {
  const color = new Uint8ClampedArray(size * size * 4);
  const bump = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = tileableNoise(x, y, size, 4, 6, seed);
      const fine = tileableNoise(x, y, size, 3, 48, seed + 9);
      let v = broad * 0.65 + fine * 0.35;
      const pebble = intHash(x, y, seed + 77);
      let b = v * 200;
      if (pebble > 0.993) {
        v *= 0.55; // dark pebble
        b = 255;
      } else if (pebble < 0.004) {
        v = Math.min(1, v * 1.25); // light grain
        b = 230;
      }
      const [r, g, bl] = samplePalette(0.3 + v * 0.55);
      const i = (y * size + x) * 4;
      color[i] = r;
      color[i + 1] = g;
      color[i + 2] = bl;
      color[i + 3] = 255;
      bump[i] = bump[i + 1] = bump[i + 2] = b;
      bump[i + 3] = 255;
    }
  }
  return { size, color, bump };
}

/**
 * Vesicular basalt rock texture.
 * @param {number} size
 */
export function generateRock(size = 256) {
  const color = new Uint8ClampedArray(size * size * 4);
  const bump = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = fractalNoise(x, y, 5, 30, 911);
      const n2 = fractalNoise(x * 2.2, y * 2.2, 3, 14, 433);
      const v = n1 * 0.7 + n2 * 0.3;
      const micro = (hashNoise(x, y, 77) - 0.5) * 30;
      const vesicle = hashNoise(x * 0.5, y * 0.5, 13) > 0.985;
      let r;
      let g;
      let b;
      if (v < 0.4) [r, g, b] = [34 + v * 80, 22 + v * 50, 18 + v * 30];
      else if (v < 0.7) [r, g, b] = [66 + (v - 0.4) * 330, 42 + (v - 0.4) * 145, 30 + (v - 0.4) * 75];
      else [r, g, b] = [165 + (v - 0.7) * 170, 86 + (v - 0.7) * 180, 52 + (v - 0.7) * 145];
      if (vesicle) [r, g, b] = [16, 10, 7];
      const i = (y * size + x) * 4;
      color[i] = r + micro * 0.4;
      color[i + 1] = g + micro * 0.3;
      color[i + 2] = b + micro * 0.2;
      color[i + 3] = 255;
      const bv = vesicle ? 0 : v * 230 + micro;
      bump[i] = bump[i + 1] = bump[i + 2] = bv;
      bump[i + 3] = 255;
    }
  }
  return { size, color, bump };
}
