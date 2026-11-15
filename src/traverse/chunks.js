/**
 * Streaming ground for the first-person route rehearsal.
 *
 * The world is cut into square chunks (CHUNK m) in the local frame of the
 * route start (x = east, z = −north, y = height above the start). Around
 * the walker three rings are kept:
 *   - ACTIVE  (≤ activeRadius chunks): built and drawn,
 *   - PRELOAD (≤ preloadRadius): loading or loaded, drawn but already inside
 *     the fog, so their arrival is never noticed,
 *   - beyond DROP: freed (geometry, textures, rocks).
 * Chunks ahead on the route are loaded first. Each chunk has real heights
 * at its vertices (Mars Trek terrain, shared edges between neighbours,
 * skirts hide level changes), the sharpest real image that covers it
 * (HiRISE/CTX, tinted with the local Viking colour) and, where the image is
 * sharp enough, real boulders detected from their shadows.
 */
import * as THREE from 'three';
import { toLatLon } from '../geo/mars.js';
import { loadPatchGrid, loadImageryMosaic, bestOpticalLayer } from '../geo/trek.js';
import { vikingColorAt } from '../geo/vikingColor.js';
import { detectRocks } from '../planner/rocks.js';
import { placeRocks } from '../surface/rocks.js';
import { disposeObject } from '../core/renderer.js';
import { MARS_TINT } from '../config.js';
import { createRng } from '../core/rng.js';

export const CHUNK = 160;

let bumpTex = null;
function microBump(textures) {
  if (!bumpTex) {
    bumpTex = textures.groundBump.clone();
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(CHUNK / 3, CHUNK / 3);
    bumpTex.needsUpdate = true;
    bumpTex.userData.shared = true;
  }
  return bumpTex;
}
const SEGMENTS = 80; // 2 m vertex spacing
const IMAGE_PX = 512;
const MAX_LOADS = 4;

/**
 * Rocks smaller than one image pixel cannot be seen from orbit; their
 * number is extrapolated from the detected boulders with a power law
 * (Golombek & Rapp 1997 style: many more small rocks than big ones).
 */
export function smallRocks(centre, seed, boulderCount, measured) {
  const rng = createRng(seed + 17);
  const count = Math.round(Math.min(700, measured ? 90 + boulderCount * 14 : 160));
  const out = [];
  for (let k = 0; k < count; k++) {
    const u = rng();
    const d = Math.min(0.5, 0.05 / Math.sqrt(1 - u * 0.97));
    out.push({ x: centre.e - CHUNK / 2 + rng() * CHUNK, z: -(centre.n - CHUNK / 2 + rng() * CHUNK), d });
  }
  return out;
}

/** Chunk index containing a local position. */
export function chunkOf(x, z) {
  return { i: Math.round(x / CHUNK) + 0, j: Math.round(-z / CHUNK) + 0 };
}

