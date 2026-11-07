// Page helpers shared by every game: markup, the seat palette, toasts, the achievements strip and
// card, and achievements stored in this browser. Game rules stay in src/engine/.
// SPDX-License-Identifier: AGPL-3.0-only

import { announce } from './announce.js';
import { IDEAS } from './ideas.js';

export const NAMES = ['Wren', 'Quoll', 'Tern', 'Moss', 'Ember', 'Reed', 'Kestrel', 'Fig', 'Banksia', 'Curlew'];
// Seat colours from the 2017 RGB colour wheel: rose, orange, chartreuse, spring, azure, violet.
export const HUES = ['#d1386f', '#d9741c', '#6fa52a', '#1f9c66', '#2f78cc', '#7650c8'];
export const HUMAN_HUE = '#a06f17';
export const CELEBRATION_COLOURS = [...HUES, HUMAN_HUE, '#ffd166'];
export const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SVGNS = 'http://www.w3.org/2000/svg';
/** An SVG element with attributes and optional text. */
export function el(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** HTML to a fragment (may hold several elements). */
export function frag(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
/** HTML to its first element. */
export const h = (html) => frag(html).firstElementChild;
export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** A short message at the foot of the screen. Several at once stack upwards. */
export function toast(msg, ms = 5000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('aria-hidden', 'true'); // screen readers hear it through the announcer
  t.textContent = msg;
  announce(msg);
  const stacked = document.querySelectorAll('.toast').length;
  if (stacked) t.style.bottom = `calc(${20 + stacked * 56}px + env(safe-area-inset-bottom, 0px))`;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Achievements earned in this browser, with a fallback for when storage is unavailable. */
export function achievementStore({ key, celebratedKey, all }) {
  let memory = new Set();
  let celebratedInMemory = false;
  const load = () => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(memory); } };
  return {
    load,
    complete: (have = load()) => all.every((a) => have.has(a.id)),
    /** Records ids; returns the ones that are new. */
    add(ids) {
      const have = load();
      const fresh = [...ids].filter((id) => !have.has(id));
      for (const id of fresh) have.add(id);
      memory = have;
      if (fresh.length) { try { localStorage.setItem(key, JSON.stringify([...have])); } catch { /* storage unavailable */ } }
      return fresh;
    },
    /** True the first time it's asked after every achievement is earned (the full fireworks). */
    firstCelebration() {
      let done = false;
      try { done = localStorage.getItem(celebratedKey) === '1'; localStorage.setItem(celebratedKey, '1'); } catch { done = celebratedInMemory; }
      celebratedInMemory = true;
      return !done;
    },
    forget() { memory = new Set(); celebratedInMemory = false; },
    keys: [key, celebratedKey],
  };
}

/** The segmented strip: n of N, plus the unlock it leads to. */
export function progressHtml(all, have, { unlocked = false, unlockLabel = '' } = {}) {
  const n = all.filter((a) => have.has(a.id)).length;
  return `<div class="progress" role="img" aria-label="${n} of ${all.length} achievements">
    <div class="progress-segs">${all.map((a) => `<span class="seg ${have.has(a.id) ? 'on' : ''}" title="${esc(a.name)}${have.has(a.id) ? ' (done)' : ''}"></span>`).join('')}</div>
    <span class="progress-label">${n} of ${all.length}${n === all.length || unlocked ? ` · ${unlockLabel}` : ''}</span></div>`;
}

/** The achievements card shown below a finished table. newNow: ids earned since the page opened. */
export function achievementsCardHtml(all, have, newNow, { note, unlocked, unlockLabel }) {
  return `<section class="card extra" aria-labelledby="ach-h"><h3 id="ach-h">Achievements</h3>${progressHtml(all, have, { unlocked, unlockLabel })}<p class="muted small">${note}</p><ul class="achievements">
    ${all.map((a) => `<li class="${have.has(a.id) ? '' : 'locked'}"><span class="badge">${have.has(a.id) ? (newNow.has(a.id) ? 'NEW' : 'DONE') : '····'}</span>
      <span><b>${esc(a.name)}</b> ${esc(a.text)}</span></li>`).join('')}
  </ul></section>`;
}

/** True when the whole table picture is on screen. */
export function tableInView() {
  const t = document.querySelector('.table-wrap')?.getBoundingClientRect();
  return !!t && t.top >= 0 && t.bottom <= innerHeight;
}

/**
 * Scroll the play area (table and panel) to the top of the screen. With ifHidden, only when part
 * of the table is off the screen: on a phone after a split's results, or after New table from the
 * foot of a finished table (Jason, 2026-11-08). A desktop that already shows the table stays put.
 */
export function showTable({ ifHidden = false } = {}) {
  const game = document.querySelector('.game');
  if (!game || (ifHidden && tableInView())) return;
  game.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

/**
 * "Collapse and play" at the end of How it works (Jason, 2026-11-08): closes the section, brings
 * the table and panel into view, and puts keyboard focus in the panel. The section remembers
 * being closed (rememberToggle), so returning players go straight to the table.
 */
export function wireCollapse() {
  for (const btn of document.querySelectorAll('[data-collapse]')) {
    btn.addEventListener('click', () => {
      const d = document.getElementById(btn.dataset.collapse);
      if (d) d.open = false;
      showTable();
      const panel = document.getElementById('panel');
      if (panel) { if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
    });
  }
}

/** A collapsible section that remembers whether this viewer left it open. */
export function rememberToggle(id, prefix) {
  const d = document.getElementById(id);
  if (!d) return;
  const k = `${prefix}.${id}`;
  try { const v = localStorage.getItem(k); if (v !== null) d.open = v === '1'; } catch { /* storage unavailable */ }
  d.addEventListener('toggle', () => { try { localStorage.setItem(k, d.open ? '1' : '0'); } catch { /* storage unavailable */ } });
}

/** "What this table showed": each moment's plain line, then the idea it shows, with its source. */
export function momentsCardHtml(moments) {
  if (!moments.length) return '';
  return `<section class="card extra showed" aria-labelledby="showed-h"><h3 id="showed-h">What this table showed</h3>
    ${moments.map((m) => {
      const idea = IDEAS[m.idea];
      const src = idea.source ? ` <a href="${esc(idea.source.url)}" target="_blank" rel="noopener">${esc(idea.source.label)}</a>` : '';
      return `<div class="moment"><p>${esc(m.line)}</p><p class="idea"><b>${esc(idea.name)}.</b> ${esc(idea.text)}${src}</p></div>`;
    }).join('')}
  </section>`;
}
