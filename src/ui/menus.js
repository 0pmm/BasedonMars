/**
 * Menus: settings (general, graphics, audio, controls with key remapping,
 * accessibility, about) and the controls help.
 */
import { h, clear } from '../core/dom.js';
import { t, LANGUAGES } from '../core/i18n.js';
import { getSettings, updateSettings, resetSettings, DEFAULT_BINDINGS } from '../core/settings.js';
import { captureNextKey, keyLabel } from '../core/input.js';
import { getStoredErrors, clearStoredErrors } from '../core/errors.js';
import { FEEDBACK_URL } from '../config.js';
import { openDialog } from './modal.js';
import { toast } from './feedback.js';

/* ---------------- Settings ---------------- */
function select(key, options, labelKey, hintKey) {
  const id = `set-${key}`;
  const s = getSettings();
  const el = h(
    'select',
    { attrs: { id }, on: { change: (e) => updateSettings({ [key]: coerce(e.target.value, s[key]) }) } },
    options.map(([value, label]) => h('option', { attrs: { value: String(value), selected: String(s[key]) === String(value) } }, label))
  );
  return h('div.setting', null, h('label', { attrs: { for: id } }, t(labelKey), hintKey ? h('small', null, t(hintKey)) : null), el);
}

function coerce(value, previous) {
  if (typeof previous === 'number') return Number(value);
  if (typeof previous === 'boolean') return value === 'true';
  return value;
}

function toggle(key, labelKey, hintKey) {
  const s = getSettings();
  const id = `set-${key}`;
  const btn = h('button.switch', {
    attrs: { type: 'button', role: 'switch', id, 'aria-checked': String(!!s[key]), 'aria-labelledby': `${id}-label` },
    on: {
      click: () => {
        const v = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(v));
        updateSettings({ [key]: v });
      },
    },
  });
  return h(
    'div.setting',
    null,
    h('span.label', { attrs: { id: `${id}-label` } }, t(labelKey), hintKey ? h('small', null, t(hintKey)) : null),
    btn
  );
}

function range(key, labelKey, min, max, step, fmt = (v) => `${Math.round(v * 100)}%`) {
  const s = getSettings();
  const id = `set-${key}`;
  const out = h('output', { attrs: { for: id } }, fmt(s[key]));
  const inp = h('input', {
    attrs: { type: 'range', id, min, max, step, value: s[key] },
    on: {
      input: (e) => {
        const v = Number(e.target.value);
        out.textContent = fmt(v);
        updateSettings({ [key]: v });
      },
    },
  });
  return h('div.setting', null, h('label', { attrs: { for: id } }, t(labelKey), ' ', out), inp);
}

function keyRow(action) {
  const s = getSettings();
  const btn = h('button.btn.keybind', { attrs: { type: 'button' } }, s.bindings[action].map(keyLabel).join(' / '));
  btn.addEventListener('click', async () => {
    btn.classList.add('listening');
    btn.textContent = t('settings.pressKey');
    const code = await captureNextKey();
    btn.classList.remove('listening');
    if (code) {
      const bindings = { ...getSettings().bindings };
      // A key can only belong to one action
      for (const k of Object.keys(bindings)) bindings[k] = bindings[k].filter((c) => c !== code);
      bindings[action] = [code, ...(DEFAULT_BINDINGS[action].filter((c) => c.startsWith('Arrow')) || [])].slice(0, 2);
      updateSettings({ bindings });
    }
    btn.textContent = getSettings().bindings[action].map(keyLabel).join(' / ');
  });
  return h('div.setting', null, h('span.label', null, t(`action.${action}`)), btn);
}

