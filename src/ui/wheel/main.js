// The Wheel (Game 3, working title): browser UI. One human seat plus five strategy bots, or six bots
// to watch. A first play-test page (Jason, 2026-11-09: "Let's get this up for play to check feedback
// from play"). The engine settles each second; this page draws the seconds in between, so rewards
// and shares travel as streams and arrive on time.
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, step, seatAngle, quotas, whiteId, blackId, feePct, nearest, UNIT } from '../../engine/wheel.js';
import { STRATEGIES, FAMILIES, botView, selectRoster } from '../../bots/wheel-bots.js';
import { mulberry32, newSeed, shuffle } from '../../engine/rng.js';
import { isUnlocked } from '../progress-store.js';
import { announce } from '../announce.js';
import { NAMES, HUES, HUMAN_HUE, reduceMotion, el, esc, h, signed, rememberToggle, wireCollapse, showTable } from '../common.js';

const $ = (sel) => document.querySelector(sel);
const CX = 230; // centre of the wheel in the picture (viewBox 460 x 480)
const CY = 240;
const WHEEL_R = 106;
const RIM_R = 128; // where shares travel
const SEAT_R = 160;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const tok = (u) => Math.round(u / UNIT);
const fmt = (u) => tok(u).toLocaleString('en-AU');
const polar = (deg, r) => [CX + r * Math.sin((deg * Math.PI) / 180), CY - r * Math.cos((deg * Math.PI) / 180)];
const turnTo = (a, b) => { const d = (((b - a) % 360) + 360) % 360; return d > 180 ? d - 360 : d; };

let G = null;

// ---------- lock ----------
const previewMode = () => Boolean(globalThis.TRUNK_PREVIEW) || /[?&]preview\b/.test(globalThis.location?.search ?? '');

// ---------- a table ----------
function newTable({ watch = G?.watch ?? false } = {}) {
  stopClock();
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
  };
  drawTable();
  renderPanel();
  renderScore();
  $('#extras').replaceChildren();
  update();
  announce(watch
    ? 'New table: six bots. Press Start to set the wheel turning.'
    : `New table. You sit at the white arrow with ${fmt(s.stake)} tokens. Set your dials, then press Start.`);
  if (!animating && !reduceMotion) { animating = true; requestAnimationFrame(frame); }
}
let animating = false; // one animation loop for the page, whichever table is showing

