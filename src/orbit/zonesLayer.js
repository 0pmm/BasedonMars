/**
 * Mission layers on the globe: candidate zones (circles) and science sites
 * with their rank for the current objective. Clicking a zone or site emits
 * an event consumed by the mission guide.
 */
import * as THREE from 'three';
import { latLonToXYZ } from '../core/math.js';
import { getState } from '../core/state.js';
import { orbitView } from './orbitView.js';
import { createLabelSprite } from './markers.js';
import { isEditingRoute } from '../ui/routePanel.js';
import sitesData from '../data/scienceSites.json';
import { places, rankPlaces } from '../game/recommend.js';
import prospects from '../data/prospects.json';
import { ORBIT } from '../config.js';

const R_KM = 3389.5;
const LIFT = 0.9; // scene units above the planet radius
const SITES = sitesData.sites;
const MISSIONS = sitesData.missions;

const state = {
  visible: true,
  objective: 'geology',
  selectedSite: null,
  group: null,
  zoneGroup: null,
  siteGroup: null,
  hit: [],
  labels: [],
  onZone: () => {},
  onSite: () => {},
};

function destination(lat, lon, bearingDeg, distanceKm) {
  const d = distanceKm / R_KM;
  const b = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  let lon2 = (l2 * 180) / Math.PI;
  lon2 = ((((lon2 + 180) % 360) + 360) % 360) - 180;
  return { lat: (p2 * 180) / Math.PI, lon: lon2 };
}

function toVec(lat, lon, lift = LIFT) {
  const p = latLonToXYZ(lat, lon, ORBIT.planetRadius + lift);
  return new THREE.Vector3(p.x, p.y, p.z);
}

function zoneColor(score, explored) {
  if (explored) return new THREE.Color('#a7b2c4');
  const t = Math.max(0, Math.min(1, (score - 0.55) / 0.45));
  return new THREE.Color('#4fd1ff').lerp(new THREE.Color('#39ff88'), t);
}

function buildZone(zone) {
  const radiusUnits = (zone.radiusKm / R_KM) * ORBIT.planetRadius;
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const p = destination(zone.lat, zone.lon, (i / 72) * 360, zone.radiusKm);
    pts.push(toVec(p.lat, p.lon));
  }
  const color = zoneColor(zone.score, zone.explored);
  const group = new THREE.Group();
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: zone.explored ? 0.35 : 0.85, depthWrite: false })
  );
  line.renderOrder = 4;
  const fill = new THREE.Mesh(
    new THREE.SphereGeometry(radiusUnits, 12, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false })
  );
  fill.position.copy(toVec(zone.lat, zone.lon, LIFT - 0.2));
  group.add(line, fill);

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(1.2, radiusUnits * 1.05), 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.copy(toVec(zone.lat, zone.lon, LIFT));
  hit.userData = { kind: 'zone', zone };
  group.add(hit);
  group.userData = { kind: 'zone', zone, color };
  state.hit.push(hit);
  return group;
}

function buildSite(site, rank) {
  const group = new THREE.Group();
  const pos = toVec(site.lat, site.lon, LIFT + 0.2);
  group.position.copy(pos);
  const color = new THREE.Color(rank == null ? '#c9b6a4' : rank <= 3 ? '#e2653a' : '#d9a441');
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 14), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.userData = { kind: 'site', site };
  state.hit.push(hit);
  group.add(core, hit);
  if (rank == null || rank <= 6) {
    const label = createLabelSprite(rank == null ? site.name : `#${rank} ${site.name}`, `#${color.getHexString()}`);
    label.scale.multiplyScalar(0.72);
    group.add(label);
    state.labels.push(label);
  }
  group.userData = { kind: 'site', site, rank };
  return group;
}

function clearGroup(group) {
  if (!group) return;
  group.traverse((obj) => {
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
    else obj.material?.dispose?.();
  });
  group.clear();
}

