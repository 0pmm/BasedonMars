/**
 * Streaming terrain globe (Google-Earth style level of detail).
 *
 * Mars is drawn as a quadtree of tiles in the Mars Trek geographic tiling
 * (level z: 2^(z+1) × 2^z tiles). Each tile is a regular vertex grid with
 * REAL heights from the Mars Trek quantized-mesh terrain (or its finest
 * ancestor) and a texture made of:
 *   - colour: Viking MDIM 2.1 colour mosaic (≤ level 7, ~232 m/px),
 *   - detail: the sharpest greyscale image that covers the tile (HiRISE
 *     25 cm, CTX 6 m, THEMIS-IR 100 m); its brightness modulates the Viking
 *     colour ("pan-sharpening"), so colours stay real and detail is added,
 *   - overlay: the selected data layer (THEMIS, geology, TES…) or a layer
 *     computed in the shader (slope, elevation, no-go zones, contours).
 * Tiles are refined while one texel covers more than ~1.4 pixels, so the
 * view goes smoothly from the whole planet down to metre-scale ground.
 *
 * Scene units: the globe lives in the tilted planet frame of orbitView,
 * radius ORBIT.planetRadius. Tile meshes are positioned at their centre
 * (relative-to-centre vertices) so float precision holds down to the ground.
 */
import * as THREE from 'three';
import { ORBIT } from '../config.js';
import { latLonToXYZ, xyzToLatLon } from '../core/math.js';
import { MARS_SPHERE_RADIUS_M, TREK_HEIGHT_OFFSET_M } from '../geo/mars.js';
import { terrainAvailability, fetchTerrainTile, findLayer, layerTileUrl, loadImage, TREK_CATALOG } from '../geo/trek.js';
import {
  tileBounds,
  ancestorAt,
  childrenOf,
  terrainLevelFor,
  sampleMeshGrid,
  sampleTileGrid,
  gridSlopes,
  needsRefine,
  meshSlopeRaster,
} from '../geo/tileHeights.js';

export const UNITS_PER_M = ORBIT.planetRadius / MARS_SPHERE_RADIUS_M;
const N = 32; // segments per tile side
const MIN_LEVEL = 2;
const MAX_LOADS = 8;
const COLOR_LAYER = 'viking';
const COLOR_MAX_Z = 7;
const THEMIS = { id: 'themisDay', south: -65, north: 65 };

/** Overlay modes understood by the tile shader. */
export const OVERLAY_MODES = { none: 0, texture: 1, slope: 2, elevation: 3, hazard: 4, contours: 5 };

