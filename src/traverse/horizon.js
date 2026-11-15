/**
 * Distant ground for the first-person rehearsal, so the view reaches the
 * real horizon instead of a fog wall.
 *
 * Two lower-resolution rings surround the detailed chunks:
 *   - MID: 3.2 km square, ~20 m vertices, sharpest image that covers it
 *     (HiRISE/CTX where available),
 *   - FAR: 40 km square, ~200 m vertices, CTX / THEMIS-IR / Viking.
 * Each ring is re-centred on the walker when they move away and is hidden
 * (discarded in the shader) wherever a finer layer is ready: a mask texture
 * marks the loaded chunks, and the far ring is cut out under the mid ring.
 * Vertices are dropped by d²/2R in the vertex shader so the ground curves
 * away with the real radius of Mars (~60 m at 20 km).
 */
import * as THREE from 'three';
import { toLatLon } from '../geo/mars.js';
import { loadPatchGrid, loadImageryMosaic, findLayer, TREK_CATALOG } from '../geo/trek.js';
import { MARS_SPHERE_RADIUS_M } from '../geo/mars.js';
import { CHUNK } from './chunks.js';

const MASK = 33; // chunks per side covered by the mask (centred on the walker)

const RINGS = [
  { name: 'mid', size: 3200, n: 160, imagePx: 2048, recenter: 700, maxTiles: 120, maxImageTiles: 140, drop: 0.6 },
  { name: 'far', size: 40000, n: 200, imagePx: 2048, recenter: 7000, maxTiles: 100, maxImageTiles: 160, drop: 3 },
];

/** Image layer that covers a whole bbox, sharpest first. */
export function layerForBox(bbox) {
  const inside = (l) => !l.bbox || (bbox.west >= l.bbox[0] && bbox.south >= l.bbox[1] && bbox.east <= l.bbox[2] && bbox.north <= l.bbox[3]);
  const regional = TREK_CATALOG.regional.filter((l) => l.kind === 'optical' && l.grayscale && inside(l)).sort((a, b) => b.maxZ - a.maxZ);
  if (regional.length) return regional[0];
  if (bbox.south > -65 && bbox.north < 65) return findLayer('themisDay');
  return findLayer('viking');
}

