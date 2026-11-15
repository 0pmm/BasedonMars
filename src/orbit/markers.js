/**
 * Location markers (POIs) and rover markers on the globe, with text
 * labels so information is not conveyed by colour alone.
 */
import * as THREE from 'three';
import { latLonToXYZ } from '../core/math.js';
import { ORBIT } from '../config.js';

const GLOW_SCALE = 4.5;

/** Canvas text label sprite. */
export function createLabelSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 34px Rajdhani, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w;
  c.height = 52;
  ctx.font = font;
  ctx.fillStyle = 'rgba(5,8,15,0.78)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const r = 10;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, 50, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 14, 27);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Constant on-screen size (sizeAttenuation off): readable both from far
  // away and when the camera is focused close to the surface. The whole label
  // is hidden when its anchor is behind the planet or the terrain.
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      sizeAttenuation: false,
    })
  );
  sprite.userData.isLabel = true; // hidden as a whole when its anchor is occluded (see orbitView)
  const height = 0.032;
  sprite.scale.set((w / 52) * height, height, 1);
  sprite.center.set(0.5, -0.6);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * @param {THREE.Object3D} parent
 * @param {any[]} pois
 * @param {Record<string,{color:string, icon:string}>} types
 * @param {THREE.Texture} glowTexture
 */
export function createMarkers(parent, pois, types, glowTexture) {
  const group = new THREE.Group();
  group.name = 'markers';
  parent.add(group);
  /** @type {THREE.Mesh[]} */
  const hitboxes = [];
  /** @type {Map<string, THREE.Group>} */
  const byId = new Map();
  const coreGeo = new THREE.SphereGeometry(0.75, 16, 16);
  const hitGeo = new THREE.SphereGeometry(2, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  for (const poi of pois) {
    const color = types[poi.type].color;
    const p = latLonToXYZ(poi.lat, poi.lon, ORBIT.planetRadius + 0.6);
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.scale.set(GLOW_SCALE, GLOW_SCALE, 1);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.userData.owner = g;
    const label = createLabelSprite(`${types[poi.type].icon} ${poi.name}`, color);
    label.visible = false;
    g.add(core, glow, hit, label);
    g.userData = { poi, core, glow, label, phase: Math.random() * 6 };
    hitboxes.push(hit);
    byId.set(poi.id, g);
    group.add(g);
  }

  let hovered = null;
  let selected = null;
  let labelsAlways = false;

  function style(g) {
    const { core, glow, label } = g.userData;
    const isSel = g === selected;
    const isHov = g === hovered;
    // Selected markers are seen from close up (focus): keep the glow small
    // so it does not hide the terrain around the location.
    core.scale.setScalar(isSel ? 1.15 : isHov ? 1.35 : 1);
    if (isSel) glow.scale.set(2.2, 2.2, 1);
    else if (isHov) glow.scale.set(GLOW_SCALE * 1.3, GLOW_SCALE * 1.3, 1);
    label.visible = labelsAlways || isSel || isHov;
  }

  return {
    group,
    hitboxes,
    byId,
    setHovered(g) {
      const prev = hovered;
      hovered = g;
      if (prev) style(prev);
      if (g) style(g);
    },
    setSelected(g) {
      const prev = selected;
      selected = g;
      if (prev) style(prev);
      if (g) style(g);
    },
    get selected() {
      return selected;
    },
    get hovered() {
      return hovered;
    },
    setLabelsAlways(v) {
      labelsAlways = v;
      byId.forEach(style);
    },
    /** @param {Set<string>} types */
    setTypeFilter(typesVisible) {
      byId.forEach((g) => {
        g.visible = typesVisible.has(g.userData.poi.type);
      });
    },
    /** Pulse animation (disabled with reduced motion). */
    update(time, reducedMotion) {
      byId.forEach((g) => {
        if (g === hovered || g === selected) return;
        const s = reducedMotion ? 1 : 1 + Math.sin(time * 2 + g.userData.phase) * 0.08;
        g.userData.glow.scale.set(GLOW_SCALE * s, GLOW_SCALE * s, 1);
      });
    },
  };
}

/** Small diamond markers for active rovers (approximate positions). */
export function createRoverMarkers(parent, rovers) {
  const group = new THREE.Group();
  group.name = 'rovers';
  const geo = new THREE.OctahedronGeometry(0.55, 0);
  for (const r of rovers) {
    const p = latLonToXYZ(r.lat, r.lon, ORBIT.planetRadius + 0.5);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    m.position.set(p.x, p.y, p.z);
    const label = createLabelSprite(`🤖 ${r.name}`, '#ffffff');
    label.scale.multiplyScalar(0.8);
    label.position.copy(m.position);
    group.add(m, label);
  }
  parent.add(group);
  return group;
}
