/**
 * Procedural Mars texture — only generated as a FALLBACK when the
 * photographic texture fails to load (offline, blocked, missing file).
 * Uses the corrected equirectangular mapping (see lonLatToPixel).
 */
import * as THREE from 'three';
import { domainWarpNoise, fractalNoise, samplePalette } from '../core/noise.js';
import { lonLatToPixel } from '../core/math.js';
import { createRng } from '../core/rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function region(ctx, w, h, lon, lat, rx, ry, color, alpha, blend) {
  const p = lonLatToPixel(lon, lat, w, h);
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(rx, ry));
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** @returns {THREE.CanvasTexture} */
export function buildProceduralMarsTexture(w = 2048, h = 1024) {
  const rng = createRng(7);
  const low = canvas(256, 128);
  const img = low.ctx.createImageData(256, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 256; x++) {
      const [r, g, b] = samplePalette(domainWarpNoise(x * 1.2, y * 1.2, 7));
      const i = (y * 256 + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  low.ctx.putImageData(img, 0, 0);

  const { c, ctx } = canvas(w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(low.c, 0, 0, w, h);

  // Albedo regions (Syrtis Major dark, Hellas bright, Tharsis bright, Acidalia dark)
  region(ctx, w, h, 70, 8, w * 0.078, h * 0.115, 'rgba(40,26,19,1)', 0.44, 'multiply');
  region(ctx, w, h, 70, -42, w * 0.09, h * 0.15, 'rgba(230,198,170,1)', 0.34, 'screen');
  region(ctx, w, h, -110, 5, w * 0.145, h * 0.17, 'rgba(206,154,112,1)', 0.19, 'screen');
  region(ctx, w, h, -25, 46, w * 0.095, h * 0.085, 'rgba(48,32,24,1)', 0.28, 'multiply');

  // Craters
  for (let i = 0; i < 260; i++) {
    const x = rng() * w;
    const y = (rng() * 0.86 + 0.07) * h;
    const r = 1.3 + Math.pow(rng(), 3) * w * 0.03;
    const g = ctx.createRadialGradient(x + r * 0.2, y + r * 0.2, 0, x, y, r);
    g.addColorStop(0, 'rgba(30,16,11,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Valles Marineris
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let lon = -104; lon <= -26; lon += 1.5) {
    const lat = -13 + Math.sin(lon * 0.055) * 3.6;
    const p = lonLatToPixel(lon, lat, w, h);
    if (lon === -104) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = 'rgba(25,12,8,0.55)';
  ctx.lineWidth = h * 0.03;
  ctx.stroke();

  // Tharsis volcanoes
  for (const [lon, lat, r] of [
    [-133.8, 18.65, 0.05],
    [-113, 9, 0.025],
    [-104, 0, 0.023],
    [-120, -8, 0.024],
  ]) {
    const p = lonLatToPixel(lon, lat, w, h);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, w * r);
    g.addColorStop(0, 'rgba(228,195,165,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, w * r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Polar caps
  for (const north of [true, false]) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * w;
      const n = (fractalNoise(x * 0.5, north ? 0 : 99, 3, 48, 11) - 0.5) * 2;
      const extent = h * 0.06 * (0.7 + 0.4 * n);
      const y = north ? extent : h - extent;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, north ? 0 : h);
    ctx.lineTo(0, north ? 0 : h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,244,250,0.92)';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
