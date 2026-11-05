// Centipede & Ultimatum — browser UI. One human seat plus five strategy bots, or six bots in watch mode.
// SPDX-License-Identifier: AGPL-3.0-only

import {
  createGame, currentPlayer, act, divide, vote, stay, requirement, canGive, canGrab, activeIds, splitBy,
} from '../../engine/centipede-ultimatum.js';
import { STRATEGIES, FAMILIES, botView, selectRoster } from '../../bots/centipede-ultimatum-bots.js';
import { mulberry32, newSeed, shuffle } from '../../engine/rng.js';
import { ACHIEVEMENTS, STORAGE_KEY, CELEBRATED_KEY, splitAchievements, endAchievements } from './achievements.js';
import * as Game1 from '../rising-pool/achievements.js';
import { fireworks } from '../fireworks.js';
import { unlock, isUnlocked, resetControl } from '../progress-store.js';
import { keepFocus } from '../focus.js';
import {
  NAMES, HUES, HUMAN_HUE, CELEBRATION_COLOURS, reduceMotion, el, esc, h, signed, toast,
  achievementStore, progressHtml, achievementsCardHtml,
} from '../common.js';

const START_BALANCE = 20;
const COMMONS_RESERVE = 120;
const BOT_DELAY = reduceMotion ? 250 : 650;

const $ = (sel) => document.querySelector(sel);

// ---------- lock ----------
function game1Done() {
  if (isUnlocked('centipede')) return true;
  return achievementStore({ key: Game1.STORAGE_KEY, celebratedKey: Game1.CELEBRATED_KEY, all: Game1.ACHIEVEMENTS }).complete();
}
const previewMode = () => Boolean(globalThis.TRUNK_PREVIEW) || /[?&]preview\b/.test(globalThis.location?.search ?? '');

let G = null;

// ---------- achievements (checks in ./achievements.js, stored in this browser) ----------
const store = achievementStore({ key: STORAGE_KEY, celebratedKey: CELEBRATED_KEY, all: ACHIEVEMENTS });
const UNLOCK = () => ({ unlocked: isUnlocked('wheel'), unlockLabel: 'Game 3 unlocked' });
function earn(ids) {
  const fresh = store.add(ids);
  if (!fresh.length) return;
  for (const id of fresh) G.earned.add(id);
  const names = fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id).name);
  toast(`Achievement: ${names.join(' · ')}`);
  if (store.complete()) {
    unlock('wheel');
    if (store.firstCelebration()) G.allNow = true;
  }
}
const celebrate = (duration) => fireworks({ colors: CELEBRATION_COLOURS, duration });

function renderProgress() {
  const box = document.getElementById('ach-progress');
  if (!box) return;
  const have = store.load();
  if (store.complete(have)) unlock('wheel');
  box.innerHTML = `<span class="eyebrow">Achievements</span>${progressHtml(ACHIEVEMENTS, have, UNLOCK())}`;
  if (G.watch) return;
  box.append(resetControl({
    game: 'centipede', keys: store.keys, count: ACHIEVEMENTS.filter((a) => have.has(a.id)).length,
    onChange: (reset) => {
      if (reset) { store.forget(); G.earned = new Set(); toast('Centipede & Ultimatum achievements reset.'); }
      render();
    },
  }));
}

function renderExtras() {
  const box = $('#extras');
  if (!box) return;
  if (G.watch || G.game.status === 'playing') { box.replaceChildren(); return; }
  const have = store.load();
  const parts = [];
  if (store.complete(have)) {
    const card = h(`<section class="card extra unlocked" aria-labelledby="all-h"><div class="eyebrow">All achievements</div>
      <h3 id="all-h">Centipede &amp; Ultimatum mastered</h3>
      <p>You've shown you can share fairly, hold back, grab well, win a table's welcome, go the full distance, and make your own vote count.</p>
      <p class="muted small">Game 3, the Wheel, is unlocked for you and opens when it's ready.</p>
      <div class="btn-row"><button class="btn ghost" type="button" id="celebrate-again">Celebrate again</button></div></section>`);
    card.querySelector('#celebrate-again').addEventListener('click', () => celebrate(5200));
    parts.push(card);
  }
  parts.push(h(achievementsCardHtml(ACHIEVEMENTS, have, G.earned, { note: 'Easiest first, judged from simulated tables.', ...UNLOCK() })));
  box.replaceChildren(...parts);
}

