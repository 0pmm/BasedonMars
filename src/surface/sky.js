/**
 * Martian sky + sun as a function of local time of day.
 * Daytime sky is butterscotch; around a low Sun the forward-scattering
 * dust makes the famous BLUE sunset halo.
 */
import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 halo;
  uniform float storm;
  uniform float night;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y, 0.0, 1.0);
    vec3 col = mix(horizon, zenith, pow(h, 0.55));
    float cosA = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
    col += halo * pow(cosA, 12.0) * 0.9;
    col += vec3(1.0, 0.95, 0.85) * pow(cosA, 900.0) * 2.0;
    col = mix(col, horizon * 0.95, storm * 0.85);
    col *= mix(1.0, 0.08, night);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const SUNRISE = 5.8;
const SUNSET = 18.4;

/**
 * Sun position and light colours for a local solar time (hours).
 * @param {number} hours 0..24
 */
export function sunForTime(hours) {
  const t = (hours - SUNRISE) / (SUNSET - SUNRISE);
  const elevation = Math.sin(clamp(t, -0.15, 1.15) * Math.PI) * 70; // degrees
  const azimuth = lerp(-80, 260, clamp(t, 0, 1)); // east → west
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
  const low = clamp(1 - elevation / 25, 0, 1); // 1 near horizon
  const night = clamp(-elevation / 8, 0, 1);
  return { dir, elevation, low, night };
}

/**
 * Sun from a real azimuth/elevation (degrees, from Mars24) in the surface
 * frame used by real sites (x = east, z = −north). Same shape as sunForTime().
 */
export function sunFromAzEl(azimuth, elevation) {
  const el = (elevation * Math.PI) / 180;
  const az = (azimuth * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const low = clamp(1 - elevation / 25, 0, 1);
  const night = clamp(-elevation / 8, 0, 1);
  return { dir, elevation, low, night, azimuth };
}

export function createSky() {
  const uniforms = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    halo: { value: new THREE.Color() },
    storm: { value: 0 },
    night: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16), // encloses the largest (real-terrain) world
    new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  mesh.renderOrder = -1;
  const dayZenith = new THREE.Color(0xb7774a);
  const dayHorizon = new THREE.Color(0xf0c79d);
  const duskZenith = new THREE.Color(0x3b2a2a);
  const duskHorizon = new THREE.Color(0x8c6a5a);
  const blueHalo = new THREE.Color(0x3f6fc0);
  const dayHalo = new THREE.Color(0xffe2b8);

  return {
    mesh,
    uniforms,
    /**
     * @param {ReturnType<typeof sunForTime>} sun
     * @param {number} storm 0..1
     * @returns {THREE.Color} fog colour
     */
    update(sun, storm) {
      uniforms.sunDir.value.copy(sun.dir);
      uniforms.zenith.value.copy(dayZenith).lerp(duskZenith, sun.low * 0.8);
      uniforms.horizon.value.copy(dayHorizon).lerp(duskHorizon, sun.low * 0.7);
      uniforms.halo.value.copy(dayHalo).lerp(blueHalo, sun.low);
      uniforms.storm.value = storm;
      uniforms.night.value = sun.night;
      return uniforms.horizon.value.clone().multiplyScalar(1 - sun.night * 0.9);
    },
  };
}