/** Rebuild circles/labels for an objective. */
export function refreshZones(objectiveId = state.objective, selectedSiteId = null) {
  state.objective = objectiveId;
  state.selectedSite = selectedSiteId;
  if (!state.group || !state.zoneGroup || !state.siteGroup) return;
  clearGroup(state.zoneGroup);
  clearGroup(state.siteGroup);
  state.hit = [];
  state.labels = [];

  const free = objectiveId === 'free';
  // one ranking for sites and candidate areas, the same the guide shows
  const ranked = free ? [] : rankPlaces(places(SITES, prospects.zones, MISSIONS, objectiveId));
  const rankById = new Map(ranked.map((r) => [r.id, r.rank]));

  // Sites are meaningful for every objective.
  for (const site of SITES) {
    state.siteGroup.add(buildSite(site, free ? null : rankById.get(site.id) || 99));
  }

  // Candidate areas (clusters of hydrated-mineral detections): water in the
  // planet's past (geology) or water a base could extract (survival).
  if (!free) {
    const zones = ranked.filter((r) => r.kind === 'zone').slice(0, 24);
    for (const r of zones) {
      state.zoneGroup.add(buildZone(r.zone));
      if (r.rank <= 12) {
        const label = createLabelSprite(`#${r.rank}`, r.zone.explored ? '#a7b2c4' : '#8bd0b0');
        label.scale.multiplyScalar(0.72);
        label.position.copy(toVec(r.zone.lat, r.zone.lon, LIFT + 0.5));
        state.zoneGroup.add(label);
        state.labels.push(label);
      }
    }
  }
  state.group.visible = state.visible && !state.suppressed;
}

export function setZonesVisible(visible) {
  state.visible = visible;
  if (state.group) state.group.visible = visible && !state.suppressed;
}

/** Hide the layer outside the globe screen (start screen, first person) without touching the user's toggle. */
export function suppressZones(suppressed) {
  state.suppressed = suppressed;
  if (state.group) state.group.visible = state.visible && !suppressed;
}

export function isZonesVisible() {
  return state.visible;
}

function pickAt(clientX, clientY) {
  if (!state.visible) return null;
  const ray = orbitView.rayFrom(clientX, clientY);
  const hits = ray.intersectObjects(state.hit, false);
  if (!hits.length) return null;
  const ground = orbitView.groundDistance(orbitView.raycaster);
  const hit = hits.find((h) => ground == null || h.distance < ground + 0.05 * h.distance);
  return hit ? hit.object.userData : null;
}

/** @param {{onZone?:(zone:object)=>void, onSite?:(site:object)=>void}} handlers */
export function initZonesLayer(handlers = {}) {
  state.onZone = handlers.onZone || (() => {});
  state.onSite = handlers.onSite || (() => {});
  if (!orbitView.frame || state.group) return;

  state.group = new THREE.Group();
  state.group.name = 'mission-layers';
  state.zoneGroup = new THREE.Group();
  state.siteGroup = new THREE.Group();
  state.group.add(state.zoneGroup, state.siteGroup);
  orbitView.frame.add(state.group);
  refreshZones(state.objective, state.selectedSite);

  const el = orbitView.renderer.domElement;
  let down = null;
  // Capture on the window so the mission layers win the click before the
  // globe's own pointer handlers (registered earlier on the canvas).
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target !== el) return;
      down = { x: e.clientX, y: e.clientY };
    },
    { capture: true }
  );
  window.addEventListener(
    'pointerup',
    (e) => {
      if (e.target !== el || !down || getState() !== 'dashboard' || isEditingRoute()) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const picked = pickAt(e.clientX, e.clientY);
      if (!picked) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (picked.kind === 'zone') state.onZone(picked.zone);
      else state.onSite(picked.site);
    },
    { capture: true }
  );

  // Pointer cursor over mission layers.
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.target !== el || getState() !== 'dashboard' || isEditingRoute()) return;
      const picked = pickAt(e.clientX, e.clientY);
      if (picked) el.style.cursor = 'pointer';
      else if (el.style.cursor === 'pointer') el.style.cursor = orbitView.cursor || 'grab';
    },
    { capture: true }
  );
}