// ---------- session ----------
function newSession({ watch = false } = {}) {
  clearTimeout(G?.timer);
  const seed = newSeed();
  const rng = mulberry32(seed);
  const roster = selectRoster(rng, 5);
  const names = shuffle(rng, NAMES).slice(0, 5);
  const standIn = watch ? shuffle(rng, Object.keys(STRATEGIES).filter((k) => !roster.includes(k)))[0] : null;
  const seats = [
    { id: 'you', name: watch ? 'Stand-in' : 'You', hue: HUMAN_HUE, human: !watch, strategy: standIn },
    ...roster.map((sid, i) => ({ id: `b${i}`, name: names[i], hue: HUES[i], human: false, strategy: sid })),
  ];
  const agents = {};
  for (const s of seats) if (!s.human) agents[s.id] = STRATEGIES[s.strategy].create(rng);
  G = {
    seed, watch, seats, agents,
    game: createGame({ players: seats.map((s) => ({ id: s.id })), seed, startBalance: START_BALANCE, commonsReserve: COMMONS_RESERVE }),
    timer: null, fast: false, lastUlt: null, note: null, earned: new Set(), allNow: false, endChecked: false,
  };
  $('#watch-toggle').setAttribute('aria-pressed', String(watch));
  $('#watch-toggle').textContent = watch ? 'Play a table' : 'Watch the bots';
  render();
  schedule();
}

const seat = (id) => G.seats.find((s) => s.id === id);
const player = (id) => G.game.players.find((p) => p.id === id);
// A split was just judged: show its outcome until the next round starts.
const justJudged = () => Boolean(G.lastUlt) && G.game.rounds.at(-1)?.result === 'ultimatum'
  && (G.game.phase === 'stay' || G.game.status !== 'playing');
const humanIn = () => !G.watch && player('you').active && G.game.status === 'playing';

// ---------- the loop: bots act on a timer, the human acts through the panel ----------
function schedule() {
  clearTimeout(G.timer);
  const s = G.game;
  if (s.status !== 'playing') { render(); return; }
  if (needsHuman()) { render(); return; }
  G.timer = setTimeout(botStep, G.fast ? 30 : BOT_DELAY);
}

function needsHuman() {
  const s = G.game;
  if (!humanIn()) return false;
  if (s.phase === 'turn') return currentPlayer(s) === 'you';
  if (s.phase === 'divide') return s.ultimatum.grabber === 'you';
  return s.phase === 'vote' || s.phase === 'stay';
}

function botStep() {
  const s = G.game;
  if (s.phase === 'turn') {
    const id = currentPlayer(s);
    G.game = act(s, id, G.agents[id].turn(botView(s, id)));
  } else if (s.phase === 'divide') {
    const g = s.ultimatum.grabber;
    G.game = divide(s, G.agents[g].divide(botView(s, g)));
  } else if (s.phase === 'vote') {
    applyVotes(null);
  } else if (s.phase === 'stay') {
    applyStay(null);
  }
  afterChange();
}

function afterChange() {
  const last = G.game.rounds.at(-1);
  if (last?.result === 'ultimatum' && last.ultimatum !== G.lastUlt?.u) {
    G.lastUlt = { u: last.ultimatum, round: last.round };
    if (!G.watch && last.ultimatum.grabber === 'you') {
      if (last.ultimatum.result === 'welcomed') {
        celebrate(2600);
        toast(`Welcomed! The table averaged ${last.ultimatum.voteAvg.toFixed(2)}, and everyone gets a bonus point.`);
      }
      earn(splitAchievements(G.game));
    }
  }
  if (!G.watch && G.game.status === 'ended' && !G.endChecked) {
    G.endChecked = true;
    earn(endAchievements(G.game));
  }
  render();
  schedule();
}

function applyVotes(mine) {
  const s = G.game;
  const votes = {};
  for (const id of activeIds(s)) votes[id] = id === 'you' && mine !== null ? mine : G.agents[id].vote(botView(s, id));
  G.game = vote(s, votes);
}

function applyStay(mine) {
  const s = G.game;
  const d = {};
  for (const id of activeIds(s)) {
    if (id === 'you' && mine !== null) d[id] = mine;
    else d[id] = G.agents[id].stay ? G.agents[id].stay(botView(s, id)) : true;
  }
  G.game = stay(s, d);
}

// ---------- human actions ----------
function humanMove(move) {
  G.game = act(G.game, 'you', move);
  afterChange();
}
function humanDivide(shares) {
  G.game = divide(G.game, shares);
  afterChange();
}
function humanVote(v) { applyVotes(v); afterChange(); }
function humanStay(v) { applyStay(v); afterChange(); }

