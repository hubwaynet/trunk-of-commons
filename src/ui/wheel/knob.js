// The Wheel's dials (Jason, 2026-11-09: "The 3 dials should be dials with strength indicators to
// select from"). A round knob with a ring of bars that grow with strength. Tap a bar, drag round the
// knob, or use the keyboard (it is a slider to assistive technology). Lit bars are filled, unlit bars
// are outlines, so colour is never the only cue.
// SPDX-License-Identifier: AGPL-3.0-only

import { el } from '../common.js';

const SWEEP = 135; // the ring runs from -135° to +135°, with the gap at the bottom
const pt = (deg, r) => [50 + r * Math.sin((deg * Math.PI) / 180), 50 - r * Math.cos((deg * Math.PI) / 180)];

/**
 * opts:
 *   id, label, min, max, value
 *   angleOf(v): where a value sits on the ring, -135..135 (0 is the top)
 *   strengthOf(v): 0..1, the bar's length (0: a small marker, no bar)
 *   lit(v, value): whether the bar for v is lit at the current value
 *   centre(v): { main, sub } for the cap
 *   valueText(v): what assistive technology hears
 *   centreTap: a value a tap on the cap selects (the vote dial's neutral), or null
 *   describedBy, onChange(v)
 */
export function createKnob(opts) {
  const { id, label, min, max, angleOf, strengthOf, lit, centre, valueText, centreTap = null, describedBy, onChange } = opts;
  let value = opts.value;
  const wrap = document.createElement('div');
  wrap.className = 'knob-wrap';
  const lab = document.createElement('div');
  lab.className = 'knob-label';
  lab.id = `${id}-label`;
  lab.textContent = label;
  const k = document.createElement('div');
  k.className = 'knob';
  k.id = id;
  k.tabIndex = 0;
  k.setAttribute('role', 'slider');
  k.setAttribute('aria-labelledby', lab.id);
  k.setAttribute('aria-valuemin', String(min));
  k.setAttribute('aria-valuemax', String(max));
  if (describedBy) k.setAttribute('aria-describedby', describedBy);
  const svg = el('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  const count = max - min + 1;
  const hw = Math.min(8, ((2 * SWEEP) / count) * 0.3); // half the width of a bar, in degrees
  const bars = new Map();
  for (let v = min; v <= max; v++) {
    const a = angleOf(v);
    const s = strengthOf(v);
    let shape;
    if (s <= 0) {
      const [x, y] = pt(a, 33);
      shape = el('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 2.4, class: 'knob-mark' });
    } else {
      const r0 = 28;
      const r1 = 32 + 15 * s;
      const p = [pt(a - hw, r0), pt(a + hw, r0), pt(a + hw, r1), pt(a - hw, r1)];
      shape = el('polygon', { points: p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '), class: 'knob-bar' });
    }
    bars.set(v, shape);
    svg.append(shape);
  }
  svg.append(el('circle', { cx: 50, cy: 50, r: 22, class: 'knob-cap' }));
  const pointer = el('line', { x1: 50, y1: 50, x2: 50, y2: 30, class: 'knob-pointer' });
  const main = el('text', { x: 50, y: 54, class: 'knob-text' });
  const sub = el('text', { x: 50, y: 64, class: 'knob-sub' });
  svg.append(pointer, main, sub);
  k.append(svg);
  wrap.append(lab, k);

  function show() {
    for (const [v, shape] of bars) shape.classList.toggle('on', lit(v, value));
    const [x, y] = pt(angleOf(value), 21);
    const [x0, y0] = pt(angleOf(value), 13);
    pointer.setAttribute('x1', x0.toFixed(2)); pointer.setAttribute('y1', y0.toFixed(2));
    pointer.setAttribute('x2', x.toFixed(2)); pointer.setAttribute('y2', y.toFixed(2));
    const c = centre(value);
    main.textContent = c.main;
    sub.textContent = c.sub ?? '';
    main.setAttribute('y', c.sub ? '50' : '55');
    sub.setAttribute('y', '61');
    k.setAttribute('aria-valuenow', String(value));
    k.setAttribute('aria-valuetext', valueText(value));
  }
  function set(v, fire = true) {
    const nv = Math.max(min, Math.min(max, Math.round(v)));
    const changed = nv !== value;
    value = nv;
    show();
    if (changed && fire) onChange?.(value);
  }

  // Pointer: the nearest value to where you touch, round the ring; the cap selects centreTap.
  const pick = (e) => {
    const r = k.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100 - 50;
    const y = ((e.clientY - r.top) / r.height) * 100 - 50;
    if (centreTap != null && Math.hypot(x, y) < 17) return centreTap;
    let a = (Math.atan2(x, -y) * 180) / Math.PI;
    a = Math.max(-SWEEP, Math.min(SWEEP, a));
    let best = value;
    let bd = Infinity;
    for (let v = min; v <= max; v++) { const d = Math.abs(angleOf(v) - a); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  let dragging = null;
  k.addEventListener('pointerdown', (e) => {
    dragging = e.pointerId;
    k.setPointerCapture?.(e.pointerId);
    k.focus({ preventScroll: true });
    set(pick(e));
    e.preventDefault();
  });
  k.addEventListener('pointermove', (e) => { if (dragging === e.pointerId) set(pick(e)); });
  const stop = (e) => { if (dragging === e.pointerId) dragging = null; };
  k.addEventListener('pointerup', stop);
  k.addEventListener('pointercancel', stop);

  // Keyboard: arrows step, Page Up/Down by three, Home/End the ends, 0 the neutral (vote dial).
  k.addEventListener('keydown', (e) => {
    const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 };
    if (e.key in steps) set(value + steps[e.key]);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else if (e.key === '0' && centreTap != null) set(centreTap);
    else return;
    e.preventDefault();
  });

  show();
  return { wrap, knob: k, set, get value() { return value; } };
}
