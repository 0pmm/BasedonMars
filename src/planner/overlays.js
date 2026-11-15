/**
 * Turns analysis rasters into overlay images (canvas, grid resolution)
 * and defines the legends shown for each one.
 */
import { contours } from '../geo/heightGrid.js';

/** Colour ramps: [stop 0..1, r, g, b]. */
export const RAMPS = {
  elevation: [
    [0, 40, 30, 150],
    [0.25, 40, 150, 210],
    [0.5, 60, 190, 90],
    [0.75, 235, 210, 70],
    [1, 220, 60, 40],
  ],
  slope: [
    [0, 30, 160, 70],
    [0.33, 235, 220, 60],
    [0.66, 240, 130, 40],
    [1, 200, 30, 40],
  ],
  roughness: [
    [0, 30, 60, 140],
    [0.5, 230, 200, 70],
    [1, 220, 40, 60],
  ],
};

export function rampColor(stops, v) {
  const x = Math.max(0, Math.min(1, v));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0] || 1);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3]];
}

export function cssGradient(stops) {
  return `linear-gradient(90deg, ${stops.map((s) => `rgb(${s[1]},${s[2]},${s[3]}) ${Math.round(s[0] * 100)}%`).join(', ')})`;
}

function rasterCanvas(size, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let k = 0; k < size * size; k++) {
    const rgba = fill(k);
    if (!rgba) continue;
    img.data.set(rgba, k * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Elevation colour map. */
export function elevationOverlay(site) {
  const { min, max } = site.stats;
  const span = max - min || 1;
  return rasterCanvas(site.grid.size, (k) => [...rampColor(RAMPS.elevation, (site.grid.data[k] - min) / span), 200]);
}

/** Slope map (0 → limit+). */
export function slopeOverlay(site, limit) {
  return rasterCanvas(site.grid.size, (k) => [...rampColor(RAMPS.slope, site.slope[k] / (limit * 1.5)), 190]);
}

/** Roughness map (0 → limit). */
export function roughnessOverlay(site, limit) {
  return rasterCanvas(site.grid.size, (k) => [...rampColor(RAMPS.roughness, site.roughness[k] / limit), 185]);
}

/** Hazards: red where the suit/rover limits are exceeded. */
export function hazardOverlay(site, trav) {
  return rasterCanvas(site.grid.size, (k) => (trav.blocked[k] ? [230, 40, 50, 170] : [40, 200, 90, 40]));
}

/** Shadow mask for the selected time. */
export function shadowOverlay(site, mask) {
  return rasterCanvas(site.grid.size, (k) => (mask[k] ? [10, 15, 40, 165] : null));
}

/** Radio coverage from the habitat mast. */
export function viewshedOverlay(site, vis) {
  return rasterCanvas(site.grid.size, (k) => (vis[k] ? [60, 200, 255, 70] : [255, 70, 70, 120]));
}

/** Contour lines (vector, drawn on a larger canvas for crisp lines). */
export function contourOverlay(site, interval) {
  const scale = 4;
  const size = site.grid.size;
  const c = document.createElement('canvas');
  c.width = c.height = size * scale;
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round';
  for (const lvl of contours(site.grid, interval)) {
    ctx.strokeStyle = lvl.major ? 'rgba(255,235,200,0.95)' : 'rgba(255,235,200,0.5)';
    ctx.lineWidth = lvl.major ? 2.4 : 1.1;
    ctx.beginPath();
    const s = lvl.segs;
    for (let i = 0; i < s.length; i += 4) {
      ctx.moveTo((s[i] + 0.5) * scale, (s[i + 1] + 0.5) * scale);
      ctx.lineTo((s[i + 2] + 0.5) * scale, (s[i + 3] + 0.5) * scale);
    }
    ctx.stroke();
  }
  return c;
}

/** Pick a "nice" contour interval for an elevation span. */
export function niceInterval(span) {
  const target = span / 12;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= target) ?? 1000;
}
