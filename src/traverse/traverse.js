/**
 * First-person route rehearsal ("Percorrer a rota").
 *
 * Starts at the base of a route planned on the globe and follows it on the
 * real ground, streamed in chunks around the walker (chunks.js) and hidden
 * behind the Martian haze. Two modes:
 *   - follow: the walker moves along the planned path at the modelled
 *     walking (or rover) speed × the chosen time factor; look around freely,
 *   - free: walk anywhere (WASD / joystick) to inspect the terrain.
 * The EVA clock, O₂ and the Sun advance with the EVA time (Mars24 Sun
 * position at the planned date), so the light and the consumables in the
 * helmet HUD match the plan.
 */
import * as THREE from 'three';
import { SURFACE } from '../config.js';
import { emit } from '../core/events.js';
import { onResize, renderView, disposeObject } from '../core/renderer.js';
import { prefersReducedMotion } from '../core/settings.js';
import * as input from '../core/input.js';
import { toLocal, toLatLon, formatLatLon } from '../geo/mars.js';
import { sampleHeight } from '../geo/heightGrid.js';
import { sunPosition, localSolarTime, formatHours } from '../geo/mars24.js';
import { walkingSpeed, walkingMetabolic, o2Capacity, surfaceDoseRate } from '../planner/eva.js';
import { getSurfaceTextures } from '../surface/textures.js';
import { createSky, sunFromAzEl } from '../surface/sky.js';
import { createDust } from '../surface/effects.js';
import { Player } from '../surface/player.js';
import { createLabelSprite } from '../orbit/markers.js';
import { createChunkManager, CHUNK } from './chunks.js';
import { createHorizon } from './horizon.js';
import { loadTraverse, loadWeather } from '../geo/missionData.js';
import { marsTime } from '../geo/mars24.js';
import { surfacePressure } from '../planner/eva.js';

export const TIME_SCALES = [1, 2, 5, 10, 30, 60, 120];
const MAX_SPEED = 60; // m/s: faster than this the ground cannot stream in time
const O2_KG_PER_W_H = 0.000247;

/**
 * Typical dust optical depth at Jezero for a season (climatology from
 * Perseverance/Curiosity sky measurements: ~0.4–0.5 around aphelion, up to
 * ~0.9 in the dusty perihelion season). An estimate, not a forecast.
 */
export function dustTau(Ls) {
  const dusty = Math.max(0, Math.cos(((Ls - 255) * Math.PI) / 180)); // peaks at Ls 255°
  return 0.42 + 0.48 * dusty ** 1.5;
}

/** Visibility scale (m) of the haze for an optical depth. */
export function hazeDistance(tau) {
  return 9000 / Math.max(0.2, tau);
}

/** Air temperature estimate from MEDA's daily min/max and the local time. */
export function airTemperature(minT, maxT, ltst) {
  // coldest near sunrise (~5.5 h), warmest early afternoon (~13.5 h)
  const phase = ((ltst - 13.5) / 24) * 2 * Math.PI;
  return minT + (maxT - minT) * (0.5 + 0.5 * Math.cos(phase));
}

function lerpAngle(a, b, t) {
  const d = ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + d * t;
}

