/**
 * Minimal DOM helpers. All dynamic UI is built with `h()` so that data is
 * always inserted as text (never as HTML), which removes the XSS risk of
 * `innerHTML` string templates.
 */

/**
 * Create an element.
 * @param {string} tag e.g. "div.card#id"
 * @param {{
 *   class?: string, text?: string|number, attrs?: Record<string, any>,
 *   on?: Record<string, EventListener>, dataset?: Record<string, string>,
 *   style?: Record<string, string>
 * } | null} [props]
 * @param {...(Node|string|number|null|undefined|false)} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const part of rest) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }
  if (props) {
    if (props.class) el.className += (el.className ? ' ' : '') + props.class;
    if (props.text != null) el.textContent = String(props.text);
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v === false || v == null) continue;
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (props.dataset) Object.assign(el.dataset, props.dataset);
    if (props.style) Object.assign(el.style, props.style);
    if (props.on) for (const [evt, fn] of Object.entries(props.on)) el.addEventListener(evt, fn);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** @param {string} sel @param {ParentNode} [root] @returns {HTMLElement | null} */
export const $ = (sel, root = document) => root.querySelector(sel);

/** @param {string} sel @param {ParentNode} [root] @returns {HTMLElement[]} */
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Remove all children of an element. */
export function clear(el) {
  if (el) el.replaceChildren();
  return el;
}

/** Show/hide helper using the `hidden` attribute. */
export function setVisible(el, visible) {
  if (el) el.hidden = !visible;
}

/** True when the event target is a text field (keyboard shortcuts must be ignored). */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
