/**
 * Planet body: photographic texture (resolution by quality preset) with a
 * procedural fallback, relief detail map, rim-glow atmosphere and stars.
 */
import * as THREE from 'three';
import { ASSETS, ORBIT } from '../config.js';
import { emit } from '../core/events.js';

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const ATMOSPHERE_FRAG = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 glowColor;
  void main() {
    vec3 viewDir = normalize(-vPosition);
    float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
    gl_FragColor = vec4(glowColor, pow(rim, 3.0) * 0.22);
    #include <colorspace_fragment>
  }`;

export function createPlanet(renderer) {
  const material = new THREE.MeshStandardMaterial({ color: 0x8a4a2c, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(ORBIT.planetRadius, 128, 128), material);
  mesh.name = 'mars';
  let currentRes = null;
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /**
   * Load (or switch) the photographic texture resolution.
   * Resolves when loaded or after the procedural fallback is applied.
   * @param {'2k'|'4k'|'8k'} res
   */
  function loadTexture(res) {
    if (res === currentRes) return Promise.resolve();
    currentRes = res;
    return new Promise((resolve) => {
      loader.load(
        ASSETS.planet[res],
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = maxAniso;
          const old = material.map;
          material.map = tex;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          old?.dispose();
          emit('log', { type: 'system', key: 'log.textureLoaded', vars: { res } });
          resolve();
        },
        undefined,
        async () => {
          console.warn(`[planet] texture ${res} failed, using procedural fallback`);
          const { buildProceduralMarsTexture } = await import('./proceduralTexture.js');
          material.map = buildProceduralMarsTexture();
          material.color.set(0xffffff);
          material.needsUpdate = true;
          emit('log', { type: 'system', key: 'log.textureFallback' });
          resolve();
        }
      );
    });
  }

  /** Relief detail map derived from the photo (not measured elevation). */
  function loadDetail() {
    return new Promise((resolve) => {
      loader.load(
        ASSETS.planetDetail,
        (tex) => {
          tex.anisotropy = maxAniso;
          material.bumpMap = tex;
          material.bumpScale = 1.4;
          material.needsUpdate = true;
          resolve();
        },
        undefined,
        () => resolve()
      );
    });
  }

  return { mesh, material, loadTexture, loadDetail };
}

export function createAtmosphere() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(ORBIT.planetRadius * 1.012, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0xd7a27c) } },
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    })
  );
}

/** @param {number} count */
export function createStarField(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 1400 + Math.random() * 1200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const warm = Math.random();
    colors[i * 3] = 0.85 + warm * 0.15;
    colors[i * 3 + 1] = 0.85 + (1 - Math.abs(warm - 0.5)) * 0.1;
    colors[i * 3 + 2] = 1 - warm * 0.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: true, vertexColors: true, toneMapped: false }));
}

/** Soft radial sprite texture used for glows. */
export function createGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.userData.shared = true;
  return tex;
}
