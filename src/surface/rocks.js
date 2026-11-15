/**
 * Rocks rendered with InstancedMesh: a handful of shared deformed base
 * shapes × 3 materials, instanced hundreds of times (few draw calls).
 * Returns circle colliders for the player.
 */
import * as THREE from 'three';
import { fractalNoise } from '../core/noise.js';
import { createRng } from '../core/rng.js';
import { SURFACE } from '../config.js';

const BASE_SHAPES = 6;
let shared = null;

function getShared(textures) {
  if (shared) return shared;
  const geometries = [];
  for (let s = 0; s < BASE_SHAPES; s++) {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fractalNoise(v.x * 2.2 + s * 9, v.z * 2.2 + v.y * 1.7, 3, 1.6, s + 3);
      v.multiplyScalar(0.78 + n * 0.45);
      v.y *= 0.75;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    geo.userData.shared = true;
    geometries.push(geo);
  }
  const tints = [0x8a6a58, 0x6e5446, 0x9a7a62];
  const materials = tints.map((c, i) => {
    const m = new THREE.MeshStandardMaterial({
      map: textures.rockColor,
      bumpMap: textures.rockBump,
      bumpScale: 2 + i * 0.4,
      roughness: 0.9,
      metalness: 0.05,
      color: new THREE.Color(c),
    });
    m.userData.shared = true;
    return m;
  });
  shared = { geometries, materials };
  return shared;
}

/**
 * @param {THREE.Object3D} parent
 * @param {ReturnType<import('./terrainModel.js').createTerrainModel>} terrain
 * @param {{count:number, seed:number, castShadow:boolean, exclusions:{x:number,z:number,r:number}[]}} opts
 */
export function scatterRocks(parent, terrain, textures, { count, seed, castShadow, exclusions }) {
  const { geometries, materials } = getShared(textures);
  const rng = createRng(seed * 999 + 13);
  const buckets = new Map(); // "g:m" → matrices
  const colliders = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const half = SURFACE.size / 2 - 8;

  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = 9 + Math.sqrt(rng()) * (half - 9);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    if (exclusions.some((ex) => Math.hypot(x - ex.x, z - ex.z) < ex.r)) continue;
    const big = rng() > 0.93;
    const radius = big ? 1.6 + rng() * 1.6 : 0.25 + rng() * 1.1;
    const sx = radius * (1 + rng() * 0.5);
    const sy = radius * (0.6 + rng() * 0.5);
    const sz = radius * (1 + rng() * 0.5);
    const y = terrain.height(x, z);
    e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5); // mostly upright
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, y + sy * 0.3, z), q, new THREE.Vector3(sx, sy, sz));
    const key = `${Math.floor(rng() * BASE_SHAPES)}:${Math.floor(rng() * materials.length)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m4.clone());
    if (radius > 0.45) colliders.push({ x, z, r: Math.max(sx, sz) * 0.85, top: y + sy * 1.05 });
  }
  return finishRocks(parent, buckets, materials, geometries, castShadow, colliders);
}

/**
 * Place rocks at REAL positions (boulders detected in HiRISE imagery).
 * @param {{x:number, z:number, d:number}[]} list surface-frame positions + diameter (m)
 */
export function placeRocks(parent, terrain, textures, list, { castShadow, exclusions = [], seed = 1, minRadius = 0.25 }) {
  const { geometries, materials } = getShared(textures);
  const rng = createRng(seed * 31 + 3);
  const buckets = new Map();
  const colliders = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const half = SURFACE.size / 2 - 4;
  for (const r of list) {
    if (Math.abs(r.x) > half || Math.abs(r.z) > half) continue;
    if (exclusions.some((ex) => Math.hypot(r.x - ex.x, r.z - ex.z) < ex.r)) continue;
    const radius = Math.min(4, Math.max(minRadius, r.d / 2));
    const sx = radius * (0.85 + rng() * 0.35);
    const sy = radius * (0.75 + rng() * 0.45);
    const sz = radius * (0.85 + rng() * 0.35);
    const y = terrain.height(r.x, r.z);
    e.set((rng() - 0.5) * 0.6, rng() * Math.PI * 2, (rng() - 0.5) * 0.6);
    q.setFromEuler(e);
    // partly buried, as rocks on Mars usually are
    m4.compose(new THREE.Vector3(r.x, y + sy * (0.15 + rng() * 0.25), r.z), q, new THREE.Vector3(sx, sy, sz));
    const key = `${Math.floor(rng() * BASE_SHAPES)}:${Math.floor(rng() * materials.length)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m4.clone());
    if (radius > 0.45) colliders.push({ x: r.x, z: r.z, r: Math.max(sx, sz) * 0.85, top: y + sy * 1.05 });
  }
  return finishRocks(parent, buckets, materials, geometries, castShadow, colliders);
}

function finishRocks(parent, buckets, materials, geometries, castShadow, colliders) {
  const group = new THREE.Group();
  group.name = 'rocks';
  for (const [key, mats] of buckets) {
    const [gi, mi] = key.split(':').map(Number);
    const mesh = new THREE.InstancedMesh(geometries[gi], materials[mi], mats.length);
    mats.forEach((mat, i) => mesh.setMatrixAt(i, mat));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  parent.add(group);
  return { group, colliders };
}
