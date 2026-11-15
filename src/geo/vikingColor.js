/**
 * Real surface colour at a point, read from NASA's Viking MDIM 2.1 colour
 * mosaic (Mars Trek, ~232 m/px). Used to tint the greyscale HiRISE/CTX
 * images in first person so the ground has the measured local hue instead
 * of a fixed "Mars orange".
 */
import { findLayer, layerTileUrl, loadImage } from './trek.js';
import { tileDeg } from './tiles.js';

const Z = 6;
const cache = new Map();

function tileCanvas(row, col) {
  const key = `${row}/${col}`;
  if (!cache.has(key)) {
    const p = loadImage(layerTileUrl(findLayer('viking'), Z, row, col)).then((img) => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/**
 * Average colour (sRGB 0..1) of a 5×5-pixel window (~1.2 km) at a point.
 * @returns {Promise<{r:number,g:number,b:number}|null>}
 */
export async function vikingColorAt(lat, lon) {
  try {
    const d = tileDeg(Z);
    const col = Math.floor((lon + 180) / d);
    const row = Math.floor((90 - lat) / d);
    const ctx = await tileCanvas(row, col);
    const x = Math.floor((((lon + 180) / d) % 1) * 256);
    const y = Math.floor((((90 - lat) / d) % 1) * 256);
    const data = ctx.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
  } catch {
    return null;
  }
}
