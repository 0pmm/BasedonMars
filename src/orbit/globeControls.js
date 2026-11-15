/**
 * Google-Earth style camera for the globe.
 *
 * State: a target point on the ground (lat, lon, height), the range from
 * the target to the camera, the heading (0 = looking north) and the tilt
 * (0 = straight down, up to ~85° near the ground). Panning moves the target
 * over the sphere, zoom scales the range (towards the point under the
 * cursor), and tilting/rotating is only allowed close to the surface, so
 * the same control smoothly turns the planet view into a ground view.
 *
 * Mouse: drag = pan · wheel = zoom · right-drag / Ctrl+drag = rotate & tilt.
 * Touch: one finger = pan · pinch = zoom · two-finger twist = rotate ·
 * two fingers up/down = tilt. Keyboard: arrows, + / −, Q / E, PageUp/Down.
 */
import * as THREE from 'three';
import { ORBIT } from '../config.js';
import { clamp, lerp, latLonToXYZ, smoothstep } from '../core/math.js';
import { MARS_SPHERE_RADIUS_M } from '../geo/mars.js';
import { UNITS_PER_M } from './terrainGlobe.js';

const DEG = Math.PI / 180;
export const MIN_RANGE_M = 25;
export const MAX_RANGE_M = 12000e3;
const MIN_CLEARANCE_M = 4;

/** Largest tilt allowed at a given range (degrees). */
export function maxTiltForRange(range) {
  const t = smoothstep(Math.log(40e3), Math.log(2500e3), Math.log(Math.max(1, range)));
  return lerp(84, 0, t);
}

/** Local east/north/up basis at a lat/lon in the planet frame (math.js axes). */
export function enuBasis(lat, lon) {
  const p = latLonToXYZ(lat, lon, 1);
  const up = new THREE.Vector3(p.x, p.y, p.z).normalize();
  const q = latLonToXYZ(lat, lon + 0.01, 1);
  const east = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  return { up, east, north };
}

