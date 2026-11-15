/**
 * Deep links via the URL hash:
 *   #objective=life&step=site&zone=zone-03  → guided mission at an objective/step
 *   #site=jezero                            → guided mission at a science site
 *   #poi=jezero                             → free exploration focused on a location
 *   #surface=gale                           → walk on the surface of a location
 *   #chapter=3                              → guided mission at chapter 3 (if unlocked)
 *   #at=18.44,77.45                         → EVA planner at any coordinate (lat, east lon)
 */

/** @returns {{poi?: string, surface?: string, chapter?: number, site?: string, objective?: string, step?: string, zone?: string, at?: {lat:number, lon:number}}} */
export function parseHash(hash = globalThis.location?.hash ?? '') {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const out = {};
  const poi = params.get('poi');
  const surface = params.get('surface');
  const chapter = params.get('chapter');
  if (poi && /^[a-z0-9-]{1,40}$/.test(poi)) out.poi = poi;
  if (surface && /^[a-z0-9-]{1,40}$/.test(surface)) out.surface = surface;
  if (chapter && /^\d{1,2}$/.test(chapter)) out.chapter = Number(chapter);
  const site = params.get('site');
  if (site && /^[a-z0-9-]{1,40}$/.test(site)) out.site = site;
  const objective = params.get('objective');
  if (objective && /^[a-z0-9-]{1,20}$/.test(objective)) out.objective = objective;
  const step = params.get('step');
  if (step && /^[a-z]{1,10}$/.test(step)) out.step = step;
  const zone = params.get('zone');
  if (zone && /^zone-\d{1,3}$/.test(zone)) out.zone = zone;
  const at = params.get('at');
  const m = at && /^(-?\d{1,2}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/.exec(at);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) <= 85 && Math.abs(lon) <= 180) out.at = { lat, lon };
  }
  return out;
}

/**
 * Replace the current hash without adding a history entry.
 * @param {Record<string, string|number>|null} params
 */
export function setHash(params) {
  try {
    const query = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
    const url = `${location.pathname}${location.search}${query ? '#' + query : ''}`;
    history.replaceState(null, '', url);
  } catch {
    /* ignore (e.g. sandboxed iframes) */
  }
}
