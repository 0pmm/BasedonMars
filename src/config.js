/**
 * Global configuration and physical constants.
 * Every "magic number" that tunes the experience lives here.
 */

/* ---------- Real Mars constants (NASA Mars Fact Sheet) ---------- */
export const MARS_RADIUS_KM = 3389.5;
export const MARS_GRAVITY = 3.721; // m/s²
export const MARS_AXIAL_TILT_DEG = 25.19;
export const MARS_SOL_SECONDS = 88775; // 24h 39m 35s
export const MARS_SURFACE_PRESSURE_PA = 610; // mean
export const PHOBOS = { orbitRadiusMarsRadii: 2.76, periodHours: 7.65, radiusKm: 11.3 };
export const DEIMOS = { orbitRadiusMarsRadii: 6.92, periodHours: 30.3, radiusKm: 6.2 };

/** Approximate surface colour used to tint greyscale orbital images (HiRISE RED, CTX). */
export const MARS_TINT = 0xe0a878;

/* ---------- Orbital view ---------- */
export const ORBIT = {
  planetRadius: 50, // scene units
  cameraHome: [10, 35, 140],
  minDistance: 58,
  maxDistance: 420,
  autoRotateSpeed: 0.35,
  focusDistance: 22,
  focusDurationMs: 1200,
  unfocusDurationMs: 900,
  moonTimeScale: 900, // how many seconds of Mars time pass per real second
};

/* ---------- Surface (first person) ---------- */
export const SURFACE = {
  size: 1e9, // no world bounds: the first-person ground streams around the walker
  proceduralSize: 260, // story/free worlds with procedural terrain
  realSize: 640, // worlds built from real NASA terrain (Mars Trek DTM + HiRISE)
  realCells: 400, // elevation grid resolution for real worlds (1.6 m)
  landingPadRadius: 14,
  eyeHeight: 1.8,
  walkSpeed: 4.2, // m/s (realistic EVA walk is ~1.4 m/s, sped up for fun)
  sprintMultiplier: 1.8,
  groundAccel: 18,
  airAccel: 4,
  jumpVelocity: 3.2, // → ~1.4 m jump under Mars gravity
  playerRadius: 0.6,
  maxClimbGrade: 0.95,
  landerPosition: { x: 0, z: 3.2 },
  landerRadius: 2.3,
  roverOffset: { x: 9, z: 6 },
  roverSpeed: 14,
  roverRadius: 2.2,
  roverEyeHeight: 3.1,
  interactRange: 3.2,
  landerInteractRange: 7,
  refillRange: 7,
  boundsMargin: 6,
};

/* ---------- Oxygen / suit ---------- */
export const OXYGEN = {
  baseDrainPerSecond: 100 / (7 * 60), // a full tank lasts ~7 min of walking
  sprintMultiplier: 1.8,
  idleMultiplier: 0.45,
  refillPerSecond: 6,
  warnLevel: 30,
  criticalLevel: 15,
};

export const DIFFICULTY = Object.freeze({
  easy: { o2Multiplier: 0.5, hazardMultiplier: 0.6, scoreMultiplier: 0.8, canFail: false },
  normal: { o2Multiplier: 1, hazardMultiplier: 1, scoreMultiplier: 1, canFail: true },
  hard: { o2Multiplier: 1.5, hazardMultiplier: 1.4, scoreMultiplier: 1.3, canFail: true },
});

/* ---------- Rendering quality presets ---------- */
export const QUALITY_PRESETS = Object.freeze({
  low: {
    pixelRatio: 1,
    planetTexture: '2k',
    terrainSegments: 80,
    rockCount: 90,
    shadows: 0,
    bloom: false,
    dustParticles: 120,
    stars: 2500,
  },
  medium: {
    pixelRatio: 1.5,
    planetTexture: '4k',
    terrainSegments: 120,
    rockCount: 140,
    shadows: 1024,
    bloom: false,
    dustParticles: 260,
    stars: 4000,
  },
  high: {
    pixelRatio: 2,
    planetTexture: '4k',
    terrainSegments: 160,
    rockCount: 170,
    shadows: 2048,
    bloom: true,
    dustParticles: 420,
    stars: 5000,
  },
  ultra: {
    pixelRatio: 2,
    planetTexture: '8k',
    terrainSegments: 200,
    rockCount: 210,
    shadows: 2048,
    bloom: true,
    dustParticles: 600,
    stars: 6500,
  },
});

/* ---------- Network ---------- */
export const NASA_IMAGES_API = 'https://images-api.nasa.gov/search';
export const NASA_IMAGES_DETAILS = 'https://images.nasa.gov/details/';
export const PHOTO_TIMEOUT_MS = 8000;
export const ALLOWED_IMAGE_HOST_SUFFIX = '.nasa.gov';
export const FEEDBACK_URL = 'https://github.com/alissonsiv/mars-explorer/issues';

/* ---------- Asset paths (relative to Vite base) ---------- */
const BASE = import.meta.env?.BASE_URL ?? './';
export const ASSETS = {
  planet: {
    '2k': `${BASE}assets/textures/mars_2k.webp`,
    '4k': `${BASE}assets/textures/mars_4k.webp`,
    '8k': `${BASE}assets/textures/mars_8k.webp`,
  },
  planetDetail: `${BASE}assets/textures/mars_detail_2k.webp`,
};
