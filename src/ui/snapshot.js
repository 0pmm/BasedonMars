/**
 * Screenshot with a trip card: the captured frame plus a panel with the
 * route / EVA data (and the elevation profile), shown in a preview dialog
 * before downloading. The card can be turned off.
 */
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { openDialog } from './modal.js';

/**
 * @typedef {{title:string, subtitle?:string, rows:[string,string][],
 *   profile?:{pts:{d:number,h:number}[], marker?:number|null, pnr?:number|null, stops?:number[]},
 *   footer?:string}} TripCard
 */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw the trip card on a copy of the frame. */
export function composeSnapshot(frame, card) {
  const c = document.createElement('canvas');
  c.width = frame.width;
  c.height = frame.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(frame, 0, 0);
  if (!card) return c;
  const sc = Math.max(0.7, Math.min(2.4, c.height / 820));
  const pad = 16 * sc;
  const lineH = 21 * sc;
  const colW = 250 * sc;
  const cols = card.rows.length > 7 ? 2 : 1;
  const perCol = Math.ceil(card.rows.length / cols);
  const profH = card.profile?.pts?.length > 1 ? 92 * sc : 0;
  const w = Math.min(c.width - 2 * pad, Math.max(cols * colW + 2 * pad, 330 * sc));
  const hh = pad * 2 + 30 * sc + (card.subtitle ? 20 * sc : 0) + perCol * lineH + (profH ? profH + 10 * sc : 0) + 22 * sc;
  const x = pad;
  const y = c.height - hh - pad;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 18, 0.80)';
  ctx.strokeStyle = 'rgba(255, 107, 53, 0.85)';
  ctx.lineWidth = 1.5 * sc;
  roundRect(ctx, x, y, w, hh, 12 * sc);
  ctx.fill();
  ctx.stroke();
  let cy = y + pad + 20 * sc;
  ctx.fillStyle = '#ff8a55';
  ctx.font = `700 ${19 * sc}px Orbitron, Rajdhani, sans-serif`;
  ctx.fillText(card.title, x + pad, cy);
  if (card.subtitle) {
    cy += 20 * sc;
    ctx.fillStyle = '#c9ced8';
    ctx.font = `500 ${13.5 * sc}px Rajdhani, sans-serif`;
    ctx.fillText(card.subtitle, x + pad, cy);
  }
  cy += 12 * sc;
  card.rows.forEach(([k, v], i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const rx = x + pad + col * colW;
    const ry = cy + (row + 1) * lineH;
    ctx.fillStyle = '#9aa3b2';
    ctx.font = `500 ${12.5 * sc}px Rajdhani, sans-serif`;
    ctx.fillText(k, rx, ry, 112 * sc);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${14 * sc}px "Share Tech Mono", monospace`;
    ctx.fillText(v, rx + 118 * sc, ry, colW - 124 * sc);
  });
  cy += perCol * lineH + 10 * sc;
  if (profH) drawProfile(ctx, card.profile, x + pad, cy, w - 2 * pad, profH - 6 * sc, sc);
  ctx.fillStyle = '#7d8696';
  ctx.font = `500 ${11 * sc}px Rajdhani, sans-serif`;
  ctx.fillText(card.footer || t('snap.footer'), x + pad, y + hh - 10 * sc, w - 2 * pad);
  ctx.restore();
  return c;
}

function drawProfile(ctx, p, x, y, w, h, sc) {
  const pts = p.pts;
  let min = Infinity;
  let max = -Infinity;
  for (const q of pts) {
    min = Math.min(min, q.h);
    max = Math.max(max, q.h);
  }
  const span = Math.max(4, max - min);
  const L = pts[pts.length - 1].d || 1;
  const px = (d) => x + (d / L) * w;
  const py = (v) => y + h - ((v - min) / span) * h;
  ctx.fillStyle = 'rgba(255,107,53,0.25)';
  ctx.beginPath();
  ctx.moveTo(px(0), y + h);
  for (const q of pts) ctx.lineTo(px(q.d), py(q.h));
  ctx.lineTo(px(L), y + h);
  ctx.fill();
  ctx.strokeStyle = '#ff8a55';
  ctx.lineWidth = 1.6 * sc;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(px(q.d), py(q.h)) : ctx.moveTo(px(q.d), py(q.h))));
  ctx.stroke();
  ctx.fillStyle = '#ffcc33';
  for (const d of p.stops || []) ctx.fillRect(px(d) - sc, y, 2 * sc, h);
  if (p.pnr != null) {
    ctx.strokeStyle = '#ff3b5c';
    ctx.setLineDash([4 * sc, 3 * sc]);
    ctx.beginPath();
    ctx.moveTo(px(p.pnr), y);
    ctx.lineTo(px(p.pnr), y + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (p.marker != null) {
    const mx = px(Math.min(L, p.marker));
    let hv = pts[0].h;
    for (const q of pts) if (q.d <= p.marker) hv = q.h;
    ctx.fillStyle = '#4fd1ff';
    ctx.beginPath();
    ctx.arc(mx, py(hv), 5 * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#c9ced8';
  ctx.font = `500 ${11 * sc}px "Share Tech Mono", monospace`;
  ctx.fillText(`${Math.round(max)} m`, x, y + 10 * sc);
  ctx.fillText(`${Math.round(min)} m`, x, y + h - 2 * sc);
}

function download(canvas) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = h('a', {
      attrs: { href: url, download: `mars-explorer-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png` },
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

/**
 * Preview dialog: image with the trip card (toggle), download button.
 * @param {HTMLCanvasElement} frame
 * @param {TripCard|null} card
 * @param {{onSaved?:()=>void}} [opts]
 */
export function openSnapshot(frame, card, opts = {}) {
  let withCard = !!card;
  let composed = composeSnapshot(frame, withCard ? card : null);
  const img = h('img.snap-preview', { attrs: { alt: t('snap.alt'), src: composed.toDataURL('image/jpeg', 0.85) } });
  const toggle = card
    ? h(
        'label.pl-check',
        null,
        h('input#snap-info', {
          attrs: { type: 'checkbox', checked: true },
          on: {
            change: (e) => {
              withCard = e.target.checked;
              composed = composeSnapshot(frame, withCard ? card : null);
              img.src = composed.toDataURL('image/jpeg', 0.85);
            },
          },
        }),
        ` ${t('snap.include')}`
      )
    : h('p.pl-meta', null, t('snap.noTrip'));
  return openDialog({
    title: `📸 ${t('snap.title')}`,
    wide: true,
    body: h('div.snap-body', null, img, toggle),
    actions: [
      {
        id: 'snap-download',
        label: `⬇ ${t('snap.download')}`,
        primary: true,
        onClick: () => {
          download(composed);
          opts.onSaved?.();
        },
      },
      { label: t('common.close') },
    ],
  });
}