// ---------- the table picture ----------
function seatPos(i, n = 6, r = 140) {
  const a = (-90 + (360 / n) * i) * (Math.PI / 180);
  return { x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a), a };
}


function renderTable() {
  const svg = $('#table');
  svg.replaceChildren();
  const s = G.game;
  const ids = activeIds(s);
  const turnId = currentPlayer(s);
  const u = s.ultimatum;
  const shown = justJudged() ? G.lastUlt.u : null;

  // the pool
  const poolR = 18 + Math.min(52, Math.sqrt(s.pool) * 5);
  svg.append(el('circle', { cx: 200, cy: 200, r: 72, class: 'pool-ring' }));
  svg.append(el('circle', { cx: 200, cy: 200, r: poolR, class: `pool-fill ${u ? 'held' : ''}` }));
  svg.append(el('text', { x: 200, y: 204, 'text-anchor': 'middle', class: 'pool-num' }, String(u ? u.pool : s.pool)));
  svg.append(el('text', { x: 200, y: 222, 'text-anchor': 'middle', class: 'pool-sub' }, u ? 'HELD BY ' + seat(u.grabber).name.toUpperCase() : 'POOL'));

  G.seats.forEach((st, i) => {
    const p = player(st.id);
    const pos = seatPos(i);
    const g = el('g', { class: `seat ${p.active ? '' : 'left'} ${st.id === turnId ? 'turn' : ''}` });
    if (st.id === turnId) g.append(el('circle', { cx: pos.x, cy: pos.y, r: 33, class: 'turn-ring' }));
    g.append(el('circle', { cx: pos.x, cy: pos.y, r: 26, fill: st.hue }));
    g.append(el('text', { x: pos.x, y: pos.y + 5, 'text-anchor': 'middle', class: 'seat-bal' }, String(p.balance)));
    const below = pos.y > 200;
    const ny = below ? pos.y + 44 : pos.y - 34;
    g.append(el('text', { x: pos.x, y: ny, 'text-anchor': 'middle', class: 'seat-name' }, st.name));
    // what's on the line from this seat
    let chip = '';
    let cls = 'stake';
    if (shown && p.active !== undefined && shown.shares[st.id] !== undefined) {
      const v = shown.votes[st.id];
      chip = shown.result === 'rejected' ? `vote ${v}` : `got ${shown.shares[st.id]} · vote ${v}`;
      cls = 'share';
    } else if (u?.shares && u.shares[st.id] !== undefined) {
      chip = `offered ${u.shares[st.id]}`;
      cls = 'share';
    } else if (p.active) {
      const m = s.current?.moves.find((x) => x.id === st.id);
      const stake = s.stakes[st.id] ?? 0;
      chip = m ? (m.move === 'give' ? `gave ${m.amount}` : m.move === 'pass' ? 'passed' : 'GRABBED') : '';
      if (stake) chip += `${chip ? ' · ' : ''}in ${stake}`;
      if (m?.move === 'grab') cls = 'grab';
      if (m?.move === 'pass') cls = 'pass';
    } else {
      chip = p.leftBecause === 'rejected' ? 'sent out' : 'sat out';
    }
    if (chip) g.append(el('text', { x: pos.x, y: below ? ny + 15 : ny - 14, 'text-anchor': 'middle', class: `seat-chip ${cls}` }, chip));
    // turn-order badge
    const order = ids.indexOf(st.id);
    if (s.status === 'playing' && s.phase === 'turn' && order >= 0) {
      const b = seatPos(i, 6, 98);
      g.append(el('circle', { cx: b.x, cy: b.y, r: 9, class: 'order-badge' }));
      g.append(el('text', { x: b.x, y: b.y + 4, 'text-anchor': 'middle', class: 'order-num' }, String(order + 1)));
    }
    svg.append(g);
  });

  // the Commons
  const w = 120;
  const frac = Math.max(0, Math.min(1, s.commons.reserve / (COMMONS_RESERVE * 1.5)));
  svg.append(el('text', { x: 16, y: 428, class: 'pool-sub' }, 'COMMONS'));
  svg.append(el('rect', { x: 76, y: 421, width: w, height: 8, rx: 4, class: 'commons-track' }));
  svg.append(el('rect', { x: 76, y: 421, width: w * frac, height: 8, rx: 4, class: 'commons-fill' }));
  svg.append(el('text', { x: 204, y: 429, class: 'commons-val' }, String(s.commons.reserve)));
  const roundLabel = s.status === 'playing'
    ? `ROUND ${s.round} OF ${s.maxRound} · AMOUNT ${requirement(s.round)}`
    : `TABLE OVER AFTER ROUND ${s.rounds.at(-1)?.round ?? s.round}`; // not the round that never started
  svg.append(el('text', { x: 384, y: 429, 'text-anchor': 'end', class: 'pool-sub' }, roundLabel));
}

