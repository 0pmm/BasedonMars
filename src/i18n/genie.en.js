/** GENIE (assistant) lines. Keys must match genie.pt.js. */
export default {
  'genie.ask': 'Ask GENIE',
  'genie.ok': 'Got it',
  'genie.more': 'Learn more',
  'genie.less': 'Less',
  'genie.unknown': 'I am still learning about this!',

  'genie.distance.title': 'Distance',
  'genie.distance.text': 'Hi! This is how far you will walk following the route, counting turns and detours, not the straight line.',
  'genie.distance.now': 'Your route is {d}.',
  'genie.duration.title': 'Duration',
  'genie.duration.text': 'The total EVA time: walking time (slower uphill) plus the work time at each stop.',
  'genie.duration.now': 'Your route takes {total}: {move} walking and {stops} at the stops.',
  'genie.climb.title': 'Climb and descent',
  'genie.climb.text':
    'All the metres you go up and down added together. Climbing costs much more energy and oxygen than walking on the flat.',
  'genie.climb.now': 'On this route: up {up}, down {down}.',
  'genie.maxSlope.title': 'Slope',
  'genie.maxSlope.text':
    'Slope tells how tilted the ground is. Think of a street: if it is too steep, it is hard and risky to pass. On the map it helps you find steep ground and decide whether it suits the trip.',
  'genie.maxSlope.now': 'The steepest part of your route is {max}°, and the suit limit is {lim}°.',
  'genie.maxSlope.extra':
    'The app measures slope by comparing the height of neighbouring points of the real NASA terrain. Over the limit the ground is forbidden and the route goes around.',
  'genie.o2.title': 'Oxygen',
  'genie.o2.text': 'How much of the suit’s usable oxygen the walk will use. It grows when you climb or walk faster.',
  'genie.o2.now': 'This route uses {pct}% of the usable oxygen (about {g} g), and the {reserve}% safety reserve is still kept.',
  'genie.pnr.title': 'Point of no return',
  'genie.pnr.text':
    'The farthest point you can reach and still walk back the same way with the oxygen you have. Past it, you can no longer safely return.',
  'genie.pnr.now': 'On your route it is {d} from the base (the route is {total}).',
  'genie.shelter.title': 'Worst time to the base',
  'genie.shelter.text':
    'If the Sun releases a particle storm, you must hurry to shelter. This is the longest time, from any point of the route, to get back to the base. Ideally 30 minutes or less.',
  'genie.shelter.now': 'On your route the worst case is {t}.',
  'genie.range.title': 'Range',
  'genie.range.text':
    'How far you can go and come back on flat ground with the suit’s oxygen. It is the dashed green circle around the base.',
  'genie.range.now': 'With the current assumptions the range is {d}.',
  'genie.comms.title': 'Route with signal',
  'genie.comms.text':
    'Radio on Mars needs "line of sight": if a hill gets between you and the base antenna, the signal drops. This is the part of the route the base can see.',
  'genie.comms.now': '{pct}% of your route has signal, with the antenna {mast} m high.',
  'genie.dose.title': 'Radiation dose',
  'genie.dose.text':
    'Mars has almost no magnetic field and a thin atmosphere, so radiation reaches the ground. This is what you receive during the EVA, based on what the Curiosity rover measured.',
  'genie.dose.now': 'This EVA: {msv} mSv (a chest X-ray is about 0.1 mSv).',
  'genie.score.title': 'Plan score',
  'genie.score.text':
    'A 0–100 score to compare plans: half comes from safety, 30% from science (science stops) and 20% from efficiency (how close to the straight line).',
  'genie.score.now': 'Your plan: {total} (safety {s}, science {c}, efficiency {e}).',
  'genie.profile.title': 'Elevation profile',
  'genie.profile.text':
    'The drawing shows the ground height along the route. Colours show the steepness, yellow lines are the stops and the dashed red line is the point of no return.',
  'genie.profile.now': 'The point of no return is at {pnr}.',
  'genie.why.title': 'Why this route?',
  'genie.why.text':
    'Here I compare the chosen route with the straight line. The shortest way is not always the best: climbing a mountain or passing near boulders costs more time, oxygen and risk.',
  'genie.why.now': 'The route costs {saved}% less than the straight line, which would cross {blocked} of forbidden ground.',
  'genie.why.extra':
    'Each step costs walking time × effort (climbing uses more O₂) × the risk of the place: slope near the limit, rough ground, near boulders, loose soil, no radio and shadow.',
  'genie.priority.title': 'Route priority',
  'genie.priority.text':
    'Tells the planner what matters most. Safety avoids more risks; Speed accepts more risk to arrive sooner; Balanced is in between.',
  'genie.priority.now': 'Now set to: {p}.',
  'genie.mode.title': 'On foot or rover',
  'genie.mode.text':
    'On foot you are slower but limited to gentler slopes. The rover is faster and carries more oxygen, but needs smoother ground away from boulders.',
  'genie.mode.now': 'Current mode: {m}, with a {lim}° slope limit.',
  'genie.crew.title': 'Crew',
  'genie.crew.text': 'NASA never does a spacewalk alone: one helps the other if something goes wrong. Going solo lowers the safety score.',
  'genie.returnToBase.title': 'Return to base',
  'genie.returnToBase.text':
    'When checked the route ends back at the base, which is normal for an EVA. Uncheck it to plan only the way out.',
  'genie.ltst.title': 'Local solar time',
  'genie.ltst.text':
    'The time by the Sun at the base, on the Mars clock (a day there lasts 24 h 39 min). It changes the shadows, light and temperature of your plan.',
  'genie.params.title': 'Suit assumptions',
  'genie.params.text':
    'The numbers the planner uses: walking speed, maximum slope, oxygen autonomy, reserve. Change them and the route is recomputed right away.',
  'genie.params.now': 'Now: {speed} m/s on the flat, {o2h} h of oxygen at 300 W, up to {lim}° on foot.',
  'genie.season.title': 'Season',
  'genie.season.text':
    'Mars has seasons like Earth, but each lasts about twice as long. "Ls" is where Mars is around the Sun (0° to 360°). Between Ls 180° and 330° is the dust-storm season.',
  'genie.sun.title': 'Sun position',
  'genie.sun.text':
    'Elevation is how high the Sun is (0° = horizon) and azimuth is its direction (0° = north). A low Sun means long shadows and less warmth.',
  'genie.daylight.title': 'Sunrise and sunset',
  'genie.daylight.text': 'Sunrise and sunset times at the base. Plan the EVA in daylight: at night it drops below −80 °C.',
  'genie.irradiance.title': 'Solar irradiance',
  'genie.irradiance.text':
    'How much solar energy reaches Mars per square metre. Less than half of Earth’s, because Mars is farther away, and dust blocks part of it.',
  'genie.pressure.title': 'Pressure',
  'genie.pressure.text':
    'Martian air is very thin: under 1% of Earth’s pressure. That is why a pressurised suit is mandatory. Lower places have a little more pressure.',
  'genie.doseRate.title': 'Background radiation',
  'genie.doseRate.text':
    'How much radiation the ground gets per day here, from Curiosity’s RAD instrument. Higher places get a bit more, because there is less air above.',

  'genie.layerNone.title': 'Real images',
  'genie.layerNone.text':
    'This is Mars seen from orbit: colours come from the Viking mosaic and details from the HiRISE (25 cm), CTX (6 m) or THEMIS cameras. The colour is approximate; shapes and light/dark are real.',
  'genie.layer_slope.title': 'Slope layer',
  'genie.layer_slope.text':
    'Paints the ground by steepness: blue is flat, green and yellow are ramps and red is very steep (near or above {lim}°, the suit limit).',
  'genie.layer_hazard.title': 'No-go zones',
  'genie.layer_hazard.text': 'Red marks the places steeper than the suit limit ({lim}°). The route never crosses them.',
  'genie.layer_elevation.title': 'Elevation',
  'genie.layer_elevation.text':
    'Paints the ground by height: blue is the lowest and red the highest of what is on screen. Colours adjust as you move the map.',
  'genie.layer_contours.title': 'Contour lines',
  'genie.layer_contours.text':
    'Each line joins points of the same height, like a hiking map. Lines close together = steep ground; far apart = gentle ground.',
  'genie.layerScale':
    'Tip: from far away the app uses less detailed terrain and shows the MAXIMUM of each area, so hills and cliffs do not vanish. Zoom in to see metre-level detail.',
  'genie.layerKind.optical': '{name}: an image taken from orbit by {inst}, at {res}.',
  'genie.layerKind.thermal':
    '{name}: ground temperature measured by {inst} ({res}). Ground that stays warm at night is usually rock; cold is usually sand and dust.',
  'genie.layerKind.spectral': '{name}: what the ground is made of, measured from the light it reflects ({inst}, {res}).',
  'genie.layerKind.topography': '{name}: relief measured by laser or stereo ({inst}, {res}).',
  'genie.layerKind.geology': '{name}: a geologic map ({inst}). Each colour is a kind of terrain of a different age.',
  'genie.layerMeasured': 'These values were measured by NASA instruments.',
  'genie.layerInterpreted': 'This map is an interpretation by geologists, made from measurements.',

  'genie.sol.title': 'Sol',
  'genie.sol.text': 'On Mars a day is called a "sol". This number counts sols since Perseverance landed in Jezero.',
  'genie.sol.now': 'Today is sol {v}.',
  'genie.localTime.title': 'Local time at Jezero',
  'genie.localTime.text': 'The time right now at Jezero crater, where Perseverance is, from NASA’s official Mars clock (Mars24).',
  'genie.localTime.now': 'It is {v} there now.',
  'genie.temperature.title': 'Temperature',
  'genie.temperature.text':
    'Min and max of the last day measured by Perseverance’s MEDA weather station. On Mars the temperature swings a lot between day and night.',
  'genie.temperature.now': 'Latest: {v}.',
  'genie.telePressure.title': 'Air pressure',
  'genie.telePressure.text': 'Pressure measured by MEDA. On Earth it is about 101,000 Pa; on Mars it is near 700 Pa.',
  'genie.telePressure.now': 'Latest: {v}.',
  'genie.radiation.title': 'Radiation',
  'genie.radiation.text':
    'Average dose measured by Curiosity on the Martian surface: about 0.64 mSv per day, some 200 times more than on Earth.',

  'genie.hudO2.title': 'Suit oxygen',
  'genie.hudO2.text': 'How much oxygen is left in the suit. It drops faster when you climb and slower when you are resting.',
  'genie.hudO2.now': 'Now: {pct}%.',
  'genie.hudDose.title': 'Accumulated dose',
  'genie.hudDose.text': 'Radiation received since the start of the EVA.',
  'genie.hudDose.now': 'So far: {msv} mSv.',
  'genie.hudClock.title': 'EVA clock',
  'genie.hudClock.text': 'The spacewalk time. At ×1 it runs with your own clock; the buttons speed time up, and oxygen and the Sun follow.',
  'genie.hudClock.now': 'Current factor: ×{x}.',
  'genie.hudGround.title': 'Where the ground comes from',
  'genie.hudGround.text':
    'Shows the quality of the real data under you: the terrain level (17 ≈ 1 m of detail) and the orbital image used.',
  'genie.hudGround.now': 'Here: terrain level {z}, image {src}.',
  'genie.hudEnv.title': 'Environment',
  'genie.hudEnv.text':
    'Estimated temperature, pressure and how much dust is in the air (τ). More dust = thicker haze and less direct sunlight.',
  'genie.hudEnv.now': 'Now: τ {tau}, haze ~{km} km, {ltst} local time.',
};
