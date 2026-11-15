/**
 * Route drawn on the globe: waypoint pins (constant on-screen size), the
 * planned path draped on the terrain (lifted a little more when the camera
 * is high, so it never sinks into coarse tiles), a faint copy that shows
 * through hills, straight dashed previews before the route is computed and
 * the O₂ range ring around the base.
 */
import * as THREE from 'three';
import { latLonToXYZ, greatCirclePoints } from '../core/math.js';
import { MARS_SPHERE_RADIUS_M, toLatLon } from '../geo/mars.js';
import { UNITS_PER_M } from './terrainGlobe.js';
import { createLabelSprite } from './markers.js';

function localPoint(lat, lon, hM) {
  const p = latLonToXYZ(lat, lon, (MARS_SPHERE_RADIUS_M + hM) * UNITS_PER_M);
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** Line object whose vertices are relative to their centroid (precision). */
function rtcLine(points, material) {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  c.divideScalar(Math.max(1, points.length));
  const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => p.clone().sub(c)));
  const line = new THREE.Line(geo, material);
  line.position.copy(c);
  line.frustumCulled = false;
  return line;
}

export function createRouteLayer(frame, { heightAt }) {
  const group = new THREE.Group();
  group.name = 'route';
  frame.add(group);
  const pins = new THREE.Group();
  group.add(pins);
  let pathGroup = null;
  let preview = null;
  let ring = null;
  let data = { points: [], path: null, color: 0x4fd1ff, ring: null };
  let lift = 2;

  function clearObj(obj) {
    if (!obj) return;
    group.remove(obj);
    obj.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  function buildPins() {
    while (pins.children.length) {
      const s = pins.children.pop();
      s.material.map?.dispose();
      s.material.dispose();
    }
    data.points.forEach((p, i) => {
      const label = i === 0 ? '🏠 Base' : `${p.science ? '🔬' : '🚩'} ${i}`;
      const s = createLabelSprite(label, i === 0 ? '#39ff88' : p.science ? '#ffcc33' : '#4fd1ff');
      s.center.set(0.5, 0);
      s.scale.multiplyScalar(0.9);
      s.userData.ll = p;
      s.userData.index = i;
      pins.add(s);
    });
    placePins();
  }

  function placePins() {
    for (const s of pins.children) {
      const p = s.userData.ll;
      const h = p.h ?? heightAt(p.lat, p.lon) ?? 0;
      s.position.copy(localPoint(p.lat, p.lon, h + lift * 2));
    }
  }

  function buildPath() {
    clearObj(pathGroup);
    clearObj(preview);
    pathGroup = null;
    preview = null;
    if (data.path?.length > 1) {
      const pts = data.path.map((q) => localPoint(q.lat, q.lon, q.h + lift));
      pathGroup = new THREE.Group();
      pathGroup.add(
        rtcLine(pts, new THREE.LineBasicMaterial({ color: data.color, toneMapped: false })),
        rtcLine(
          pts,
          new THREE.LineBasicMaterial({ color: data.color, transparent: true, opacity: 0.28, depthTest: false, toneMapped: false })
        )
      );
      pathGroup.children[1].renderOrder = 5;
      pathGroup.userData.ghost = pathGroup.children[1];
      group.add(pathGroup);
    } else if (data.points.length > 1) {
      // straight previews (great circles) until the route is computed
      const seq = data.points.concat(data.returnToBase ? [data.points[0]] : []);
      const pts = [];
      for (let i = 0; i < seq.length - 1; i++)
        for (const q of greatCirclePoints(seq[i].lat, seq[i].lon, seq[i + 1].lat, seq[i + 1].lon, 48)) {
          const h = heightAt(q.lat, q.lon) ?? 0;
          pts.push(localPoint(q.lat, q.lon, h + lift * 3));
        }
      preview = new THREE.Group();
      const line = rtcLine(
        pts,
        new THREE.LineDashedMaterial({
          color: 0xffffff,
          dashSize: 0.004,
          gapSize: 0.003,
          transparent: true,
          opacity: 0.7,
        })
      );
      line.computeLineDistances();
      line.renderOrder = 5;
      preview.add(line);
      group.add(preview);
    }
  }

  function buildRing() {
    clearObj(ring);
    ring = null;
    if (!data.ring || !data.points.length) return;
    const base = data.points[0];
    const pts = [];
    for (let a = 0; a <= 360; a += 3) {
      const ll = toLatLon(Math.sin((a * Math.PI) / 180) * data.ring, Math.cos((a * Math.PI) / 180) * data.ring, base);
      const h = heightAt(ll.lat, ll.lon) ?? base.h ?? 0;
      pts.push(localPoint(ll.lat, ll.lon, h + lift * 2));
    }
    ring = new THREE.Group();
    const line = rtcLine(
      pts,
      new THREE.LineDashedMaterial({ color: 0x39ff88, dashSize: 0.002, gapSize: 0.002, transparent: true, opacity: 0.6 })
    );
    line.computeLineDistances();
    ring.add(line);
    group.add(ring);
  }

  let lastAlt = 0;
  let lastRebuild = 0;
  return {
    group,
    /**
     * @param {{points:{lat:number,lon:number,h?:number,science?:boolean}[], path?:{lat:number,lon:number,h:number}[]|null,
     *          color?:number, returnToBase?:boolean, ring?:number|null}} d
     */
    set(d) {
      data = { ...data, ...d };
      buildPins();
      buildPath();
      buildRing();
    },
    /** Re-lift lines when the altitude changes a lot (coarse tiles at altitude). */
    update(altitudeM) {
      // the faint "see-through" copy only helps near the ground (hills); from
      // orbit it would show the route through the planet
      if (pathGroup?.userData.ghost) pathGroup.userData.ghost.visible = altitudeM < 60e3;
      const want = Math.min(4000, Math.max(1.5, altitudeM * 0.003));
      const now = performance.now();
      if ((Math.abs(Math.log(want / lift)) > 0.6 || Math.abs(Math.log(altitudeM / (lastAlt || 1))) > 0.6) && now - lastRebuild > 250) {
        lift = want;
        lastAlt = altitudeM;
        lastRebuild = now;
        placePins();
        buildPath();
        buildRing();
      }
    },
    /** Waypoint pin under the pointer (for dragging). */
    pickPin(raycaster) {
      const hits = raycaster.intersectObjects(pins.children, false);
      return hits.length ? hits[0].object.userData.index : null;
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}