const SECTIONS = {
  general: () => [
    select('language', [['auto', t('settings.auto')], ...LANGUAGES.map((l) => [l.code, l.label])], 'settings.language'),
    select(
      'units',
      [
        ['metric', t('settings.metric')],
        ['imperial', t('settings.imperial')],
      ],
      'settings.units'
    ),
    toggle('autoRotate', 'settings.autoRotate'),
  ],
  graphics: () => [
    select(
      'quality',
      [
        ['auto', t('settings.auto')],
        ['low', t('quality.low')],
        ['medium', t('quality.medium')],
        ['high', t('quality.high')],
        ['ultra', t('quality.ultra')],
      ],
      'settings.quality',
      'settings.qualityHint'
    ),
    toggle('helmetOverlay', 'settings.visor'),
    toggle('showMinimap', 'settings.minimap'),
    toggle('showFps', 'settings.fps'),
  ],
  audio: () => [
    toggle('muted', 'settings.mute'),
    range('masterVolume', 'settings.master', 0, 1, 0.05),
    range('sfxVolume', 'settings.sfx', 0, 1, 0.05),
    range('ambientVolume', 'settings.ambient', 0, 1, 0.05),
    range('musicVolume', 'settings.music', 0, 1, 0.05),
  ],
  controls: () => [
    range('mouseSensitivity', 'settings.sensitivity', 0.2, 3, 0.1, (v) => `${v.toFixed(1)}×`),
    toggle('invertY', 'settings.invertY'),
    h('p.section-title', null, t('settings.keys')),
    ...Object.keys(DEFAULT_BINDINGS).map(keyRow),
    h(
      'button.btn.ghost',
      {
        attrs: { type: 'button' },
        on: { click: () => (updateSettings({ bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)) }), toast(t('settings.keysReset'))) },
      },
      t('settings.resetKeys')
    ),
    h('p', { style: { color: 'var(--muted)', fontSize: '0.85rem', marginTop: '8px' } }, t('settings.gamepad')),
  ],
  accessibility: () => [
    select(
      'reducedMotion',
      [
        ['auto', t('settings.auto')],
        ['on', t('common.on')],
        ['off', t('common.off')],
      ],
      'settings.reducedMotion'
    ),
    toggle('highContrast', 'settings.highContrast'),
    select(
      'fontScale',
      [
        [1, '100%'],
        [1.15, '115%'],
        [1.3, '130%'],
      ],
      'settings.fontScale'
    ),
    toggle('soundCaptions', 'settings.captions', 'settings.captionsHint'),
  ],
  about: () => {
    const errors = getStoredErrors();
    return [
      h('p', null, t('about.text')),
      h('p', { style: { marginTop: '8px' } }, t('about.disclaimer')),
      h('p.section-title', null, t('about.privacy')),
      h('p', null, t('about.privacyText')),
      h('p.section-title', null, t('about.feedback')),
      h('a.btn', { attrs: { href: FEEDBACK_URL, target: '_blank', rel: 'noopener noreferrer' } }, `💬 ${t('about.feedbackBtn')} ↗`),
      errors.length
        ? h(
            'details',
            { style: { marginTop: '10px' } },
            h('summary', null, t('about.errors', { n: errors.length })),
            h(
              'pre',
              { style: { whiteSpace: 'pre-wrap', fontSize: '0.75rem', maxHeight: '160px', overflow: 'auto' } },
              errors.map((e) => `${e.at} ${e.message}`).join('\n')
            ),
            h(
              'button.btn.ghost',
              { attrs: { type: 'button' }, on: { click: () => (clearStoredErrors(), toast(t('about.errorsCleared'))) } },
              t('about.clearErrors')
            )
          )
        : null,
      h('p.section-title', null, t('about.reset')),
      h(
        'div.segmented',
        null,
        h(
          'button.btn.ghost',
          { attrs: { type: 'button' }, on: { click: () => (resetSettings(), toast(t('settings.resetDone'))) } },
          t('about.resetSettings')
        )
      ),
    ];
  },
};

export function openSettings(section = 'general') {
  const body = h('div');
  const tabs = h('div.settings-tabs', { attrs: { role: 'tablist' } });
  const panel = h('div', { attrs: { role: 'tabpanel' } });
  const show = (name) => {
    clear(panel);
    panel.append(...SECTIONS[name]().filter(Boolean));
    tabs.querySelectorAll('.chip').forEach((c) => {
      const active = c.dataset.section === name;
      c.classList.toggle('active', active);
      c.setAttribute('aria-selected', String(active));
    });
  };
  for (const name of Object.keys(SECTIONS)) {
    tabs.append(
      h(
        'button.chip',
        { attrs: { type: 'button', role: 'tab' }, dataset: { section: name }, on: { click: () => show(name) } },
        t(`settings.tab.${name}`)
      )
    );
  }
  body.append(tabs, panel);
  show(section);
  return openDialog({ title: `⚙️ ${t('menu.settings')}`, body, wide: true });
}

/* ---------------- Controls help ---------------- */
export function openHelp() {
  const b = getSettings().bindings;
  const row = (label, keys) => h('tr', null, h('td', null, label), h('td', null, keys));
  const k = (action) => b[action].map(keyLabel).join(' / ');
  const body = [
    h('p.section-title', null, t('help.surface')),
    h(
      'table.help-table',
      null,
      h(
        'tbody',
        null,
        row(t('help.move'), `${k('forward')} ${k('left')} ${k('back')} ${k('right')}`),
        row(t('help.look'), t('help.lookKeys')),
        row(t('action.jump'), k('jump')),
        row(t('action.sprint'), k('sprint')),
        row(t('tr.action.follow'), k('interact')),
        row(t('tr.action.speed'), `${k('speedDown')} / ${k('speedUp')}`),
        row(t('action.map'), k('map')),
        row(t('action.screenshot'), k('screenshot')),
        row(t('action.pause'), `${k('pause')} / Esc`),
        row(t('action.help'), k('help'))
      )
    ),
    h('p.section-title', null, t('help.orbit')),
    h(
      'table.help-table',
      null,
      h(
        'tbody',
        null,
        row(t('help.pan'), t('help.panKeys')),
        row(t('help.zoom'), t('help.zoomKeys')),
        row(t('help.tilt'), t('help.tiltKeys')),
        row(t('help.select'), t('help.selectKeys')),
        row(t('help.addPoint'), t('help.addPointKeys')),
        row(t('help.exitFocus'), 'Esc')
      )
    ),
    h('p.section-title', null, t('help.touch')),
    h('p', null, t('help.touchText')),
    h('p.section-title', null, t('help.gamepad')),
    h('p', null, t('help.gamepadText')),
  ];
  return openDialog({ title: `⌨️ ${t('menu.controls')}`, body, wide: true });
}
