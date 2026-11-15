/**
 * Surface visual effects: drifting dust, footprints, landing puffs and the
 * sample-collection burst. All pooled (no allocations per frame).
 */
import * as THREE from 'three';

/* ---------------- Dust particles around the player ---------------- */
export function createDust(count, glowTexture) {
  const positions = new Float32Array(count * 3);
  const box = 40;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * box;
    positions[i * 3 + 1] = Math.random() * 12;
    positions[i * 3 + 2] = (Math.random() - 0.5) * box;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Round soft particles (the glow texture) instead of square points
  const mat = new THREE.PointsMaterial({
    color: 0xe8b88a,
    map: glowTexture,
    size: 0.09,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    object: points,
    /**
     * @param {number} dt
     * @param {{x:number,z:number}} center player position
     * @param {{x:number,z:number}} wind m/s
     * @param {number} storm 0..1
     */
    update(dt, center, wind, storm) {
      const p = geo.attributes.position.array;
      const half = box / 2;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        p[k] += (wind.x * 0.6 + (Math.random() - 0.5) * 0.3) * dt;
        p[k + 1] += (Math.random() - 0.52) * 0.25 * dt;
        p[k + 2] += (wind.z * 0.6 + (Math.random() - 0.5) * 0.3) * dt;
        if (p[k] - center.x > half) p[k] -= box;
        if (p[k] - center.x < -half) p[k] += box;
        if (p[k + 2] - center.z > half) p[k + 2] -= box;
        if (p[k + 2] - center.z < -half) p[k + 2] += box;
        if (p[k + 1] < 0) p[k + 1] = 12;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.25 + storm * 0.6;
      mat.size = 0.08 + storm * 0.12;
    },
  };
}

/* ---------------- Footprints ---------------- */
export function createFootprints(max = 240) {
  const geo = new THREE.PlaneGeometry(0.16, 0.3);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a2116, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  let next = 0;
  let left = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);
  return {
    object: mesh,
    /** Stamp a footprint at (x, y, z) heading `yaw`. */
    stamp(x, y, z, yaw, deep = false) {
      left = !left;
      const side = left ? 0.16 : -0.16;
      const px = x + Math.cos(yaw) * side;
      const pz = z - Math.sin(yaw) * side;
      q.setFromAxisAngle(up, yaw);
      scale.set(1, 1, deep ? 1.3 : 1);
      m.compose(new THREE.Vector3(px, y + 0.03, pz), q, scale);
      mesh.setMatrixAt(next, m);
      next = (next + 1) % max;
      mesh.count = Math.min(max, mesh.count + 1);
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------------- Sprite pool for puffs and bursts ---------------- */
export function createSpritePool(glowTexture, size = 24) {
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < size; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: 0xd9a37a, transparent: true, depthWrite: false, opacity: 0 })
    );
    s.visible = false;
    group.add(s);
    items.push({ sprite: s, life: 0, max: 1, grow: 1, vel: new THREE.Vector3() });
  }
  let cursor = 0;
  function spawn(pos, { color = 0xd9a37a, scale = 1, life = 0.8, grow = 3, vel = null, additive = false, opacity = 0.5 } = {}) {
    const it = items[cursor];
    cursor = (cursor + 1) % items.length;
    it.sprite.position.copy(pos);
    it.sprite.material.color.set(color);
    it.sprite.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    it.sprite.scale.setScalar(scale);
    it.sprite.visible = true;
    it.life = life;
    it.max = life;
    it.grow = grow;
    it.opacity = opacity;
    it.vel.copy(vel || new THREE.Vector3(0, 0.4, 0));
  }
  return {
    object: group,
    puff(pos) {
      for (let i = 0; i < 4; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.2);
        spawn(pos, { scale: 0.6, life: 1.1, grow: 2.2, vel: v, opacity: 0.4 });
      }
    },
    burst(pos) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const v = new THREE.Vector3(Math.cos(a) * 2.5, 1.5 + Math.random(), Math.sin(a) * 2.5);
        spawn(pos, { color: 0xffcc33, scale: 0.8, life: 0.9, grow: 1.5, vel: v, additive: true, opacity: 0.9 });
      }
      spawn(pos, { color: 0xfff2c0, scale: 2, life: 0.6, grow: 6, additive: true, opacity: 0.8, vel: new THREE.Vector3() });
    },
    update(dt) {
      for (const it of items) {
        if (it.life <= 0) continue;
        it.life -= dt;
        const t = 1 - it.life / it.max;
        it.sprite.position.addScaledVector(it.vel, dt);
        it.sprite.scale.multiplyScalar(1 + it.grow * dt * (1 - t));
        it.sprite.material.opacity = it.opacity * (1 - t);
        if (it.life <= 0) it.sprite.visible = false;
      }
    },
  };
}
