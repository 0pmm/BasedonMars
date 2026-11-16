/**
 * Line icons (24 × 24, 1.6 px stroke, currentColor). One consistent set
 * replaces the emoji that were used as icons, so the interface reads like an
 * instrument panel. Built with DOM APIs (no innerHTML).
 */
const NS = 'http://www.w3.org/2000/svg';

/** Each icon: list of [tag, attrs]. Paths are drawn on a 24-unit grid. */
const ICONS = {
  home: [
    ['path', { d: 'M4 11 12 4l8 7' }],
    ['path', { d: 'M6 10v10h12V10' }],
    ['path', { d: 'M10 20v-5h4v5' }],
  ],
  settings: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' }],
  ],
  keyboard: [
    ['rect', { x: 3, y: 6, width: 18, height: 12, rx: 1.5 }],
    ['path', { d: 'M7 10h.01M11 10h.01M15 10h.01M7 14h10' }],
  ],
  book: [
    ['path', { d: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z' }],
    ['path', { d: 'M5 17a3 3 0 0 1 3-3h9' }],
  ],
  layers: [
    ['path', { d: 'M12 4 3 9l9 5 9-5z' }],
    ['path', { d: 'm3 14 9 5 9-5' }],
  ],
  route: [
    ['circle', { cx: 6, cy: 18, r: 2 }],
    ['circle', { cx: 18, cy: 6, r: 2 }],
    ['path', { d: 'M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6' }],
  ],
  target: [
    ['circle', { cx: 12, cy: 12, r: 8 }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M12 2v4M12 18v4M2 12h4M18 12h4' }],
  ],
  rotate: [
    ['path', { d: 'M20 12a8 8 0 1 1-2.3-5.7' }],
    ['path', { d: 'M20 4v4h-4' }],
  ],
  label: [
    ['path', { d: 'M4 6h10l6 6-6 6H4z' }],
    ['circle', { cx: 8.5, cy: 12, r: 1 }],
  ],
  satellite: [
    ['rect', { x: 9, y: 9, width: 6, height: 6, rx: 1, transform: 'rotate(45 12 12)' }],
    ['path', { d: 'm6 6 3 3M15 15l3 3M4 8l4-4M16 20l4-4' }],
  ],
  pin: [
    ['path', { d: 'M12 21s6-6.2 6-11a6 6 0 0 0-12 0c0 4.8 6 11 6 11z' }],
    ['circle', { cx: 12, cy: 10, r: 2.2 }],
  ],
  compass: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'm15.5 8.5-2 5-5 2 2-5z' }],
  ],
  camera: [
    ['path', { d: 'M4 8h3l2-3h6l2 3h3v11H4z' }],
    ['circle', { cx: 12, cy: 13, r: 3.5 }],
  ],
  expand: [['path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  trash: [['path', { d: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13' }]],
  frame: [
    ['path', { d: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4' }],
    ['circle', { cx: 12, cy: 12, r: 2.5 }],
  ],
  walk: [
    ['circle', { cx: 13, cy: 4.5, r: 1.6 }],
    ['path', { d: 'm9 20 2.5-6 2.5 2v4M11.5 14l1-5.5 3 2.5h3M12.5 8.5 9 10l-1.5 3' }],
  ],
  rover: [
    ['rect', { x: 5, y: 9, width: 14, height: 5, rx: 1 }],
    ['circle', { cx: 7, cy: 17, r: 2 }],
    ['circle', { cx: 12, cy: 17, r: 2 }],
    ['circle', { cx: 17, cy: 17, r: 2 }],
    ['path', { d: 'M15 9V6h3' }],
  ],
  shield: [['path', { d: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z' }]],
  balance: [['path', { d: 'M12 4v16M6 20h12M4 8h16M6 8l-3 6h6zM18 8l-3 6h6z' }]],
  bolt: [['path', { d: 'M13 3 5 13h6l-1 8 8-10h-6z' }]],
  play: [['path', { d: 'M8 5v14l11-7z' }]],
  pause: [['path', { d: 'M8 5v14M16 5v14' }]],
  forward: [['path', { d: 'm4 6 7 6-7 6zM13 6l7 6-7 6z' }]],
  rewind: [['path', { d: 'm20 6-7 6 7 6zM11 6l-7 6 7 6z' }]],
  close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  check: [['path', { d: 'm5 12 4 4 10-10' }]],
  warning: [
    ['path', { d: 'M12 4 2.5 20h19z' }],
    ['path', { d: 'M12 10v4M12 17h.01' }],
  ],
  info: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 11v6M12 7.5h.01' }],
  ],
  chevron: [['path', { d: 'm9 6 6 6-6 6' }]],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M5 19l1.8-1.8M17.2 6.8 19 5' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M12 7v5l3 2' }],
  ],
  mountain: [['path', { d: 'm3 19 6-10 4 6 2-3 6 7z' }]],
  save: [
    ['path', { d: 'M5 4h11l3 3v13H5z' }],
    ['path', { d: 'M8 4v5h7V4M8 20v-6h8v6' }],
  ],
  download: [['path', { d: 'M12 4v11M7 10l5 5 5-5M5 20h14' }]],
  list: [['path', { d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' }]],
  edit: [
    ['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }],
    ['path', { d: 'm13 7 4 4' }],
  ],
  flag: [['path', { d: 'M6 21V4M6 4h11l-2 4 2 4H6' }]],
  signal: [['path', { d: 'M5 20v-3M10 20v-7M15 20V9M20 20V5' }]],
  // objectives
  life: [
    ['path', { d: 'M8 3c0 6 8 6 8 12s-8 6-8 6M16 3c0 6-8 6-8 12' }],
    ['path', { d: 'M9 7h6M9 12.5h6M9 17h6' }],
  ],
  geology: [
    ['path', { d: 'M3 7h18M3 12c4-1.5 7 1.5 11 0s5-1 7 0M3 17h18' }],
    ['path', { d: 'M3 4h18v16H3z' }],
  ],
  survival: [
    ['path', { d: 'M3 18a9 9 0 0 1 18 0z' }],
    ['path', { d: 'M3 18h18M12 9v2M8 13.5l1 1M16 13.5l-1 1' }],
  ],
  free: [
    ['circle', { cx: 12, cy: 12, r: 3.5 }],
    ['ellipse', { cx: 12, cy: 12, rx: 10, ry: 4, transform: 'rotate(-25 12 12)' }],
  ],
};

/** Map of the objective ids to icons (kept separate from the data). */
export const OBJECTIVE_ICON = { life: 'life', geology: 'geology', survival: 'survival', free: 'free' };

/**
 * @param {keyof typeof ICONS} name
 * @param {{size?:number, className?:string, label?:string}} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, opts = {}) {
  const svg = document.createElementNS(NS, 'svg');
  const size = opts.size ?? 18;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `ico${opts.className ? ` ${opts.className}` : ''}`);
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name] || ICONS.info) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

/** Replace `[data-icon]` placeholders in static markup (index.html). */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.firstElementChild?.classList?.contains('ico')) return;
    el.replaceChildren(icon(el.dataset.icon, { size: Number(el.dataset.iconSize) || 18 }));
  });
}

export const ICON_NAMES = Object.keys(ICONS);
