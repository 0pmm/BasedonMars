
# Mars Explorer · Map and Routes on Mars

A layered map of Mars, built with **real NASA data**, designed to safely plan a walk on Mars (EVA, or "Marswalk").

Developed for the NASA Space Apps 2026 challenge:
[Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/).

The goal is to show Mars **as it really is**, at the scale of a human walk: the terrain and actual images of a location, combined with thermal, mineral, geological, radiation, and weather layers. On top of this data, the tool calculates safe routes between any points, estimates oxygen consumption, duration, radiation dose, and the point of no return, and allows users to traverse the route in first-person view over the real terrain. The gamified component (guided mission) has been removed.

## Features

A single tool with three main steps: **explore the entire planet → plan a route between any points → traverse the route in first-person view to test it.**

**1. Continuous Globe: From Planetary View to Ground Level**

- Real terrain streamed dynamically, with a level of detail similar to Google Earth: the globe seamlessly transitions into ground-level terrain. Each tile combines elevation data from NASA/JPL Mars Trek (MOLA/HRSC across the planet; CTX/HiRISE DTMs at up to ~1 m resolution in landing sites) with colors from the Viking mosaic and the highest-resolution imagery available (HiRISE 25 cm, CTX 6 m, THEMIS-IR 100 m).
- Google Earth-style camera controls: drag to move the map, scroll to zoom toward the cursor, right-click (or Ctrl) to rotate and tilt near the ground, and double-click to descend.
- NASA instrument layers (THEMIS day/night, USGS geology, MOLA, TES: thermal inertia, dust, clay minerals, pyroxene, albedo, and roughness), plus calculated layers derived from actual terrain data at the current viewing scale (slope, restricted zones, elevation, and contour lines), all with adjustable opacity.
- 14 important locations (with NASA images), which can be shown or hidden; illumination based on the actual subsolar point; real-time telemetry from Jezero (Mars24, MEDA, RAD).

**2. Route Planning Between Any Points ("Route" Tab)**

- Set a base and intermediate stops by clicking anywhere on the globe, at any zoom level; drag markers to reposition them.
- Each route segment is calculated using a grid adapted to its length: a 300 m segment uses ~1.5 m resolution (including boulders detected in HiRISE imagery), while a 200 km segment uses resolutions of hundreds of meters. The A* algorithm (16 directions, followed by path smoothing) avoids slopes, rough terrain, and boulders exceeding spacesuit limits.
- Three profiles with distinct rules:
  - **Fast:** minimizes travel time while accepting slopes up to the permitted limit.
  - **Balanced:** balances travel time and safety.
  - **Safe:** uses a lower effective slope limit, maintains a 15 m margin from restricted terrain, and avoids hills.

  All three profiles are calculated and compared in the panel and on the map.
- Distance, duration, ascent/descent, O₂ consumption, point of no return, worst-case return time to base, operational range, percentage of the route with radio coverage (antenna line of sight), percentage in shadow, radiation dose, and plan score; elevation profile.
- Travel on foot or by rover, solo or in pairs, adjustable local solar time, and editable spacesuit assumptions.
- Saved and comparable routes, GeoJSON export, and a checklist.

**3. First-Person Route Traversal**

- Terrain is loaded in 160 m chunks around the astronaut: nearby chunks remain active, upcoming chunks load hidden behind fog, and distant chunks are discarded. Chunks ahead along the route are prioritized. Routes can have any length.
- Real elevation at each chunk vertex, HiRISE/CTX imagery tinted with the actual local colors, and real rock formations where the imagery provides sufficient detail.
- **Follow mode:** automatically moves along the route at the modeled speed, with adjustable time acceleration from ×1 to ×200.
- **Free mode:** allows movement using WASD.
- The EVA clock, O₂ consumption, radiation dose, and Sun position advance as EVA time progresses.
- When exiting first-person mode, the globe returns exactly to the position where you left it.

**4. Scientific Objectives and Landing Guide**

- Two scientific objectives:
  - **Geological History:** identifies locations where rocks provide the best evidence of how Mars has changed over time.
  - **Human Survival:** identifies locations where establishing a human base would make sense.

  Both objectives include visible criteria, weights, and sources. A third option, **Free Exploration**, skips scientific objectives and takes users directly to the map.