export const traverse = {
  scene: null,
  camera: null,
  renderer: null,
  world: null,
  player: new Player(),

  init(renderer, glowTexture, quality) {
    this.renderer = renderer;
    this.glowTexture = glowTexture;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.25, 45000);
    onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.hemi = new THREE.HemisphereLight(0xf2c49b, 0x5a3220, 1.1);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.8);
    this.sun.shadow.camera.left = -45;
    this.sun.shadow.camera.right = 45;
    this.sun.shadow.camera.top = 45;
    this.sun.shadow.camera.bottom = -45;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sky = createSky();
    this.scene.add(this.sky.mesh);
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xfff3d6,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    this.sunSprite.scale.set(36, 36, 1);
    this.scene.add(this.sunSprite);
    this.scene.fog = new THREE.FogExp2(0xe3ab78, 1 / 18000);
  },

  setQuality(quality) {
    this.quality = quality;
  },

  /**
   * Build the rehearsal for a computed route.
   * @param {{route:any, points:any[], name:string, startD?:number, heightAtLL?:(lat:number, lon:number)=>number|null}} plan
   */
  async build(plan, onProgress) {
    this.dispose();
    const textures = await getSurfaceTextures();
    const route = plan.route;
    const origin = { lat: route.path[0].lat, lon: route.path[0].lon };
    const baseH = route.path[0].h;
    const q = this.quality;
    SURFACE.size = 1e9; // no world bounds: the ground streams around the walker
    const root = new THREE.Group();
    root.name = 'traverse';
    this.scene.add(root);

    // Route in local metres
    const local = route.path.map((p) => {
      const l = toLocal(p.lat, p.lon, origin);
      return { x: l.e, z: -l.n, h: p.h - baseH, d: p.d };
    });
    // Coarse heights (route grids, then the globe) where no chunk is loaded yet
    const legs = route.legs.filter((l) => l.site);
    let lastFallback = 0;
    const fallbackHeight = (x, z) => {
      const ll = toLatLon(x, -z, origin);
      for (const leg of legs) {
        const l = toLocal(ll.lat, ll.lon, leg.center);
        const half = leg.site.grid.half - leg.site.grid.cell;
        if (Math.abs(l.e) < half && Math.abs(l.n) < half) return (lastFallback = sampleHeight(leg.site.grid, l.e, l.n) - baseH);
      }
      const g = plan.heightAtLL?.(ll.lat, ll.lon);
      return g != null ? (lastFallback = g - baseH) : lastFallback;
    };

    // Habitat next to the base (collider) + stop beacons
    const stops = [];
    const habitat = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6, metalness: 0.1 })
    );
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(4.05, 4.05, 0.6, 32),
      new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.5, metalness: 0.6 })
    );
    ring.position.y = 0.3;
    habitat.add(dome, ring);
    habitat.position.set(-7, 0, 5);
    dome.castShadow = q.shadows > 0;
    root.add(habitat);

    const pillarGeo = new THREE.CylinderGeometry(0.25, 0.25, 80, 8, 1, true);
    plan.points.forEach((p, i) => {
      if (i === 0) return;
      const l = toLocal(p.lat, p.lon, origin);
      const color = p.science ? 0xffcc33 : 0x4fd1ff;
      const pillar = new THREE.Mesh(
        pillarGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        })
      );
      const label = createLabelSprite(`${p.science ? '🔬' : '🚩'} ${i}`, p.science ? '#ffcc33' : '#4fd1ff');
      label.material.depthTest = true; // on the ground, hills hide the stop labels
      const g = new THREE.Group();
      g.add(pillar, label);
      pillar.position.y = 40;
      label.position.y = 4;
      g.position.set(l.e, 0, -l.n);
      root.add(g);
      stops.push({
        i,
        x: l.e,
        z: -l.n,
        group: g,
        d: route.stopD[i - 1],
        minutes: p.minutes ?? route.params.stopMinutes,
        science: p.science,
      });
    });

    // Route line near the walker (rebuilt as chunks arrive)
    const MAXP = 900;
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    lineGeo.setDrawRange(0, 0);
    const routeLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.95 }));
    routeLine.frustumCulled = false;
    root.add(routeLine);

    const dust = createDust(Math.round(q.dustParticles * 0.5), this.glowTexture);
    root.add(dust.object);

    const chunks = createChunkManager({
      origin,
      baseH,
      parent: root,
      textures,
      shadows: q.shadows > 0,
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      fallbackHeight,
      exclusions: [{ x: -7, z: 5, r: 6 }],
      lowDetail: q.terrainSegments < 120,
    });
    // generous rings on strong devices
    if (q.terrainSegments >= 160) chunks.setRadius({ active: 3.2, preload: 4.2, drop: 5.2 });
    const horizon = createHorizon({
      origin,
      baseH,
      parent: root,
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
      getTint: () => chunks.tint,
      lowDetail: q.terrainSegments < 120,
    });

    // Real Perseverance wheel tracks (JPL MMGIS traverse) where the route is in Jezero
    const tracks = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6000 * 3), 3)),
      new THREE.LineBasicMaterial({ color: 0x3a2618, transparent: true, opacity: 0.55 })
    );
    tracks.geometry.setDrawRange(0, 0);
    tracks.frustumCulled = false;
    root.add(tracks);
    let trackLines = [];
    const inJezero = origin.lat > 17.8 && origin.lat < 19.2 && origin.lon > 76.8 && origin.lon < 78.2;
    if (inJezero)
      loadTraverse()
        .then((lines) => {
          trackLines = lines
            .map((l) => l.map(([lon, lat]) => toLocal(lat, lon, origin)).map((pt) => ({ x: pt.e, z: -pt.n })))
            .filter((l) => l.some((pt) => Math.hypot(pt.x, pt.z) < 6000));
          if (this.world) this.world.trackLines = trackLines;
        })
        .catch(() => {});
    let weather = null;
    loadWeather()
      .then((ws) => {
        weather = ws.find((x) => x.minTemp != null && x.maxTemp != null) || null;
        if (this.world) this.world.weather = weather;
      })
      .catch(() => {});

    const startD = Math.max(0, plan.startD ?? 0);
    this.player.reset();
    this.world = {
      plan,
      route,
      origin,
      baseH,
      local,
      root,
      chunks,
      stops,
      habitat,
      routeLine,
      dust,
      mode: 'follow',
      s: startD,
      speedIndex: 0, // real time by default
      horizon,
      tracks,
      trackLines,
      weather,
      atStop: null,
      finished: null,
      trackTimer: 0,
      evaSeconds: 0,
      o2Kg: 0,
      doseMsv: 0,
      walked: 0,
      passed: new Set(stops.filter((st) => st.d < startD).map((st) => st.i)),
      stopHold: 0,
      lookOffset: 0,
      lookIdle: 0,
      paused: false,
      lineTimer: 0,
      sunTimer: 0,
      waitingGround: false,
      sunInfo: null,
    };
    const start = this.positionAt(startD);
    this.player.x = start.x;
    this.player.z = start.z;
    this.player.yaw = start.yaw;
    if (startD > 0) this.syncConsumables();
    chunks.setOnTint?.((c) => horizon.setTint(c));

    // Wait for the ground under the walker (and around it) before showing
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        chunks.update(this.player.x, this.player.z, this.aheadPoints(400));
        const s = chunks.stats();
        onProgress?.(Math.min(1, s.ready / 9));
        if ((chunks.readyAt(this.player.x, this.player.z) && s.ready >= Math.min(9, s.total)) || performance.now() - t0 > 25000)
          return resolve();
        setTimeout(tick, 120);
      };
      tick();
    });
    this.updateSun(true);
    this.rebuildLine();
    this.updateCamera();
    return this.world;
  },

  dispose() {
    const w = this.world;
    if (!w) return;
    w.chunks.dispose();
    w.horizon.dispose();
    this.scene.remove(w.root);
    disposeObject(w.root);
    this.world = null;
  },

  /* ---------------- route helpers ---------------- */
  positionAt(d) {
    const L = this.world.local;
    let lo = 0;
    let hi = L.length - 1;
    if (d >= L[hi].d) lo = hi - 1;
    else
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (L[mid].d <= d) lo = mid;
        else hi = mid;
      }
    const a = L[lo];
    const b = L[Math.min(L.length - 1, lo + 1)];
    const t = Math.min(1, Math.max(0, (d - a.d) / Math.max(1e-9, b.d - a.d)));
    // heading from a point a few metres ahead
    const ahead = this.pointAt(Math.min(L[L.length - 1].d, d + 6));
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const yaw = Math.atan2(ahead.x - x, ahead.z - z) || 0;
    return { x, z, yaw, grade: (Math.atan2(b.h - a.h, Math.max(0.01, b.d - a.d)) * 180) / Math.PI };
  },

  pointAt(d) {
    const L = this.world.local;
    let lo = 0;
    let hi = L.length - 1;
    if (d >= L[hi].d) return L[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (L[mid].d <= d) lo = mid;
      else hi = mid;
    }
    const a = L[lo];
    const b = L[hi];
    const t = (d - a.d) / Math.max(1e-9, b.d - a.d);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  },

  /** Route points ahead of the walker (to stream those chunks first). */
  aheadPoints(metres) {
    const w = this.world;
    const out = [];
    for (let d = w.s; d < Math.min(w.s + metres, w.local[w.local.length - 1].d); d += CHUNK / 2) out.push(this.pointAt(d));
    return out;
  },

  /** EVA clock and O₂ from the route model at the current distance (follow mode). */
  syncConsumables() {
    const w = this.world;
    const ev = w.route.evaluation;
    const legs = ev.legs;
    let t = 0;
    let o2 = 0;
    if (legs.length) {
      let lo = 0;
      while (lo < legs.length - 1 && legs[lo + 1].d <= w.s) lo++;
      const a = legs[lo];
      const b = legs[Math.min(legs.length - 1, lo + 1)];
      const f = b.d > a.d ? Math.min(1, Math.max(0, (w.s - a.d) / (b.d - a.d))) : 0;
      t = a.t + (b.t - a.t) * f;
      o2 = a.o2 + (b.o2 - a.o2) * f;
    }
    const p = w.route.params;
    for (const st of w.stops)
      if (w.passed.has(st.i)) {
        t += st.minutes * 60;
        o2 += p.restMetabolicW * (st.minutes / 60) * O2_KG_PER_W_H;
      }
    w.evaSeconds = t;
    w.o2Kg = o2;
  },

  get timeScale() {
    return TIME_SCALES[this.world?.speedIndex ?? 1];
  },

  setTimeScaleIndex(i) {
    if (!this.world) return;
    this.world.speedIndex = Math.max(0, Math.min(TIME_SCALES.length - 1, i));
  },

  setMode(mode) {
    const w = this.world;
    if (!w || w.mode === mode) return;
    w.mode = mode;
    if (mode === 'follow') {
      // snap back to the nearest point of the route
      let best = w.s;
      let bestD = Infinity;
      for (const p of w.local) {
        const d = Math.hypot(p.x - this.player.x, p.z - this.player.z);
        if (d < bestD) {
          bestD = d;
          best = p.d;
        }
      }
      w.s = best;
      w.lookOffset = 0;
      w.baseYaw = this.player.yaw;
    }
    emit('traverse:mode', { mode });
  },

  /* ---------------- per frame ---------------- */
  update(dt) {
    const w = this.world;
    if (!w) return null;
    const p = this.player;
    const rm = prefersReducedMotion();
    const params = w.route.params;
    const scale = this.timeScale;
    const rover = params.mode === 'rover';
    const look = input.consumeLook(dt);
    const axis = input.moveAxis();
    if (w.mode === 'follow' && (Math.abs(axis.x) > 0.2 || Math.abs(axis.y) > 0.2)) this.setMode('free');
    const end = w.local[w.local.length - 1].d;
    let arrivedStop = null;
    let atEnd = false;

    if (!w.paused) {
      if (w.mode === 'follow') {
        const here = this.positionAt(w.s);
        const base = rover ? params.roverSpeed * Math.max(0.3, 1 - Math.abs(here.grade) / 40) : walkingSpeed(here.grade, params);
        const v = Math.min(MAX_SPEED, base * scale);
        if (w.atStop) {
          // working at a stop: the planned minutes pass on the EVA clock (× time factor)
          const evaDt = Math.min(w.atStop.remaining, dt * scale);
          w.atStop.remaining -= evaDt;
          w.evaSeconds += evaDt;
          w.o2Kg += params.restMetabolicW * (evaDt / 3600) * O2_KG_PER_W_H;
          if (input.isDown('jump') || w.atStop.remaining <= 0) {
            // skipping = fast-forward: the rest of the planned work still counts
            const rest = Math.max(0, w.atStop.remaining);
            w.evaSeconds += rest;
            w.o2Kg += params.restMetabolicW * (rest / 3600) * O2_KG_PER_W_H;
            w.atStop = null;
          }
        } else if (w.s >= end) {
          if (!w.finished) w.finished = { evaSeconds: w.evaSeconds, o2Kg: w.o2Kg };
        } else {
          const next = this.pointAt(Math.min(end, w.s + v * dt + 4));
          w.waitingGround = !w.chunks.readyAt(next.x, next.z);
          if (!w.waitingGround) {
            const prevS = w.s;
            // stop exactly at the next stop
            const nextStop = w.stops.find((st) => !w.passed.has(st.i) && st.d > prevS - 1);
            const target = Math.min(end, w.s + v * dt, nextStop ? nextStop.d : Infinity);
            w.s = target;
            const moved = w.s - prevS;
            w.walked += moved;
            // EVA time = distance / modelled speed (even when the factor is capped)
            const evaDt = moved / Math.max(0.05, base);
            w.evaSeconds += evaDt;
            const watts = rover ? params.restMetabolicW * 0.8 : walkingMetabolic(here.grade, params);
            w.o2Kg += watts * (evaDt / 3600) * O2_KG_PER_W_H;
            if (nextStop && w.s >= nextStop.d - 1e-6) {
              w.passed.add(nextStop.i);
              w.atStop = { st: nextStop, remaining: nextStop.minutes * 60 };
              arrivedStop = nextStop;
            }
            atEnd = w.s >= end;
          }
        }
        const pos = this.positionAt(w.s);
        p.x = pos.x;
        p.z = pos.z;
        // look around freely; the view drifts back to the route after a while
        if (Math.abs(look.dx) + Math.abs(look.dy) > 1e-4) w.lookIdle = 0;
        else w.lookIdle += dt;
        w.lookOffset -= look.dx;
        if (w.lookIdle > 2.5) w.lookOffset *= Math.max(0, 1 - dt * 1.5);
        w.baseYaw = lerpAngle(w.baseYaw ?? pos.yaw, pos.yaw, Math.min(1, dt * 3));
        p.yaw = w.baseYaw + w.lookOffset;
        p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - look.dy));
      } else {
        SURFACE.walkSpeed = Math.min(MAX_SPEED, (rover ? params.roverSpeed : params.walkSpeed * 1.4) * scale);
        const g = w.chunks.gradient(p.x, p.z);
        const prevX = p.x;
        const prevZ = p.z;
        p.inRover = false;
        p.update(dt, {
          axis,
          look,
          jump: input.isDown('jump'),
          sprint: input.isDown('sprint'),
          terrain: w.chunks,
          colliders: [...w.chunks.collidersNear(p.x, p.z), { x: w.habitat.position.x, z: w.habitat.position.z, r: 4.3 }],
          hazard: { speedMul: 1, wind: { x: 0, z: 0 } },
        });
        const moved = Math.hypot(p.x - prevX, p.z - prevZ);
        w.walked += moved;
        const grade = (Math.atan(g.gx * Math.sin(p.yaw) + g.gz * Math.cos(p.yaw)) * 180) / Math.PI;
        const evaDt = (moved > 1e-4 ? moved / Math.max(0.05, SURFACE.walkSpeed) : dt) * scale;
        w.evaSeconds += evaDt;
        const watts = moved > 1e-4 ? (rover ? params.restMetabolicW * 0.8 : walkingMetabolic(grade, params)) : params.restMetabolicW;
        w.o2Kg += watts * (evaDt / 3600) * O2_KG_PER_W_H;
      }
    }
    const altitude = w.chunks.height(p.x, p.z);
    w.doseMsv = (surfaceDoseRate(w.baseH + altitude) * w.evaSeconds) / 86400;

    // streaming, line, beacons, sun
    w.chunks.update(p.x, p.z, this.aheadPoints(w.mode === 'follow' ? 500 : 0));
    w.lineTimer -= dt;
    if (w.lineTimer <= 0) {
      w.lineTimer = 0.35;
      this.rebuildLine();
      for (const st of w.stops) st.group.position.y = w.chunks.height(st.x, st.z);
      w.habitat.position.y = w.chunks.height(w.habitat.position.x, w.habitat.position.z) - 0.2;
    }
    w.sunTimer -= dt;
    if (w.sunTimer <= 0) {
      w.sunTimer = 0.5;
      this.updateSun();
    }
    const Ls = marsTime(w.route.timeMs + w.evaSeconds * 1000).Ls;
    const tau = dustTau(Ls);
    this.scene.fog.color.copy(this.sky.update(w.sunInfo, Math.min(0.6, (tau - 0.4) * 0.8)));
    this.scene.fog.density = 1 / hazeDistance(tau);
    w.horizon.update(p.x, p.z, this.camera.position, (i, j) => w.chunks.isReady(i, j));
    w.trackTimer -= dt;
    if (w.trackTimer <= 0) {
      w.trackTimer = 0.8;
      this.rebuildTracks();
    }
    w.dust.update(dt, p, { x: 0.6, z: 0.2 }, 0);
    this.updateCamera(rm);

    const capacity = o2Capacity(params) * (rover ? 1.6 : 1);
    const ll = toLatLon(p.x, -p.z, w.origin);
    const g = w.chunks.gradient(p.x, p.z);
    const ch = w.chunks.chunkAt(p.x, p.z);
    const nextStop = w.stops.find((st) => !w.passed.has(st.i));
    return {
      mode: w.mode,
      paused: w.paused,
      s: w.s,
      total: end,
      walked: w.walked,
      evaSeconds: w.evaSeconds,
      o2Pct: Math.max(0, 100 - (w.o2Kg / capacity) * 100),
      doseMsv: w.doseMsv,
      altitude: w.baseH + altitude,
      slope: (Math.atan(Math.hypot(g.gx, g.gz)) * 180) / Math.PI,
      latLon: ll,
      ltst: localSolarTime(w.route.timeMs + w.evaSeconds * 1000, ll.lon).ltst,
      timeScale: this.timeScale,
      waiting: w.waitingGround,
      arrivedStop,
      atEnd,
      nextStop: nextStop ? { ...nextStop, dist: Math.hypot(nextStop.x - p.x, nextStop.z - p.z) } : null,
      base: { x: 0, z: 0, dist: Math.hypot(p.x, p.z) },
      chunk: ch ? { level: ch.level, mpp: ch.mpp, layer: ch.layer, rocks: ch.rocks || 0, pebbles: ch.pebbles || 0 } : null,
      streaming: w.chunks.stats(),
      atStop: w.atStop ? { i: w.atStop.st.i, remaining: w.atStop.remaining, science: w.atStop.st.science } : null,
      finished: w.finished ? { ...w.finished, planned: w.route.evaluation.totalSeconds } : null,
      env: {
        tau,
        haze: hazeDistance(tau),
        pressure: surfacePressure(w.baseH + altitude, Ls),
        temp: w.weather
          ? airTemperature(w.weather.minTemp, w.weather.maxTemp, localSolarTime(w.route.timeMs + w.evaSeconds * 1000, ll.lon).ltst)
          : null,
        medaSol: w.weather?.sol ?? null,
      },
      horizon: w.horizon.info(),
      trackDist: w.trackDist ?? null,
    };
  },

  updateSun(force = false) {
    const w = this.world;
    const ll = toLatLon(this.player.x, -this.player.z, w.origin);
    const sp = sunPosition(w.route.timeMs + w.evaSeconds * 1000, ll.lat, ll.lon);
    const sun = sunFromAzEl(sp.azimuth, Math.max(-4, sp.elevation));
    w.sunInfo = sun;
    const q = this.quality;
    if (force) {
      this.sun.castShadow = q.shadows > 0;
      if (q.shadows > 0) {
        this.sun.shadow.mapSize.set(q.shadows, q.shadows);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.sun.color.set(0xfff0dc).lerp(new THREE.Color(0xffb27a), sun.low);
    // Dust: direct sunlight is attenuated by the optical depth along the path (Beer–Lambert),
    // the lost light comes back as diffuse sky light.
    const tau = dustTau(marsTime(w.route.timeMs + w.evaSeconds * 1000).Ls);
    const sinEl = Math.max(0.05, Math.sin((Math.max(0, sp.elevation) * Math.PI) / 180));
    const direct = Math.exp(-tau / sinEl);
    this.sun.intensity = 3.6 * direct * Math.max(0.05, 1 - sun.night);
    this.hemi.intensity = (0.55 + 0.9 * (1 - direct)) * (1 - sun.night * 0.85);
    w.light = { direct, tau };
    this.sunSprite.material.color.set(sun.low > 0.6 ? 0x9fc0f0 : 0xfff3d6);
    this.sunSprite.scale.setScalar(sun.low > 0.6 ? 24 : 36);
  },

  /** Route polyline within ±700 m of the walker, densified and draped on the ground. */
  rebuildLine() {
    const w = this.world;
    const p = this.player;
    const attr = w.routeLine.geometry.attributes.position;
    const max = attr.count;
    const L = w.local;
    // nearest index
    let near = 0;
    let best = Infinity;
    for (let k = 0; k < L.length; k++) {
      const d = (L[k].x - p.x) ** 2 + (L[k].z - p.z) ** 2;
      if (d < best) {
        best = d;
        near = k;
      }
    }
    const d0 = Math.max(0, L[near].d - 700);
    const d1 = Math.min(L[L.length - 1].d, L[near].d + 700);
    const step = Math.max(2, (d1 - d0) / (max - 1));
    let n = 0;
    for (let d = d0; d <= d1 && n < max; d += step) {
      const q = this.pointAt(d);
      attr.setXYZ(n++, q.x, w.chunks.height(q.x, q.z) + 0.3, q.z);
    }
    attr.needsUpdate = true;
    w.routeLine.geometry.setDrawRange(0, n);
  },

  /** Perseverance wheel tracks within ±500 m, draped on the loaded ground. */
  rebuildTracks() {
    const w = this.world;
    const lines = w.trackLines || [];
    const attr = w.tracks.geometry.attributes.position;
    const max = attr.count;
    const p = this.player;
    let n = 0;
    let nearest = Infinity;
    const R = 500;
    for (const line of lines) {
      for (let k = 1; k < line.length && n < max - 4; k++) {
        const a = line[k - 1];
        const b = line[k];
        const da = Math.hypot(a.x - p.x, a.z - p.z);
        if (da > R && Math.hypot(b.x - p.x, b.z - p.z) > R) continue;
        nearest = Math.min(nearest, da);
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const nx = -(b.z - a.z) / len;
        const nz = (b.x - a.x) / len;
        const steps = Math.max(1, Math.ceil(len / 2));
        for (let s = 0; s < steps && n < max - 4; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          for (const off of [-1.35, 1.35]) {
            const x0 = a.x + (b.x - a.x) * t0 + nx * off;
            const z0 = a.z + (b.z - a.z) * t0 + nz * off;
            const x1 = a.x + (b.x - a.x) * t1 + nx * off;
            const z1 = a.z + (b.z - a.z) * t1 + nz * off;
            attr.setXYZ(n++, x0, w.chunks.height(x0, z0) + 0.04, z0);
            attr.setXYZ(n++, x1, w.chunks.height(x1, z1) + 0.04, z1);
          }
        }
      }
    }
    attr.needsUpdate = true;
    w.tracks.geometry.setDrawRange(0, n);
    w.trackDist = Number.isFinite(nearest) ? nearest : null;
  },

  updateCamera(reducedMotion = false) {
    const w = this.world;
    if (!w) return;
    const rover = w.route.params.mode === 'rover';
    const p = this.player;
    p.inRover = rover;
    const e = p.eye(w.chunks, reducedMotion || w.mode === 'follow');
    this.camera.position.set(e.x, e.y, e.z);
    this.camera.lookAt(e.x + e.dx, e.y + e.dy, e.z + e.dz);
    this.sky.mesh.position.set(e.x, e.y, e.z);
    const sd = w.sunInfo.dir;
    this.sunSprite.position.set(e.x + sd.x * 700, e.y + sd.y * 700, e.z + sd.z * 700);
    this.sun.position.set(e.x + sd.x * 120, e.y + Math.max(10, sd.y * 120), e.z + sd.z * 120);
    this.sun.target.position.set(e.x, e.y, e.z);
  },

  /** Markers for compass/minimap (local metres). */
  markers() {
    const w = this.world;
    if (!w) return [];
    return [
      { kind: 'base', x: 0, z: 0 },
      ...w.stops.map((s) => ({ kind: w.passed.has(s.i) ? 'done' : s.science ? 'science' : 'stop', x: s.x, z: s.z, i: s.i })),
    ];
  },

  render() {
    renderView(this.scene, this.camera);
  },

  /** Where the walker is now (to place the globe camera on exit). */
  where() {
    const w = this.world;
    if (!w) return null;
    const ll = toLatLon(this.player.x, -this.player.z, w.origin);
    return {
      ...ll,
      heading: ((Math.atan2(Math.sin(this.player.yaw), -Math.cos(this.player.yaw)) * 180) / Math.PI + 360) % 360,
      label: formatLatLon(ll.lat, ll.lon, 4),
      ltst: formatHours(0),
    };
  },
};
