/**
 * Globe view: one continuous view of Mars from orbit down to the ground.
 *
 * - terrainGlobe.js streams real terrain + imagery tiles (level of detail)
 * - globeControls.js is a Google-Earth style camera (pan, zoom to cursor,
 *   rotate/tilt near the ground, fly-to)
 * - markers (POIs), moons/orbiters, stars and atmosphere fade with altitude
 *   so the view turns into a ground view without a cut.
 */
import * as THREE from 'three';
import { ORBIT, MARS_AXIAL_TILT_DEG } from '../config.js';
import { DEG, clamp, smoothstep, latLonToXYZ, xyzToLatLon } from '../core/math.js';
import { emit } from '../core/events.js';
import { getState } from '../core/state.js';
import { prefersReducedMotion, getSettings } from '../core/settings.js';
import { onResize, renderView } from '../core/renderer.js';
import { createAtmosphere, createGlowTexture, createPlanet, createStarField } from './planet.js';
import { createMarkers, createRoverMarkers } from './markers.js';
import { createSatellites } from './satellites.js';
import { createTerrainGlobe, UNITS_PER_M } from './terrainGlobe.js';
import { createGlobeControls, enuBasis } from './globeControls.js';
import { MARS_SPHERE_RADIUS_M } from '../geo/mars.js';
import catalog from '../data/catalog.json';
import pois from '../data/pois.json';

/** Whole-planet view, pulled back on portrait screens so Mars fits. */
export function homeView(aspect = innerWidth / innerHeight) {
  const k = aspect < 1 ? Math.min(2.4, 1 / aspect) * 0.95 : 1;
  return { lat: 18, lon: 60, range: 7600e3 * Math.max(1, k), heading: 0, tilt: 0 };
}

const SKY_DAY = new THREE.Color(0xc9936a);
const SPACE = new THREE.Color(0x000000);