// ---------- the panel ----------
function renderPanel() {
  const panel = $('#panel');
  panel.replaceChildren();
  const s = G.game;
  const me = player('you');

  if (justJudged()) panel.append(outcomeCard(G.lastUlt.u));

  if (s.status !== 'playing') { panel.append(endCard()); return; }

  if (!humanIn()) {
    const why = G.watch ? 'Watching six bots.' : me.leftBecause === 'rejected' ? 'Your split was rejected, so you left the table. Watch how the rest plays out.' : 'You sat out. Watch how the rest plays out.';
    panel.append(h(`<div class="card"><p class="muted">${esc(why)}</p><div class="btn-row">
      <button class="btn ghost" id="skip" type="button">${G.fast ? 'Playing fast…' : 'Skip to the end'}</button></div></div>`));
    $('#skip').addEventListener('click', () => { G.fast = true; schedule(); });
    if (s.phase !== 'stay') panel.prepend(statusCard());
    return;
  }

  panel.append(statusCard());
  if (s.phase === 'turn') panel.append(currentPlayer(s) === 'you' ? turnCard() : waitCard());
  else if (s.phase === 'divide') panel.append(s.ultimatum.grabber === 'you' ? divideCard() : waitCard());
  else if (s.phase === 'vote') panel.append(voteCard());
  else if (s.phase === 'stay') panel.append(stayCard());
}

function statusCard() {
  const s = G.game;
  const me = player('you');
  const stake = s.stakes.you ?? 0;
  return h(`<div class="card status">
    <div class="status-row">
      <div><div class="eyebrow">${G.watch ? 'Stand-in balance' : 'Your balance'}</div><div class="big">${me.balance}</div></div>
      <div><div class="eyebrow">Pool</div><div class="big">${s.ultimatum ? s.ultimatum.pool : s.pool}</div></div>
      <div><div class="eyebrow">Round ${s.round} amount</div><div class="big">${requirement(s.round)}</div></div>
    </div>
    ${stake ? `<p class="muted small">You have put ${stake} into this pool.</p>` : ''}
  </div>`);
}

function waitCard() {
  const s = G.game;
  const who = s.phase === 'divide' ? seat(s.ultimatum.grabber).name : seat(currentPlayer(s)).name;
  const what = s.phase === 'divide' ? 'is dividing the pool…' : 'is deciding…';
  return h(`<div class="card"><p class="muted">${esc(who)} ${what}</p></div>`);
}

function turnCard() {
  const s = G.game;
  const r = requirement(s.round);
  if (!canGive(s, 'you')) {
    const c = h(`<div class="card"><h2>Your turn</h2>
      <p>You can't afford this round's ${r}. You pass: no giving and no grabbing, but you keep your seat and your vote.</p>
      <div class="btn-row"><button class="btn" type="button" id="pass">Pass</button></div></div>`);
    c.querySelector('#pass').addEventListener('click', () => humanMove('give'));
    return c;
  }
  const grabNote = s.pool === 0 ? 'The pool is empty right now.' : `You'd hold ${s.pool} and decide who gets what.`;
  const open = canGrab(s, 'you');
  const wait = Math.max(0, activeIds(s).length - s.turnsSinceSplit);
  const grabSub = open
    ? `${esc(grabNote)} Then the table votes on your split.`
    : `Not yet: the pool has to go round the table once after each split. ${wait} more turn${wait === 1 ? '' : 's'} before anyone can grab.`;
  const c = h(`<div class="card"><h2>Your turn</h2>
    <div class="choices two">
      <button class="choice" type="button" id="give"><span class="lbl">Give</span><span class="amt">${r}</span><span class="sub">The pool grows. If everyone gives, the Commons adds 1 per giver.</span></button>
      <button class="choice grab" type="button" id="grab" ${open ? '' : 'disabled'}><span class="lbl">Grab</span><span class="amt">${s.pool}</span><span class="sub">${grabSub}</span></button>
    </div></div>`);
  c.querySelector('#give').addEventListener('click', () => humanMove('give'));
  if (open) c.querySelector('#grab').addEventListener('click', () => humanMove('grab'));
  return c;
}

