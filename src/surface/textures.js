/**
 * Surface textures (ground, rock) generated once in a Web Worker and
 * shared by every location (tinted per profile through material colour).
 */
import * as THREE from 'three';
import { generateGround, generateRock } from './textureGen.js';

let worker = null;
let nextId = 1;
const pending = new Map();
let cache = null;

function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./textures.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (p) {
        pending.delete(e.data.id);
        p.resolve(e.data);
      }
    };
    worker.onerror = (err) => {
      console.warn('[textures] worker failed, using main thread', err);
      pending.forEach((p) => p.resolve(p.fallback()));
      pending.clear();
      worker = false;
    };
  } catch {
    worker = false;
  }
  return worker;
}

function generate(kind, size, seed) {
  const fallback = () => (kind === 'rock' ? generateRock(size) : generateGround(size, seed));
  const w = getWorker();
  if (!w) return Promise.resolve(fallback());
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve, fallback });
    w.postMessage({ id, kind, size, seed });
  });
}

function toTexture({ size, color }, srgb, repeat) {
  const tex = new THREE.DataTexture(color, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.userData.shared = true;
  return tex;
}

/**
 * Generate (once) and return the shared surface textures.
 * @returns {Promise<{groundColor: THREE.Texture, groundBump: THREE.Texture, rockColor: THREE.Texture, rockBump: THREE.Texture}>}
 */
export async function getSurfaceTextures() {
  if (cache) return cache;
  const [ground, rock] = await Promise.all([generate('ground', 512, 41), generate('rock', 256, 0)]);
  cache = {
    groundColor: toTexture(ground, true, 18),
    groundBump: toTexture({ size: ground.size, color: ground.bump }, false, 18),
    rockColor: toTexture(rock, true, 1.5),
    rockBump: toTexture({ size: rock.size, color: rock.bump }, false, 1.5),
  };
  return cache;
}
