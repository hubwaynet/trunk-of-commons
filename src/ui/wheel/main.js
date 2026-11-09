// The Wheel (Game 3, working title): browser UI. One human seat plus five strategy bots, or six bots
// to watch. A play-test page (Jason, 2026-11-09: "Let's get this up for play to check feedback
// from play"). The engine settles each second; this page draws the seconds in between, so rewards
// and shares travel as streams and arrive on time.
//
// After Jason's first play (2026-11-09): You sit at the bottom; round dials with strength bars sit
// under the wheel, and your vote fades back to 0; each seat's vote is a big curved arrow; each
// player's shares run in their own lane, as bands from sender to receiver; the boost fund sits in
// the hub; the ending plays out (shares land, the fund and bonus flow to the seats); the end card
// shows each account in full.
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, step, seatAngle, quotas, whiteId, blackId, feePct, ledger, voteCostOf, UNIT } from '../../engine/wheel.js';
import { STRATEGIES, FAMILIES, botView, selectRoster } from '../../bots/wheel-bots.js';
import { mulberry32, newSeed, shuffle } from '../../engine/rng.js';
import { isUnlocked } from '../progress-store.js';
import { announce } from '../announce.js';
import { NAMES, HUES, HUMAN_HUE, reduceMotion, el, esc, h, signed, rememberToggle, wireCollapse, showTable } from '../common.js';
import { createKnob } from './knob.js';