const VERT = /* glsl */ `
  attribute float aHeight;
  attribute float aSlope;
  varying vec2 vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3 vNormal;
  varying vec3 vDir;
  varying float vDist;
  void main() {
    vUv = uv;
    vHeight = aHeight;
    vSlope = aSlope;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D colorMap;
  uniform vec4 colorXf;
  uniform sampler2D detailMap;
  uniform vec4 detailXf;
  uniform float detailMean;
  uniform float hasDetail;
  uniform sampler2D overlayMap;
  uniform vec4 overlayXf;
  uniform float hasOverlay;
  uniform int overlayMode;
  uniform float overlayOpacity;
  uniform float slopeLimit;
  uniform sampler2D slopeMap;
  uniform float hasSlopeMap;
  uniform vec2 elevRange;
  uniform float contourStep;
  uniform vec3 sunDir;
  uniform float localLight;
  uniform mat3 frameRot;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 highlight;
  varying vec2 vUv;
  varying float vHeight;
  varying float vSlope;
  varying vec3 vNormal;
  varying vec3 vDir;
  varying float vDist;

  vec3 ramp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.13, 0.22, 0.75);
    vec3 b = vec3(0.16, 0.66, 0.85);
    vec3 c = vec3(0.24, 0.78, 0.35);
    vec3 d = vec3(0.93, 0.88, 0.25);
    vec3 e = vec3(0.90, 0.30, 0.16);
    if (t < 0.25) return mix(a, b, t / 0.25);
    if (t < 0.5) return mix(b, c, (t - 0.25) / 0.25);
    if (t < 0.75) return mix(c, d, (t - 0.5) / 0.25);
    return mix(d, e, (t - 0.75) / 0.25);
  }

  void main() {
    // slope from the full NASA mesh (max per pixel) when available, else from the display grid
    float slope = hasSlopeMap > 0.5 ? texture2D(slopeMap, vUv).r * 63.75 : vSlope;
    vec3 col = texture2D(colorMap, colorXf.xy + vUv * colorXf.zw).rgb;
    // Viking colours are approximate (dark basalts turn purple-grey): keep the
    // real brightness pattern, pull the hue towards rover-image soil colour.
    float vl = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vl * vec3(1.32, 0.93, 0.62), 0.55);
    if (hasDetail > 0.5) {
      vec4 dt = texture2D(detailMap, detailXf.xy + vUv * detailXf.zw);
      float d = dot(dt.rgb, vec3(0.299, 0.587, 0.114));
      // no-data pixels of the mosaics (transparent or pure black) keep the colour layer
      float valid = step(0.5, dt.a) * step(0.0015, d);
      col *= mix(1.0, clamp(d / max(detailMean, 0.02), 0.15, 3.0), valid);
    }
    if (overlayMode == 1 && hasOverlay > 0.5) {
      vec3 o = texture2D(overlayMap, overlayXf.xy + vUv * overlayXf.zw).rgb;
      col = mix(col, o, overlayOpacity);
    } else if (overlayMode == 2) {
      col = mix(col, ramp(slope / (slopeLimit * 1.5)), overlayOpacity);
    } else if (overlayMode == 3) {
      col = mix(col, ramp((vHeight - elevRange.x) / max(1.0, elevRange.y - elevRange.x)), overlayOpacity);
    } else if (overlayMode == 4) {
      float over = smoothstep(slopeLimit * 0.75, slopeLimit, slope);
      col = mix(col, vec3(1.0, 0.12, 0.2), over * overlayOpacity);
    } else if (overlayMode == 5) {
      float f = abs(fract(vHeight / contourStep + 0.5) - 0.5) * contourStep;
      float w = fwidth(vHeight) * 1.2;
      float line = 1.0 - smoothstep(0.0, w, f);
      col = mix(col, vec3(1.0, 0.95, 0.75), line * overlayOpacity);
    }
    // Lighting: real Sun (whole planet) blended with a fixed north-west
    // light near the ground so relief always reads well.
    vec3 n = normalize(vNormal);
    vec3 up = normalize(vDir);
    vec3 axis = frameRot * vec3(0.0, 1.0, 0.0);
    vec3 east = normalize(cross(axis, up) + vec3(1e-6));
    vec3 north = normalize(cross(up, east));
    vec3 local = normalize(up * 0.75 + north * 0.45 - east * 0.45);
    vec3 L = normalize(mix(sunDir, local, localLight));
    float diff = max(dot(n, L), 0.0);
    float amb = mix(0.30, 0.42, localLight);
    col *= (amb + diff * mix(1.15, 0.95, localLight)) * mix(1.0, 1.55, localLight);
    float fog = 1.0 - exp(-pow(vDist * fogDensity, 2.0));
    col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/* ------------------------------------------------------------------ */
/* Texture cache (shared between tiles, evicted when unused)           */
/* ------------------------------------------------------------------ */

const textures = new Map(); // key → {promise, tex, used}
let frameNo = 0;

function texKey(layer, z, row, col) {
  return `${layer.id}/${z}/${row}/${col}`;
}

function meanLuminance(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let s = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10 || d[i] + d[i + 1] + d[i + 2] < 2) continue; // skip no-data pixels
      // sRGB → linear (the shader compares linear values)
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      s += Math.pow(l, 2.2);
      n++;
    }
    return n ? s / n : 0.2;
  } catch {
    return 0.2;
  }
}

function getTexture(layer, z, row, col) {
  const key = texKey(layer, z, row, col);
  let e = textures.get(key);
  if (!e) {
    e = { tex: null, used: frameNo, failed: false };
    e.promise = loadImage(layerTileUrl(layer, z, row, col))
      .then((img) => {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = 4;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.userData.mean = meanLuminance(img);
        tex.needsUpdate = true;
        e.tex = tex;
        return tex;
      })
      .catch(() => {
        e.failed = true;
        return null;
      });
    textures.set(key, e);
  }
  e.used = frameNo;
  return e;
}

function evictTextures() {
  if (textures.size < 900) return;
  for (const [k, e] of textures) {
    if (frameNo - e.used > 600 && e.tex) {
      e.tex.dispose();
      textures.delete(k);
    } else if (e.failed && frameNo - e.used > 600) textures.delete(k);
    if (textures.size < 700) break;
  }
}

/** UV transform of tile (z,x,y) inside its ancestor imagery tile at level za. */
function subXf(z, x, y, za) {
  const k = z - za;
  if (k <= 0) return new THREE.Vector4(0, 0, 1, 1);
  const n = 2 ** k;
  const a = ancestorAt(z, x, y, za);
  const subX = x - a.x * n;
  const subRowFromNorth = n - 1 - (y - a.y * n);
  return new THREE.Vector4(subX / n, subRowFromNorth / n, 1 / n, 1 / n);
}

/** Imagery (WMTS) row/col of a TMS tile at the same level. */
function imageryTile(z, x, y) {
  return { row: 2 ** z - 1 - y, col: x };
}

function boundsInside(b, bbox) {
  if (!bbox) return true;
  const [w, s, e, n] = bbox;
  return b.west >= w && b.east <= e && b.south >= s && b.north <= n;
}

/** Sharpest greyscale detail layer that fully covers a tile. */
function detailLayerFor(b, z) {
  const regional = TREK_CATALOG.regional
    .filter((l) => l.kind === 'optical' && l.grayscale && boundsInside(b, l.bbox))
    .sort((a, c) => c.maxZ - a.maxZ)[0];
  if (regional && z > 8) return regional;
  if (z > COLOR_MAX_Z - 1 && b.south >= THEMIS.south && b.north <= THEMIS.north) return findLayer(THEMIS.id);
  return null;
}

/* ------------------------------------------------------------------ */
/* Tiles                                                               */
/* ------------------------------------------------------------------ */

class Tile {
  constructor(z, x, y, parent) {
    this.z = z;
    this.x = x;
    this.y = y;
    this.parent = parent;
    this.children = null;
    this.bounds = tileBounds(z, x, y);
    this.state = 'new'; // new | loading | ready | failed
    this.mesh = null;
    this.heights = null;
    this.visited = 0;
    this.requested = 0;
    this.priority = 0;
    // Approximate bounds before the real heights are known
    const b = this.bounds;
    const lat = (b.south + b.north) / 2;
    const lon = (b.west + b.east) / 2;
    const c = latLonToXYZ(lat, lon, ORBIT.planetRadius);
    this.center = new THREE.Vector3(c.x, c.y, c.z);
    let r = 0;
    for (const [la, lo] of [
      [b.south, b.west],
      [b.south, b.east],
      [b.north, b.west],
      [b.north, b.east],
      [b.north, lon],
      [b.south, lon],
    ]) {
      const p = latLonToXYZ(la, lo, ORBIT.planetRadius);
      r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
    }
    this.radius = r + 25000 * UNITS_PER_M;
    this.width = ((b.east - b.west) * Math.PI * ORBIT.planetRadius * Math.max(0.05, Math.cos((lat * Math.PI) / 180))) / 180;
    this.height = ((b.north - b.south) * Math.PI * ORBIT.planetRadius) / 180;
  }

  get key() {
    return `${this.z}/${this.x}/${this.y}`;
  }
}

function buildGeometry(tile, heights) {
  const b = tile.bounds;
  const s = N + 1;
  const count = s * s + 4 * s; // grid + skirts
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const aH = new Float32Array(count);
  const aS = new Float32Array(count);
  const world = new Float64Array(s * s * 3);
  const slopes = gridSlopes(heights, N, b, MARS_SPHERE_RADIUS_M);
  let minH = Infinity;
  let maxH = -Infinity;
  for (let j = 0; j < s; j++) {
    const lat = b.north - ((b.north - b.south) * j) / N;
    for (let i = 0; i < s; i++) {
      const lon = b.west + ((b.east - b.west) * i) / N;
      const k = j * s + i;
      const hm = heights[k];
      minH = Math.min(minH, hm);
      maxH = Math.max(maxH, hm);
      const p = latLonToXYZ(lat, lon, (MARS_SPHERE_RADIUS_M + hm) * UNITS_PER_M);
      world[k * 3] = p.x;
      world[k * 3 + 1] = p.y;
      world[k * 3 + 2] = p.z;
    }
  }
  // Centre on the middle vertex (relative-to-centre precision)
  const mid = (N / 2) * s + N / 2;
  const cx = world[mid * 3];
  const cy = world[mid * 3 + 1];
  const cz = world[mid * 3 + 2];
  let radius = 0;
  for (let k = 0; k < s * s; k++) {
    const x = world[k * 3] - cx;
    const y = world[k * 3 + 1] - cy;
    const z = world[k * 3 + 2] - cz;
    pos[k * 3] = x;
    pos[k * 3 + 1] = y;
    pos[k * 3 + 2] = z;
    radius = Math.max(radius, Math.hypot(x, y, z));
    uv[k * 2] = (k % s) / N;
    uv[k * 2 + 1] = Math.floor(k / s) / N;
    aH[k] = heights[k];
    aS[k] = slopes[k];
  }
  // Normals from the grid (double precision)
  const v = (k) => [world[k * 3], world[k * 3 + 1], world[k * 3 + 2]];
  for (let j = 0; j < s; j++)
    for (let i = 0; i < s; i++) {
      const k = j * s + i;
      const l = v(j * s + Math.max(0, i - 1));
      const r = v(j * s + Math.min(N, i + 1));
      const u = v(Math.max(0, j - 1) * s + i);
      const d = v(Math.min(N, j + 1) * s + i);
      const ex = [r[0] - l[0], r[1] - l[1], r[2] - l[2]];
      const ny = [u[0] - d[0], u[1] - d[1], u[2] - d[2]];
      let nx = ex[1] * ny[2] - ex[2] * ny[1];
      let nyy = ex[2] * ny[0] - ex[0] * ny[2];
      let nz = ex[0] * ny[1] - ex[1] * ny[0];
      const len = Math.hypot(nx, nyy, nz) || 1;
      nx /= len;
      nyy /= len;
      nz /= len;
      // make it point outwards
      const p = v(k);
      if (nx * p[0] + nyy * p[1] + nz * p[2] < 0) {
        nx = -nx;
        nyy = -nyy;
        nz = -nz;
      }
      nor[k * 3] = nx;
      nor[k * 3 + 1] = nyy;
      nor[k * 3 + 2] = nz;
    }
  // Skirts: edge vertices pushed towards the planet centre hide cracks
  const skirt = Math.max(30, ((b.north - b.south) * Math.PI * MARS_SPHERE_RADIUS_M) / 180 / 40) * UNITS_PER_M;
  const edges = [
    Array.from({ length: s }, (_, i) => i), // north row
    Array.from({ length: s }, (_, i) => N * s + i), // south row
    Array.from({ length: s }, (_, j) => j * s), // west column
    Array.from({ length: s }, (_, j) => j * s + N), // east column
  ];
  let w = s * s;
  const index = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * s + i;
      const bb = a + 1;
      const c = a + s;
      const d = c + 1;
      index.push(a, c, bb, bb, c, d);
    }
  for (const edge of edges) {
    const start = w;
    for (const k of edge) {
      const px = world[k * 3];
      const py = world[k * 3 + 1];
      const pz = world[k * 3 + 2];
      const len = Math.hypot(px, py, pz);
      pos[w * 3] = px - (px / len) * skirt - cx;
      pos[w * 3 + 1] = py - (py / len) * skirt - cy;
      pos[w * 3 + 2] = pz - (pz / len) * skirt - cz;
      nor.set(nor.subarray(k * 3, k * 3 + 3), w * 3);
      uv[w * 2] = uv[k * 2];
      uv[w * 2 + 1] = uv[k * 2 + 1];
      aH[w] = aH[k];
      aS[w] = aS[k];
      w++;
    }
    for (let q = 0; q < s - 1; q++) {
      const a = edge[q];
      const bb = edge[q + 1];
      const c = start + q;
      const d = start + q + 1;
      index.push(a, bb, c, bb, d, c, a, c, bb, bb, c, d); // both windings: always visible
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aHeight', new THREE.BufferAttribute(aH, 1));
  geo.setAttribute('aSlope', new THREE.BufferAttribute(aS, 1));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  return { geo, center: new THREE.Vector3(cx, cy, cz), radius, minH, maxH };
}

/* ------------------------------------------------------------------ */
/* Globe                                                               */
/* ------------------------------------------------------------------ */

/**
 * @param {THREE.Object3D} frame tilted planet frame (orbitView.frame)
 */
export function createTerrainGlobe(frame) {
  const group = new THREE.Group();
  group.name = 'terrain-globe';
  frame.add(group);
  const roots = [new Tile(0, 0, 0, null), new Tile(0, 1, 0, null)];
  const queue = new Map();
  let active = 0;
  let available = null;
  let enabled = true;
  const blank = new THREE.DataTexture(new Uint8Array([200, 120, 80, 255]), 1, 1);
  blank.needsUpdate = true;

  const shared = {
    overlayMode: OVERLAY_MODES.none,
    overlayLayer: null,
    overlayOpacity: 0.75,
    slopeLimit: 15,
    elevRange: new THREE.Vector2(-8000, 21000),
    contourStep: 100,
    sunDir: new THREE.Vector3(1, 0, 0),
    localLight: 0,
    frameRot: new THREE.Matrix3(),
    fogColor: new THREE.Color(0xd9a87c),
    fogDensity: 0,
  };

  terrainAvailability()
    .then((a) => (available = a))
    .catch(() => (available = []));

  function makeMaterial() {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        colorMap: { value: blank },
        colorXf: { value: new THREE.Vector4(0, 0, 1, 1) },
        detailMap: { value: blank },
        detailXf: { value: new THREE.Vector4(0, 0, 1, 1) },
        detailMean: { value: 0.2 },
        hasDetail: { value: 0 },
        overlayMap: { value: blank },
        overlayXf: { value: new THREE.Vector4(0, 0, 1, 1) },
        hasOverlay: { value: 0 },
        overlayMode: { value: 0 },
        overlayOpacity: { value: shared.overlayOpacity },
        slopeLimit: { value: shared.slopeLimit },
        slopeMap: { value: blank },
        hasSlopeMap: { value: 0 },
        elevRange: { value: shared.elevRange },
        contourStep: { value: shared.contourStep },
        sunDir: { value: shared.sunDir },
        localLight: { value: 0 },
        frameRot: { value: shared.frameRot },
        fogColor: { value: shared.fogColor },
        fogDensity: { value: 0 },
        highlight: { value: new THREE.Color(0, 0, 0) },
      },
      extensions: { derivatives: true },
    });
  }

  /** Bind (or re-bind) an imagery layer to a tile uniform set. */
  function bindImagery(tile, which, layer, maxZ) {
    const u = tile.mesh.material.uniforms;
    if (!layer) {
      if (which === 'detail') u.hasDetail.value = 0;
      if (which === 'overlay') u.hasOverlay.value = 0;
      tile[`${which}Key`] = null;
      return Promise.resolve(true);
    }
    const za = Math.min(tile.z, maxZ);
    const a = ancestorAt(tile.z, tile.x, tile.y, za);
    const { row, col } = imageryTile(za, a.x, a.y);
    const key = texKey(layer, za, row, col);
    tile[`${which}Key`] = key;
    const e = getTexture(layer, za, row, col);
    const apply = (tex) => {
      if (!tile.mesh || tile[`${which}Key`] !== key) return false;
      if (!tex) {
        if (which === 'detail') u.hasDetail.value = 0;
        if (which === 'overlay') u.hasOverlay.value = 0;
        return false;
      }
      u[`${which}Map`].value = tex;
      u[`${which}Xf`].value = subXf(tile.z, tile.x, tile.y, za);
      if (which === 'detail') {
        u.hasDetail.value = 1;
        u.detailMean.value = tex.userData.mean ?? 0.2;
      }
      if (which === 'overlay') u.hasOverlay.value = 1;
      return true;
    };
    if (e.tex) return Promise.resolve(apply(e.tex));
    return e.promise.then(apply);
  }

  async function loadTile(tile) {
    tile.state = 'loading';
    active++;
    try {
      // Heights from the finest available terrain tile (or ancestor)
      let heights;
      const level = available ? terrainLevelFor(available, tile.z, tile.x, tile.y) : 0;
      tile.terrainLevel = level;
      if (level > 0 || available) {
        const a = ancestorAt(tile.z, tile.x, tile.y, level);
        try {
          const mesh = await fetchTerrainTile(a.z, a.x, a.y);
          heights = sampleMeshGrid(mesh, tileBounds(a.z, a.x, a.y), tile.bounds, N, TREK_HEIGHT_OFFSET_M);
          tile.slopeRaster = meshSlopeRaster(mesh, tileBounds(a.z, a.x, a.y), tile.bounds, 128, MARS_SPHERE_RADIUS_M);
        } catch {
          heights = null;
        }
      }
      if (!heights) {
        // Fall back to the parent's grid (or a flat datum)
        heights = new Float32Array((N + 1) ** 2);
        if (tile.parent?.heights) {
          const pb = tile.parent.bounds;
          for (let j = 0; j <= N; j++)
            for (let i = 0; i <= N; i++) {
              const lat = tile.bounds.north - ((tile.bounds.north - tile.bounds.south) * j) / N;
              const lon = tile.bounds.west + ((tile.bounds.east - tile.bounds.west) * i) / N;
              heights[j * (N + 1) + i] = sampleTileGrid(tile.parent.heights, N, pb, lat, lon);
            }
        }
      }
      const g = buildGeometry(tile, heights);
      tile.heights = heights;
      tile.minH = g.minH;
      tile.maxH = g.maxH;
      tile.center.copy(g.center);
      tile.radius = g.radius;
      const mesh = new THREE.Mesh(g.geo, makeMaterial());
      mesh.position.copy(g.center);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData.tile = tile;
      tile.mesh = mesh;
      group.add(mesh);
      if (tile.slopeRaster) {
        const st = new THREE.DataTexture(tile.slopeRaster, 128, 128, THREE.RedFormat, THREE.UnsignedByteType);
        st.magFilter = THREE.LinearFilter;
        st.minFilter = THREE.LinearFilter;
        st.needsUpdate = true;
        mesh.material.uniforms.slopeMap.value = st;
        mesh.material.uniforms.hasSlopeMap.value = 1;
        tile.slopeTex = st;
        tile.slopeRaster = null;
      }
      // Colour (required), detail and overlay (optional)
      const colour = findLayer(COLOR_LAYER);
      const colourOk = await bindImagery(tile, 'color', colour, Math.min(colour.maxZ, COLOR_MAX_Z));
      if (!colourOk && tile.parent?.mesh) {
        const pu = tile.parent.mesh.material.uniforms;
        tile.mesh.material.uniforms.colorMap.value = pu.colorMap.value;
      }
      const detail = detailLayerFor(tile.bounds, tile.z);
      tile.detailLayer = detail;
      bindImagery(tile, 'detail', detail, detail?.maxZ ?? 0);
      applyOverlayToTile(tile);
      tile.state = 'ready';
    } catch (err) {
      console.warn('[globe] tile failed', tile.key, err);
      tile.state = 'failed';
      tile.failedAt = frameNo;
    } finally {
      active--;
    }
  }

  function applyOverlayToTile(tile) {
    if (!tile.mesh) return;
    const u = tile.mesh.material.uniforms;
    u.overlayMode.value = shared.overlayMode;
    if (shared.overlayMode === OVERLAY_MODES.texture && shared.overlayLayer)
      bindImagery(tile, 'overlay', shared.overlayLayer, shared.overlayLayer.maxZ);
    else u.hasOverlay.value = 0;
  }

  function disposeTile(tile) {
    if (tile.children) tile.children.forEach(disposeTile);
    tile.children = null;
    if (tile.mesh) {
      group.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      tile.mesh.material.dispose();
      tile.slopeTex?.dispose();
      tile.slopeTex = null;
      tile.mesh = null;
    }
    tile.heights = null;
    tile.state = 'new';
    queue.delete(tile);
  }

  function maxLevelFor(tile) {
    const terrainMax = tile.terrainLevel ?? 0;
    const detail = tile.detailLayer ?? detailLayerFor(tile.bounds, Math.max(tile.z, 9));
    return Math.min(19, Math.max(terrainMax, detail?.maxZ ?? COLOR_MAX_Z, COLOR_MAX_Z + 2) + 1);
  }

  const tmpSphere = new THREE.Sphere();
  const tmpV = new THREE.Vector3();
  const visible = [];
  let lastSig = 0;
  let version = 0;

  function request(tile, priority) {
    if (tile.state !== 'new') return;
    tile.requested = frameNo;
    tile.priority = priority;
    queue.set(tile, tile);
  }

  function pump() {
    if (!queue.size) return;
    const list = [...queue.values()].filter((t) => frameNo - t.requested < 3 && t.state === 'new');
    queue.clear();
    list.sort((a, b) => b.priority - a.priority);
    for (const t of list) {
      if (active >= MAX_LOADS) {
        queue.set(t, t);
        continue;
      }
      loadTile(t);
    }
  }

  /**
   * Select and show the tiles for this frame.
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} screenHeight
   */
  function update(camera, screenHeight) {
    frameNo++;
    if (!enabled) return;
    visible.length = 0;
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    );
    frame.updateMatrixWorld();
    const toLocal = frame.matrixWorld.clone().invert();
    const camLocal = camera.position.clone().applyMatrix4(toLocal);
    const camDist = camLocal.length();
    const fov = (camera.fov * Math.PI) / 180;
    const R = ORBIT.planetRadius;
    // Horizon: points with dot(p, cam) < R² (approx.) are hidden
    const horizonCos = Math.min(1, (R * 0.985) / Math.max(camDist, R));

    const visit = (tile) => {
      tile.visited = frameNo;
      tmpSphere.center.copy(tile.center).applyMatrix4(frame.matrixWorld);
      tmpSphere.radius = tile.radius;
      if (!frustum.intersectsSphere(tmpSphere)) return;
      // Behind the horizon?
      if (tile.z >= 2) {
        const c = tmpV.copy(tile.center);
        const cosA = c.dot(camLocal) / (c.length() * camDist);
        const angR = tile.radius / R;
        if (Math.acos(Math.min(1, Math.max(-1, cosA))) - angR > Math.acos(horizonCos) + 0.02) return;
      }
      const dist = Math.max(1e-9, camLocal.distanceTo(tile.center) - tile.radius);
      const wantRefine =
        tile.z < MIN_LEVEL || (tile.z < maxLevelFor(tile) && needsRefine(Math.max(tile.width, tile.height), dist, screenHeight, fov, 1.4));
      if (wantRefine) {
        tile.children ??= childrenOf(tile.z, tile.x, tile.y).map((c) => new Tile(c.z, c.x, c.y, tile));
        for (const c of tile.children) {
          if (c.state === 'failed' && frameNo - (c.failedAt ?? 0) > 300) c.state = 'new'; // retry later
          if (c.state === 'new') request(c, 1 / dist + c.z * 0.01);
        }
        if (tile.children.every((c) => c.state === 'ready') || (tile.state !== 'ready' && tile.z < MIN_LEVEL)) {
          for (const c of tile.children) if (c.state === 'ready' || c.children) visit(c);
          if (tile.children.every((c) => c.state === 'ready')) return;
        }
      }
      if (tile.state === 'ready') visible.push(tile);
      else request(tile, 10 + 1 / dist);
    };
    for (const r of roots) visit(r);
    for (const r of roots) hideAll(r);
    // Elevation / contour layers adapt to the heights in view
    if ((shared.overlayMode === OVERLAY_MODES.elevation || shared.overlayMode === OVERLAY_MODES.contours) && visible.length) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const t of visible) {
        lo = Math.min(lo, t.minH);
        hi = Math.max(hi, t.maxH);
      }
      const k = 0.08;
      shared.elevRange.x += (lo - shared.elevRange.x) * k;
      shared.elevRange.y += (hi - shared.elevRange.y) * k;
      const span = Math.max(5, shared.elevRange.y - shared.elevRange.x);
      const raw = span / 14;
      const mag = 10 ** Math.floor(Math.log10(raw));
      const nice = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) || 10 * mag;
      shared.contourStep = nice;
    }
    let sig = visible.length;
    for (const t of visible) sig = (sig * 31 + t.z * 7 + t.x * 13 + t.y) % 1000000007;
    if (sig !== lastSig) {
      lastSig = sig;
      version++;
    }
    for (const t of visible) {
      t.mesh.visible = true;
      const u = t.mesh.material.uniforms;
      u.localLight.value = shared.localLight;
      u.fogDensity.value = shared.fogDensity;
      u.overlayOpacity.value = shared.overlayOpacity;
      u.slopeLimit.value = shared.slopeLimit;
      u.contourStep.value = shared.contourStep;
      // keep textures alive
      for (const k of [t.colorKey, t.detailKey, t.overlayKey]) if (k && textures.has(k)) textures.get(k).used = frameNo;
    }
    pump();
    if (frameNo % 120 === 0) prune();
  }

  function hideAll(tile) {
    if (tile.mesh) tile.mesh.visible = false;
    if (tile.children) for (const c of tile.children) hideAll(c);
  }

  function prune() {
    let loaded = 0;
    const walk = (t) => {
      if (t.mesh) loaded++;
      t.children?.forEach(walk);
    };
    roots.forEach(walk);
    const limit = loaded > 900 ? 60 : 600;
    const visitPrune = (t) => {
      if (!t.children) return;
      if (frameNo - t.visited > limit && t.z >= MIN_LEVEL) {
        t.children.forEach(disposeTile);
        t.children = null;
        return;
      }
      t.children.forEach(visitPrune);
    };
    roots.forEach(visitPrune);
    evictTextures();
  }

  /** Deepest loaded tile containing a point. */
  function tileAt(lat, lon) {
    let t = roots[lon < 0 ? 0 : 1];
    let best = t.state === 'ready' ? t : null;
    while (t.children) {
      const next = t.children.find((c) => lat >= c.bounds.south && lat <= c.bounds.north && lon >= c.bounds.west && lon <= c.bounds.east);
      if (!next || next.state !== 'ready') break;
      t = next;
      best = t;
    }
    return best;
  }

  return {
    group,
    update,
    /** Terrain height (m above the datum) at a point, from the finest loaded tile. */
    heightAt(lat, lon) {
      const t = tileAt(lat, lon);
      return t?.heights ? sampleTileGrid(t.heights, N, t.bounds, lat, lon) : null;
    },
    /** Height (m) of the tile actually drawn at a point (what the eye sees now). */
    displayedHeightAt(lat, lon) {
      for (const t of visible) {
        const b = t.bounds;
        if (lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east && t.heights)
          return sampleTileGrid(t.heights, N, b, lat, lon);
      }
      return null;
    },
    /** Changes whenever the set of drawn tiles changes. */
    get version() {
      return version;
    },
    /** Level of the finest loaded tile at a point. */
    levelAt(lat, lon) {
      return tileAt(lat, lon)?.z ?? 0;
    },
    /** Meshes drawn this frame (for picking). */
    visibleMeshes() {
      return visible.map((t) => t.mesh);
    },
    /** Lat/lon of a world-space hit point. */
    hitToLatLon(point) {
      const local = frame.worldToLocal(point.clone());
      return xyzToLatLon(local.x, local.y, local.z);
    },
    setEnabled(on) {
      enabled = on;
      group.visible = on;
    },
    get pending() {
      return active + queue.size;
    },
    /** Sun direction in the planet frame. */
    setSun(dirLocal) {
      shared.sunDir.copy(dirLocal).normalize();
    },
    setFrameRotation(m3) {
      shared.frameRot.copy(m3);
    },
    /** 0 = real Sun only, 1 = fixed relief light (close to the ground). */
    setLocalLight(v) {
      shared.localLight = v;
    },
    setFog(color, density) {
      shared.fogColor.copy(color);
      shared.fogDensity = density;
    },
    /**
     * Overlay: 'none', a Trek layer id, or a computed layer
     * ('slope' | 'elevation' | 'hazard' | 'contours').
     */
    setOverlay(id, opts = {}) {
      if (opts.opacity != null) shared.overlayOpacity = opts.opacity;
      if (opts.slopeLimit != null) shared.slopeLimit = opts.slopeLimit;
      if (opts.contourStep != null) shared.contourStep = opts.contourStep;
      if (opts.elevRange) shared.elevRange.set(opts.elevRange[0], opts.elevRange[1]);
      if (id !== undefined) {
        if (id === 'none') {
          shared.overlayMode = OVERLAY_MODES.none;
          shared.overlayLayer = null;
        } else if (OVERLAY_MODES[id] != null) {
          shared.overlayMode = OVERLAY_MODES[id];
          shared.overlayLayer = null;
        } else {
          shared.overlayMode = OVERLAY_MODES.texture;
          shared.overlayLayer = findLayer(id);
        }
        const walk = (t) => {
          applyOverlayToTile(t);
          t.children?.forEach(walk);
        };
        roots.forEach(walk);
      }
    },
    get overlay() {
      return { ...shared };
    },
  };
}