export function createGlobeControls(camera, dom, frame, { heightAt } = {}) {
  const st = {
    lat: 18,
    lon: 40,
    h: 0,
    range: 9000e3,
    heading: 0,
    tilt: 0,
  };
  const goal = { range: st.range, heading: 0, tilt: 0 };
  const ctl = {
    enabled: true,
    autoRotate: false,
    autoRotateSpeed: ORBIT.autoRotateSpeed,
    tween: null,
    onStart: null,
    onChange: null,
  };
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  /* ---------- geometry ---------- */
  function cameraFrameLocal() {
    const { up, east, north } = enuBasis(st.lat, st.lon);
    const r = (MARS_SPHERE_RADIUS_M + st.h) * UNITS_PER_M;
    const target = up.clone().multiplyScalar(r);
    const hd = st.heading * DEG;
    const tl = st.tilt * DEG;
    const fwd = east
      .clone()
      .multiplyScalar(Math.sin(hd))
      .add(north.clone().multiplyScalar(Math.cos(hd)));
    const offset = up
      .clone()
      .multiplyScalar(Math.cos(tl))
      .add(fwd.clone().multiplyScalar(-Math.sin(tl)))
      .multiplyScalar(st.range * UNITS_PER_M);
    const pos = target.clone().add(offset);
    const camUp = fwd
      .clone()
      .multiplyScalar(Math.cos(tl))
      .add(up.clone().multiplyScalar(Math.sin(tl)))
      .normalize();
    return { pos, target, camUp, up };
  }

  function apply() {
    frame.updateMatrixWorld();
    const m = frame.matrixWorld;
    const view = cameraFrameLocal();
    const { target, camUp } = view;
    let pos = view.pos;
    // Never go below the ground
    if (heightAt) {
      const r = pos.length();
      const ll = toLatLon(pos);
      const g = heightAt(ll.lat, ll.lon);
      if (g != null) {
        const minR = (MARS_SPHERE_RADIUS_M + g + MIN_CLEARANCE_M) * UNITS_PER_M;
        if (r < minR) pos = pos.multiplyScalar(minR / r);
      }
    }
    camera.position.copy(pos.applyMatrix4(m));
    camera.up.copy(camUp.transformDirection(m));
    camera.lookAt(target.applyMatrix4(m));
    camera.updateMatrixWorld();
    // Clip planes follow the altitude (precision from orbit down to the ground)
    const alt = altitude();
    const near = clamp(alt * 0.25, 0.5, 2e5) * UNITS_PER_M;
    const horizon = Math.sqrt(2 * MARS_SPHERE_RADIUS_M * (alt + 30000) + (alt + 30000) ** 2);
    const far = Math.max(ORBIT.planetRadius * 60, (horizon + st.range) * UNITS_PER_M * 1.5);
    if (Math.abs(camera.near - near) / near > 0.05 || Math.abs(camera.far - far) / far > 0.05) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  function toLatLon(v) {
    const r = v.length() || 1;
    const lat = 90 - Math.acos(clamp(v.y / r, -1, 1)) / DEG;
    let lon = Math.atan2(v.z, -v.x) / DEG - 180;
    if (lon < -180) lon += 360;
    if (lon >= 180) lon -= 360;
    return { lat, lon };
  }

  /** Camera altitude above the ground (m). */
  function altitude() {
    frame.updateMatrixWorld();
    const local = frame.worldToLocal(camera.position.clone());
    const ll = toLatLon(local);
    const g = heightAt?.(ll.lat, ll.lon) ?? 0;
    return Math.max(1, local.length() / UNITS_PER_M - MARS_SPHERE_RADIUS_M - g);
  }

  function metresPerPixel() {
    const fov = camera.fov * DEG;
    return (2 * st.range * Math.tan(fov / 2)) / Math.max(1, dom.clientHeight);
  }

  function panBy(dx, dy) {
    const mpp = metresPerPixel() * (1 + Math.sin(st.tilt * DEG) * 0.6);
    const hd = st.heading * DEG;
    // screen right / forward in ground metres
    const right = -dx * mpp;
    const fwd = dy * mpp;
    const e = right * Math.cos(hd) + fwd * Math.sin(hd);
    const n = -right * Math.sin(hd) + fwd * Math.cos(hd);
    st.lat = clamp(st.lat + n / (MARS_SPHERE_RADIUS_M * DEG), -89.5, 89.5);
    st.lon += e / (MARS_SPHERE_RADIUS_M * DEG * Math.max(0.02, Math.cos(st.lat * DEG)));
    st.lon = ((((st.lon + 180) % 360) + 360) % 360) - 180;
  }

  function clampTilt() {
    goal.tilt = clamp(goal.tilt, 0, maxTiltForRange(goal.range));
  }

  /* ---------- picking ---------- */
  let pickFn = null; // (clientX, clientY) => {lat, lon} | null

  function zoomAt(factor, clientX, clientY) {
    const old = goal.range;
    goal.range = clamp(goal.range * factor, MIN_RANGE_M, MAX_RANGE_M);
    clampTilt();
    const k = 1 - goal.range / old;
    if (pickFn && clientX != null && k > 0) {
      const ll = pickFn(clientX, clientY);
      if (ll) {
        // move the target part of the way towards the point under the cursor
        let dLon = ll.lon - st.lon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        st.lat += (ll.lat - st.lat) * k;
        st.lon += dLon * k;
      }
    }
  }

  /* ---------- events ---------- */
  function start() {
    cancelTween();
    ctl.onStart?.();
  }

  dom.addEventListener('contextmenu', (e) => ctl.enabled && e.preventDefault());
  dom.addEventListener(
    'wheel',
    (e) => {
      if (!ctl.enabled) return;
      e.preventDefault();
      start();
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(Math.exp(clamp(d, -300, 300) * 0.0016), e.clientX, e.clientY);
    },
    { passive: false }
  );
  dom.addEventListener('pointerdown', (e) => {
    if (!ctl.enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dom.setPointerCapture?.(e.pointerId);
    start();
    if (pointers.size === 1) {
      const rotate = e.button === 2 || e.button === 1 || e.ctrlKey || e.shiftKey;
      drag = { x: e.clientX, y: e.clientY, rotate };
    } else if (pointers.size === 2) {
      drag = null;
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), y: (a.y + b.y) / 2 };
    }
  });
  dom.addEventListener('pointermove', (e) => {
    if (!ctl.enabled || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const y = (a.y + b.y) / 2;
      if (dist > 0 && pinch.dist > 0) zoomAt(pinch.dist / dist, (a.x + b.x) / 2, y);
      goal.heading = (goal.heading - (angle - pinch.angle) / DEG + 360) % 360;
      goal.tilt += (pinch.y - y) * 0.25;
      clampTilt();
      pinch = { dist, angle, y };
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.rotate) {
      goal.heading = (goal.heading - dx * 0.3 + 360) % 360;
      goal.tilt -= dy * 0.25;
      clampTilt();
    } else panBy(dx, dy);
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) drag = null;
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  addEventListener('keydown', (e) => {
    if (!ctl.enabled || e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const step = 60;
    const k = e.key;
    if (k === 'ArrowLeft') panBy(step, 0);
    else if (k === 'ArrowRight') panBy(-step, 0);
    else if (k === 'ArrowUp') panBy(0, step);
    else if (k === 'ArrowDown') panBy(0, -step);
    else if (k === '+' || k === '=') zoomAt(0.7);
    else if (k === '-' || k === '_') zoomAt(1.4);
    else if (k === 'q' || k === 'Q') goal.heading = (goal.heading - 10 + 360) % 360;
    else if (k === 'e' || k === 'E') goal.heading = (goal.heading + 10) % 360;
    else if (k === 'PageUp') (goal.tilt += 8), clampTilt();
    else if (k === 'PageDown') (goal.tilt -= 8), clampTilt();
    else return;
    start();
  });

  /* ---------- flights ---------- */
  function cancelTween() {
    if (ctl.tween) {
      ctl.tween.cancelled = true;
      ctl.tween = null;
    }
  }

  /**
   * Fly to a view (great-circle path that rises between distant points).
   * @param {{lat:number, lon:number, range?:number, heading?:number, tilt?:number}} to
   */
  function flyTo(to, duration = 1800) {
    cancelTween();
    const from = { ...st };
    const end = {
      lat: to.lat,
      lon: to.lon,
      range: clamp(to.range ?? st.range, MIN_RANGE_M, MAX_RANGE_M),
      heading: to.heading ?? st.heading,
      tilt: to.tilt ?? 0,
    };
    let dLon = end.lon - from.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dHead = ((((end.heading - from.heading) % 360) + 540) % 360) - 180;
    const arc = Math.hypot(end.lat - from.lat, dLon * Math.cos(from.lat * DEG)) * DEG * MARS_SPHERE_RADIUS_M;
    const peak = Math.max(from.range, end.range, Math.min(MAX_RANGE_M, arc * 1.1));
    if (duration <= 0) {
      Object.assign(st, end);
      Object.assign(goal, { range: end.range, heading: end.heading, tilt: end.tilt });
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const tw = { cancelled: false };
      ctl.tween = tw;
      const t0 = performance.now();
      const step = (now) => {
        if (tw.cancelled) return resolve();
        const t = Math.min(1, (now - t0) / duration);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        st.lat = lerp(from.lat, end.lat, e);
        st.lon = from.lon + dLon * e;
        st.heading = (from.heading + dHead * e + 360) % 360;
        st.tilt = lerp(from.tilt, end.tilt, e);
        // log-space range with a rise in the middle
        const l0 = Math.log(from.range);
        const l1 = Math.log(end.range);
        const bump = Math.max(0, Math.log(peak) - Math.max(l0, l1));
        st.range = clamp(Math.exp(lerp(l0, l1, e) + bump * Math.sin(Math.PI * e)), MIN_RANGE_M, MAX_RANGE_M);
        goal.range = st.range;
        goal.heading = st.heading;
        goal.tilt = st.tilt;
        if (t < 1) requestAnimationFrame(step);
        else {
          ctl.tween = null;
          Object.assign(st, end);
          Object.assign(goal, { range: end.range, heading: end.heading, tilt: end.tilt });
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- per-frame ---------- */
  function update(dt) {
    if (heightAt) {
      const g = heightAt(st.lat, st.lon);
      if (g != null) st.h += (g - st.h) * Math.min(1, dt * 6);
    }
    if (!ctl.tween) {
      const k = Math.min(1, dt * 10);
      st.range = Math.exp(lerp(Math.log(st.range), Math.log(goal.range), k));
      const dh = ((((goal.heading - st.heading) % 360) + 540) % 360) - 180;
      st.heading = (st.heading + dh * k + 360) % 360;
      st.tilt = lerp(st.tilt, goal.tilt, k);
      if (ctl.autoRotate && !pointers.size) st.lon = ((st.lon + ctl.autoRotateSpeed * dt * 4 + 540) % 360) - 180;
    }
    apply();
  }

  return Object.assign(ctl, {
    state: st,
    goal,
    update,
    flyTo,
    cancelTween,
    altitude,
    setPicker(fn) {
      pickFn = fn;
    },
    /** Set the view immediately. */
    jumpTo(view) {
      cancelTween();
      Object.assign(st, view);
      goal.range = st.range;
      goal.heading = st.heading;
      goal.tilt = st.tilt;
      apply();
    },
    zoomBy(f) {
      zoomAt(f);
    },
    resetNorth() {
      goal.heading = 0;
      goal.tilt = 0;
    },
  });
}