function divideCard() {
  const s = G.game;
  const ids = activeIds(s);
  const pool = s.pool;
  const ones = Object.fromEntries(ids.map((id) => [id, 1]));
  const stakeW = Object.fromEntries(ids.map((id) => [id, s.stakes[id] ?? 0]));
  const { freeRiders: riders, freeZeros } = botView(s, 'you');
  const anyStake = ids.some((id) => (s.stakes[id] ?? 0) > 0);
  let shares = anyStake ? splitBy(pool, stakeW) : splitBy(pool, ones);
  const c = h(`<div class="card divide"><h2>Divide the pool of ${pool}</h2>
    <p class="muted small">Set each share. It starts split by what each player put in; an equal share would be about ${(pool / ids.length).toFixed(1)}.${riders.some((x) => x !== 'you') ? ' A <b>free rider</b> has voted 0 at least twice on fair splits that passed anyway: you can cut their share and the others won\'t defend them.' : ''}</p>
    ${needLine(ids.length)}
    <div class="btn-row presets">
      <button class="btn ghost small-btn" type="button" id="preset-stakes" data-p="stakes">By what each put in</button>
      <button class="btn ghost small-btn" type="button" id="preset-equal" data-p="equal">Equal</button>
      <button class="btn ghost small-btn" type="button" id="preset-half" data-p="half">Keep half</button>
    </div>
    <div class="share-rows"></div>
    <p class="remaining" aria-live="polite"></p>
    <div class="btn-row"><button class="btn" type="button" id="offer">Offer this split</button></div></div>`);
  const rows = c.querySelector('.share-rows');
  const draw = () => keepFocus(() => {
    rows.replaceChildren(...ids.map((id) => {
      const st = seat(id);
      const row = h(`<div class="share-row">
        <span class="who"><span class="dot" style="background:${st.hue}"></span>${esc(st.name)}${riders.includes(id) ? ' <span class="chip-fr" title="Voted 0 at least twice on fair splits that passed anyway">free rider</span>' : freeZeros[id] === 1 && id !== 'you' ? ' <span class="chip-fr soft" title="Voted 0 once on a fair split that passed anyway. A second time makes a free rider.">1 free 0</span>' : ''}</span>
        <span class="muted small">put in ${s.stakes[id] ?? 0}</span>
        <span class="stepper">
          <button type="button" class="step" id="less-${id}" aria-label="Less for ${esc(st.name)}">−</button>
          <input type="number" id="share-${id}" min="0" max="${pool}" step="1" inputmode="numeric" value="${shares[id]}" aria-label="Share for ${esc(st.name)}">
          <button type="button" class="step" id="more-${id}" aria-label="More for ${esc(st.name)}">+</button>
        </span></div>`);
      const [minus, plus] = row.querySelectorAll('.step');
      const input = row.querySelector('input');
      minus.addEventListener('click', () => { shares[id] = Math.max(0, shares[id] - 1); draw(); });
      plus.addEventListener('click', () => { shares[id] = shares[id] + 1; draw(); });
      input.addEventListener('change', () => { shares[id] = Math.max(0, Math.floor(Number(input.value) || 0)); draw(); });
      return row;
    }));
    const left = pool - ids.reduce((a, id) => a + shares[id], 0);
    const rem = c.querySelector('.remaining');
    rem.textContent = left === 0 ? 'Every point is assigned.' : left > 0 ? `${left} still to assign.` : `${-left} too many assigned.`;
    rem.className = `remaining ${left === 0 ? 'ok' : 'miss'}`;
    c.querySelector('#offer').disabled = left !== 0;
  }, ['panel']);
  c.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.p;
    shares = p === 'equal' ? splitBy(pool, ones) : p === 'stakes' ? splitBy(pool, stakeW) : splitBy(pool, ones, 'you', Math.ceil(pool / 2));
    draw();
  }));
  c.querySelector('#offer').addEventListener('click', () => humanDivide({ ...shares }));
  draw();
  return c;
}

