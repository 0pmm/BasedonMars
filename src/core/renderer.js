/**
 * Shared WebGL renderer + optional post-processing (bloom) per view.
 * One renderer draws either the orbital scene or the surface scene.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** @type {THREE.WebGLRenderer} */
let renderer;
/** @type {Map<THREE.Scene, {composer: EffectComposer, camera: THREE.Camera, bloom: UnrealBloomPass}>} */
const composers = new Map();
let bloomEnabled = false;
const resizeHandlers = new Set();

/** @param {HTMLCanvasElement} canvas */
export function createRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', handleResize);
  return renderer;
}

export function getRenderer() {
  return renderer;
}

/** Apply a quality preset (pixel ratio, shadows, bloom). */
export function applyRendererQuality(preset) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  renderer.shadowMap.enabled = preset.shadows > 0;
  bloomEnabled = preset.bloom;
  composers.forEach(({ composer }) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
  });
}

function getComposer(scene, camera) {
  let entry = composers.get(scene);
  if (!entry || entry.camera !== camera) {
    entry?.composer.dispose();
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.96);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    entry = { composer, camera, bloom };
    composers.set(scene, entry);
  }
  return entry.composer;
}

/** Render a scene, through the bloom composer on high quality. */
export function renderView(scene, camera) {
  if (bloomEnabled) getComposer(scene, camera).render();
  else renderer.render(scene, camera);
}

/** @param {(w:number, h:number) => void} fn */
export function onResize(fn) {
  resizeHandlers.add(fn);
  return () => resizeHandlers.delete(fn);
}

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composers.forEach(({ composer }) => composer.setSize(w, h));
  resizeHandlers.forEach((fn) => fn(w, h));
}

/**
 * Recursively dispose geometries, materials and textures of an object.
 * Shared resources can be protected with `userData.shared = true`.
 * @param {THREE.Object3D} root
 */
export function disposeObject(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.userData?.shared) return;
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const key of Object.keys(m)) {
        const v = m[key];
        if (v && v.isTexture && !v.userData?.shared) v.dispose();
      }
      m.dispose();
    }
    if (obj.isInstancedMesh) obj.dispose();
  });
  root.parent?.remove(root);
}

/**
 * Copy of the current frame (rendered right before the copy, so it works
 * without preserveDrawingBuffer).
 * @returns {HTMLCanvasElement}
 */
export function captureFrame(renderFn) {
  renderFn();
  const src = renderer.domElement;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
