/**
 * Moons (Phobos, Deimos) and the spacecraft orbiting Mars (MRO, Odyssey,
 * MAVEN, TGO, Mars Express, Hope, Tianwen-1) on their approximate orbits.
 * Distances follow the real ratios; moon sizes are exaggerated ×15 so
 * they are visible. Time runs `ORBIT.moonTimeScale`× faster than real.
 */
import * as THREE from 'three';
import { DEIMOS, MARS_RADIUS_KM, ORBIT, PHOBOS } from '../config.js';
import { DEG } from '../core/math.js';
import { createLabelSprite } from './markers.js';

const KM = ORBIT.planetRadius / MARS_RADIUS_KM; // scene units per km

function moonMesh(radiusUnits, color, seed) {
  const geo = new THREE.IcosahedronGeometry(radiusUnits, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = 0.8 + 0.25 * Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed) + 0.1 * Math.sin(v.z * 5);
    v.multiplyScalar(n);
    v.x *= 1.35; // Phobos/Deimos are elongated
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1 }));
}

/** @param {THREE.Object3D} equatorFrame tilted planet frame */
export function createSatellites(equatorFrame, orbiters) {
  const group = new THREE.Group();
  group.name = 'satellites';
  equatorFrame.add(group);
  const bodies = [];

  // Moons in the equatorial plane
  for (const [def, name, color, seed] of [
    [PHOBOS, 'Phobos', 0x8c7b6b, 1],
    [DEIMOS, 'Deimos', 0xa39282, 2],
  ]) {
    const radius = def.orbitRadiusMarsRadii * ORBIT.planetRadius;
    const mesh = moonMesh(Math.max(1.2, def.radiusKm * KM * 15), color, seed);
    const label = createLabelSprite(name, '#c9b8a6');
    group.add(mesh, label);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.15, radius + 0.15, 180),
      new THREE.MeshBasicMaterial({ color: 0x8c7b6b, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    bodies.push({ mesh, label, radius, periodS: def.periodHours * 3600, inclination: 0, phase: seed * 2, ecc: 0 });
  }

  // Orbiters (exaggerated altitude for visibility of low orbits)
  for (const o of orbiters) {
    // low orbits (< 1000 km) are drawn 2.2× higher so they do not sit on the surface
    const alt = (km) => Math.max(3, km * KM * (km > 1000 ? 1 : 2.2));
    const peri = ORBIT.planetRadius + alt(o.altitudeKm);
    const apo = ORBIT.planetRadius + alt(o.apoapsisKm);
    const a = (peri + apo) / 2;
    const ecc = (apo - peri) / (apo + peri);
    const frame = new THREE.Group();
    frame.rotation.x = (90 - o.inclination) * DEG;
    frame.rotation.y = Math.random() * Math.PI * 2;
    group.add(frame);
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const th = (i / 160) * Math.PI * 2;
      const r = (a * (1 - ecc * ecc)) / (1 + ecc * Math.cos(th));
      pts.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.35 })
    );
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), new THREE.MeshBasicMaterial({ color: o.color, toneMapped: false }));
    const label = createLabelSprite(o.name, o.color);
    label.scale.multiplyScalar(0.85);
    frame.add(line, dot, label);
    bodies.push({ mesh: dot, label, radius: a, ecc, periodS: o.periodMin * 60, frame, phase: Math.random() * 6 });
  }

  let marsTime = 0;
  return {
    group,
    setVisible(v) {
      group.visible = v;
    },
    setLabelsVisible(v) {
      bodies.forEach((b) => (b.label.visible = v));
    },
    /** @param {number} dt real seconds */
    update(dt, reducedMotion) {
      if (!group.visible) return;
      marsTime += dt * (reducedMotion ? ORBIT.moonTimeScale * 0.2 : ORBIT.moonTimeScale);
      for (const b of bodies) {
        const th = b.phase + (marsTime / b.periodS) * Math.PI * 2;
        const r = b.ecc ? (b.radius * (1 - b.ecc * b.ecc)) / (1 + b.ecc * Math.cos(th)) : b.radius;
        b.mesh.position.set(Math.cos(th) * r, 0, Math.sin(th) * r);
        b.label.position.copy(b.mesh.position);
        if (!b.frame) b.mesh.rotation.y = th; // tidally locked moons
      }
    },
  };
}
