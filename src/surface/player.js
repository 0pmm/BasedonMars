/**
 * First-person astronaut: acceleration-based walking/sprinting, slope
 * resistance, real Mars gravity jumps, circle collisions and rover driving.
 */
import { MARS_GRAVITY, SURFACE } from '../config.js';
import { clamp } from '../core/math.js';

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.jump = 0; // height above ground
    this.vy = 0;
    this.grounded = true;
    this.yaw = Math.PI; // facing -Z (away from the lander)
    this.pitch = -0.06;
    this.inRover = false;
    this.stepAccum = 0;
    this.distance = 0; // metres walked/driven this visit
    this.uphill = 0;
    this.bob = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  /**
   * @param {number} dt
   * @param {{
   *   axis:{x:number,y:number}, look:{dx:number,dy:number}, jump:boolean, sprint:boolean,
   *   terrain:any, colliders:{x:number,z:number,r:number}[], hazard:{speedMul:number, wind:{x:number,z:number}}
   * }} ctx
   * @returns {{stepped:boolean, landed:boolean, moved:number}}
   */
  update(dt, ctx) {
    const events = { stepped: false, landed: false, moved: 0 };

    // Look
    this.yaw -= ctx.look.dx;
    this.pitch = clamp(this.pitch - ctx.look.dy, -1.3, 1.3);

    // Desired velocity on the ground plane
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    let dirX = fx * ctx.axis.y + rx * ctx.axis.x;
    let dirZ = fz * ctx.axis.y + rz * ctx.axis.x;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1) {
      dirX /= len;
      dirZ /= len;
    }

    let maxSpeed;
    if (this.inRover) maxSpeed = SURFACE.roverSpeed;
    else maxSpeed = SURFACE.walkSpeed * (ctx.sprint ? SURFACE.sprintMultiplier : 1) * ctx.hazard.speedMul;

    // Slope resistance: climbing is slower, descending slightly faster
    const g = ctx.terrain.gradient(this.x, this.z);
    const grade = len > 0.01 ? (g.gx * dirX + g.gz * dirZ) / Math.max(len, 1e-6) : 0;
    this.uphill = Math.max(0, grade);
    const slopeFactor = clamp(1 - grade * (this.inRover ? 0.5 : 1.1), 0.25, 1.15);
    if (!this.inRover && grade > SURFACE.maxClimbGrade) maxSpeed *= 0.15;

    const targetVx = dirX * maxSpeed * slopeFactor;
    const targetVz = dirZ * maxSpeed * slopeFactor;
    const accel = this.grounded ? (this.inRover ? 8 : SURFACE.groundAccel) : SURFACE.airAccel;
    const k = Math.min(1, (accel * dt) / Math.max(maxSpeed, 0.1));
    this.vx += (targetVx - this.vx) * k;
    this.vz += (targetVz - this.vz) * k;

    let nx = this.x + (this.vx + (this.inRover ? 0 : ctx.hazard.wind.x * 0.25)) * dt;
    let nz = this.z + (this.vz + (this.inRover ? 0 : ctx.hazard.wind.z * 0.25)) * dt;

    // Circle-vs-circle collisions (two passes for smooth sliding)
    const radius = this.inRover ? SURFACE.roverRadius : SURFACE.playerRadius;
    const feetY = ctx.terrain.height(nx, nz) + this.jump;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of ctx.colliders) {
        if (c.top !== undefined && feetY > c.top) continue; // jumped over a small rock
        const dx = nx - c.x;
        const dz = nz - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx += (dx / d) * (min - d);
          nz += (dz / d) * (min - d);
        }
      }
    }
    const half = SURFACE.size / 2 - SURFACE.boundsMargin;
    nx = clamp(nx, -half, half);
    nz = clamp(nz, -half, half);
    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx;
    this.z = nz;
    this.distance += moved;
    events.moved = moved;

    // Jump under real Mars gravity
    if (ctx.jump && this.grounded && !this.inRover) {
      this.vy = SURFACE.jumpVelocity;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.jump += this.vy * dt;
      this.vy -= MARS_GRAVITY * dt;
      if (this.jump <= 0) {
        this.jump = 0;
        this.vy = 0;
        this.grounded = true;
        events.landed = true;
      }
    }

    // Footsteps
    if (this.grounded && !this.inRover && moved > 0) {
      this.stepAccum += moved;
      this.bob += moved * 3.2;
      if (this.stepAccum > 0.85) {
        this.stepAccum = 0;
        events.stepped = true;
      }
    }
    return events;
  }

  /** Camera eye position and look direction. */
  eye(terrain, reducedMotion) {
    const ground = terrain.height(this.x, this.z);
    const bob = reducedMotion || this.inRover ? 0 : Math.sin(this.bob) * 0.04 * Math.min(1, this.speed / 3);
    const height = this.inRover ? SURFACE.roverEyeHeight : SURFACE.eyeHeight;
    return {
      x: this.x,
      y: ground + height + this.jump + bob,
      z: this.z,
      dx: Math.sin(this.yaw) * Math.cos(this.pitch),
      dy: Math.sin(this.pitch),
      dz: Math.cos(this.yaw) * Math.cos(this.pitch),
    };
  }
}
