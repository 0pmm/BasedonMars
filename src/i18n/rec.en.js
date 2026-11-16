/** Site/zone recommendation, picker with filters, GENIE explanations and guided tour. Same keys as rec.pt.js. */
export default {
  // ---- recommendation card
  'rec.kicker.site': 'Best site for {obj}',
  'rec.kicker.zone': 'Best zone for {obj}',
  'rec.kicker.filter': 'highlight: {f}',
  'rec.kicker.picked': 'Your choice',
  'rec.backToBest': 'Back to the recommendation',
  'rec.whyBest': 'Why it is the best choice',
  'rec.whyBestZone': 'Why this zone',
  'rec.strengths': 'Strengths',
  'rec.watch': 'Watch out for',
  'rec.allAttrs': 'All characteristics ({n})',
  'rec.change.site': 'Change site',
  'rec.change.zone': 'Change zone',
  'rec.options': '{n} options',
  'rec.highlightBy': 'Highlight by',
  'rec.filter.general': 'Overall',
  'rec.recommended': 'Recommended',
  'rec.current': 'Current',
  'rec.score': 'fit',
  'rec.standsOut': 'Stands out in',
  'rec.landing.loading': 'Downloading the real terrain of the zone and looking for the flattest spot…',

  // ---- picker (full screen)
  'rec.picker.siteTitle': 'Choose a site · {obj}',
  'rec.picker.zoneTitle': 'Choose a zone · {obj}',
  'rec.picker.siteIntro': 'Every studied site, from most to least suited to this objective. The filters show where each one stands out.',
  'rec.picker.zoneIntro':
    'Zones grouped from {n} hydrated-mineral detections (CRISM and OMEGA). The filters show where each one stands out.',

  // ---- why it is good (plain language)
  'rec.why.unitDiversity': 'Many rock types and layers in one place: you can read several chapters of Mars history in a single walk.',
  'rec.why.aqueousContext': 'Clear signs that water once flowed or pooled here: ancient rivers, lakes or deltas.',
  'rec.why.hydration': 'Orbiters detected minerals that only form in the presence of water.',
  'rec.why.exposure': 'Little dust on the ground: the rocks are in plain view to study.',
  'rec.why.trafficability': 'Firm, gentle ground: easy to walk, drive and land on.',
  'rec.why.power': 'Plenty of sunlight through the year: good power for solar panels.',
  'rec.why.comms': 'Good geometry with the relay orbiters: frequent contact with Earth.',
  'rec.why.shielding': 'Low ground: more atmosphere overhead, so less radiation reaches the surface.',
  'rec.why.waterAccess': 'Water within reach (in hydrated minerals or ice): it can be extracted for drinking, oxygen and fuel.',

  // ---- what counts against
  'rec.watchFor.unitDiversity': 'Little rock variety: the story told here is shorter.',
  'rec.watchFor.aqueousContext': 'Few signs of past water.',
  'rec.watchFor.hydration': 'Few detections of water-bearing minerals.',
  'rec.watchFor.exposure': 'A lot of dust covers the rocks.',
  'rec.watchFor.trafficability': 'Hard terrain: soft sand, boulders or slopes.',
  'rec.watchFor.power': 'Less sunlight (high latitude or dusty): more limited power.',
  'rec.watchFor.comms': 'Less frequent contact with the orbiters.',
  'rec.watchFor.shielding': 'High ground: less atmosphere to shield from radiation.',
  'rec.watchFor.waterAccess': 'Water is hard to get here.',

  // ---- zones
  'rec.zones.introGeology':
    'Zones are regions where orbiters found minerals that only form with water: clues to what Mars was like in the past.',
  'rec.zones.introSurvival':
    'Zones are regions with minerals that hold trapped water: possible water sources for a base, if there is sunlight and flat ground.',
  'rec.zfilter.general': 'Overall',
  'rec.zfilter.detections': 'Most detections',
  'rec.zfilter.confidence': 'Highest confidence',
  'rec.zfilter.sunlight': 'Most sunlight',
  'rec.zfilter.unexplored': 'Never visited',
  'rec.zone.past': '{n} detections of water-bearing minerals within {km} km: a strong sign that there was water here.',
  'rec.zone.water': '{n} detections of water-bearing minerals within {km} km: a possible water source for the base.',
  'rec.zone.confHigh': 'High confidence: several independent observations agree.',
  'rec.zone.new': 'No mission has landed nearby: everything there would be new.',
  'rec.zone.sunGood': 'Latitude {lat}°: near the equator, strong sunlight all year for solar panels.',
  'rec.zone.sunLow': 'Latitude {lat}°: far from the equator, less sunlight in winter.',
  'rec.zone.confMedium': 'Medium confidence: few observations; confirm with high-resolution images.',
  'rec.zone.explored': 'Close to an already visited site: less scientific novelty.',
  'rec.ztag.conf.high': 'high confidence',
  'rec.ztag.conf.medium': 'medium confidence',
  'rec.ztag.conf.low': 'low confidence',
  'rec.ztag.new': 'never visited',
  'rec.ztag.lat': 'latitude {lat}',

  // ---- objectives missions had that the app no longer offers
  'science.objLegacy.life': 'Ancient life (astrobiology)',

  // ---- um só tipo de lista: locais estudados + áreas candidatas
  'rec.exploredLabel': 'Exploration',
  'rec.explored.all': 'All',
  'rec.explored.explored': 'Already explored',
  'rec.explored.unexplored': 'Never explored',
  'rec.kind.site': 'Studied site',
  'rec.kind.zone': 'Candidate area',
  'rec.zoneTitle': 'Area {coords}',
  'rec.zoneNote': 'Area with {n} detections of water-bearing minerals within {km} km, known only from orbital data.',
  'rec.src.hydration': 'CRISM/OMEGA: {n} detections within {km} km',
  'rec.src.water': 'Hydrated minerals detected from orbit as a water source',
  'rec.src.power': 'Latitude {lat}° (sunlight through the year)',
  'rec.place.new': 'Never explored: everything found there will be new.',
  'rec.place.nearKnown': '{km} km from {name}, an already explored site.',
  'rec.place.nearShort': '{km} km from {name}',
  'rec.place.nearSurvival': '{km} km from {name}, already explored: known terrain, weather and landing approaches help build the base.',
  'rec.place.partial': 'Assessed on {n} of {m} criteria, from orbital data only: confirm with high-resolution images.',
  'rec.place.exploredBy': 'Explored by {missions}',
  'rec.place.exploredNear': 'Explored: near {name} ({missions})',
  'rec.place.never': 'Never explored',
  'rec.mapToggle': 'Candidate areas on the map',
  'rec.none': 'No place with this filter.',
  'rec.unknown': 'no data (only observed from orbit)',
  'rec.allAttrsTitle': 'All characteristics',
  'rec.picker.placesIntro':
    'Studied sites and candidate areas flagged by orbiters, from most to least suited to this objective. Filter by already explored or never explored and see where each one stands out.',
  'rt.dock.toggle': 'Route',
  'rt.rehearse': 'Final rehearsal',
  'rt.rehearseHint': 'Review the plan and walk the route in first person.',
  'guide.try.title': 'Final rehearsal',
  'guide.try.noRoute': 'Plan a route first to rehearse it in first person.',
  'genie.explored.title': 'Explored or not',
  'genie.explored.text':
    'Explored places had a lander or a rover: the missions are listed next to the name, and there is plenty of ground data. Never-explored places are new: some were studied from orbit by scientists, others are candidate areas the orbiters flagged for their water-bearing minerals.',

  // ---- GENIE: new topics
  'genie.fitScore.title': 'Fit for the objective',
  'genie.fitScore.text':
    'A 0–100 score of how much this place helps the chosen objective. Each characteristic (water, sunlight, terrain…) has a score and a weight, and the fit is the weighted sum. The weights and sources are under "All characteristics".',
  'genie.fitScore.now': '{name} scores {score}/100 and does best in: {best}.',
  'genie.recFilter.title': 'Highlight by',
  'genie.recFilter.text':
    '"Overall" balances every criterion of the objective. The other filters show the best place for a single criterion, useful when one thing matters more to you, like water or sunlight. The recommendation updates right away.',
  'genie.criterion.title': '{name}',
  'genie.criterion.unitDiversity':
    'How many rock types and layers there are in one place. Each layer is a page of Mars history: more variety, more history to read.',
  'genie.criterion.aqueousContext':
    'Whether the landscape shows there was water: river beds, deltas, lake floors. From published studies of orbital images.',
  'genie.criterion.hydration':
    'Minerals that only form with water (clays, sulfates), detected from orbit by the CRISM and OMEGA spectrometers.',
  'genie.criterion.exposure': 'How much rock is in view, without dust on top. Covered rock cannot be studied or sampled.',
  'genie.criterion.trafficability':
    'How easy it is to walk and drive: firm ground, gentle slopes, few large boulders. It also makes landing safer.',
  'genie.criterion.power':
    'How much solar power you can make: it depends on latitude (sunlight is stronger near the equator all year) and dust.',
  'genie.criterion.comms': 'How often the orbiters pass overhead to carry messages to and from Earth.',
  'genie.criterion.shielding':
    'Radiation shielding from the atmosphere. Low places have more air overhead, so less radiation reaches the ground.',
  'genie.criterion.waterAccess':
    'Whether water can be taken from the site, from hydrated minerals or ground ice. Water becomes drinking water, oxygen and even fuel.',
  'genie.criterion.now': 'Here: {value}%.',
  'genie.zones.title': 'Candidate zones',
  'genie.zones.text':
    'Regions where the CRISM and OMEGA spectrometers detected minerals that only form with water. Several nearby detections make a zone. For geological history they show where water was; for a base, where water might be extracted. Where nothing was observed there are no detections, which does not mean there is nothing there.',
  'genie.landing.title': 'Check landing',
  'genie.landing.text':
    'The app downloads the real terrain of the zone and looks for the flattest, smoothest spot to land and build the base. The 0–100 score uses slope, roughness, elevation (more air helps the parachute) and latitude.',
  'genie.objective.title': 'Mission objective',
  'genie.objective.text':
    'The objective changes everything: which sites are recommended, which criteria weigh more and which zones show on the globe. Free exploration recommends nothing: it is just you and the map.',
  'genie.modes.title': 'Compare route profiles',
  'genie.modes.text':
    'The same route computed three ways. Fast accepts slopes up to the suit limit to arrive sooner. Safe keeps away from slopes and goes around hills, even if it walks more. Balanced sits in between. Click a row to use that profile; the others show fainter on the map.',
  'genie.layers.title': 'Map layers',
  'genie.layers.text':
    'Paint the globe with real data: NASA instrument measurements (temperature, minerals, relief) or layers computed from the terrain (slope, no-go zones, elevation, contours). Pick one and the legend shows at the bottom left.',

  // ---- guided tour
  'tour.start': 'Take the tour with GENIE',
  'tour.startSub': 'A 2-minute walk through the app',
  'tour.next': 'Next',
  'tour.prev': 'Back',
  'tour.skip': 'Skip tour',
  'tour.done': 'Start exploring',
  'tour.step': '{i} of {n}',
  'tour.welcome.title': 'Hi, I am GENIE!',
  'tour.welcome.text':
    "Let me show you Mars Explorer. Here you choose what you want to discover on Mars, find the best place, plan a safe walk over NASA's real terrain and then walk it in first person.",
  'tour.objectives.title': 'Pick an objective',
  'tour.objectives.text':
    'Geological history looks for the places that best tell how Mars changed. Human survival looks for where a base would make sense. Free exploration lets you go anywhere, with no recommendation.',
  'tour.globe.title': 'The globe is real',
  'tour.globe.text': 'Drag to rotate and scroll to zoom seamlessly down to the ground. The images and terrain come from NASA orbiters.',
  'tour.header.title': 'Mission and telemetry',
  'tour.header.text':
    'At the top are your objective (click to change it) and live data from Jezero: sol, local time, season and radiation. The "?" buttons open my explanations.',
  'tour.rail.title': 'Map tools',
  'tour.rail.text':
    'In this bar you switch layers (slope, minerals, temperature…), show labels and orbiters, point north, take a picture or go full screen.',
  'tour.guide.title': 'The guide in 3 steps',
  'tour.guide.text':
    'In the right panel: 1 Objective, 2 Site and 3 Route. In Site I show the best place and, if you open each section, why. "Change site" opens every option, with already explored / never explored filters.',
  'tour.route.title': 'Plan the route',
  'tour.route.text':
    'In tab 3, Route, mark the base and the stops by clicking the terrain: the route avoids slopes and boulders, and you compare Fast, Balanced and Safe.',
  'tour.walk.title': 'Final rehearsal',
  'tour.walk.text':
    'With the route ready, the "Final rehearsal" opens a summary of the plan and takes you on the route in first person, with oxygen, time and the Sun running for real. Ready? Let\'s go!',
};
