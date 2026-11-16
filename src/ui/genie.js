/**
 * GENIE — the small robot that explains what is on the screen.
 *
 * A "?" button sits next to an indicator. Clicking it blurs everything
 * except that indicator (four blurred panes around its rectangle + a glowing
 * frame that follows it), and GENIE appears with a speech bubble explaining
 * the indicator in plain words, using the values currently shown (topics are
 * registered by genieTopics.js, so this module stays generic and reusable).
 */
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { emit } from '../core/events.js';
import { prefersReducedMotion } from '../core/settings.js';

/** @type {Map<string, (ctx:any) => {title:string, text:string, extra?:string}>} */
const topics = new Map();
let open = null;

/** Register explanations: { topicId: (ctx) => ({title, text, extra?}) }. */
export function registerTopics(map) {
  for (const [k, fn] of Object.entries(map)) topics.set(k, fn);
}

export function isGenieOpen() {
  return !!open;
}

/**
 * Small "?" button.
 * @param {string} topic
 * @param {{targets?:() => Element[], ctx?:() => any, label?:string}} [opts]
 */
export function helpButton(topic, opts = {}) {
  const b = h(
    'button.genie-q',
    {
      attrs: { type: 'button', 'aria-label': `${t('genie.ask')}: ${opts.label || topic}`, title: t('genie.ask'), 'data-genie': topic },
      on: {
        click: (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targets = opts.targets?.() || [b.closest('[data-genie-target]') || b.parentElement];
          openGenie(topic, targets.filter(Boolean), opts.ctx?.(), b);
        },
      },
    },
    '?'
  );
  return b;
}