function splitTable(u, { votes = false } = {}) {
  const ids = Object.keys(u.shares);
  const max = Math.max(1, ...ids.map((id) => u.shares[id]));
  const eq = u.pool / ids.length;
  return `<div class="split"><div class="split-row head"><span></span><span></span><span class="num">gets</span><span class="num">put in</span>${votes ? '<span class="num">vote</span>' : '<span></span>'}</div>${ids.map((id) => {
    const st = seat(id);
    const w = Math.round((100 * u.shares[id]) / max);
    const stake = u.stakes[id] ?? 0;
    const short = u.shares[id] < stake;
    return `<div class="split-row ${id === 'you' ? 'me' : ''}">
      <span class="who"><span class="dot" style="background:${st.hue}"></span>${esc(st.name)}${id === u.grabber ? ' <span class="muted small">divider</span>' : ''}</span>
      <span class="bar"><span style="width:${w}%"></span></span>
      <span class="num${short ? ' short' : ''}"${short ? ` title="Less than ${stake} put in"` : ''}>${u.shares[id]}</span>
      <span class="num muted">${stake}</span>
      ${votes ? `<span class="vote v${u.votes[id]}">${u.votes[id]}</span>` : '<span></span>'}
    </div>`;
  }).join('')}<p class="muted small">Equal share ≈ ${eq.toFixed(1)}. <span class="short">Red</span> means getting back less than was put in.</p></div>`;
}