const settingsOf = (s) => Object.fromEntries(s.players.map((p) => [p.id, { ...p.settings }]));
const player = (id) => G.s.players.find((p) => p.id === id);

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
  noteEvents();
  update();
  if (G.s.status !== 'playing') return endTable();
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
function drawTable() {
  const svg = $('#table');
  const title = svg.querySelector('title');
  svg.replaceChildren(title);
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'face', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(el('stop', { offset: '0%', 'stop-color': '#ffffff' }), el('stop', { offset: '50%', 'stop-color': '#8d9693' }), el('stop', { offset: '100%', 'stop-color': '#151a19' }));
  defs.append(grad);
  svg.append(defs);
  svg.append(el('circle', { cx: CX, cy: CY, r: RIM_R, class: 'rim-track' }));

  // The wheel turns as one: face, arrows and hub.
  const wheel = el('g', { id: 'wheel' });
  wheel.append(el('circle', { cx: CX, cy: CY, r: WHEEL_R, fill: 'url(#face)', class: 'wheel-face' }));
  const arrow = (deg, cls, len) => {
    const [tx, ty] = polar(deg, len);
    const [lx, ly] = polar(deg - 90, 9);
    const [rx, ry] = polar(deg + 90, 9);
    return el('polygon', { points: `${tx},${ty} ${lx},${ly} ${rx},${ry}`, class: cls });
  };
  wheel.append(arrow(90, 'arrow-grey', WHEEL_R - 30), arrow(270, 'arrow-grey', WHEEL_R - 30), arrow(180, 'arrow-black', WHEEL_R - 4), arrow(0, 'arrow-white', WHEEL_R - 4));
  wheel.append(el('circle', { cx: CX, cy: CY, r: 11, class: 'hub' }));
  svg.append(wheel);
  svg.append(el('g', { id: 'parcels', 'aria-hidden': 'true' }));

  const seats = el('g', { id: 'seats' });
  for (const p of G.s.players) {
    const a = seatAngle(G.s, p.pos);
    const [x, y] = polar(a, SEAT_R);
    const g = el('g', { class: 'seat', 'data-id': p.id });
    g.append(el('circle', { cx: x, cy: y, r: 26, class: 'seat-ring' }));
    g.append(el('circle', { cx: x, cy: y, r: 19, fill: G.hue[p.id], class: 'seat-disc' }));
    g.append(el('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'seat-initial' }, p.id === 'you' ? 'YOU' : G.name[p.id][0]));
    // labels sit outside the seat: to the right, to the left, or above/below at the top and bottom
    const sx = Math.sin((a * Math.PI) / 180);
    const side = sx > 0.3 ? 'start' : sx < -0.3 ? 'end' : 'middle';
    const lx = side === 'start' ? x + 30 : side === 'end' ? x - 30 : x;
    const top = Math.cos((a * Math.PI) / 180) > 0.5;
    const ly = side !== 'middle' ? y - 20 : top ? y - 70 : y + 40;
    const t = el('text', { x: lx, y: ly, 'text-anchor': side, class: 'seat-label' });
    const line = (cls, dy) => el('tspan', { x: lx, dy, class: cls });
    t.append(line('seat-name', 0), line('seat-tokens', 14), line('seat-dials', 13), line('seat-state', 13));
    t.childNodes[0].textContent = G.name[p.id];
    g.append(t);
    seats.append(g);
  }
  svg.append(seats);
  drawMoving(1);
}

/** Per second: balances, dials and who pays or receives. */
function drawSeats() {
  const q = quotas(G.s);
  const w = G.s.status === 'playing' ? whiteId(G.s) : null;
  G.s.players.forEach((p, i) => {
    const g = $(`#seats .seat[data-id="${CSS.escape(p.id)}"]`);
    if (!g) return;
    const [, tokens, dials, state] = g.querySelectorAll('tspan');
    tokens.textContent = fmt(p.balance);
    const st = p.settings;
    const others = Math.min(st.people, G.s.n) - 1;
    dials.textContent = st.share === 0 || others === 0 ? 'keeps all' : `${st.share}/10 → ${others}`;
    const v = st.vote;
    const voteTxt = v ? ` ${v > 0 ? '↻' : '↺'}${Math.abs(v)}` : '';
    const paying = G.s.status === 'playing' ? q[i] : 0;
    state.textContent = (w === p.id ? 'receives' : paying ? `pays ${paying / UNIT}` : '') + voteTxt;
    const ring = g.querySelector('.seat-ring');
    ring.setAttribute('class', `seat-ring${w === p.id ? ' receiving' : paying >= 9 * UNIT ? ' paying' : paying ? ' paying-light' : ''}`);
    g.classList.toggle('bust', G.s.bust.includes(p.id));
  });
}

/** Every frame: the wheel's turn through the second, and the parcels on their way. */
function drawMoving(frac) {
  if (!G) return;
  const s = G.s;
  const prevTheta = G.prev.theta;
  const delta = G.prev === s ? 0 : turnTo(prevTheta, s.theta);
  const theta = prevTheta + delta * frac;
  $('#wheel')?.setAttribute('transform', `rotate(${theta.toFixed(2)} ${CX} ${CY})`);
  const T = s.t - 1 + frac; // the second being shown
  const out = [];
  for (const x of s.transit) {
    const span = Math.max(1, x.arrive - x.depart);
    const p = Math.max(0, Math.min(1, (T - x.depart) / span));
    const size = Math.min(5.5, 1.8 + Math.sqrt(x.amount / UNIT) * 0.9);
    for (let k = 0; k < 4; k++) {
      const q = p - k * 0.045;
      if (q < 0) break;
      let pt;
      if (x.kind === 'reward') {
        const [bx, by] = polar(theta + 180, WHEEL_R - 8);
        const [wx, wy] = polar(theta, WHEEL_R - 8);
        pt = q < 0.5 ? [bx + (CX - bx) * q * 2, by + (CY - by) * q * 2] : [CX + (wx - CX) * (q - 0.5) * 2, CY + (wy - CY) * (q - 0.5) * 2];
      } else {
        const a0 = seatAngle(s, player(x.from).pos);
        const a1 = seatAngle(s, player(x.to).pos);
        pt = polar(a0 + turnTo(a0, a1) * q, RIM_R);
      }
      out.push(`<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="${(size * (1 - k * 0.18)).toFixed(1)}" class="${x.kind === 'reward' ? 'dot-reward' : 'dot-share'}" opacity="${(1 - k * 0.22).toFixed(2)}"/>`);
    }
  }
  const layer = $('#parcels');
  if (layer) layer.innerHTML = out.join('');
}

function frame() {
  const running = G && !G.paused && G.s.status === 'playing';
  if (G) drawMoving(running ? Math.min(1, (now() - G.lastStep) / tickMs()) : 1);
  requestAnimationFrame(frame);
}

// ---------- the panel ----------
function renderPanel() {
  const watch = G.watch;
  const panel = $('#panel');
  panel.replaceChildren(h(`<div class="card status-card" aria-labelledby="status-h">
    <h2 id="status-h" class="sr-only">Table status</h2>
    <div class="status-row">
      <div><div class="eyebrow">Time left</div><div class="big" id="clock">6:00</div></div>
      ${watch ? '<div><div class="eyebrow">Boost fund</div><div class="big" id="fund-big">0</div></div>'
        : '<div><div class="eyebrow">Your tokens</div><div class="big" id="mine">0</div><div class="small muted" id="mine-net"></div></div>'}
    </div>
    <p class="small arrows-now" id="arrows-now"></p>
    <p class="small" id="poorest"></p>
    ${watch ? '' : '<p class="small muted" id="fund-line"></p>'}
    <div class="clock-ctl">
      <button class="btn" id="pause" type="button">Start</button>
      <button class="btn ghost" id="step" type="button">Step 1 second</button>
      <label class="small">Speed <select id="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
    </div>
  </div>`));
  if (!watch) {
    panel.append(h(`<div class="card dials" aria-labelledby="dials-h">
      <h2 id="dials-h">Your dials</h2>
      <div class="dial">
        <label for="d-share">Pass on</label>
        <input type="range" id="d-share" min="0" max="10" step="1" value="${G.dials.share}" aria-describedby="o-share fee-note">
        <output id="o-share" for="d-share"></output>
      </div>
      <div class="dial">
        <label for="d-people">Share with</label>
        <input type="range" id="d-people" min="1" max="6" step="1" value="${G.dials.people}" aria-describedby="o-people">
        <output id="o-people" for="d-people"></output>
      </div>
      <p class="small muted" id="fee-note"></p>
      <div class="dial">
        <label for="d-vote">Turn the wheel</label>
        <input type="range" id="d-vote" min="-9" max="9" step="1" value="${G.dials.vote}" aria-describedby="o-vote vote-note">
        <output id="o-vote" for="d-vote"></output>
      </div>
      <p class="small muted" id="vote-note">Left is anticlockwise, right is clockwise. Turning the wheel round takes more than 9 from everyone together.</p>
    </div>`));
    for (const [id, key] of [['d-share', 'share'], ['d-people', 'people'], ['d-vote', 'vote']]) {
      $(`#${id}`).addEventListener('input', (e) => { G.dials[key] = Number(e.target.value); updateDials(); });
    }
  }
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

/** The words beside your dials: what you pass on, what you keep after the fee, what a vote costs. */
function updateDials() {
  if (G.watch || !$('#o-share')) return;
  const { share, people, vote } = G.dials;
  const others = Math.min(people, G.s.n) - 1;
  const f = others ? (share * others) / (10 * (others + 1)) : 0;
  const fee = feePct(f);
  const net = Math.round((1 - f) * (1 - fee / 100) * 100);
  $('#o-share').textContent = share === 0 ? 'nothing: keep it all' : `${share}/10 of what you receive`;
  $('#o-people').textContent = people === 1 ? 'just you' : people >= G.s.n ? `everyone: you and ${others} others` : `you and the ${others} nearest`;
  $('#fee-note').textContent = f === 0
    ? `You keep everything, and the fee takes 95% of it: you end up with 5% of what you receive.${share && people === 1 ? ' Sharing only with yourself counts as keeping.' : ''}`
    : `${Math.round(f * 100)}% goes to the others. On the ${Math.round((1 - f) * 100)}% you keep, the fee takes ${fee}%: you end up with ${net}% of what you receive, plus whatever comes back.`;
  const cost = Math.abs(vote) * G.s.voteCost;
  const withWheel = Math.sign(vote) === G.s.dir;
  $('#o-vote').textContent = vote === 0 ? 'no vote' : `${vote > 0 ? 'clockwise' : 'anticlockwise'} ${Math.abs(vote)} (${withWheel ? 'with the wheel: faster' : 'against the wheel: holds it back'}), ${cost.toFixed(2).replace(/\.?0+$/, '')} a second`;
}

function update() {
  const s = G.s;
  const left = Math.max(0, s.maxTicks - s.t);
  $('#clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const me = s.players.find((p) => p.id === 'you');
  if (me) {
    $('#mine').textContent = fmt(me.balance);
    const net = tok(me.balance - me.start);
    $('#mine-net').textContent = `${net === 0 ? '±0' : signed(net)} on your stake`;
    $('#fund-line').textContent = `Boost fund: ${fmt(s.fund.balance)} tokens, shared out equally if the table lasts with the poorest above a tenth of the stake.`;
  } else $('#fund-big').textContent = fmt(s.fund.balance);
  if (s.status === 'playing') {
    const q = quotas(s);
    const b = blackId(s);
    $('#arrows-now').innerHTML = `White arrow: <b>${esc(G.name[whiteId(s)])}</b> · Black arrow: <b>${esc(G.name[b])}</b> pays ${q[s.players.findIndex((p) => p.id === b)] / UNIT} a second · Wheel turning ${s.dir > 0 ? 'clockwise' : 'anticlockwise'} at ${s.speed}° a second`;
  } else $('#arrows-now').textContent = '';
  const poor = s.players.reduce((a, p) => (p.balance < a.balance ? p : a));
  const floor = s.stake / 10;
  $('#poorest').innerHTML = `Poorest: <b>${esc(G.name[poor.id])}</b> with ${fmt(poor.balance)}. ${poor.balance >= floor
    ? `<span class="ok">Above a tenth of the stake (${fmt(floor)}): the bonus is still on.</span>`
    : `<span class="miss">Below a tenth of the stake (${fmt(floor)}): no bonus unless they recover.</span>`}`;
  updateDials();
  drawSeats();
  if (reduceMotion || G.paused) drawMoving(1);
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
  if (!G.warned && poor.balance < s.stake / 10) {
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
  for (const p of G.s.players) {
    const row = $(`#scoreboard tr[data-id="${CSS.escape(p.id)}"]`);
    if (!row) continue;
    const c = row.querySelectorAll('td');
    const st = p.settings;
    const others = Math.min(st.people, G.s.n) - 1;
    c[0].textContent = fmt(p.balance);
    c[1].textContent = st.share === 0 || others === 0 ? 'keeps all' : `${st.share}/10 to ${others}`;
    c[2].textContent = st.vote ? `${st.vote > 0 ? '↻ clockwise' : '↺ anticlockwise'} ${Math.abs(st.vote)}` : '–';
    c[3].textContent = fmt(p.stats.reward);
    c[4].textContent = fmt(p.stats.sharesOut);
    c[5].textContent = fmt(p.stats.paid);
  }
}

// ---------- the end ----------
function endTable() {
  stopClock();
  setPaused(true);
  const s = G.s;
  const lasted = s.endReason === 'time';
  const at = `${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')}`;
  const bust = s.bust.map((id) => G.name[id]);
  const fundTotal = s.fund.refunded + s.fund.balance;
  const each = s.fund.refunded / s.n;
  const bonusEach = s.commonIn / s.n;
  const poor = s.players.reduce((a, p) => (p.balance < a.balance ? p : a));
  const rows = s.players.map((p, i) => ({ p, key: G.keys[i], net: p.balance - p.start })).sort((a, b) => b.net - a.net);
  const richest = rows[0];
  const giver = [...rows].sort((a, b) => b.p.stats.sharesOut - a.p.stats.sharesOut)[0];
  const me = s.players.find((p) => p.id === 'you');
  let fundLine;
  if (s.bonus) fundLine = `The poorest player still had more than a tenth of the stake, so the boost fund was shared out: ${fmt(each)} each, plus a ${s.bonus.pct}% bonus of ${fmt(bonusEach)} each from the common fund.`;
  else if (lasted) fundLine = `The poorest player, ${G.name[poor.id]}, had less than a tenth of the stake, so the boost fund (${fmt(fundTotal)} tokens) was lost.`;
  else fundLine = `The table ended early, so the boost fund (${fmt(fundTotal)} tokens) was lost.`;
  const card = h(`<section class="card extra end-card" aria-labelledby="end-h">
    <div class="eyebrow">${lasted ? 'Six minutes' : `Ended at ${at}`}</div>
    <h3 id="end-h">${lasted ? 'The table lasted the six minutes' : `${esc(bust.join(' and '))} couldn't pay`}</h3>
    <p>${esc(fundLine)}</p>
    ${me ? `<p class="you-result">You end with <b>${fmt(me.balance)}</b>: <b class="${me.balance >= me.start ? 'pos' : 'neg'}">${signed(tok(me.balance - me.start))}</b> on your stake of ${fmt(me.start)}.</p>` : ''}
    <div class="log-wrap" tabindex="0" role="region" aria-label="Results, scrollable"><table class="score">
      <thead><tr><th scope="col">Seat</th><th scope="col">Strategy</th><th scope="col">Ends with</th><th scope="col">Net</th><th scope="col">Shared out</th></tr></thead>
      <tbody>${rows.map(({ p, key, net }) => `<tr><th scope="row"><span class="who"><span class="dot" style="background:${G.hue[p.id]}"></span>${esc(G.name[p.id])}</span></th><td>${key === 'you' ? 'You' : esc(STRATEGIES[key].label)}</td><td>${fmt(p.balance)}</td><td class="${net >= 0 ? 'pos' : 'neg'}">${signed(tok(net))}</td><td>${fmt(p.stats.sharesOut)}</td></tr>`).join('')}</tbody>
    </table></div>
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