- The Location step presents the best choice and explains why. The "Change" option opens all available alternatives with filters.
- **GENIE Tour** on the home screen, along with GENIE explanations (the "?" buttons) throughout the app.
- Ranking of 12 curated locations and candidate zones discovered through CRISM/OMEGA hydrated mineral detections, with explored/never-visited and confidence labels.
- **Plan Marswalk:** selects scientific stops based on the chosen objective, builds the EVA (on foot or by rover), and displays the scientific coverage of the route.
- In unexplored zones, evaluates landing suitability in real time using actual terrain data and suggests a base location.

## Getting Started

Requires [Node.js](https://nodejs.org/) 20.19+ (or 22.12+) and an internet connection (data is retrieved live from NASA services).

```bash
npm install
```

```bash
npm run dev
```

Open the address displayed in the terminal (usually http://localhost:5173).

Direct links:

- `#site=delta-front` navigates to a suggested location.
- `#at=18.4446,77.4509` navigates to any coordinate (latitude, east longitude).
- `#poi=gale` opens a location on the globe.

### Additional Commands

| Command | Description |
| ------------------ | ----------------------------------------------------- |
| `npm run build` | Builds the production version in `dist/` |
| `npm run preview` | Serves `dist/` locally (with CSP enabled) |
| `npm test` | Runs unit tests (Vitest) |
| `npm run test:e2e` | Runs end-to-end tests in the installed Chrome browser (Playwright) |
| `npm run lint` | Runs ESLint |
| `npm run format` | Runs Prettier |
| `npm run check` | Runs linting, formatting, tests, and build |

## How to Plan a Route

1. Choose an objective or select **Free Exploration**, then zoom in on the desired location on the globe (or use a suggested location).
2. Enable **Mark Points** and click on the terrain. The first point becomes the base, and subsequent points become stops.
3. The route appears on the globe, and its metrics are displayed in the panel, including the Fast / Balanced / Safe comparison. Drag markers or adjust the profile, time, and assumptions as needed.
4. Save, compare, and export your route.
5. Select **Traverse Route in First-Person View** to test the planned journey.

## Controls

| Action | Globe | First-Person View |
| --------------------------- | -------------------------------------- | ----------------------------------- |
| Move | Drag · Arrow keys | WASD / Arrow keys (switches to free mode) |
| Zoom / Look | Scroll (toward cursor) · Pinch · + / − | Mouse (click to capture) |
| Rotate and Tilt | Right-click or Ctrl + drag · Q/E | — |
| Follow Route / Free Walk | — | F (or E) |
| Time Acceleration | — | [ and ] |
| Pause / Minimap / Photo | — | P · M · K |

**Mobile controls:** One finger moves the map, pinch to zoom, and two fingers rotate and tilt. In first-person mode, use the joystick on the left and drag on the right to look around.

## Project Structure

```text
index.html            Interface structure
public/               Globe textures, icons, PWA (service worker with NASA tile caching)
src/
  main.js             Initialization, state navigation, and main loop
  config.js           Physical constants and parameters
  geo/                Real data: Mars geodesy, Mars Trek tiles, terrain decoder,
                      tile elevations, elevation grids and analysis, Mars24, mission feeds
  orbit/              Globe: streamed terrain (terrainGlobe), camera (globeControls),
                      globe routes, locations, satellites, atmosphere
  planner/            Planning models: point-to-point routing, A*,
                      EVA model, boulder detection
  traverse/           First-person view: terrain chunks, route traversal, controls
  surface/            First-person components: sky, player, rocks, dust, textures
  ui/                 Globe panel, Route tab, HUD, menus, dialogs, sources and methodology
  core/               Infrastructure: events, state, settings, i18n, audio, input, renderer
  data/               JSON: suggested locations, NASA layers, globe locations, catalog
  i18n/               Translations (en / pt)
  styles/             Area-specific CSS
tests/unit/           Vitest (tiles, routing, EVA, chunks, geodesy, Mars24, feeds, translations)
tests/e2e/            Playwright (continuous zoom, routing, first-person view, mobile, settings)
docs/                 ARCHITECTURE.md and METHODOLOGY.md
```

## Privacy

No accounts, cookies, or tracking. Settings, progress, and plans are stored in `localStorage`.

External requests are sent only to public NASA services (trek.nasa.gov, the Mars Trek terrain bucket, mars.nasa.gov, api.nasa.gov, and images-api.nasa.gov).

## License

To be determined by the team (see [CREDITS.md](CREDITS.md) for third-party asset licenses).