/** Robot drawing (inline SVG, inherits the project palette). */
export function genieRobot() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 140');
  svg.setAttribute('class', 'genie-robot');
  svg.setAttribute('aria-hidden', 'true');
  // Built with DOM APIs (no innerHTML): antenna, head, visor, eyes, body, arms, wheel
  const add = (tag, attrs, parent = svg) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    parent.append(el);
    return el;
  };
  const defs = add('defs', {});
  const grad = add('linearGradient', { id: 'genie-shell', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  add('stop', { offset: '0%', 'stop-color': '#ffffff' }, grad);
  add('stop', { offset: '100%', 'stop-color': '#c9cfdb' }, grad);
  const g = add('g', { class: 'genie-float' });
  add('line', { x1: 60, y1: 10, x2: 60, y2: 26, stroke: '#9aa3b2', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
  add('circle', { cx: 60, cy: 9, r: 6, class: 'genie-light' }, g);
  add('rect', { x: 22, y: 24, width: 76, height: 58, rx: 22, fill: 'url(#genie-shell)', stroke: '#8a93a3', 'stroke-width': 2 }, g);
  add('rect', { x: 32, y: 36, width: 56, height: 32, rx: 14, fill: '#0b1220' }, g);
  const eyes = add('g', { class: 'genie-eyes' }, g);
  add('ellipse', { cx: 48, cy: 52, rx: 6, ry: 7, fill: '#4fd1ff' }, eyes);
  add('ellipse', { cx: 72, cy: 52, rx: 6, ry: 7, fill: '#4fd1ff' }, eyes);
  add('path', { d: 'M50 62 Q60 68 70 62', stroke: '#4fd1ff', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }, g);
  add('rect', { x: 14, y: 44, width: 8, height: 18, rx: 4, fill: '#ff6b35' }, g);
  add('rect', { x: 98, y: 44, width: 8, height: 18, rx: 4, fill: '#ff6b35' }, g);
  add('rect', { x: 38, y: 86, width: 44, height: 30, rx: 12, fill: 'url(#genie-shell)', stroke: '#8a93a3', 'stroke-width': 2 }, g);
  add('circle', { cx: 60, cy: 100, r: 8, fill: '#ff6b35' }, g);
  add(
    'text',
    {
      x: 60,
      y: 104.5,
      'text-anchor': 'middle',
      'font-size': 11,
      'font-weight': 700,
      fill: '#fff',
      'font-family': 'IBM Plex Sans Condensed, sans-serif',
    },
    g
  ).textContent = 'G';
  add(
    'path',
    { d: 'M38 96 Q26 100 24 112', stroke: '#9aa3b2', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', class: 'genie-wave' },
    g
  );
  add('path', { d: 'M82 96 Q94 100 96 112', stroke: '#9aa3b2', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, g);
  add('ellipse', { cx: 60, cy: 128, rx: 22, ry: 5, fill: 'rgba(0,0,0,0.35)', class: 'genie-shadow' });
  return svg;
}

function unionRect(els) {
  let r = null;
  for (const el of els) {
    if (!el?.isConnected) continue;
    const b = el.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    r = r
      ? {
          left: Math.min(r.left, b.left),
          top: Math.min(r.top, b.top),
          right: Math.max(r.right, b.right),
          bottom: Math.max(r.bottom, b.bottom),
        }
      : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  }
  return r;
}

/**
 * Open GENIE on a topic, highlighting the target elements.
 * @param {string} topic
 * @param {Element[]} targets
 */
export function openGenie(topic, targets = [], ctx, opener = document.activeElement) {
  const fn = topics.get(topic);
  const content = fn ? fn(ctx) : { title: topic, text: t('genie.unknown') };
  showGenie({ ...content, topic }, targets, opener);
}

/**
 * Show GENIE with any content (also used by the guided tour).
 * @param {{title:string, text:string, extra?:string|null, topic?:string, step?:string,
 *   actions?:{label:string, primary?:boolean, onClick:()=>void}[], dim?:boolean}} content
 *   actions replace the "Got it" button; dim:false keeps the whole screen clear (no blur).
 * @param {Element[]} targets
 */
export function showGenie(content, targets = [], opener = document.activeElement) {
  closeGenie(true);
  const topic = content.topic || 'custom';
  const panes = ['top', 'bottom', 'left', 'right'].map((side) => h(`div.genie-pane.${side}`));
  const frame = h('div.genie-frame');
  const title = h('h2.genie-title', { attrs: { id: 'genie-title' } }, content.title);
  const text = h('p.genie-text', null, content.text);
  const more = content.extra ? h('p.genie-extra', { attrs: { hidden: true } }, content.extra) : null;
  const actions = h('div.genie-actions');
  if (more) {
    const moreBtn = h(
      'button.genie-btn.ghost',
      {
        attrs: { type: 'button' },
        on: {
          click: () => {
            more.hidden = !more.hidden;
            moreBtn.textContent = more.hidden ? t('genie.more') : t('genie.less');
            place();
          },
        },
      },
      t('genie.more')
    );
    actions.append(moreBtn);
  }
  let ok;
  if (content.actions?.length) {
    for (const a of content.actions) {
      const b = h(`button.genie-btn${a.primary ? '' : '.ghost'}`, { attrs: { type: 'button' }, on: { click: () => a.onClick() } }, a.label);
      actions.append(b);
      if (a.primary) ok = b;
    }
    ok ||= actions.lastElementChild;
  } else {
    ok = h('button.genie-btn', { attrs: { type: 'button' }, on: { click: () => closeGenie() } }, t('genie.ok'));
    actions.append(ok);
  }
  const bubble = h(
    'div.genie-bubble',
    { attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'genie-title' } },
    h('div.genie-name', null, 'GENIE', content.step ? h('span.genie-step', null, content.step) : null),
    title,
    text,
    more,
    actions,
    h('button.genie-close', { attrs: { type: 'button', 'aria-label': t('common.close') }, on: { click: () => closeGenie() } }, '✕')
  );
  const robot = h('div.genie-bot', null, genieRobot());
  const layer = h(
    'div.genie-layer',
    { class: [prefersReducedMotion() ? 'no-motion' : '', content.dim === false ? 'clear' : ''].join(' ').trim() },
    ...panes,
    frame,
    robot,
    bubble
  );
  layer.addEventListener('click', (e) => {
    if (e.target.classList?.contains('genie-pane')) closeGenie();
  });
  document.body.append(layer);

  const pad = 6;
  function place() {
    const r = unionRect(targets) || {
      left: innerWidth / 2 - 1,
      right: innerWidth / 2 + 1,
      top: innerHeight / 2 - 1,
      bottom: innerHeight / 2 + 1,
    };
    const L = Math.max(0, r.left - pad);
    const T = Math.max(0, r.top - pad);
    const R = Math.min(innerWidth, r.right + pad);
    const B = Math.min(innerHeight, r.bottom + pad);
    Object.assign(panes[0].style, { left: '0px', top: '0px', width: '100%', height: `${T}px` });
    Object.assign(panes[1].style, { left: '0px', top: `${B}px`, width: '100%', height: `${Math.max(0, innerHeight - B)}px` });
    Object.assign(panes[2].style, { left: '0px', top: `${T}px`, width: `${L}px`, height: `${B - T}px` });
    Object.assign(panes[3].style, { left: `${R}px`, top: `${T}px`, width: `${Math.max(0, innerWidth - R)}px`, height: `${B - T}px` });
    Object.assign(frame.style, { left: `${L}px`, top: `${T}px`, width: `${R - L}px`, height: `${B - T}px` });
    // GENIE + bubble: on the side with the most room, kept on screen
    const bw = Math.min(360, innerWidth - 24);
    bubble.style.width = `${bw}px`;
    const bh = bubble.offsetHeight || 180;
    const robotW = innerWidth < 600 ? 0 : 96;
    const room = { below: innerHeight - B, above: T, right: innerWidth - R, left: L };
    const side = innerWidth < 600 ? 'sheet' : Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
    let x;
    let y;
    if (side === 'sheet') {
      x = 12;
      y = innerHeight - bh - 12;
    } else if (side === 'below' || side === 'above') {
      x = Math.min(innerWidth - bw - 12, Math.max(12 + robotW, (L + R) / 2 - bw / 2));
      y = side === 'below' ? B + 14 : T - bh - 14;
    } else {
      x = side === 'right' ? R + 14 + robotW : L - bw - 14;
      y = (T + B) / 2 - bh / 2;
    }
    x = Math.min(innerWidth - bw - 8, Math.max(8 + (side === 'sheet' ? 0 : robotW), x));
    y = Math.min(innerHeight - bh - 8, Math.max(8, y));
    Object.assign(bubble.style, { left: `${x}px`, top: `${y}px` });
    robot.hidden = !robotW;
    Object.assign(robot.style, { left: `${x - robotW - 4}px`, top: `${y + bh - 120}px` });
    bubble.dataset.side = side;
  }
  let raf = 0;
  const follow = () => {
    place();
    raf = requestAnimationFrame(follow);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeGenie();
    } else if (e.key === 'Tab') {
      // keep focus inside the bubble
      const f = [...bubble.querySelectorAll('button')].filter((b) => !b.hidden);
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length]?.focus();
    }
  };
  addEventListener('keydown', onKey, true);
  open = { layer, raf: 0, onKey, opener, topic, onClose: content.onClose };
  follow();
  open.raf = raf;
  open.stop = () => cancelAnimationFrame(raf);
  requestAnimationFrame(() => layer.classList.add('in'));
  ok.focus({ preventScroll: true });
  emit('genie:open', { topic });
  emit('modal:change', { open: true });
}

export function closeGenie(immediate = false) {
  if (!open) return;
  const o = open;
  open = null;
  o.stop?.();
  removeEventListener('keydown', o.onKey, true);
  const done = () => o.layer.remove();
  if (immediate || prefersReducedMotion()) done();
  else {
    o.layer.classList.remove('in');
    setTimeout(done, 220);
  }
  emit('modal:change', { open: false });
  emit('genie:close', { topic: o.topic });
  // dismissed by the user (Escape, ✕, click outside): let the caller know (the tour ends)
  if (!immediate) o.onClose?.();
  if (o.opener instanceof HTMLElement && document.contains(o.opener)) o.opener.focus({ preventScroll: true });
}