const $ = (sel) => document.querySelector(sel);
// The picture (viewBox -16 -8 512 512). Angles are degrees clockwise from the top of the screen.
const CX = 240;
const CY = 246;
const OFFSET = 180; // seat 0 (you, or the first to join) sits at the bottom (Jason, 2026-11-09)
const WHEEL_R = 84;
const HUB_R = 27;
const LANE_OUT = 134; // each sender's shares run in their own lane: seat 0 outermost
const LANE_GAP = 8;
const SEAT_R = 168;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const tok = (u) => Math.round(u / UNIT);
const fmt = (u) => tok(u).toLocaleString('en-AU');
const rad = (deg) => (deg * Math.PI) / 180;
const polar = (deg, r) => [CX + r * Math.sin(rad(deg)), CY - r * Math.cos(rad(deg))];
const turnTo = (a, b) => { const d = (((b - a) % 360) + 360) % 360; return d > 180 ? d - 360 : d; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const f1 = (n) => n.toFixed(1);
const MINUS = '−';
const money = (u, sign = 0) => `${sign < 0 ? MINUS : sign > 0 ? '+' : ''}${fmt(Math.abs(u))}`;

let G = null;

// ---------- lock ----------
const previewMode = () => Boolean(globalThis.TRUNK_PREVIEW) || /[?&]preview\b/.test(globalThis.location?.search ?? '');

// ---------- a table ----------
function newTable({ watch = G?.watch ?? false } = {}) {
  stopClock();
  if (G) clearTimeout(G.endTimer);
  const seed = newSeed();
  const rng = mulberry32(seed);
  const botKeys = selectRoster(rng, watch ? 6 : 5);
  const keys = watch ? botKeys : ['you', ...botKeys];
  const ids = keys.map((k, i) => (k === 'you' ? 'you' : `${k}#${i}`));
  const inst = keys.map((k) => (k === 'you' ? null : STRATEGIES[k].create(rng)));
  const names = shuffle(rng, NAMES);
  const stake = Number($('#stake')?.value) || 650;
  const dials = { vote: 0, share: 5, people: 6 }; // you start passing on half, to everyone
  // The bots set their dials before the clock starts, so the table shows them from the first look.
  const blank = createGame({ players: ids.map((id) => ({ id })), seed, stake });
  const players = ids.map((id, i) => ({ id, settings: inst[i] ? inst[i].decide(botView(blank, id)) : dials }));
  const s = createGame({ players, seed, stake });
  G = {
    seed, keys, ids, inst, watch, s, prev: s, dials: { ...dials },
    name: Object.fromEntries(ids.map((id, i) => [id, id === 'you' ? 'You' : names[i]])),
    hue: Object.fromEntries(ids.map((id, i) => [id, id === 'you' ? HUMAN_HUE : HUES[i % HUES.length]])),
    paused: true, started: false, speed: Number($('#speed')?.value) || 1, lastStep: now(), timer: null,
    events: [], holder: whiteId(s), holderSince: 0, holderReward: 0, last: settingsOf(s), warned: false,
    focus: watch ? 'all' : 'you', knobs: null, endAnim: null, endTimer: null,
  };
  drawTable();
  renderFlowControl();
  renderDials();
  renderPanel();
  renderScore();
  $('#extras').replaceChildren();
  update();
  announce(watch
    ? 'New table: six bots. Press Start to set the wheel turning.'
    : `New table. You sit at the bottom, at the white arrow, with ${fmt(s.stake)} tokens. Set your dials, then press Start.`);
  if (!animating && !reduceMotion) { animating = true; requestAnimationFrame(frame); }
}
let animating = false; // one animation loop for the page, whichever table is showing

const settingsOf = (s) => Object.fromEntries(s.players.map((p) => [p.id, { ...p.settings }]));
const player = (id) => G.s.players.find((p) => p.id === id);
const disp = (pos) => seatAngle(G.s, pos) + OFFSET; // where a seat is drawn
const laneR = (pos) => LANE_OUT - pos * LANE_GAP;
/** Balances as the picture and panel show them: during the ending, the balances at the bell. */
const shownBalance = (p, i) => (G.endAnim ? G.endAnim.e.bell[i] : p.balance);

// ---------- the clock ----------
const tickMs = () => 1000 / G.speed;
function stopClock() { if (G) { clearTimeout(G.timer); G.timer = null; } }
function schedule() {
  stopClock();
  if (!G.paused && G.s.status === 'playing') G.timer = setTimeout(tick, tickMs());
}
function tick() {
  if (G.s.status !== 'playing') return;
  const d = {};
  G.ids.forEach((id, i) => { d[id] = G.inst[i] ? G.inst[i].decide(botView(G.s, id)) : { ...G.dials }; });
  G.prev = G.s;
  G.s = step(G.s, d);
  G.lastStep = now();
  // Your vote fades back to 0, one step a second (Jason, 2026-11-09: "The direction dial strength
  // should decay strength back to neutral"). Turn it again to keep pushing.
  if (!G.watch && G.dials.vote) {
    G.dials.vote -= Math.sign(G.dials.vote);
    G.knobs?.vote.set(G.dials.vote, false);
  }
  noteEvents();
  if (G.s.status !== 'playing') return endTable();
  update();
  schedule();
}
function setPaused(p) {
  G.paused = p;
  if (!p) G.started = true;
  const b = $('#pause');
  if (b) {
    b.textContent = p ? (G.started ? 'Play' : 'Start') : 'Pause';
    b.disabled = G.s.status !== 'playing';
  }
  const st = $('#step');
  if (st) st.disabled = !p || G.s.status !== 'playing';
  G.lastStep = now();
  schedule();
}

// ---------- drawing ----------
function arcPath(r, a0, a1) {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
/** An arrowhead on a circle of radius r, its tip at angle a, pointing the way of sign s. */
function arcHead(r, a, s, len, half) {
  const back = a - (s * (len / r) * 180) / Math.PI;
  const pts = [polar(a, r), polar(back, r + half), polar(back, r - half)];
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function drawTable() {
  const svg = $('#table');
  const title = svg.querySelector('title');
  svg.replaceChildren(title);
  const defs = el('defs');
  // The face fades from white at the white arrow to black at the black arrow. At rest the white
  // arrow points at seat 0, at the bottom.
  const grad = el('linearGradient', { id: 'face', x1: '0', y1: '1', x2: '0', y2: '0' });
  grad.append(el('stop', { offset: '0%', 'stop-color': '#ffffff' }), el('stop', { offset: '50%', 'stop-color': '#8d9693' }), el('stop', { offset: '100%', 'stop-color': '#151a19' }));
  defs.append(grad);
  svg.append(defs);

  // The wheel turns as one: face and arrows.
  const wheel = el('g', { id: 'wheel' });
  wheel.append(el('circle', { cx: CX, cy: CY, r: WHEEL_R, fill: 'url(#face)', class: 'wheel-face' }));
  const arrow = (deg, cls, len) => {
    const [tx, ty] = polar(deg, len);
    const [lx, ly] = polar(deg - 90, 9);
    const [rx, ry] = polar(deg + 90, 9);
    return el('polygon', { points: `${tx},${ty} ${lx},${ly} ${rx},${ry}`, class: cls });
  };
  wheel.append(
    arrow(OFFSET + 90, 'arrow-grey', WHEEL_R - 26), arrow(OFFSET + 270, 'arrow-grey', WHEEL_R - 26),
    arrow(OFFSET + 180, 'arrow-black', WHEEL_R - 3), arrow(OFFSET, 'arrow-white', WHEEL_R - 3),
  );
  svg.append(wheel);
  svg.append(el('g', { id: 'rewards', 'aria-hidden': 'true' }));
  // The hub shows the boost fund (Jason, 2026-11-09: "bonus boost is not seen").
  const hub = el('g', { id: 'hub' });
  hub.append(el('circle', { cx: CX, cy: CY, r: HUB_R, class: 'hub' }));
  hub.append(el('text', { x: CX, y: CY + 2, class: 'hub-fund', id: 'hub-fund' }, '0'));
  hub.append(el('text', { x: CX, y: CY + 14, class: 'hub-label' }, 'fund'));
  svg.append(hub);
  svg.append(el('g', { id: 'flows', 'aria-hidden': 'true' }));
  svg.append(el('g', { id: 'votes', 'aria-hidden': 'true' }));

  const seats = el('g', { id: 'seats' });
  for (const p of G.s.players) {
    const a = disp(p.pos);
    const [x, y] = polar(a, SEAT_R);
    const g = el('g', { class: 'seat', 'data-id': p.id });
    g.append(el('circle', { cx: x, cy: y, r: 26, class: 'seat-ring' }));
    g.append(el('circle', { cx: x, cy: y, r: 19, fill: G.hue[p.id], class: 'seat-disc' }));
    g.append(el('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'seat-initial' }, p.id === 'you' ? 'YOU' : G.name[p.id][0]));
    // labels sit outside the seat: to the right, to the left, or above/below at the top and bottom
    const sx = Math.sin(rad(a));
    const side = sx > 0.3 ? 'start' : sx < -0.3 ? 'end' : 'middle';
    const lx = side === 'start' ? x + 30 : side === 'end' ? x - 30 : x;
    const top = Math.cos(rad(a)) > 0.5;
    const ly = side !== 'middle' ? y - 20 : top ? y - 70 : y + 42;
    const t = el('text', { x: lx, y: ly, 'text-anchor': side, class: 'seat-label' });
    const line = (cls, dy) => el('tspan', { x: lx, dy, class: cls });
    t.append(line('seat-name', 0), line('seat-tokens', 14), line('seat-dials', 13), line('seat-state', 13));
    t.childNodes[0].textContent = G.name[p.id];
    g.append(t);
    // Tap a seat to follow its shares (the picker under the picture does the same from the keyboard).
    g.addEventListener('click', () => setFocus(G.focus === p.id ? 'all' : p.id));
    seats.append(g);
  }
  svg.append(seats);
  svg.append(el('g', { id: 'endfx', 'aria-hidden': 'true' }));
  drawMoving(1);
}

/** Per second: balances, dials, who pays or receives, the votes and the fund. */
function drawSeats() {
  const q = quotas(G.s);
  const w = G.s.status === 'playing' ? whiteId(G.s) : null;
  G.s.players.forEach((p, i) => {
    const g = $(`#seats .seat[data-id="${CSS.escape(p.id)}"]`);
    if (!g) return;
    const [, tokens, dials, state] = g.querySelectorAll('tspan');
    tokens.textContent = fmt(shownBalance(p, i));
    const st = p.settings;
    const others = Math.min(st.people, G.s.n) - 1;
    dials.textContent = st.share === 0 || others === 0 ? 'keeps all' : `${st.share}/10 → ${others}`;
    const paying = G.s.status === 'playing' ? q[i] : 0;
    state.textContent = w === p.id ? 'receives' : paying ? `pays ${paying / UNIT}` : '';
    const ring = g.querySelector('.seat-ring');
    ring.setAttribute('class', `seat-ring${w === p.id ? ' receiving' : paying >= 9 * UNIT ? ' paying' : paying ? ' paying-light' : ''}`);
    g.classList.toggle('bust', G.s.bust.includes(p.id));
    g.classList.toggle('focused', G.focus === p.id);
  });
  drawVotes();
  const fund = $('#hub-fund');
  if (fund && !G.endAnim) {
    fund.textContent = fmt(G.s.fund.balance);
    // after a table that didn't earn the refund, the fund is lost
    $('#hub .hub-label').textContent = G.s.status === 'ended' && !G.s.bonus ? 'lost' : 'fund';
  }
}

/**
 * Each seat's vote as a curved arrow beside it, along the circle of seats (Jason, 2026-11-09:
 * "Increase size of the directional vote indicators for players in order for them to cooperate or
 * go against"). Longer and thicker for a stronger vote, with the number on it; solid when it goes
 * with the wheel's turn, dashed when against it.
 */
function drawVotes() {
  const out = [];
  if (G.s.status === 'playing') {
    for (const p of G.s.players) {
      const v = p.settings.vote;
      if (!v) continue;
      const m = Math.abs(v);
      const s = Math.sign(v);
      const a0 = disp(p.pos) + s * 11;
      const a1 = a0 + s * (4 + 3.3 * m);
      const w = 2.4 + 0.62 * m;
      const len = w + 6;
      const against = s !== G.s.dir;
      const back = a1 - (s * (len / SEAT_R) * 180) / Math.PI;
      out.push(`<path d="${arcPath(SEAT_R, Math.min(a0, back), Math.max(a0, back))}" class="vote-arc${against ? ' against' : ''}" stroke-width="${w.toFixed(1)}"/>`);
      out.push(`<polygon points="${arcHead(SEAT_R, a1, s, len, w / 2 + 3.5)}" class="vote-head"/>`);
      const [nx, ny] = polar(a0 + s * (2 + 1.6 * m), SEAT_R + 13 + w / 2);
      out.push(`<text x="${nx.toFixed(1)}" y="${(ny + 4.5).toFixed(1)}" class="vote-num">${m}</text>`);
    }
  }
  const layer = $('#votes');
  if (layer) layer.innerHTML = out.join('');
}

/** The reward crossing the middle: from the black arrow to the hub, then out to the white arrow. */
function rewardPoint(theta, q) {
  const [bx, by] = polar(theta + OFFSET + 180, WHEEL_R - 8);
  const [wx, wy] = polar(theta + OFFSET, WHEEL_R - 8);
  return q < 0.5 ? [bx + (CX - bx) * q * 2, by + (CY - by) * q * 2] : [CX + (wx - CX) * (q - 0.5) * 2, CY + (wy - CY) * (q - 0.5) * 2];
}
function rewardDots(theta, T, parcels, stopAtHub = false) {
  const out = [];
  for (const x of parcels) {
    const span = Math.max(1, x.arrive - x.depart);
    let p = clamp((T - x.depart) / span, 0, 1);
    if (stopAtHub) p = Math.min(p, 0.5);
    const size = Math.min(5.5, 1.8 + Math.sqrt(x.amount / UNIT) * 0.9);
    for (let k = 0; k < 4; k++) {
      const q = p - k * 0.045;
      if (q < 0) break;
      const [px, py] = rewardPoint(theta, q);
      out.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(size * (1 - k * 0.18)).toFixed(1)}" class="dot-reward" opacity="${(1 - k * 0.22).toFixed(2)}"/>`);
    }
  }
  return out.join('');
}

/**
 * Shares, separated by sender (Jason, 2026-11-09: "Separate the player share flows so we can see
 * where they flow, how much, how far"). Each sender has a lane; each flow is a band along it from
 * the sender to the receiver, thicker for more in flight, with an arrowhead at the receiver and the
 * parcels moving along it. Following one player writes the amount on its way on each of their bands.
 */
function flowMarkup(T, parcels) {
  const focus = G.focus;
  const pairs = new Map();
  for (const x of parcels) {
    if (x.kind !== 'share') continue;
    const key = `${x.from}>${x.to}`;
    let pr = pairs.get(key);
    if (!pr) { pr = { from: player(x.from), to: player(x.to), total: 0, parcels: [] }; pairs.set(key, pr); }
    pr.total += x.amount;
        pr.parcels.push(x);
  }
  const list = [...pairs.values()].sort((a, b) => (a.from.id === focus) - (b.from.id === focus));
  const bands = [];
  const dots = [];
  const labels = [];
  for (const pr of list) {
    const state = focus === 'all' ? '' : pr.from.id === focus ? ' focus' : ' dim';
    const r = laneR(pr.from.pos);
    const a0 = disp(pr.from.pos);
    const a1 = a0 + turnTo(a0, disp(pr.to.pos));
    const s = Math.sign(a1 - a0) || 1;
    const w = clamp(1.3 + 1.5 * Math.sqrt(pr.total / UNIT), 1.3, 6);
    const len = w + 4.5;
    const back = a1 - (s * (len / r) * 180) / Math.PI;
    const hue = G.hue[pr.from.id];
    bands.push(`<path d="${arcPath(r, Math.min(a0, back), Math.max(a0, back))}" class="flow-band${state}" stroke="${hue}" stroke-width="${w.toFixed(1)}"/>`);
    bands.push(`<polygon points="${arcHead(r, a1, s, len, w / 2 + 2.5)}" class="flow-head${state}" fill="${hue}"/>`);
    for (const x of pr.parcels) {
      const span = Math.max(1, x.arrive - x.depart);
      const p = clamp((T - x.depart) / span, 0, 1);
      if (p >= 1) continue;
      const [px, py] = polar(a0 + (a1 - a0) * p, r);
      const size = clamp(1.5 + Math.sqrt(x.amount / UNIT), 1.5, 4.6);
      dots.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${size.toFixed(1)}" class="dot-share${state}" fill="${hue}"/>`);
    }
    if (state === ' focus' && pr.total >= 0.1 * UNIT) {
      const [lx, ly] = polar((a0 + back) / 2, r);
      labels.push(`<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" class="flow-label">${f1(pr.total / UNIT)}</text>`);
    }
  }
  return bands.join('') + dots.join('') + labels.join('');
}

/** Every frame: the wheel's turn through the second, and the parcels on their way. */
function drawMoving(frac) {
  if (!G) return;
  const s = G.s;
  const delta = G.prev === s ? 0 : turnTo(G.prev.theta, s.theta);
  const theta = G.prev.theta + delta * frac;
  $('#wheel')?.setAttribute('transform', `rotate(${theta.toFixed(2)} ${CX} ${CY})`);
  const T = s.t - 1 + frac; // the second being shown
  const rw = $('#rewards');
  if (rw) rw.innerHTML = rewardDots(theta, T, s.transit.filter((x) => x.kind === 'reward'));
  const fl = $('#flows');
  if (fl) fl.innerHTML = flowMarkup(T, s.transit);
}

function frame() {
  if (G?.endAnim) drawEnding();
  else if (G) {
    const running = !G.paused && G.s.status === 'playing';
    drawMoving(running ? Math.min(1, (now() - G.lastStep) / tickMs()) : 1);
  }
  requestAnimationFrame(frame);
}
function redrawNow() {
  if (!G || G.endAnim) return;
  const running = !G.paused && G.s.status === 'playing' && !reduceMotion;
  drawMoving(running ? Math.min(1, (now() - G.lastStep) / tickMs()) : 1);
}

// ---------- following one player's shares ----------
function renderFlowControl() {
  const box = $('#flow-ctl');
  if (!box) return;
  const opts = [['all', "Everyone's"], ...G.s.players.map((p) => [p.id, p.id === 'you' ? 'Yours' : `${G.name[p.id]}'s`])];
  box.innerHTML = `<label class="small"><b>Shares shown:</b> <select id="flow-focus">${opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>
    <details class="flow-legend small" id="picture-key"><summary>What the picture shows</summary>
      <p class="muted">Gold dots: the reward, crossing from the black arrow to the white. Each player's shares run in their own lane, in their colour, from them to each person they share with: thicker for more on the way, with the amount on its way written on the band for the player you follow. Tap a seat to follow it, or pick above. Curved arrows beside the seats are votes: longer and thicker for stronger, dashed when against the wheel's turn. The hub shows the boost fund. Rings: solid for the seat receiving, dashed for the seats paying.</p></details>`;
  const sel = $('#flow-focus');
  sel.value = G.focus;
  sel.addEventListener('change', (e) => setFocus(e.target.value));
}
function setFocus(id) {
  G.focus = id;
  const sel = $('#flow-focus');
  if (sel && sel.value !== id) sel.value = id;
  for (const g of document.querySelectorAll('#seats .seat')) g.classList.toggle('focused', g.dataset.id === id);
  redrawNow();
}

// ---------- your dials ----------
function renderDials() {
  const box = $('#dials-box');
  box.replaceChildren();
  G.knobs = null;
  if (G.watch) return;
  const n = G.s.n;
  const card = h(`<div class="card dials" aria-labelledby="dials-h">
    <h2 id="dials-h">Your dials</h2>
    <div class="knobs" id="knobs"></div>
    <p class="small dial-line"><b>Pass on</b> <output id="o-share" for="d-share"></output>, <b>to</b> <output id="o-people" for="d-people"></output>.</p>
    <p class="small muted" id="fee-note"></p>
    <p class="small dial-line"><b>Turn the wheel:</b> <output id="o-vote" for="d-vote"></output></p>
    <p class="small muted" id="vote-note"></p>
  </div>`);
  box.append(card);
  const knobs = card.querySelector('#knobs');
  const share = createKnob({
    id: 'd-share', label: 'Pass on', min: 0, max: 10, value: G.dials.share, describedBy: 'o-share fee-note',
    angleOf: (v) => -135 + 27 * v, strengthOf: (v) => v / 10, lit: (v, cur) => v >= 1 && v <= cur,
    centre: (v) => (v === 0 ? { main: '0', sub: 'keep all' } : { main: `${v}/10`, sub: 'pass on' }),
    valueText: (v) => (v === 0 ? 'nothing: keep it all' : `${v} tenths of what you receive`),
    onChange: (v) => { G.dials.share = v; updateDials(); },
  });
  const people = createKnob({
    id: 'd-people', label: 'Share with', min: 1, max: n, value: G.dials.people, describedBy: 'o-people',
    angleOf: (v) => -135 + (270 * (v - 1)) / (n - 1), strengthOf: (v) => v / n, lit: (v, cur) => v <= cur,
    centre: (v) => (v === 1 ? { main: 'you', sub: 'only' } : { main: `${v - 1}`, sub: v === 2 ? 'other' : 'others' }),
    valueText: (v) => peopleText(v),
    onChange: (v) => { G.dials.people = v; updateDials(); },
  });
  const vote = createKnob({
    id: 'd-vote', label: 'Turn the wheel', min: -G.s.maxVote, max: G.s.maxVote, value: G.dials.vote, describedBy: 'o-vote vote-note', centreTap: 0,
    angleOf: (v) => (135 * v) / G.s.maxVote, strengthOf: (v) => Math.abs(v) / G.s.maxVote,
    lit: (v, cur) => v !== 0 && Math.sign(v) === Math.sign(cur) && Math.abs(v) <= Math.abs(cur),
    centre: (v) => (v === 0 ? { main: '0', sub: 'no vote' } : { main: `${v > 0 ? '↻' : '↺'}${Math.abs(v)}`, sub: Math.sign(v) === G.s.dir ? 'with' : 'against' }),
    valueText: (v) => (v === 0 ? 'no vote' : `${v > 0 ? 'clockwise' : 'anticlockwise'} ${Math.abs(v)}`),
    onChange: (v) => { G.dials.vote = v; updateDials(); },
  });
  knobs.append(share.wrap, people.wrap, vote.wrap);
  G.knobs = { share, people, vote };
}
const peopleText = (v) => {
  const others = Math.min(v, G.s.n) - 1;
  return v === 1 ? 'just you' : v >= G.s.n ? `everyone: you and ${others} others` : `you and the ${others} nearest`;
};

/** The words beside your dials: what you pass on, what you keep after the fee, what a vote does. */
function updateDials() {
  if (G.watch || !$('#o-share')) return;
  const { share, people, vote } = G.dials;
  const s = G.s;
  const others = Math.min(people, s.n) - 1;
  const f = others ? (share * others) / (10 * (others + 1)) : 0;
  const fee = feePct(f);
  const net = Math.round((1 - f) * (1 - fee / 100) * 100);
  $('#o-share').textContent = share === 0 ? 'nothing: keep it all' : `${share}/10 of what you receive`;
  $('#o-people').textContent = peopleText(people);
  $('#fee-note').textContent = f === 0
    ? `You keep everything, and the fee takes 95% of it: you end up with 5% of what you receive.${share && people === 1 ? ' Sharing only with yourself counts as keeping.' : ''}`
    : `${Math.round(f * 100)}% goes to the others. On the ${Math.round((1 - f) * 100)}% you keep, the fee takes ${fee}%: you end up with ${net}% of what you receive, plus whatever comes back.`;
  const cost = (Math.abs(vote) * voteCostOf(s, vote)).toFixed(2).replace(/\.?0+$/, '');
  const withWheel = Math.sign(vote) === s.dir;
  $('#o-vote').textContent = vote === 0 ? 'no vote'
    : `${vote > 0 ? '↻ clockwise' : '↺ anticlockwise'} ${Math.abs(vote)}, ${withWheel ? 'with the wheel\'s turn: faster' : 'against the wheel\'s turn: slower'}, costing ${cost} a second`;
  $('#vote-note').textContent = `${voteEffect()} Your vote fades back to 0, one step a second: turn it again to keep pushing.`;
  G.knobs?.vote.set(vote, false); // refreshes "with" or "against" when the wheel turns round
}

/** What everyone's votes did last second, in words. Votes with the wheel's turn add to its speed; votes
 * against it slow it, never below the slowest; more than reverseAbove against turns it round. */
function voteEffect() {
  const s = G.s;
  const last = s.ticks.at(-1);
  const price = (u) => String(u).replace(/^0\./, '.').replace(/^\.25$/, '¼').replace(/^1$/, '1');
  if (!last) {
    return `Votes with the wheel's turn speed it up, at ${price(s.voteCost)} token a degree. Votes against slow it, at ${price(s.voteCostAgainst)} token a degree, never below ${s.slowest}° a second. Turning it round takes more than ${s.reverseAbove} against, so nobody can do it alone.`;
  }
  const net = last.net;
  const sum = `${net > 0 ? '↻' : '↺'}${Math.abs(net)}`;
  if (net === 0) return `Last second nobody voted, so the wheel turned at its usual ${s.minSpeed}° a second.`;
  if (G.prev.dir !== s.dir) return `Last second the votes added up to ${sum}: more than ${s.reverseAbove} against the wheel, so together they turned it round.`;
  if (Math.sign(net) === s.dir) return `Last second the votes added up to ${sum}, with the wheel's turn: it sped up to ${last.speed}° a second.`;
  return `Last second the votes added up to ${sum}, against the wheel's turn: it slowed to ${last.speed}° a second${last.speed === s.slowest && s.voteSpeed === 'addsSlows' ? ', its slowest' : ''}.`;
}

// ---------- the panel ----------
function renderPanel() {
  const watch = G.watch;
  // The clock and its controls sit under the picture, so the wheel, Start and your dials share a
  // phone screen (Jason plays on his phone).
  $('#transport').innerHTML = `<button class="btn" id="pause" type="button">Start</button>
    <button class="btn ghost" id="step" type="button">Step 1 second</button>
    <label class="small">Speed <select id="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
    <div class="clock-wrap"><span class="eyebrow">Time left</span> <span class="clock" id="clock">6:00</span></div>`;
  const panel = $('#panel');
  panel.replaceChildren(h(`<div class="card status-card" aria-labelledby="status-h">
    <h2 id="status-h" class="sr-only">Table status</h2>
    <div class="status-row">
      ${watch ? '<div><div class="eyebrow">Boost fund</div><div class="big" id="fund-big">0</div></div>'
        : '<div><div class="eyebrow">Your tokens</div><div class="big" id="mine">0</div><div class="small muted" id="mine-net"></div></div>'}
    </div>
    <p class="small arrows-now" id="arrows-now"></p>
    <p class="small" id="poorest"></p>
    ${watch ? '' : '<p class="small muted" id="fund-line"></p>'}
  </div>`));
  panel.append(h(`<div class="card events-card" aria-labelledby="events-h"><h2 id="events-h">What's happening</h2><ul class="events" id="events"></ul></div>`));
  $('#speed').value = String(G.speed);
  $('#speed').addEventListener('change', (e) => { G.speed = Number(e.target.value); G.lastStep = now(); schedule(); });
  $('#pause').addEventListener('click', () => {
    setPaused(!G.paused);
    announce(G.paused ? 'Paused.' : 'Playing.');
  });
  $('#step').addEventListener('click', () => { if (G.paused) tick(); });
  setPaused(true);
  updateDials();
}

function update() {
  const s = G.s;
  const left = Math.max(0, s.maxTicks - s.t);
  $('#clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const mi = s.players.findIndex((p) => p.id === 'you');
  if (mi >= 0) {
    const me = s.players[mi];
    const b = shownBalance(me, mi);
    $('#mine').textContent = fmt(b);
    const net = tok(b - me.start);
    $('#mine-net').textContent = `${net === 0 ? '±0' : signed(net)} on your stake`;
    $('#fund-line').textContent = `Boost fund (in the hub): ${fmt(G.endAnim ? G.endAnim.e.fundAtBell : s.fund.balance)} tokens, shared out equally if the table lasts with the poorest above a tenth of the stake.`;
  } else $('#fund-big').textContent = fmt(G.endAnim ? G.endAnim.e.fundAtBell : s.fund.balance);
  if (s.status === 'playing') {
    const q = quotas(s);
    const b = blackId(s);
    const net = s.ticks.at(-1)?.net ?? 0;
    $('#arrows-now').innerHTML = `White arrow: <b>${esc(G.name[whiteId(s)])}</b> · Black arrow: <b>${esc(G.name[b])}</b> pays ${q[s.players.findIndex((p) => p.id === b)] / UNIT} a second · Wheel turning ${s.dir > 0 ? 'clockwise' : 'anticlockwise'} at ${s.speed}° a second${net ? ` (votes ${net > 0 ? '↻' : '↺'}${Math.abs(net)})` : ''}`;
  } else $('#arrows-now').textContent = '';
  const bals = s.players.map((p, i) => shownBalance(p, i));
  const pi = bals.indexOf(Math.min(...bals));
  const floor = s.stake / 10;
  $('#poorest').innerHTML = `Poorest: <b>${esc(G.name[s.players[pi].id])}</b> with ${fmt(bals[pi])}. ${bals[pi] >= floor
    ? `<span class="ok">Above a tenth of the stake (${fmt(floor)}): the bonus is still on.</span>`
    : `<span class="miss">Below a tenth of the stake (${fmt(floor)}): no bonus unless they recover.</span>`}`;
  updateDials();
  drawSeats();
  if (reduceMotion || G.paused) redrawNow();
  renderEvents();
  updateScore();
  const st = $('#step');
  if (st) st.disabled = !G.paused || s.status !== 'playing';
}

// ---------- what's happening ----------
function pushEvent(text, speak = false) {
  G.events.unshift({ t: G.s.t, text });
  G.events.length = Math.min(G.events.length, 30);
  if (speak) announce(text);
}
function noteEvents() {
  const s = G.s;
  const t = s.t;
  // the white arrow moved on: how long the last holder had it and what reached them
  const w = s.status === 'playing' ? whiteId(s) : null;
  if (w !== G.holder) {
    const prev = s.players.find((p) => p.id === G.holder);
    const got = tok(prev.stats.reward - G.holderReward);
    if (t - G.holderSince >= 3) pushEvent(`${G.name[prev.id]} had the white arrow for ${t - G.holderSince} s; ${got} tokens reached ${prev.id === 'you' ? 'you' : 'them'}.`);
    if (w) {
      G.holder = w; G.holderSince = t; G.holderReward = s.players.find((p) => p.id === w).stats.reward;
      if (w === 'you') announce('The white arrow reaches you.');
    }
  }
  if (!G.watch && s.status === 'playing' && blackId(s) === 'you' && blackId(G.prev) !== 'you') announce('The black arrow reaches you: you pay 9 a second.');
  // dial changes by the bots (their tells)
  for (const p of s.players) {
    if (p.id === 'you') continue;
    const was = G.last[p.id];
    const st = p.settings;
    if (was.share !== st.share || was.people !== st.people) pushEvent(`${G.name[p.id]} now passes on ${st.share}/10 to ${Math.min(st.people, s.n) - 1} others.`);
    if (!was.vote && st.vote) pushEvent(`${G.name[p.id]} votes ${st.vote > 0 ? 'clockwise' : 'anticlockwise'} ${Math.abs(st.vote)} (${Math.sign(st.vote) === G.prev.dir ? 'with the wheel' : 'against it'}).`);
  }
  if (G.prev.dir !== s.dir) pushEvent(`Together the votes turned the wheel round: now ${s.dir > 0 ? 'clockwise' : 'anticlockwise'}.`, true);
  G.last = settingsOf(s);
  const poor = s.players.reduce((a, p) => (p.balance < a.balance ? p : a));
  if (!G.warned && s.status === 'playing' && poor.balance < s.stake / 10) {
    G.warned = true;
    pushEvent(`${G.name[poor.id]} has fallen below a tenth of the stake: the bonus is at risk.`, true);
  }
  if (s.status === 'playing' && t % 60 === 0 && t > 0) announce(`${(s.maxTicks - t) / 60} minute${s.maxTicks - t === 60 ? '' : 's'} left.`);
}
function renderEvents() {
  const ul = $('#events');
  if (!ul) return;
  const shown = G.events.slice(0, 7);
  ul.innerHTML = shown.length
    ? shown.map((e) => { const left = Math.max(0, G.s.maxTicks - e.t); return `<li><span class="ev-time" title="time left">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span> ${esc(e.text)}</li>`; }).join('')
    : `<li class="muted">${G.started ? 'Nothing yet.' : 'Press Start when you are ready. The first reward reaches the white arrow 2 seconds after the clock starts.'}</li>`;
}

// ---------- the scoreboard ----------
function renderScore() {
  $('#scoreboard').innerHTML = `<h2 id="score-h">The table</h2>
    <div class="log-wrap" tabindex="0" role="region" aria-label="The table, scrollable"><table class="score">
      <thead><tr><th scope="col">Seat</th><th scope="col">Tokens</th><th scope="col">Passes on</th><th scope="col">Vote</th><th scope="col">Rewards in</th><th scope="col">Shared out</th><th scope="col">Paid in</th></tr></thead>
      <tbody>${G.s.players.map((p) => `<tr data-id="${esc(p.id)}"><th scope="row"><span class="who"><span class="dot" style="background:${G.hue[p.id]}"></span>${esc(G.name[p.id])}</span></th><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">Rewards in: what reached them at the white arrow. Shared out: what they passed to others. Paid in: what the black side took from them.</p>`;
}
function updateScore() {
  G.s.players.forEach((p, i) => {
    const row = $(`#scoreboard tr[data-id="${CSS.escape(p.id)}"]`);
    if (!row) return;
    const c = row.querySelectorAll('td');
    const st = p.settings;
    const others = Math.min(st.people, G.s.n) - 1;
    c[0].textContent = fmt(shownBalance(p, i));
    c[1].textContent = st.share === 0 || others === 0 ? 'keeps all' : `${st.share}/10 to ${others}`;
    c[2].textContent = st.vote && G.s.status === 'playing' ? `${st.vote > 0 ? '↻ clockwise' : '↺ anticlockwise'} ${Math.abs(st.vote)}` : '–';
    c[3].textContent = fmt(p.stats.reward);
    c[4].textContent = fmt(p.stats.sharesOut);
    c[5].textContent = fmt(p.stats.paid);
  });
}

// ---------- the end ----------
/**
 * The bell. The ending plays out in the picture before the end card (Jason, 2026-11-09: "The end
 * game flows shut off immediately, and bonus boost is not seen"): shares still on their way finish
 * their trips, rewards still crossing drop into the boost fund in the hub, and then, if the table
 * earned it, the fund flows out to every seat and the common fund's bonus comes in from outside.
 */
function endTable() {
  stopClock();
  const s = G.s;
  const e = s.ending;
  const lasted = s.endReason === 'time';
  pushEvent(lasted
    ? 'Six minutes: the bell. Shares still on their way land; rewards still crossing go to the boost fund.'
    : `${s.bust.map((id) => G.name[id]).join(' and ')} couldn't pay: the table ends. Shares still on their way land; rewards still crossing go to the boost fund.`);
  if (reduceMotion || !e) { update(); return showEnd(); }
  const msPerSec = clamp(tickMs(), 250, 1000);
  const lastArrive = Math.max(s.t, ...e.shares.map((x) => x.arrive));
  const aMs = (lastArrive - (s.t - 1)) * msPerSec;
  const bMs = e.refundEach || e.topUp ? 2200 : 0;
  G.endAnim = { t0: now(), msPerSec, aMs, bMs, e, bellT: s.t };
  setPaused(true);
  update();
  G.endTimer = setTimeout(() => { G.endAnim = null; showEnd(); }, aMs + bMs + 500);
}

function drawEnding() {
  const A = G.endAnim;
  const s = G.s;
  const e = A.e;
  const el2 = now() - A.t0;
  const frac = Math.min(1, el2 / A.msPerSec);
  const T = A.bellT - 1 + el2 / A.msPerSec;
  const delta = G.prev === s ? 0 : turnTo(G.prev.theta, s.theta);
  const theta = G.prev.theta + delta * frac;
  $('#wheel')?.setAttribute('transform', `rotate(${theta.toFixed(2)} ${CX} ${CY})`);
  // rewards still crossing stop at the hub (the boost fund) and fade there
  const fade = clamp(1 - (el2 - A.msPerSec) / 500, 0, 1);
  const rw = $('#rewards');
  if (rw) { rw.innerHTML = rewardDots(theta, T, e.rewards, true); rw.setAttribute('opacity', fade.toFixed(2)); }
  const fl = $('#flows');
  if (fl) fl.innerHTML = flowMarkup(T, e.shares.filter((x) => x.arrive > T));
  const pa = A.aMs ? clamp(el2 / A.aMs, 0, 1) : 1;
  const pb = A.bMs ? clamp((el2 - A.aMs) / A.bMs, 0, 1) : 0;
  const each = e.refundEach + e.topUp;
  // balances count up: first the shares landing, then the fund and bonus
  s.players.forEach((p, i) => {
    const g = $(`#seats .seat[data-id="${CSS.escape(p.id)}"]`);
    const v = pb > 0 ? e.beforeSplit[i] + each * pb : e.bell[i] + (e.beforeSplit[i] - e.bell[i]) * pa;
    if (g) g.querySelectorAll('tspan')[1].textContent = fmt(v);
  });
  const hub = $('#hub-fund');
  if (hub) hub.textContent = fmt(pb > 0 ? e.fundBeforeSplit - e.refundEach * s.n * pb : e.fundAtBell + (e.fundBeforeSplit - e.fundAtBell) * pa);
  const hubLabel = $('#hub .hub-label');
  if (hubLabel) hubLabel.textContent = pa >= 1 && !A.bMs ? 'lost' : 'fund';
  // the fund flows out of the hub to every seat; the bonus comes in from outside the wheel
  const fx = [];
  if (pb > 0 && pb < 1) {
    for (const p of s.players) {
      const a = disp(p.pos);
      for (let k = 0; k < 5; k++) {
        const q = clamp(pb * 1.35 - k * 0.07, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const [x1, y1] = polar(a, HUB_R + (SEAT_R - 26 - HUB_R) * q);
        fx.push(`<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="${(4 - k * 0.5).toFixed(1)}" class="dot-refund"/>`);
        if (e.topUp) {
          const [x2, y2] = polar(a, 252 - (252 - SEAT_R) * q);
          fx.push(`<rect x="${(x2 - 3).toFixed(1)}" y="${(y2 - 3).toFixed(1)}" width="6" height="6" class="dot-bonus" transform="rotate(45 ${x2.toFixed(1)} ${y2.toFixed(1)})"/>`);
        }
      }
    }
  }
  if (pb > 0) {
    for (const p of s.players) {
      const [x, y] = polar(disp(p.pos), SEAT_R - 44);
      fx.push(`<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" class="end-gain" opacity="${Math.min(1, pb * 2).toFixed(2)}">+${fmt(each)}</text>`);
    }
  }
  const layer = $('#endfx');
  if (layer) layer.innerHTML = fx.join('');
}

function showEnd() {
  setPaused(true);
  const s = G.s;
  $('#rewards')?.removeAttribute('opacity');
  if ($('#endfx')) $('#endfx').innerHTML = '';
  const lasted = s.endReason === 'time';
  const at = `${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')}`;
  const bust = s.bust.map((id) => G.name[id]);
  const L = Object.fromEntries(s.players.map((p) => [p.id, ledger(s, p.id)]));
  const fundLost = s.ending ? s.ending.fundBeforeSplit : s.fund.balance;
  const atBell = s.ending?.bell ?? s.players.map((p) => p.balance); // the bonus is judged at the bell
  const poor = s.players[atBell.indexOf(Math.min(...atBell))];
  const rows = s.players.map((p, i) => ({ p, key: G.keys[i], net: p.balance - p.start })).sort((a, b) => b.net - a.net);
  const richest = rows[0];
  const giver = [...rows].sort((a, b) => b.p.stats.sharesOut - a.p.stats.sharesOut)[0];
  const me = s.players.find((p) => p.id === 'you');
  const any = L[s.players[0].id];
  let fundLine;
  if (s.bonus) fundLine = `The poorest player still had more than a tenth of the stake, so the boost fund was shared out: ${fmt(any.refund)} each, plus a ${s.bonus.pct}% bonus of ${fmt(any.bonus)} each from the common fund.`;
  else if (lasted) fundLine = `The poorest player, ${G.name[poor.id]}, had less than a tenth of the stake, so the boost fund (${fmt(fundLost)} tokens) was lost.`;
  else fundLine = `The table ended early, so the boost fund (${fmt(fundLost)} tokens) was lost.`;
  const cls = (u) => (u > 0 ? 'pos' : u < 0 ? 'neg' : '');
  // Your account in full (Jason, 2026-11-09: "The end point tally ignores pre-split and boost numbers")
  const myAccount = me ? (() => {
    const m = L.you;
    // Each line is the change in the rounded running total, so the whole tokens shown add up exactly.
    let cum = 0;
    let shown = 0;
    const part = (u, sign) => { cum += sign * u; const r = tok(cum); const d = r - shown; shown = r; return Math.abs(d) * UNIT; };
    const line = (label, u, sign, note = '', plain = false) => {
      const v = part(u, sign);
      const look = plain || v === 0 ? 0 : sign;
      return `<tr><th scope="row">${label}${note ? ` <span class="muted note">${note}</span>` : ''}</th><td class="${look < 0 ? 'neg' : look > 0 ? 'pos' : ''}">${v === 0 ? '0' : money(v, look)}</td></tr>`;
    };
    return `<div class="account"><h4>Your account</h4><table class="ledger">
      <tbody>
        ${line('Your stake', m.start, 1, '', true)}
        ${line('Paid in on the black side', m.paid, -1)}
        ${line('Votes', m.voted, -1)}
        ${line('Received, before sharing', m.received, 1, `rewards ${fmt(m.reward)}, shares in ${fmt(m.sharesIn)}`)}
        ${line('Shared out to others, boost included', m.sharesOut, -1)}
        ${line('Boost the fund added to your shares', m.boost, 1)}
        ${line('Fees on what you kept', m.fees, -1)}
        <tr class="subtotal"><th scope="row">Before the boost fund was shared out</th><td>${money(m.beforeSplit)}</td></tr>
        ${s.bonus ? `${line('Your share of the boost fund', m.refund, 1)}${line(`Bonus from the common fund (${s.bonus.pct}%)`, m.bonus, 1)}` : `<tr><th scope="row">Boost fund and bonus <span class="muted note">${lasted ? 'not earned: the poorest fell below a tenth of the stake' : 'lost when the table ended early'}</span></th><td>0</td></tr>`}
        <tr class="total"><th scope="row">You end with</th><td>${money(m.balance)} <span class="${cls(m.balance - m.start)}">(${signed(tok(m.balance - m.start))})</span></td></tr>
      </tbody></table></div>`;
  })() : '';
  const card = h(`<section class="card extra end-card" aria-labelledby="end-h">
    <div class="eyebrow">${lasted ? 'Six minutes' : `Ended at ${at}`}</div>
    <h3 id="end-h">${lasted ? 'The table lasted the six minutes' : `${esc(bust.join(' and '))} couldn't pay`}</h3>
    <p>${esc(fundLine)}</p>
    ${me ? `<p class="you-result">You end with <b>${fmt(me.balance)}</b>: <b class="${me.balance >= me.start ? 'pos' : 'neg'}">${signed(tok(me.balance - me.start))}</b> on your stake of ${fmt(me.start)}.</p>` : ''}
    ${myAccount}
    <div class="log-wrap" tabindex="0" role="region" aria-label="Results, scrollable"><table class="score">
      <thead><tr><th scope="col">Seat</th><th scope="col">Strategy</th><th scope="col">Received</th><th scope="col">Shared out</th><th scope="col">Fees</th><th scope="col">Before the split</th><th scope="col">Fund + bonus</th><th scope="col">Ends with</th><th scope="col">Net</th></tr></thead>
      <tbody>${rows.map(({ p, key, net }) => { const m = L[p.id]; return `<tr><th scope="row"><span class="who"><span class="dot" style="background:${G.hue[p.id]}"></span>${esc(G.name[p.id])}</span></th><td>${key === 'you' ? 'You' : esc(STRATEGIES[key].label)}</td><td>${fmt(m.received)}</td><td>${fmt(m.sharesOut)}</td><td>${fmt(m.fees)}</td><td>${fmt(m.beforeSplit)}</td><td>${s.bonus ? `+${fmt(m.refund + m.bonus)}` : '0'}</td><td>${fmt(p.balance)}</td><td class="${net >= 0 ? 'pos' : 'neg'}">${signed(tok(net))}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="small muted">Received: rewards and shares that reached them, before they passed anything on. Before the split: what they held once the last shares had landed, before the boost fund was shared out.</p>
    <p>Richest: <b>${esc(G.name[richest.p.id])}</b>. Gave the most to others: <b>${esc(G.name[giver.p.id])}</b>. Who was the hero?</p>
    <p><button class="btn" id="again" type="button">New table</button></p>
  </section>`);
  $('#extras').replaceChildren(card);
  card.querySelector('#again').addEventListener('click', () => { newTable(); showTable({ ifHidden: true }); });
  announce(`${lasted ? 'The table lasted the six minutes.' : `The table ended at ${at}: ${bust.join(' and ')} couldn't pay.`} ${fundLine}${me ? ` You end with ${fmt(me.balance)}, ${signed(tok(me.balance - me.start))} on your stake.` : ''}`);
  update();
}

// ---------- strategy key ----------
function renderKey() {
  const groups = Object.entries(FAMILIES).map(([fam, title]) => {
    const items = Object.values(STRATEGIES).filter((st) => st.family === fam);
    return `<div class="key-group"><h3>${esc(title)}</h3>${items.map((st) => `<div class="key-item"><b>${esc(st.label)}</b><span>${esc(st.summary)}</span><span class="key-tell"><span class="eyebrow">Tell</span>${esc(st.tell)}</span></div>`).join('')}</div>`;
  }).join('');
  $('#key').innerHTML = `<p class="key-note muted">Five of these sit at each table, in a random order and under random names. The end card shows who was who.</p><div class="key-groups">${groups}</div>`;
}

// ---------- start ----------
function locked() {
  $('.game').replaceChildren(h(`<div class="card locked-card"><div class="eyebrow">Level 3 · Locked</div>
    <h2>Earn all six Centipede &amp; Ultimatum achievements to open the Wheel</h2>
    <p class="muted">This is a play-test. To try it now, open <a href="?preview">the preview</a>.</p></div>`));
}

rememberToggle('how-it-works', 'trunk.wheel');
wireCollapse();
// "Collapse and play" puts focus on Start (the panel is part of the page grid here, so it can't take focus).
for (const btn of document.querySelectorAll('[data-collapse]')) btn.addEventListener('click', () => $('#pause')?.focus({ preventScroll: true }));
renderKey();
if (isUnlocked('wheel') || previewMode()) {
  $('#new-game').addEventListener('click', () => newTable());
  $('#watch-toggle').addEventListener('click', (e) => {
    const watch = !G.watch;
    e.currentTarget.setAttribute('aria-pressed', String(watch));
    e.currentTarget.textContent = watch ? 'Play a seat' : 'Watch the bots';
    newTable({ watch });
  });
  $('#stake').addEventListener('change', () => newTable());
  newTable();
} else locked();