function voteCard() {
  const u = G.game.ultimatum;
  const mine = u.shares.you;
  const c = h(`<div class="card"><h2>${u.grabber === 'you' ? 'Your split' : `${esc(seat(u.grabber).name)} grabbed ${u.pool}`}</h2>
    ${splitTable(u)}
    <p>${u.grabber === 'you' ? 'Now everyone votes, you included.' : `You're offered <b>${mine}</b>. How do you judge it?`}</p>
    <div class="choices three">
      <button class="choice" type="button" id="vote-0" data-v="0"><span class="lbl">Reject</span><span class="amt">0</span><span class="sub">Free.</span></button>
      <button class="choice" type="button" id="vote-1" data-v="1"><span class="lbl">Accept</span><span class="amt">1</span><span class="sub">Costs 1 from your share.</span></button>
      <button class="choice" type="button" id="vote-2" data-v="2"><span class="lbl">Welcome</span><span class="amt">2</span><span class="sub">Costs 2. An average of 1.5 or more welcomes the split: everyone gets 1 bonus.</span></button>
    </div>
    ${needLine(Object.keys(u.shares).length)}
    <p class="muted small">If rejected, the divider leaves the table, the pool goes back by what each put in, and everything the divider holds stays in the pool for the others. Vote tokens are shared back out, unless the split is rejected.</p></div>`);
  c.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => humanVote(Number(b.dataset.v))));
  return c;
}

function outcomeCard(u) {
  const tag = u.result === 'rejected' ? 'fail' : u.result === 'welcomed' ? 'bonus' : 'base';
  const g = seat(u.grabber).name;
  const whose = u.grabber === 'you' ? 'Your' : `${esc(g)}'s`;
  let text;
  if (u.result === 'rejected') {
    const left = u.forfeit ? ` ${u.grabber === 'you' ? 'Your' : 'Their'} remaining ${u.forfeit} points stay in the pool for the next round.` : '';
    text = `${whose} split was rejected (average ${u.voteAvg.toFixed(2)}). ${u.grabber === 'you' ? 'You leave' : esc(g) + ' leaves'} the table, and the pool of ${u.pool} went back by what each put in.${left}`;
  } else {
    const back = u.voteEach + (u.bonusEach ?? 0);
    const bonus = u.bonusEach ? ` (including a ${u.bonusEach}-point welcome bonus from the Commons)` : '';
    text = `${whose} split was ${u.result} (average ${u.voteAvg.toFixed(2)}). The shares were paid${back ? `, and everyone got ${back} back from the vote pool${bonus}` : ''}.`;
  }
  return h(`<div class="card outcome ${tag}"><div><span class="tag ${tag}">${u.result}</span></div><p>${text}</p>${tallyLine(u)}${splitTable(u, { votes: true })}</div>`);
}

function needLine(n) {
  return `<p class="need">To pass, the ${n} votes must add up to at least <b>${n}</b> (an average of 1). Every vote counts, the divider's too, and each 0 needs a 2 somewhere to make up for it.</p>`;
}

function tallyLine(u) {
  const ids = Object.keys(u.votes);
  const n = ids.length;
  const total = ids.reduce((a, id) => a + u.votes[id], 0);
  const names = (v) => ids.filter((id) => u.votes[id] === v).map((id) => esc(seat(id).name));
  const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const zeros = ids.filter((id) => u.votes[id] === 0).map((id) => {
    const fair = u.result !== 'rejected' && id !== u.grabber && (u.shares[id] ?? 0) >= (u.stakes[id] ?? 0) && (u.shares[id] ?? 0) >= 0.8 * (u.pool / n)
      && !ids.some((z) => z !== u.grabber && z !== id && (u.stakes[z] ?? 0) > 0 && u.shares[z] < u.stakes[z]);
    return `${esc(seat(id).name)}${fair ? ' (a free 0: treated fairly)' : ''}`;
  });
  const twos = names(2);
  let why = '';
  if (u.result === 'rejected') {
    why = `Short by ${n - total}. ${zeros.length ? `Voted 0: ${list(zeros)}.` : ''}${twos.length ? ` Voted 2: ${list(twos)}.` : ''}`;
  } else if (zeros.length) {
    why = `${list(zeros)} voted 0, covered by 2s from ${list(twos)}.`;
  } else if (twos.length) {
    why = `Voted 2: ${list(twos)}.`;
  }
  return `<p class="tally"><b>Votes totalled ${total}</b>, needed ${n}. ${why}</p>`;
}

function stayCard() {
  const s = G.game;
  const next = requirement(s.round + 1);
  const me = player('you');
  const c = h(`<div class="card"><h2>Stay for round ${s.round + 1}?</h2>
    <p class="muted small">The pool starts again from 0. Next round's amount is ${next}${me.balance < next ? `, more than your ${me.balance}: you'd pass each turn, but keep your vote` : ''}. If you sit out, you're out for the rest of this table.</p>
    <div class="btn-row"><button class="btn" type="button" id="stay">Stay</button><button class="btn ghost" type="button" id="leave">Sit out the rest</button></div></div>`);
  c.querySelector('#stay').addEventListener('click', () => humanStay(true));
  c.querySelector('#leave').addEventListener('click', () => humanStay(false));
  return c;
}

const END_TEXT = {
  'all-broke': 'Nobody could afford the amount any more. What was in the pool went back by what each player put in.',
  'too-few': 'Fewer than three players remained.',
  'commons-exhausted': 'The Commons ran out and could not pay the round bonus. The pool went back by what each player put in.',
  'round-cap': 'The table reached round 20, the last round. What was in the pool went back by what each player put in.',
  rejected: 'A split was rejected and the table ended.',
};

function endCard() {
  const s = G.game;
  const rows = G.seats.map((st) => {
    const p = player(st.id);
    return { st, net: p.balance - p.start, bal: p.balance };
  }).sort((a, b) => b.net - a.net);
  const best = rows[0];
  const card = h(`<div class="card debrief"><h2>Table over</h2>
    <p>${END_TEXT[s.endReason] ?? ''} ${s.rounds.at(-1)?.round ?? 0} rounds.</p>
    <table class="nets"><thead><tr><th>Player</th><th>Strategy</th><th>Ended</th><th>Net</th></tr></thead><tbody>
    ${rows.map(({ st, net, bal }) => `<tr${st.id === 'you' ? ' class="me"' : ''}><td><span class="who"><span class="dot" style="background:${st.hue}"></span>${esc(st.name)}</span></td>
      <td>${st.strategy ? esc(STRATEGIES[st.strategy].label) : '<span class="muted">you</span>'}</td><td>${bal}</td><td class="${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${signed(net)}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small">Ahead this table: ${esc(best.st.name)}${best.st.strategy ? ` (${esc(STRATEGIES[best.st.strategy].label)})` : ''}. What did they do differently?</p>
    <div class="btn-row"><button class="btn" type="button" id="again">New table</button></div></div>`);
  card.querySelector('#again').addEventListener('click', () => newSession({ watch: G.watch }));
  return card;
}

// ---------- round log ----------
function renderLog() {
  const s = G.game;
  const rounds = [...s.rounds];
  if (s.current) rounds.push({ ...s.current, result: 'live' });
  if (!rounds.length) { $('#log').replaceChildren(); return; }
  // The log is rebuilt after every move: keep it open or closed as the player left it, and keep
  // its sideways scroll, following the newest round when one is added.
  const oldFold = $('#log details');
  if (oldFold) G.logOpen = oldFold.open;
  const oldScroll = $('#log .log-wrap')?.scrollLeft ?? 0;
  const cell = (r, id) => {
    const m = r.moves.find((x) => x.id === id);
    let html = '';
    if (m) html = m.move === 'give' ? `<span class="mv give">G${m.amount}</span>` : m.move === 'pass' ? '<span class="mv pass">·</span>' : '<span class="mv grab">GRAB</span>';
    if (r.ultimatum && r.ultimatum.shares[id] !== undefined) {
      const u = r.ultimatum;
      html += `<span class="mv split" title="share offered, then vote">${u.shares[id]}<span class="v v${u.votes[id]}">${u.votes[id]}</span></span>`;
    }
    return html || '<span class="gone">–</span>';
  };
  const resLabel = (r) => r.result === 'live' ? '…' : r.result === 'complete' ? `+${r.topUp}` : r.result === 'stalled' ? 'stalled' : r.ultimatum.result;
  const resCls = (r) => r.result === 'ultimatum' ? (r.ultimatum.result === 'rejected' ? 'fail' : r.ultimatum.result === 'welcomed' ? 'bonus' : 'base') : '';
  $('#log').replaceChildren(h(`<details class="fold" ${G.logOpen === false ? '' : 'open'}><summary><h2>Round log</h2></summary>
    <p class="muted small legend-line">G = gave · <b>·</b> = passed (couldn't afford) · GRAB, then each player's offered share with their vote</p>
    <div class="log-wrap" id="log-scroll" tabindex="0" role="region" aria-label="Round log, scrolls sideways"><table class="grid">
      <thead><tr><th>Player</th>${rounds.map((r) => `<th>R${r.round}</th>`).join('')}<th>Now</th></tr></thead>
      <tbody>${G.seats.map((st) => `<tr><th scope="row"><span class="who"><span class="dot" style="background:${st.hue}"></span>${esc(st.name)}</span></th>
        ${rounds.map((r) => `<td>${cell(r, st.id)}</td>`).join('')}<td class="sum strong">${player(st.id).balance}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Result</th>${rounds.map((r) => `<td><span class="${resCls(r) ? `tag ${resCls(r)}` : ''}">${resLabel(r)}</span></td>`).join('')}<td></td></tr>
      <tr><th scope="row">Pool after</th>${rounds.map((r) => `<td>${r.result === 'complete' ? r.poolAfter : r.result === 'ultimatum' ? (r.ultimatum.forfeit ?? 0) : ''}</td>`).join('')}<td></td></tr></tfoot>
    </table></div></details>`));
  const wrap = $('#log .log-wrap');
  wrap.scrollLeft = rounds.length !== G.logRounds ? wrap.scrollWidth : oldScroll;
  G.logRounds = rounds.length;
}

// ---------- strategy key ----------
function renderKey() {
  const groups = Object.entries(FAMILIES).map(([fam, label]) => {
    const items = Object.values(STRATEGIES).filter((st) => st.family === fam);
    return `<div class="key-group"><div class="eyebrow">${esc(label)}</div>${items.map((st) => `<div class="key-item"><b>${esc(st.label)}</b><span>${esc(st.summary)}</span><span class="key-tell"><span class="eyebrow">Tell</span>${esc(st.tell)}</span></div>`).join('')}</div>`;
  }).join('');
  $('#key').replaceChildren(h(`<div><p class="muted key-note">Each table seats five of these under random names, always including at least one grabber, one judge and one reciprocator.</p><div class="key-groups">${groups}</div></div>`));
}

function render() {
  keepFocus(() => {
    renderProgress();
    renderTable();
    renderPanel();
    renderExtras();
    renderLog();
  }, ['panel', 'extras', 'log', 'ach-progress']);
  if (G.allNow) {
    G.allNow = false;
    setTimeout(() => celebrate(5200), 400);
    toast('All six achievements! Finish the table to see your card.');
  }
}

// ---------- start ----------
function showLock() {
  $('.game').replaceChildren(h(`<div class="card locked-card"><div class="eyebrow">Level 2 · Locked</div>
    <h2>Earn all five Rising Pool achievements first</h2>
    <p>Game 2 builds on what Game 1 teaches. Once you've earned every achievement in Rising Pool (in this browser), this table opens.</p>
    <div class="btn-row"><a class="btn" href="../rising-pool/">Play Rising Pool</a></div></div>`));
  $('#new-game').disabled = true;
  $('#watch-toggle').disabled = true;
}

renderKey();
if (game1Done() || previewMode()) {
  if (previewMode() && !game1Done()) document.querySelector('.eyebrow').textContent = 'Game 2 · Level 2 · Preview';
  $('#new-game').addEventListener('click', () => newSession({ watch: G?.watch ?? false }));
  $('#watch-toggle').addEventListener('click', () => newSession({ watch: !G?.watch }));
  newSession();
} else {
  showLock();
}
