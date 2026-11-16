/**
 * Option picker: a full-screen chooser over a blurred app (native <dialog>,
 * so focus is trapped and Escape closes it). Filter chips at the top re-sort
 * the scrollable list; each option is a button that picks it and closes.
 */
import { h, clear } from '../core/dom.js';
import { openDialog } from './modal.js';

/**
 * @template T
 * @param {{
 *   title: string, intro?: string, id?: string,
 *   filters?: {id:string, label:string}[], filter?: string,
 *   items: (filter:string) => T[], idOf: (item:T) => string, selectedId?: string|null,
 *   renderItem: (item:T, ctx:{filter:string, selected:boolean, index:number}) => Node[],
 *   onPick: (item:T, filter:string) => void, onFilter?: (filter:string) => void,
 *   filterLabel?: string, countLabel?: (n:number) => string, help?: Node|null
 * }} opts
 */
export function openPicker(opts) {
  let filter = opts.filter || opts.filters?.[0]?.id || 'general';
  const list = h('ol.picker-list');
  const count = h('p.picker-count');
  let api = null;

  const chips = opts.filters?.length
    ? h(
        'div.picker-filters',
        { attrs: { role: 'radiogroup', 'aria-label': opts.filterLabel || '' } },
        opts.filterLabel ? h('span.picker-filters-label', null, opts.filterLabel) : null,
        ...opts.filters.map((f) =>
          h(
            'button.picker-chip',
            {
              attrs: { type: 'button', role: 'radio', 'aria-checked': String(f.id === filter), 'data-filter': f.id },
              on: {
                click: () => {
                  filter = f.id;
                  chips
                    .querySelectorAll('.picker-chip')
                    .forEach((c) => c.setAttribute('aria-checked', String(c.dataset.filter === filter)));
                  opts.onFilter?.(filter);
                  renderList();
                  list.scrollTop = 0;
                },
              },
            },
            f.label
          )
        )
      )
    : null;

  function renderList() {
    clear(list);
    const items = opts.items(filter);
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
                  opts.onPick(item, filter);
                  api?.close();
                },
              },
            },
            ...opts.renderItem(item, { filter, selected, index })
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
    body: h('div.picker-body', null, opts.intro ? h('p.picker-intro', null, opts.intro, opts.help || null) : null, chips, count, list),
  });
  api.dialog.classList.add('picker');
  // land on the current choice, not on the first button
  const current = list.querySelector('.picker-option.selected') || list.querySelector('.picker-option');
  current?.focus({ preventScroll: false });
  return api;
}