/** Chunks (by index) within a radius (in chunks) of a position, nearest first. */
export function chunksAround(x, z, radius) {
  const c = chunkOf(x, z);
  const out = [];
  const r = Math.ceil(radius);
  for (let dj = -r; dj <= r; dj++)
    for (let di = -r; di <= r; di++) {
      const i = c.i + di;
      const j = c.j + dj;
      const d = Math.hypot(i * CHUNK - x, j * CHUNK + z) / CHUNK;
      if (d <= radius) out.push({ i, j, d });
    }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * @param {{origin:{lat:number,lon:number}, baseH:number, parent:THREE.Object3D, textures:any,
 *          shadows:boolean, anisotropy:number, fallbackHeight:(x:number,z:number)=>number}} opts
 */
export function createChunkManager(opts) {
  const { origin, baseH, parent } = opts;
  const chunks = new Map();
  let active = 0;
  let tint = new THREE.Color(MARS_TINT);
  let radius = { active: 2.6, preload: 3.6, drop: 4.6 };
  let generation = 0;
  let onTint = null;
  vikingColorAt(origin.lat, origin.lon).then((c) => {
    if (!c) return;
    // keep the measured hue, normalise the brightness
    const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b || 1;
    // Viking hues are approximate: blend them with the rover-image soil hue (as on the globe)
    const mix = (v, w) => Math.min(1, (v / l) * 0.45 + w * 0.55) * 0.82;
    tint = new THREE.Color(mix(c.r, 1.32), mix(c.g, 0.93), mix(c.b, 0.62));
    for (const ch of chunks.values()) if (ch.mesh?.userData.tinted) ch.mesh.material.color.copy(tint);
    onTint?.(tint);
  });

  const key = (i, j) => `${i},${j}`;

  function heightIn(ch, x, z) {
    const n = SEGMENTS;
    const fx = Math.min(n, Math.max(0, (x - (ch.i * CHUNK - CHUNK / 2)) / (CHUNK / n)));
    const fy = Math.min(n, Math.max(0, (z - (-ch.j * CHUNK - CHUNK / 2)) / (CHUNK / n)));
    const i = Math.min(n - 1, Math.floor(fx));
    const j = Math.min(n - 1, Math.floor(fy));
    const u = fx - i;
    const v = fy - j;
    const s = n + 1;
    const d = ch.heights;
    return (
      d[j * s + i] * (1 - u) * (1 - v) + d[j * s + i + 1] * u * (1 - v) + d[(j + 1) * s + i] * (1 - u) * v + d[(j + 1) * s + i + 1] * u * v
    );
  }

  /** Height (m above the route start) at a local position. */
  function height(x, z) {
    const c = chunkOf(x, z);
    const ch = chunks.get(key(c.i, c.j));
    if (ch?.heights) return heightIn(ch, x, z);
    return opts.fallbackHeight(x, z);
  }

  function buildMesh(ch, image, imageLayer, mpp) {
    const n = SEGMENTS;
    const s = n + 1;
    const step = CHUNK / n;
    const count = s * s + 4 * s;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const k = j * s + i;
        pos[k * 3] = -CHUNK / 2 + i * step;
        pos[k * 3 + 1] = ch.heights[k];
        pos[k * 3 + 2] = -CHUNK / 2 + j * step; // row 0 = north = −z
        uv[k * 2] = i / n;
        uv[k * 2 + 1] = 1 - j / n;
      }
    const index = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * s + i;
        index.push(a, a + s, a + 1, a + 1, a + s, a + s + 1);
      }
    // skirts (hide cracks between chunks built from different terrain levels)
    let w = s * s;
    const edges = [
      Array.from({ length: s }, (_, i) => i),
      Array.from({ length: s }, (_, i) => n * s + i),
      Array.from({ length: s }, (_, j) => j * s),
      Array.from({ length: s }, (_, j) => j * s + n),
    ];
    for (const edge of edges) {
      const start = w;
      for (const k of edge) {
        pos[w * 3] = pos[k * 3];
        pos[w * 3 + 1] = pos[k * 3 + 1] - 4;
        pos[w * 3 + 2] = pos[k * 3 + 2];
        uv[w * 2] = uv[k * 2];
        uv[w * 2 + 1] = uv[k * 2 + 1];
        w++;
      }
      for (let q = 0; q < s - 1; q++) index.push(edge[q], edge[q + 1], start + q, edge[q + 1], start + q + 1, start + q);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    let material;
    let tinted = false;
    if (image && mpp <= 8) {
      const map = new THREE.CanvasTexture(image);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = opts.anisotropy;
      tinted = !!imageLayer?.grayscale;
      material = new THREE.MeshStandardMaterial({ map, roughness: 0.97, metalness: 0, color: tinted ? tint : 0xffffff });
      // Sub-pixel grain (generic, illustrative) so the ground does not look smeared at your feet
      material.bumpMap = microBump(opts.textures);
      material.bumpScale = 2.2;
    } else {
      // No sharp orbital image here: generic soil texture tinted with the real local colour
      const map = opts.textures.groundColor.clone();
      map.userData.shared = false;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(CHUNK / 24, CHUNK / 24);
      map.needsUpdate = true;
      tinted = true;
      material = new THREE.MeshStandardMaterial({ map, roughness: 0.97, metalness: 0, color: tint });
    }
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(ch.i * CHUNK, 0, -ch.j * CHUNK);
    mesh.receiveShadow = opts.shadows;
    mesh.userData.tinted = tinted;
    return mesh;
  }

  async function load(ch) {
    active++;
    const gen = generation;
    try {
      const centre = { e: ch.i * CHUNK, n: ch.j * CHUNK };
      const ll = toLatLon(centre.e, centre.n, origin);
      const layer = bestOpticalLayer(ll.lat, ll.lon, CHUNK * 1.5);
      const [terrain, imagery] = await Promise.all([
        loadPatchGrid(origin, centre, CHUNK, SEGMENTS, { signal: ch.ctrl.signal }),
        layer.grayscale
          ? loadImageryMosaic(
              layer,
              (() => {
                const a = toLatLon(centre.e - CHUNK / 2, centre.n - CHUNK / 2, origin);
                const b = toLatLon(centre.e + CHUNK / 2, centre.n + CHUNK / 2, origin);
                return { west: a.lon, east: b.lon, south: a.lat, north: b.lat };
              })(),
              { targetPx: IMAGE_PX, maxTiles: 24, signal: ch.ctrl.signal }
            ).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (gen !== generation || ch.state === 'dropped') return;
      const heights = new Float32Array(terrain.grid.data.length);
      for (let k = 0; k < heights.length; k++) heights[k] = terrain.grid.data[k] - baseH;
      ch.heights = heights;
      ch.level = terrain.level;
      ch.mpp = imagery?.metresPerPixel ?? null;
      ch.layer = imagery ? layer : null;
      ch.mesh = buildMesh(ch, imagery?.canvas, layer, imagery?.metresPerPixel ?? Infinity);
      ch.root = new THREE.Group();
      ch.root.add(ch.mesh);
      // Real boulders (shadows in HiRISE images)
      ch.colliders = [];
      const seed = Math.abs((ch.i * 73856093) ^ (ch.j * 19349663)) % 100000;
      let boulders = [];
      if (imagery && imagery.metresPerPixel <= 1.2) {
        const ctx = imagery.canvas.getContext('2d', { willReadFrequently: true });
        const { data, width, height: hh } = ctx.getImageData(0, 0, imagery.canvas.width, imagery.canvas.height);
        boulders = detectRocks(data, width, hh, imagery.metresPerPixel).map((r) => {
          const x = centre.e - CHUNK / 2 + (r.x / width) * CHUNK;
          const z = -(centre.n + CHUNK / 2 - (r.y / hh) * CHUNK);
          return { x, z, d: r.d };
        });
        ch.rocks = boulders.length;
        ch.rocksMeasured = true;
      }
      // Pebbles and cobbles below the image resolution: power-law sizes (cumulative ∝ D⁻²),
      // count scaled from the boulders actually detected here (estimate, see METHODOLOGY)
      const pebbles = smallRocks(centre, seed, boulders.length, ch.rocksMeasured).slice(0, opts.lowDetail ? 120 : Infinity);
      ch.pebbles = pebbles.length;
      const terrainFn = { height: (x, z) => heightIn(ch, x, z) };
      const all = boulders.concat(pebbles);
      if (all.length) {
        const rocks = placeRocks(ch.root, terrainFn, opts.textures, all, {
          castShadow: opts.shadows,
          exclusions: opts.exclusions || [],
          seed,
          minRadius: 0.03,
        });
        ch.colliders = rocks.colliders;
      }
      parent.add(ch.root);
      ch.state = 'ready';
      opts.onChunk?.(ch);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.warn('[chunks] failed', ch.i, ch.j, err);
        ch.state = 'failed';
        ch.failedAt = performance.now();
      }
    } finally {
      active--;
    }
  }

  function drop(ch) {
    ch.state = 'dropped';
    ch.ctrl.abort();
    if (ch.root) {
      parent.remove(ch.root);
      disposeObject(ch.root);
    }
    ch.root = null;
    ch.mesh = null;
    chunks.delete(key(ch.i, ch.j));
  }

  return {
    height,
    gradient(x, z) {
      const e = 0.75;
      return {
        gx: (height(x + e, z) - height(x - e, z)) / (2 * e),
        gz: (height(x, z + e) - height(x, z - e)) / (2 * e),
      };
    },
    /**
     * @param {number} x player position
     * @param {number} z
     * @param {{x:number,z:number}[]} ahead route points ahead of the player (loaded first)
     */
    update(x, z, ahead = []) {
      const want = new Map();
      for (const c of chunksAround(x, z, radius.preload)) want.set(key(c.i, c.j), c.d);
      for (const p of ahead) {
        const c = chunkOf(p.x, p.z);
        const k = key(c.i, c.j);
        const d = Math.hypot(c.i * CHUNK - x, c.j * CHUNK + z) / CHUNK;
        if (d <= radius.preload + 1.5 && !want.has(k)) want.set(k, d + 0.5);
      }
      for (const [k, d] of want) {
        if (chunks.has(k)) continue;
        const [i, j] = k.split(',').map(Number);
        chunks.set(k, { i, j, d, state: 'new', ctrl: new AbortController(), colliders: [] });
      }
      for (const ch of [...chunks.values()]) {
        ch.d = Math.hypot(ch.i * CHUNK - x, ch.j * CHUNK + z) / CHUNK;
        if (ch.d > radius.drop) drop(ch);
        else if (ch.state === 'failed' && performance.now() - ch.failedAt > 8000) ch.state = 'new';
      }
      const pending = [...chunks.values()].filter((c) => c.state === 'new').sort((a, b) => a.d - b.d);
      for (const ch of pending) {
        if (active >= MAX_LOADS) break;
        ch.state = 'loading';
        load(ch);
      }
    },
    /** True when the chunk under a position is ready. */
    /** True when chunk (i, j) is built. */
    isReady(i, j) {
      return chunks.get(key(i, j))?.state === 'ready';
    },
    get tint() {
      return tint;
    },
    setOnTint(fn) {
      onTint = fn;
    },
    readyAt(x, z) {
      const c = chunkOf(x, z);
      return chunks.get(key(c.i, c.j))?.state === 'ready';
    },
    chunkAt(x, z) {
      const c = chunkOf(x, z);
      return chunks.get(key(c.i, c.j)) || null;
    },
    /** Rock colliders of the chunks around a position. */
    collidersNear(x, z) {
      const out = [];
      const c = chunkOf(x, z);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ch = chunks.get(key(c.i + di, c.j + dj));
          if (ch?.colliders?.length) out.push(...ch.colliders);
        }
      return out;
    },
    stats() {
      let ready = 0;
      let loading = 0;
      for (const ch of chunks.values()) {
        if (ch.state === 'ready') ready++;
        else if (ch.state === 'loading' || ch.state === 'new') loading++;
      }
      return { ready, loading, total: chunks.size };
    },
    /** Guaranteed visibility radius (m): fog must close before it. */
    get visibleRadius() {
      return (radius.active - 0.72) * CHUNK;
    },
    setRadius(r) {
      radius = { ...radius, ...r };
    },
    dispose() {
      generation++;
      for (const ch of [...chunks.values()]) drop(ch);
    },
  };
}