export const orbitView = {
  /** @type {THREE.Scene} */ scene: null,
  /** @type {THREE.PerspectiveCamera} */ camera: null,
  controls: null,
  terrain: null,
  glowTexture: null,
  planet: null,
  atmosphere: null,
  frame: null, // tilted equatorial frame
  markers: null,
  satellites: null,
  rovers: null,
  stars: null,
  focus: { id: null, prev: null },
  touchArmed: null,
  downPos: { x: 0, y: 0 },
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  sunLocal: new THREE.Vector3(1, 0, 0),
  markersOn: true,
  poiHeights: new Map(),

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{stars:number, planetTexture:'2k'|'4k'|'8k'}} quality
   * @returns {Promise<void>} resolves when the fallback planet texture is ready
   */
  init(renderer, quality) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 6000);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e8, 2.6);
    sun.position.set(5, 3, 5);
    this.scene.add(sun);
    this.sunLight = sun;

    this.glowTexture = createGlowTexture();
    this.stars = createStarField(quality.stars);
    this.scene.add(this.stars);

    // Equatorial frame tilted by Mars' real axial tilt (25.19°)
    this.frame = new THREE.Group();
    this.frame.rotation.z = -MARS_AXIAL_TILT_DEG * DEG;
    this.scene.add(this.frame);
    this.frame.updateMatrixWorld();

    // Low-resolution sphere shown until the first terrain tiles arrive;
    // slightly smaller than the datum so it never pokes through low terrain.
    this.planet = createPlanet(renderer);
    this.planet.mesh.scale.setScalar((MARS_SPHERE_RADIUS_M - 9000) / MARS_SPHERE_RADIUS_M);
    this.frame.add(this.planet.mesh);
    this.atmosphere = createAtmosphere();
    this.frame.add(this.atmosphere);
    this.terrain = createTerrainGlobe(this.frame);
    this.terrain.setFrameRotation(new THREE.Matrix3().setFromMatrix4(this.frame.matrixWorld));
    this.markers = createMarkers(this.frame, pois, catalog.types, this.glowTexture);
    this.markers.group.visible = false;
    this.markers.group.children.forEach((g) => {
      g.userData.dir = g.position.clone().normalize();
    });
    this.rovers = createRoverMarkers(this.frame, catalog.rovers);
    this.rovers.visible = false;
    this.satellites = createSatellites(this.frame, catalog.orbiters);
    this.satellites.setVisible(false);

    const el = renderer.domElement;
    this.controls = createGlobeControls(this.camera, el, this.frame, {
      heightAt: (lat, lon) => this.terrain.heightAt(lat, lon),
    });
    this.controls.setPicker((x, y) => this.latLonAtClient(x, y));
    this.controls.onStart = () => {
      if (this.controls.autoRotate) this.setAutoRotate(false);
    };
    this.controls.autoRotate = getSettings().autoRotate && !prefersReducedMotion();
    this.controls.jumpTo(homeView());

    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerleave', () => {
      this.setHover(null);
      if (this.interactive) emit('orbit:cursor', null);
    });
    // Double-click: fly closer to that point (like Google Earth)
    el.addEventListener('dblclick', (e) => {
      if (!this.interactive) return;
      const ll = this.latLonAt(e);
      if (!ll) return;
      const c = this.controls;
      c.flyTo({ lat: ll.lat, lon: ll.lon, range: Math.max(300, c.state.range / 3), heading: c.state.heading, tilt: c.state.tilt }, 900);
    });

    onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });

    return Promise.all([this.planet.loadTexture(quality.planetTexture), this.planet.loadDetail()]).then(() => {});
  },

  get active() {
    const s = getState();
    return s === 'dashboard' || s === 'start' || s === 'loading';
  },

  get interactive() {
    return getState() === 'dashboard';
  },

  /* ---------------- Frame update ---------------- */
  update(dt) {
    const rm = prefersReducedMotion();
    this.controls.update(dt);
    const alt = this.controls.altitude();
    // Altitude-driven look: space → hazy butterscotch sky near the ground
    const ground = 1 - smoothstep(25e3, 160e3, alt);
    this.scene.background.copy(SPACE).lerp(SKY_DAY, ground * 0.9);
    this.stars.visible = ground < 0.5;
    this.atmosphere.visible = alt > 110e3;
    this.stars.rotation.y += rm ? 0 : dt * 0.004;
    this.terrain.setLocalLight(1 - smoothstep(150e3, 1500e3, alt));
    const fogDist = clamp(alt * 25, 40e3, 600e3) * UNITS_PER_M;
    this.terrain.setFog(SKY_DAY, ground > 0 ? (1 / fogDist) * ground : 0);
    this.planet.mesh.visible = alt > 400e3;
    this.rovers.visible = !!this.roversOn && alt > 300e3;
    this.satellites.setVisible(!!this.roversOn && alt > 300e3);
    this.satellites.update(dt, rm);
    this.updateMarkers(rm);
    this.updateLabelOcclusion(alt);
    this.terrain.update(this.camera, this.renderer.domElement.clientHeight || innerHeight);
  },

  /** Keep POI markers small and on the ground as the camera gets closer. */
  updateMarkers(rm) {
    const g = this.markers.group;
    g.visible = this.markersOn && getState() === 'dashboard';
    if (!g.visible) return;
    this.markers.update(performance.now() / 1000, rm);
    const cam = this.frame.worldToLocal(this.camera.position.clone());
    const R = ORBIT.planetRadius;
    for (const m of g.children) {
      const poi = m.userData.poi;
      if (!poi) continue;
      let hm = this.poiHeights.get(poi.id);
      if (hm == null || Math.random() < 0.02) {
        const v = this.terrain.heightAt(poi.lat, poi.lon);
        if (v != null) this.poiHeights.set(poi.id, (hm = v));
      }
      const surf = m.userData.dir.clone().multiplyScalar(R + (hm ?? 0) * UNITS_PER_M);
      const d = surf.distanceTo(cam);
      const s = clamp(d / 110, 1e-7, 1);
      m.scale.setScalar(s);
      m.position.copy(m.userData.dir).multiplyScalar(R + (hm ?? 0) * UNITS_PER_M + 0.6 * s);
    }
  },

  /**
   * Labels (places, bases, route pins, moons, orbiters, rovers) are drawn on
   * top, so they are hidden as a whole when their anchor point is behind the
   * planet (segment camera→anchor crosses the sphere) or, near the ground,
   * behind the real terrain (ray against the tiles, a few labels per frame).
   */
  updateLabelOcclusion(alt) {
    this.labelFrame = (this.labelFrame || 0) + 1;
    if (!this.labelList || this.labelFrame % 30 === 0) {
      this.labelList = [];
      this.frame.traverse((o) => o.isSprite && o.userData.isLabel && this.labelList.push(o));
    }
    const cam = this.camera.position;
    const centre = this.frame.getWorldPosition(new THREE.Vector3());
    const r = ORBIT.planetRadius * 0.992;
    const a = new THREE.Vector3();
    const d = new THREE.Vector3();
    const ray = this.labelRay || (this.labelRay = new THREE.Raycaster());
    const near = alt < 400e3;
    const meshes = near ? this.terrain.visibleMeshes() : null;
    this.labelList.forEach((s, k) => {
      s.getWorldPosition(a);
      d.subVectors(a, cam);
      const len = d.length();
      d.divideScalar(len);
      // segment–sphere test
      const oc = new THREE.Vector3().subVectors(cam, centre);
      const b = oc.dot(d);
      const c = oc.lengthSq() - r * r;
      const disc = b * b - c;
      let hidden = false;
      if (disc > 0) {
        const t = -b - Math.sqrt(disc);
        hidden = t > 0 && t < len;
      }
      if (!hidden && near && meshes.length && (k + this.labelFrame) % 6 === 0) {
        ray.set(cam, d);
        ray.far = len * 0.995;
        s.userData.terrainHidden = ray.intersectObjects(meshes, false).length > 0;
      }
      if (!near) s.userData.terrainHidden = false;
      const target = hidden || s.userData.terrainHidden ? 0 : 1;
      s.material.opacity += (target - s.material.opacity) * 0.35;
      s.material.visible = s.material.opacity > 0.03;
    });
  },

  render() {
    renderView(this.scene, this.camera);
  },

  /* ---------------- Mode helpers ---------------- */
  setDashboardMode(on) {
    this.controls.enabled = true;
    if (!on) {
      this.clearFocus();
      this.markers.setSelected(null);
      this.setHover(null);
    }
  },

  setAutoRotate(on) {
    this.controls.autoRotate = on;
    emit('orbit:autorotate', on);
  },

  setMarkersVisible(on) {
    this.markersOn = on;
  },

  /**
   * Data layer: a Mars Trek layer id or a computed one (slope, elevation…).
   * @returns {Promise<boolean>}
   */
  setLayer(id, opts) {
    this.terrain.setOverlay(id, opts);
    return Promise.resolve(true);
  },

  setOrbitersVisible(on) {
    this.roversOn = on;
  },

  /* ---------------- Camera ---------------- */
  /** Fly to a lat/lon. range in metres (camera distance from the target). */
  flyTo(view, duration = 1800) {
    return this.controls.flyTo(view, prefersReducedMotion() ? 0 : duration);
  },

  resetView() {
    if (this.focus.id) return this.unfocus();
    this.markers.setSelected(null);
    const c = this.controls.state;
    this.flyTo({ ...homeView(), lat: c.lat, lon: c.lon }, 1400);
  },

  /** Current camera view (to restore later). */
  view() {
    const s = this.controls.state;
    return { lat: s.lat, lon: s.lon, range: s.range, heading: s.heading, tilt: s.tilt };
  },

  /* ---------------- Focus ---------------- */
  focusPoi(id) {
    const g = this.markers.byId.get(id);
    if (!g) return;
    if (!this.focus.id) this.focus.prev = this.view();
    this.focus.id = id;
    const poi = g.userData.poi;
    this.setAutoRotate(false);
    this.flyTo({ lat: poi.lat, lon: poi.lon, range: 260e3, heading: 0, tilt: 35 }, 2200);
    this.markers.setSelected(g);
    emit('orbit:focus', poi);
  },

  unfocus() {
    if (!this.focus.id) return;
    const prev = this.focus.prev;
    this.focus.id = null;
    this.markers.setSelected(null);
    if (prev) this.flyTo(prev, 1400);
    emit('orbit:focus', null);
  },

  /** Leave focus instantly (state changes). */
  clearFocus() {
    if (this.focus.id) emit('orbit:focus', null);
    this.focus.id = null;
  },

  selectPoi(id) {
    const g = this.markers.byId.get(id);
    if (g) this.markers.setSelected(g);
  },

  /* ---------------- Picking ---------------- */
  rayFrom(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster;
  },

  pick(e, objects) {
    return this.rayFrom(e.clientX, e.clientY).intersectObjects(objects, false);
  },

  pickMarker(e) {
    if (!this.markers.group.visible) return null;
    const hits = this.pick(
      e,
      this.markers.hitboxes.filter((h) => h.parent.visible)
    );
    if (!hits.length) return null;
    // Markers hidden behind the planet (or a hill) cannot be hovered or clicked
    const ground = this.groundDistance(this.raycaster);
    const hit = hits.find((hh) => ground == null || hh.distance < ground + 0.02 * hh.distance);
    return hit ? hit.object.userData.owner : null;
  },

  /** Distance along a ray to the ground (terrain tiles, else the planet sphere). */
  groundDistance(raycaster) {
    const meshes = this.terrain.visibleMeshes();
    const t = meshes.length ? raycaster.intersectObjects(meshes, false)[0] : null;
    if (t) return t.distance;
    const sphere = new THREE.Sphere(this.frame.getWorldPosition(new THREE.Vector3()), ORBIT.planetRadius * 0.997);
    const p = raycaster.ray.intersectSphere(sphere, new THREE.Vector3());
    return p ? p.distanceTo(raycaster.ray.origin) : null;
  },

  setHover(g, e) {
    if (this.markers.hovered !== g) this.markers.setHovered(g);
    emit('orbit:hover', g ? { poi: g.userData.poi, x: e?.clientX, y: e?.clientY } : null);
  },

  /** Lat/lon (and height) of the ground under a screen point, or null. */
  latLonAtClient(clientX, clientY) {
    const ray = this.rayFrom(clientX, clientY);
    const meshes = this.terrain.visibleMeshes();
    let hit = meshes.length ? ray.intersectObjects(meshes, false)[0] : null;
    if (!hit) hit = ray.intersectObject(this.planet.mesh, false)[0];
    if (!hit) return null;
    const local = this.frame.worldToLocal(hit.point.clone());
    const ll = xyzToLatLon(local.x, local.y, local.z);
    return { ...ll, h: local.length() / UNITS_PER_M - MARS_SPHERE_RADIUS_M };
  },

  latLonAt(e) {
    return this.latLonAtClient(e.clientX, e.clientY);
  },

  /** Scene position (world) of a lat/lon/height. */
  worldOf(lat, lon, hM = 0) {
    const p = latLonToXYZ(lat, lon, (MARS_SPHERE_RADIUS_M + hM) * UNITS_PER_M);
    return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(this.frame.matrixWorld);
  },

  /** Point the light from the real subsolar point (Mars24). */
  setSubsolar(latDeg, lonEastDeg) {
    const p = latLonToXYZ(latDeg, lonEastDeg, 1);
    this.sunLocal.set(p.x, p.y, p.z).normalize();
    this.frame.updateMatrixWorld();
    const world = this.sunLocal.clone().transformDirection(this.frame.matrixWorld);
    this.sunLight.position.copy(world.clone().multiplyScalar(1000));
    this.terrain.setSun(world);
  },

  onPointerDown(e) {
    if (!this.interactive) return;
    this.downPos = { x: e.clientX, y: e.clientY };
  },

  onPointerMove(e) {
    if (!this.interactive || e.pointerType === 'touch') return;
    const g = this.pickMarker(e);
    this.setHover(g, e);
    this.renderer.domElement.style.cursor = g ? 'pointer' : this.cursor || 'grab';
    // Live coordinates under the cursor (planetocentric, east longitude)
    const now = performance.now();
    if (now - (this.lastCursor || 0) > 80) {
      this.lastCursor = now;
      emit('orbit:cursor', this.latLonAt(e));
    }
  },

  onPointerUp(e) {
    if (!this.interactive) return;
    if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 6) return;
    // Clicks on the ground go to the route planner first (when a tool is active)
    const ll = this.latLonAt(e);
    if (ll) {
      const handled = { value: false };
      emit('orbit:groundClick', { ...ll, event: e, handled });
      if (handled.value) return;
    }
    const g = this.pickMarker(e);
    if (e.pointerType === 'touch') {
      // First tap shows the name, second tap on the same marker opens it.
      if (g && this.touchArmed !== g) {
        this.touchArmed = g;
        this.setHover(g, e);
        return;
      }
      this.touchArmed = null;
    }
    if (g) {
      this.markers.setSelected(g);
      emit('orbit:poiClick', g.userData.poi);
      return;
    }
    this.setHover(null);
  },

  /** ENU basis helper re-exported for route drawing. */
  enu(lat, lon) {
    return enuBasis(lat, lon);
  },
};
