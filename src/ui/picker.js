/**
 * Option picker: a full-screen chooser over a blurred app (native <dialog>,
 * so focus is trapped and Escape closes it). Rows of filter chips at the top
 * (one or more groups, e.g. "explored" and "highlight by") re-sort the
 * scrollable list; each option is a button that picks it and closes.
 */
import { h, clear } from '../core/dom.js';
import { openDialog } from './modal.js';

/**
 * @template T
 * @param {{
 *   title: string, intro?: string, id?: string,
 *   groups?: {key:string, label:string, options:{id:string, label:string}[]}[],
 *   state?: Record<string,string>,
 *   items: (state:Record<string,string>) => T[], idOf: (item:T) => string, selectedId?: string|null,
 *   renderItem: (item:T, ctx:{state:Record<string,string>, selected:boolean, index:number}) => Node[],
 *   onPick: (item:T, state:Record<string,string>) => void, onChange?: (state:Record<string,string>) => void,
 *   countLabel?: (n:number) => string
 * }} opts
 */
export function openPicker(opts) {
  const state = { ...(opts.state || {}) };
  for (const g of opts.groups || []) state[g.key] ??= g.options[0]?.id;
  const list = h('ol.picker-list');
  const count = h('p.picker-count', { attrs: { role: 'status' } });
  let api = null;

  const rows = (opts.groups || []).map((g) => {
    const row = h(
      'div.picker-filters',
      { attrs: { role: 'radiogroup', 'aria-label': g.label, 'data-group': g.key } },
      h('span.picker-filters-label', null, g.label),
      ...g.options.map((o) =>
        h(
          'button.picker-chip',
          {
            attrs: { type: 'button', role: 'radio', 'aria-checked': String(o.id === state[g.key]), 'data-filter': o.id },
            on: {
              click: () => {
                state[g.key] = o.id;
                row.querySelectorAll('.picker-chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.filter === o.id)));
                opts.onChange?.({ ...state });
                renderList();
                list.scrollTop = 0;
              },
            },
          },
          o.label
        )
      )
    );
    return row;
  });

  function renderList() {
    clear(list);
    const items = opts.items({ ...state });
    count.textContent = opts.countLabel ? opts.countLabel(items.length) : '';
    items.forEach((item, index) => {
      const id = opts.idOf(item);
      const selected = id === opts.selectedId;
      list.append(
        h(
          'li',
          null,
          h(
            'button.picker-option',
            {
              class: [selected ? 'selected' : '', index === 0 ? 'best' : ''].join(' ').trim(),
              attrs: { type: 'button', 'aria-current': selected ? 'true' : null, 'data-option': id },
              on: {
                click: () => {
                  opts.onPick(item, { ...state });
                  api?.close();
                },
              },
            },
            ...opts.renderItem(item, { state: { ...state }, selected, index })
          )
        )
      );
    });
  }

  renderList();
  api = openDialog({
    id: opts.id || 'option-picker',
    title: opts.title,
    wide: true,
    body: h(
      'div.picker-body',
      null,
      opts.intro ? h('p.picker-intro', null, opts.intro) : null,
      rows.length ? h('div.picker-groups', null, ...rows) : null,
      count,
      list
    ),
  });
  api.dialog.classList.add('picker');
  // land on the current choice, not on the first button
  const current = list.querySelector('.picker-option.selected') || list.querySelector('.picker-option');
  current?.focus({ preventScroll: false });
  return api;
}
