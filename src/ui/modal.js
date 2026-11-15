/**
 * Accessible modal dialogs built on the native <dialog> element:
 * focus is trapped by the browser (showModal makes the page inert),
 * Escape closes dismissible dialogs, focus returns to the opener.
 */
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { emit } from '../core/events.js';
import { audio } from '../core/audio.js';

let openCount = 0;

export function isModalOpen() {
  return openCount > 0;
}

/**
 * @param {{
 *   title: string, body: Node | Node[], badge?: {text:string, kind?:'success'|'fail'},
 *   actions?: {label:string, primary?:boolean, danger?:boolean, onClick?: (close: () => void) => void, keepOpen?: boolean, id?: string}[],
 *   dismissible?: boolean, wide?: boolean, onClose?: () => void, id?: string
 * }} opts
 */
export function openDialog(opts) {
  const { title, body, badge, actions = [], dismissible = true, wide = false, onClose } = opts;
  const opener = document.activeElement;
  const titleId = `dlg-title-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = h('dialog.modal', { class: wide ? 'wide' : '', attrs: { 'aria-labelledby': titleId, id: opts.id } });
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    openCount = Math.max(0, openCount - 1);
    emit('modal:change', { open: openCount > 0 });
    onClose?.();
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
  };

  const head = h(
    'div.modal-head',
    null,
    h(
      'div',
      null,
      badge ? h('span.mission-badge', { class: badge.kind || '' }, badge.text) : null,
      h('h2', { attrs: { id: titleId } }, title)
    ),
    dismissible ? h('button.icon-btn', { attrs: { type: 'button', 'aria-label': t('common.close') }, on: { click: close } }, '✕') : null
  );
  const bodyEl = h('div.modal-body', null, body);
  const actionsEl = actions.length
    ? h(
        'div.modal-actions',
        null,
        actions.map((a) =>
          h(
            'button.btn',
            {
              class: [a.primary ? 'primary' : '', a.danger ? 'danger' : ''].join(' ').trim(),
              attrs: { type: 'button', id: a.id },
              on: {
                click: () => {
                  audio.ui();
                  // Run the action BEFORE closing: onClose handlers (e.g. "resolve
                  // false" in confirmDialog) must see that an action was chosen.
                  a.onClick?.(close);
                  if (!a.keepOpen) close();
                },
              },
            },
            a.label
          )
        )
      )
    : null;
  dialog.append(h('div.modal-inner', null, head, bodyEl, actionsEl));
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (dismissible) close();
  });
  dialog.addEventListener('click', (e) => {
    if (dismissible && e.target === dialog) close(); // backdrop click
  });
  document.body.append(dialog);
  dialog.showModal();
  openCount++;
  emit('modal:change', { open: true });
  const primary = dialog.querySelector('.modal-actions .btn.primary') || dialog.querySelector('.modal-actions .btn');
  (primary || dialog.querySelector('button'))?.focus({ preventScroll: true });
  return { dialog, body: bodyEl, close };
}

/** Promise-based confirmation dialog. */
export function confirmDialog({ title, text, confirmLabel, cancelLabel, danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openDialog({
      title,
      body: h('p', null, text),
      actions: [
        { label: cancelLabel || t('common.cancel'), onClick: () => ((answered = true), resolve(false)) },
        { label: confirmLabel || t('common.confirm'), primary: !danger, danger, onClick: () => ((answered = true), resolve(true)) },
      ],
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
  });
}
