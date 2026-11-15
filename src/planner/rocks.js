/**
 * Boulder detection from orbital imagery (pure, unit-tested).
 *
 * In HiRISE images boulders larger than ~0.5 m show up as compact dark
 * blobs (their shadows) much darker than the surrounding regolith. We
 * flag pixels darker than the local mean by k standard deviations, group
 * them into connected blobs and estimate a diameter from the blob area.
 * This is the same principle as the automated rock counts used for
 * landing-site safety (e.g. Golombek et al. 2012), in a simplified form —
 * positions are real, sizes are estimates.
 */

/**
 * @param {Uint8ClampedArray} rgba ImageData pixels
 * @param {number} width
 * @param {number} height
 * @param {number} metresPerPixel
 * @param {{window?:number, k?:number, minPx?:number, maxPx?:number, maxRocks?:number}} [opts]
 * @returns {{x:number, y:number, d:number}[]} pixel centre + diameter (m)
 */
export function detectRocks(rgba, width, height, metresPerPixel, opts = {}) {
  const win = opts.window ?? 15;
  const k = opts.k ?? 2.2;
  const minPx = opts.minPx ?? 2;
  const maxPx = opts.maxPx ?? Math.max(6, Math.round((6 / metresPerPixel) ** 2));
  const maxRocks = opts.maxRocks ?? 1500;
  const n = width * height;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) gray[i] = 0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2];
  // Integral images for local mean / variance
  const W = width + 1;
  const sum = new Float64Array(W * (height + 1));
  const sum2 = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    let row2 = 0;
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x];
      row += v;
      row2 += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
      sum2[(y + 1) * W + x + 1] = sum2[y * W + x + 1] + row2;
    }
  }
  const r = Math.floor(win / 2);
  const dark = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      const s2 = sum2[y1 * W + x1] - sum2[y0 * W + x1] - sum2[y1 * W + x0] + sum2[y0 * W + x0];
      const mean = s / area;
      const sd = Math.sqrt(Math.max(1, s2 / area - mean * mean));
      const v = gray[y * width + x];
      if (v < mean - k * sd && v < mean * 0.8 && rgba[(y * width + x) * 4 + 3] > 0) dark[y * width + x] = 1;
    }
  }
  // Connected components (4-neighbour flood fill)
  const rocks = [];
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!dark[start]) continue;
    dark[start] = 0;
    stack.push(start);
    let count = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      count++;
      sx += x;
      sy += y;
      if (x > 0 && dark[p - 1]) (dark[p - 1] = 0), stack.push(p - 1);
      if (x < width - 1 && dark[p + 1]) (dark[p + 1] = 0), stack.push(p + 1);
      if (y > 0 && dark[p - width]) (dark[p - width] = 0), stack.push(p - width);
      if (y < height - 1 && dark[p + width]) (dark[p + width] = 0), stack.push(p + width);
    }
    if (count < minPx || count > maxPx) continue;
    const d = 2 * Math.sqrt(count / Math.PI) * metresPerPixel * 1.2;
    rocks.push({ x: sx / count, y: sy / count, d });
  }
  rocks.sort((a, b) => b.d - a.d);
  return rocks.slice(0, maxRocks);
}

/** Rock density (rocks ≥ dMin per 100 m²). */
export function rockDensity(rocks, areaM2, dMin = 0.5) {
  if (!areaM2) return 0;
  return (rocks.filter((r) => r.d >= dMin).length / areaM2) * 100;
}
