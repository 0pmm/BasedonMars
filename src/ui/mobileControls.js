/**
 * Touch controls: virtual analog joystick (left), drag-to-look zone
 * (right half), and action buttons (interact, jump, sprint toggle, rover).
 */
import { $, $$ } from '../core/dom.js';
import * as input from '../core/input.js';

const LOOK_SENSITIVITY = 0.005;

export function initMobileControls() {
  const stick = $('#joystick');
  const knob = $('#joystick-knob');
  let stickId = null;
  let center = { x: 0, y: 0 };
  const radius = 50;

  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    const r = stick.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    moveStick(e);
  });
  const moveStick = (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - center.x;
    let dy = e.clientY - center.y;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setTouchMove(dx / radius, -dy / radius);
  };
  stick.addEventListener('pointermove', moveStick);
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    input.setTouchMove(0, 0);
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  // Look zone
  const zone = $('#look-zone');
  let lookId = null;
  let last = { x: 0, y: 0 };
  let vel = { x: 0, y: 0 };
  zone.addEventListener('pointerdown', (e) => {
    lookId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    last = { x: e.clientX, y: e.clientY };
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    vel = { x: dx * LOOK_SENSITIVITY, y: dy * LOOK_SENSITIVITY };
    input.addLook(vel.x, vel.y);
  });
  const endLook = (e) => {
    if (e.pointerId !== lookId) return;
    lookId = null;
    // Light inertia after release
    let steps = 8;
    const glide = () => {
      if (lookId !== null || steps-- <= 0) return;
      vel.x *= 0.6;
      vel.y *= 0.6;
      input.addLook(vel.x, vel.y);
      requestAnimationFrame(glide);
    };
    requestAnimationFrame(glide);
  };
  zone.addEventListener('pointerup', endLook);
  zone.addEventListener('pointercancel', endLook);

  // Buttons
  $$('.m-btn').forEach((btn) => {
    const action = btn.dataset.action;
    const toggle = btn.hasAttribute('data-toggle');
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (toggle) {
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        input.setVirtualAction(action, on);
      } else input.setVirtualAction(action, true);
    });
    if (!toggle) {
      const up = () => input.setVirtualAction(action, false);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    }
  });

  const checkOrientation = () => {
    const hint = $('#orientation-hint');
    if (!hint) return;
    const portrait = matchMedia('(orientation: portrait)').matches && matchMedia('(pointer: coarse)').matches;
    hint.hidden = !portrait || $('#surface-hud').hidden;
  };
  addEventListener('resize', checkOrientation);
  return { checkOrientation };
}