export function createHorizon({ origin, baseH, parent, anisotropy, getTint, lowDetail = false }) {
  const maskData = new Uint8Array(MASK * MASK);
  const mask = new THREE.DataTexture(maskData, MASK, MASK, THREE.RedFormat, THREE.UnsignedByteType);
  mask.magFilter = mask.minFilter = THREE.NearestFilter;
  mask.needsUpdate = true;
  const shared = {
    uMask: { value: mask },
    uMaskOrigin: { value: new THREE.Vector2() }, // chunk index (i0, j0) of mask texel (0,0)
    uChunk: { value: CHUNK },
    uCam: { value: new THREE.Vector3() },
    uCurv: { value: 1 / (2 * MARS_SPHERE_RADIUS_M) },
  };
  const state = RINGS.map((r) => ({
    ...r,
    ...(lowDetail ? { n: Math.round(r.n * 0.6), imagePx: 1024 } : {}),
    mesh: null,
    loading: false,
    center: null,
    failedAt: 0,
  }));

  function patchMaterial(material, ring) {
    material.userData.square = { value: new THREE.Vector3(0, 0, 0) }; // x, z, half (cut-out of the finer ring)
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, { uSquare: material.userData.square });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uCam;
          uniform float uCurv;
          varying vec2 vWorldXZ;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          vec2 dxz = wp.xz - uCam.xz;
          transformed.y -= dot(dxz, dxz) * uCurv + ${ring.drop.toFixed(2)};
          vWorldXZ = wp.xz;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uMask;
          uniform vec2 uMaskOrigin;
          uniform float uChunk;
          uniform vec3 uSquare;
          varying vec2 vWorldXZ;`
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec2 ci = floor(vec2(vWorldXZ.x + uChunk * 0.5, -vWorldXZ.y + uChunk * 0.5) / uChunk) - uMaskOrigin;
          if (ci.x >= 0.0 && ci.y >= 0.0 && ci.x < ${MASK}.0 && ci.y < ${MASK}.0) {
            if (texture2D(uMask, (ci + 0.5) / ${MASK}.0).r > 0.5) discard;
          }
          if (uSquare.z > 0.0 && abs(vWorldXZ.x - uSquare.x) < uSquare.z && abs(vWorldXZ.y - uSquare.y) < uSquare.z) discard;`
        );
    };
    material.customProgramCacheKey = () => `horizon-${ring.name}`;
  }

  async function load(ring, x, z) {
    ring.loading = true;
    try {
      const centre = { e: x, n: -z };
      const a = toLatLon(centre.e - ring.size / 2, centre.n - ring.size / 2, origin);
      const b = toLatLon(centre.e + ring.size / 2, centre.n + ring.size / 2, origin);
      const bbox = { west: a.lon, east: b.lon, south: a.lat, north: b.lat };
      const layer = layerForBox(bbox);
      const [terrain, imagery] = await Promise.all([
        loadPatchGrid(origin, centre, ring.size, ring.n, { maxTiles: ring.maxTiles }),
        loadImageryMosaic(layer, bbox, { targetPx: ring.imagePx, maxTiles: ring.maxImageTiles }).catch(() => null),
      ]);
      const n = ring.n;
      const s = n + 1;
      const step = ring.size / n;
      const pos = new Float32Array(s * s * 3);
      const uv = new Float32Array(s * s * 2);
      for (let j = 0; j < s; j++)
        for (let i = 0; i < s; i++) {
          const k = j * s + i;
          pos[k * 3] = -ring.size / 2 + i * step;
          pos[k * 3 + 1] = terrain.grid.data[k] - baseH;
          pos[k * 3 + 2] = -ring.size / 2 + j * step;
          uv[k * 2] = i / n;
          uv[k * 2 + 1] = 1 - j / n;
        }
      const index = [];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const q = j * s + i;
          index.push(q, q + s, q + 1, q + 1, q + s, q + s + 1);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      let map = null;
      if (imagery?.canvas) {
        map = new THREE.CanvasTexture(imagery.canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = anisotropy;
      }
      const material = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.98,
        metalness: 0,
        color: !map || layer.grayscale ? getTint() : 0xffffff,
      });
      material.userData.grey = !map || layer.grayscale;
      patchMaterial(material, ring);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, 0, z);
      mesh.frustumCulled = false;
      mesh.receiveShadow = false;
      if (ring.mesh) {
        parent.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        ring.mesh.material.map?.dispose();
        ring.mesh.material.dispose();
      }
      ring.mesh = mesh;
      ring.center = { x, z };
      ring.layer = imagery ? layer : null;
      ring.mpp = imagery?.metresPerPixel ?? null;
      parent.add(mesh);
    } catch (err) {
      console.warn('[horizon] ring failed', ring.name, err);
      ring.failedAt = performance.now();
    } finally {
      ring.loading = false;
    }
  }

  return {
    /**
     * @param {number} x walker
     * @param {number} z
     * @param {THREE.Vector3} cam camera position
     * @param {(i:number, j:number)=>boolean} chunkReady
     */
    update(x, z, cam, chunkReady) {
      shared.uCam.value.copy(cam);
      // mask of ready chunks around the walker
      const ci = Math.round(x / CHUNK);
      const cj = Math.round(-z / CHUNK);
      const i0 = ci - (MASK >> 1);
      const j0 = cj - (MASK >> 1);
      shared.uMaskOrigin.value.set(i0, j0);
      for (let j = 0; j < MASK; j++) for (let i = 0; i < MASK; i++) maskData[j * MASK + i] = chunkReady(i0 + i, j0 + j) ? 255 : 0;
      mask.needsUpdate = true;
      // re-centre rings
      for (const ring of state) {
        if (ring.loading || performance.now() - ring.failedAt < 10000) continue;
        if (!ring.center || Math.hypot(ring.center.x - x, ring.center.z - z) > ring.recenter) {
          const snap = ring.recenter / 2;
          load(ring, Math.round(x / snap) * snap, Math.round(z / snap) * snap);
        }
      }
      // far ring is cut out under the mid ring (minus a margin so they overlap at the seam)
      const [mid, far] = state;
      if (far.mesh) far.mesh.material.userData.square.value.set(mid.center?.x ?? 0, mid.center?.z ?? 0, mid.mesh ? mid.size / 2 - 120 : 0);
    },
    setTint(c) {
      for (const r of state) if (r.mesh?.material.userData.grey) r.mesh.material.color.copy(c);
    },
    info() {
      return state.map((r) => ({ name: r.name, ready: !!r.mesh, layer: r.layer?.instrument ?? null, mpp: r.mpp }));
    },
    dispose() {
      for (const r of state) {
        if (!r.mesh) continue;
        parent.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.map?.dispose();
        r.mesh.material.dispose();
        r.mesh = null;
      }
      mask.dispose();
    },
  };
}
