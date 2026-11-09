// Rising Pool — browser UI. One human seat plus five strategy bots, or six bots in watch mode.
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, resolveRound, applyStayDecisions, stakes, activePlayers, affordableLevel, LEVEL_INDEX } from '../../engine/rising-pool.js';
import { STRATEGIES, FAMILIES, botView, selectRoster } from '../../bots/rising-pool-bots.js';
import { strategyEvidence, guessFits } from '../../bots/evidence.js';
import { mulberry32, newSeed, shuffle } from '../../engine/rng.js';
import { fireworks as showFireworks } from '../fireworks.js';
import { unlock, isUnlocked, resetControl } from '../progress-store.js';
import { keepFocus } from '../focus.js';
import { announce } from '../announce.js';
import {
  NAMES, HUES, HUMAN_HUE, CELEBRATION_COLOURS, reduceMotion, el, esc, frag, signed, toast,
  achievementStore, progressHtml, achievementsCardHtml, achievementsListHtml, showAchievementsButton, rememberToggle, momentsCardHtml, wireCollapse, showTable,
} from '../common.js';
import { tableMoments } from './moments.js';
import { pickMoments } from '../ideas.js';
import { ACHIEVEMENTS, STORAGE_KEY, CELEBRATED_KEY, MIN_READ_ROUNDS, roundAchievements, endAchievements } from './achievements.js';

const START_BALANCE = 20;
const COMMONS_RESERVE = 120;
const WALLET_KEY = 'trunk.risingPool.wallet';
const store = achievementStore({ key: STORAGE_KEY, celebratedKey: CELEBRATED_KEY, all: ACHIEVEMENTS });
const UNLOCK = () => ({ unlocked: isUnlocked('centipede'), unlockLabel: 'Game 2 unlocked' });

// Your points carry from table to table. A table needs START_BALANCE to join.
let walletMemory = START_BALANCE;
function loadWallet() {
  try { const v = localStorage.getItem(WALLET_KEY); if (v !== null && !Number.isNaN(Number(v))) walletMemory = Number(v); } catch { /* storage unavailable */ }
  return walletMemory;
}
function saveWallet(v) {
  walletMemory = v;
  try { localStorage.setItem(WALLET_KEY, String(v)); } catch { /* storage unavailable */ }
}

let G = null;

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
  const wallet = watch ? START_BALANCE : loadWallet();
  const game = createGame({
    players: seats.map((s) => (s.id === 'you' ? { id: s.id, balance: wallet } : { id: s.id })),
    seed, startBalance: START_BALANCE, commonsReserve: COMMONS_RESERVE,
  });
  const agents = {};
  for (const s of seats) if (s.strategy) agents[s.id] = STRATEGIES[s.strategy].create(rng);
  G = {
    seed, rng, seats, game, agents, watch,
    phase: !watch && wallet < START_BALANCE ? 'broke' : 'choose', choice: null, outcome: null, timer: null,
    humanLeftAfter: null, afterYouLeft: null,
    guesses: {}, checked: false, speed: 1400,
    poolRatio: 0, earned: new Set(),
  };
  render();
  if (watch) scheduleAuto();
  if (G.phase === 'broke') announce(sayBroke());
  else if (!watch && !firstLoad) announce(sayChoose());
  if (!firstLoad) showTable({ ifHidden: true }); // New table, Watch, Play another table, Start over (Jason, 2026-11-08)
  firstLoad = false;
}
let firstLoad = true; // the page itself is read on arrival; announce from the first new table on

const seatOf = (id) => G.seats.find((s) => s.id === id);
const playerOf = (state, id) => state.players.find((p) => p.id === id);

function botChoices(state, skipHuman) {
  const choices = {};
  for (const p of activePlayers(state)) {
    if (p.id === 'you' && skipHuman) continue;
    choices[p.id] = G.agents[p.id].choose(botView(state, p.id));
  }
  return choices;
}
function botStays(state) {
  const d = {};
  for (const p of activePlayers(state)) {
    if (p.id === 'you' && !G.watch) continue;
    const a = G.agents[p.id];
    d[p.id] = a.stay ? a.stay(botView(state, p.id)) : true;
  }
  return d;
}

// ---------- actions ----------
function reveal() {
  const humanPlays = !G.watch && playerOf(G.game, 'you').active;
  if (humanPlays && !G.choice) return;
  const choices = botChoices(G.game, humanPlays);
  if (humanPlays) choices.you = G.choice;
  const { state, outcome } = resolveRound(G.game, choices);
  G.game = state;
  G.outcome = outcome;
  if (humanPlays) { for (const id of roundAchievements(state, outcome)) earn(id); saveWallet(playerOf(state, 'you').balance); }
  G.phase = state.status === 'ended' ? 'ended' : 'revealed';
  if (G.phase === 'ended' && !G.watch) checkEndAchievements();
  render();
  if (!G.watch) announce(sayRound(outcome) + (G.phase === 'ended' ? '' : ` Stay for round ${outcome.round + 1}, or leave with ${playerOf(state, 'you').balance}?`));
  if (G.phase === 'ended') announce(sayEnd({ resultSaid: outcome.result === 'fail' }));
  animatePool(outcome.avg / outcome.stakes.high);
  if (G.watch && G.phase !== 'ended') scheduleAuto();
}

function nextRound(humanStays) {
  const decisions = botStays(G.game);
  if (!G.watch) decisions.you = humanStays;
  G.game = applyStayDecisions(G.game, decisions);
  G.choice = null;
  G.outcome = null;
  if (!G.watch && !humanStays) {
    G.humanLeftAfter = G.game.round - 1;
    playOutWithoutYou();
    G.phase = 'ended';
    checkEndAchievements();
  } else {
    G.phase = G.game.status === 'ended' ? 'ended' : 'choose';
    if (G.phase === 'ended' && !G.watch) checkEndAchievements();
  }
  G.poolRatio = 0;
  render();
  if (G.watch && G.phase !== 'ended') scheduleAuto();
  if (G.phase === 'ended') announce(sayEnd());
  else if (!G.watch) announce(sayChoose());
}

// ---------- what a screen reader hears (src/ui/announce.js) ----------
function sayChoose() {
  const r = G.game.round, s = stakes(r), you = playerOf(G.game, 'you');
  const cant = ['high', 'medium'].filter((lv) => affordableLevel(lv, r, you.balance) !== lv);
  return `Round ${r}: give nothing, medium ${s.medium} or high ${s.high}. You have ${you.balance} points.`
    + (cant.length ? ` You can't afford ${cant.join(' or ')}.` : '');
}
function sayRound(o) {
  const you = 'you' in o.levels && !G.watch
    ? ` You gave ${o.contributions.you} and received ${o.payouts.you}: ${signed(o.payouts.you - o.contributions.you)}.` : '';
  return `Round ${o.round}: ${RESULT_TAG[o.result].toLowerCase()}. ${RESULT_TEXT[o.result](o)}${you}`;
}
function sayEnd({ resultSaid = false } = {}) {
  const s = G.game;
  if (G.watch) return `Table closed. ${closingLead(s)}`;
  const p = playerOf(s, 'you');
  return `Table closed.${resultSaid ? failCause() : ` ${closingLead(s)}`} You finished with ${p.balance} points, ${signed(p.balance - p.start)} at this table.`
    + (p.balance < START_BALANCE ? ` A table needs ${START_BALANCE} to join, so you can watch or start over.` : '');
}
const sayBroke = () => `Not enough points to join: you have ${walletMemory}. A table needs ${START_BALANCE}. You can start over with ${START_BALANCE}, or watch the bots.`;

function playOutWithoutYou() {
  let s = G.game;
  const start = s.rounds.length;
  while (s.status === 'playing') {
    s = resolveRound(s, botChoices(s, false)).state;
    if (s.status !== 'playing') break;
    s = applyStayDecisions(s, botStays(s));
  }
  G.game = s;
  G.afterYouLeft = { rounds: s.rounds.length - start, reason: s.endReason };
}

function scheduleAuto() {
  clearTimeout(G.timer);
  G.timer = setTimeout(() => {
    if (!G.watch || G.phase === 'ended') return;
    if (G.phase === 'choose') reveal();
    else if (G.phase === 'revealed') nextRound(true);
  }, G.speed);
}

// ---------- achievements (checks in ./achievements.js, stored in this browser) ----------
function earn(id) {
  for (const x of store.add([id])) G.earned.add(x);
  if (store.complete()) {
    unlock('centipede');
    if (store.firstCelebration()) G.celebrateNow = true;
  }
}
function checkEndAchievements() {
  for (const id of endAchievements(G.game, { leftAfter: G.humanLeftAfter, afterReason: G.afterYouLeft?.reason ?? null })) earn(id);
}

// ---------- reputation ----------
// Reputation: green if a player's average choice meets the medium threshold, magenta if below.
function reputation() {
  const sums = {}, counts = {};
  for (const r of G.game.rounds) for (const [id, lv] of Object.entries(r.levels)) {
    sums[id] = (sums[id] || 0) + LEVEL_INDEX[lv]; counts[id] = (counts[id] || 0) + 1;
  }
  const rep = {};
  for (const s of G.seats) rep[s.id] = counts[s.id] ? (sums[s.id] / counts[s.id] >= LEVEL_INDEX.medium ? 'good' : 'low') : 'none';
  return rep;
}

// ---------- drawing ----------
const C = 200, R_SEAT = 138, R_POOL = 58;
const polar = (deg, r) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];

function drawTable() {
  const svg = document.getElementById('table');
  svg.replaceChildren();
  // clock-face ring: 60 ticks, every fifth heavier
  for (let i = 0; i < 60; i++) {
    const deg = i * 6 - 90, major = i % 5 === 0;
    const [x1, y1] = polar(deg, major ? 183 : 187);
    const [x2, y2] = polar(deg, 194);
    svg.append(el('line', { x1, y1, x2, y2, class: major ? 'tick major' : 'tick', 'stroke-width': major ? 2.5 : 1 }));
  }
  const o = G.outcome;
  const round = o ? o.round : G.game.round;
  const s = stakes(round);
  const rep = reputation();

  // flows from each seat toward the pool, after a reveal
  G.seats.forEach((seat, i) => {
    if (o && seat.id in o.levels && o.contributions[seat.id] > 0) {
      const deg = 90 + i * 60;
      const [x1, y1] = polar(deg, R_SEAT - 26);
      const [x2, y2] = polar(deg, R_POOL + 6);
      svg.append(el('line', { x1, y1, x2, y2, class: 'flow-line' }));
    }
  });

  // pool gauge: inner ring = medium, dashed = bonus line (halfway), outer = high
  const resultClass = o ? o.result : null;
  const fillColor = resultClass === 'fail' ? 'var(--fail)' : resultClass === 'bonus' ? 'var(--bonus)' : 'var(--base)';
  svg.append(el('circle', { cx: C, cy: C, r: Math.max(0.01, G.poolRatio * R_POOL), class: 'pool-fill', id: 'pool-fill', fill: fillColor, 'fill-opacity': 0.28 }));
  svg.append(el('circle', { cx: C, cy: C, r: R_POOL * 0.5, class: 'ring-medium' }));
  svg.append(el('circle', { cx: C, cy: C, r: R_POOL * 0.75, class: 'ring-bonus' }));
  svg.append(el('circle', { cx: C, cy: C, r: R_POOL, class: 'ring-high' }));
  svg.append(el('text', { x: C, y: C - R_POOL * 0.5 - 3, 'text-anchor': 'middle', class: 'ring-label' }, `medium ${s.medium}`));
  svg.append(el('text', { x: C, y: C - R_POOL - 4, 'text-anchor': 'middle', class: 'ring-label' }, `high ${s.high}`));
  svg.append(el('text', { x: C, y: C + 7, 'text-anchor': 'middle', class: 'pool-avg' }, o ? fmt(o.avg) : '?'));
  svg.append(el('text', { x: C, y: C + 21, 'text-anchor': 'middle', class: 'pool-sub' }, o ? 'AVERAGE GIFT' : `ROUND ${round}`));

  // Commons reserve, top-left corner
  const cm = G.game.commons;
  const frac = Math.max(0, Math.min(1, cm.reserve / cm.start));
  svg.append(el('text', { x: 8, y: 16, class: 'ring-label' }, 'COMMONS RESERVE'));
  svg.append(el('text', { x: 8, y: 34, class: 'commons-val' }, `${cm.reserve}`));
  svg.append(el('text', { x: 8 + 9 * String(cm.reserve).length + 4, y: 34, class: 'ring-label' }, `/ ${cm.start}`));
  svg.append(el('rect', { x: 8, y: 40, width: 72, height: 5, rx: 2.5, class: 'commons-track' }));
  svg.append(el('rect', { x: 8, y: 40, width: Math.max(0.01, 72 * frac), height: 5, rx: 2.5, class: 'commons-fill' }));

  // seats
  G.seats.forEach((seat, i) => {
    const p = playerOf(G.game, seat.id);
    const deg = 90 + i * 60;
    const [x, y] = polar(deg, R_SEAT);
    const g = el('g', { class: p.active || (o && seat.id in o.levels) ? 'seat' : 'seat left' });
    const repColor = rep[seat.id] === 'good' ? 'var(--good)' : rep[seat.id] === 'low' ? 'var(--low)' : 'var(--line)';
    g.append(el('circle', { cx: x, cy: y, r: 27, class: rep[seat.id] === 'low' ? 'seat-rep dashed' : 'seat-rep', stroke: repColor })); // dashed: shape as well as colour
    g.append(el('circle', { cx: x, cy: y, r: 21, fill: seat.hue }));
    g.append(el('text', { x, y: y + 4.5, 'text-anchor': 'middle', class: 'seat-bal' }, String(p.balance)));
    const [nx, ny] = polar(deg, R_SEAT + 41);
    g.append(el('text', { x: nx, y: ny + 4, 'text-anchor': 'middle', class: 'seat-name' }, p.active ? seat.name : `${seat.name} (left)`));
    if (o && seat.id in o.levels) {
      const [cx, cy] = polar(deg, R_SEAT - 42);
      const t = el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'seat-chip gift' }, `gave ${o.contributions[seat.id]}`);
      const t2 = el('text', { x: cx, y: cy + 11, 'text-anchor': 'middle', class: 'seat-chip pay' }, `got ${o.payouts[seat.id]}`);
      g.append(t, t2);
    }
    const title = el('title', {}, `${seat.name}: ${p.balance} points`);
    g.append(title);
    svg.append(g);
  });
  // What a screen reader hears for the picture: the same facts, in words.
  const seatsSaid = G.seats.map((seat) => {
    const p = playerOf(G.game, seat.id);
    const ring = rep[seat.id] === 'good' ? ', gives medium or more on average' : rep[seat.id] === 'low' ? ', gives less than medium on average' : '';
    return `${seat.name} ${p.balance}${p.active ? '' : ' (left)'}${ring}`;
  }).join('; ');
  svg.setAttribute('aria-label', `The table, round ${round}: medium ${s.medium}, high ${s.high}.${o ? ` Average gift ${fmt(o.avg)}.` : ''} ${seatsSaid}. Commons reserve ${cm.reserve} of ${cm.start}.`);
}

function animatePool(target) {
  const to = Math.min(target, 1.15);
  const node = document.getElementById('pool-fill');
  if (reduceMotion || !node) { G.poolRatio = to; drawTable(); return; }
  const from = 0, t0 = performance.now(), dur = 700;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    G.poolRatio = from + (to - from) * e;
    const n = document.getElementById('pool-fill');
    if (n) n.setAttribute('r', Math.max(0.01, G.poolRatio * R_POOL));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- panel ----------
const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

const RESULT_TEXT = {
  fail: (o) => `The average gift was ${fmt(o.avg)}, short of ${o.stakes.medium}. The pool of ${o.pool} went to the Commons.`,
  base: (o) => o.commonsShort
    ? `The average reached medium, but the Commons had only enough left to give everyone ${o.payouts[Object.keys(o.payouts)[0]]}.`
    : `The average reached medium. The Commons added ${o.topUp} and everyone received ${o.payouts[Object.keys(o.payouts)[0]]}.`,
  bonus: (o) => o.commonsShort
    ? `The average was nearer high, but the Commons had only enough left to give everyone ${o.payouts[Object.keys(o.payouts)[0]]}.`
    : `The average was nearer high. The Commons added ${o.topUp} so everyone received ${o.stakes.high}.`,
};
const RESULT_TAG = { fail: 'Pool failed', base: 'Shared', bonus: 'Bonus' };

function renderPanel() {
  const panel = document.getElementById('panel');
  panel.replaceChildren();
  const you = playerOf(G.game, 'you');
  const o = G.outcome;

  if (G.watch) {
    panel.append(frag(`<div class="card"><div class="watch-bar">
      <span><b>Watching six bots.</b> The stand-in is playing ${esc(STRATEGIES[seatOf('you').strategy].label)}.</span>
      <label for="speed">Speed</label>
      <select id="speed"><option value="2200">Slow</option><option value="1400">Normal</option><option value="600">Fast</option></select>
    </div></div>`));
    const sel = panel.querySelector('#speed');
    sel.value = String(G.speed);
    sel.addEventListener('change', () => { G.speed = Number(sel.value); scheduleAuto(); });
  }

  if (G.phase === 'broke') {
    panel.append(renderBroke());
  } else if (G.phase !== 'ended') {
    const r = o ? o.round : G.game.round;
    const s = stakes(r);
    const card = frag(`<div class="card">
      <div class="status-row">
        <h2>Round ${r}</h2>
        <span class="muted small">${G.watch ? 'Stand-in' : 'Your'} points <span class="big">${you.balance}</span></span>
      </div>
      ${G.watch ? '' : `<div class="choices" role="group" aria-label="Your gift this round">
        ${['low', 'medium', 'high'].map((lv) => {
          const cant = G.phase === 'choose' && affordableLevel(lv, r, you.balance) !== lv;
          return `<button class="choice" type="button" id="choice-${lv}" data-level="${lv}" aria-pressed="${G.choice === lv}" ${G.phase !== 'choose' || cant ? 'disabled' : ''}>
            <span class="lbl">${lv === 'low' ? 'Nothing' : lv}</span><span class="amt">${s[lv]}</span>${cant ? '<span class="lbl">can\'t afford</span>' : ''}
          </button>`;
        }).join('')}
      </div>`}
      <div class="btn-row" id="actions"></div>
      <div id="outcome"></div>
    </div>`);
    panel.append(card);
    const actions = panel.querySelector('#actions');
    panel.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => { G.choice = b.dataset.level; render(); }));
    if (!G.watch && G.phase === 'choose') {
      actions.append(frag(`<button class="btn" type="button" id="reveal" ${G.choice ? '' : 'disabled'}>Reveal round ${r}</button>
        <span class="muted small" style="align-self:center">${G.choice ? '' : 'Choose a gift first.'}</span>`));
      actions.querySelector('#reveal').addEventListener('click', reveal);
    }
    if (o) {
      panel.querySelector('#outcome').append(frag(`<div class="outcome ${o.result}">
        <p><span class="tag ${o.result}">${RESULT_TAG[o.result]}</span></p>
        <p>${RESULT_TEXT[o.result](o)}</p>
        ${'you' in o.levels && !G.watch ? `<p class="muted small">You gave ${o.contributions.you} and received ${o.payouts.you}: ${signed(o.payouts.you - o.contributions.you)} this round.</p>` : ''}
      </div>`));
      if (!G.watch && G.phase === 'revealed') {
        actions.append(frag(`<button class="btn" type="button" id="stay">Stay for round ${o.round + 1}</button>
          <button class="btn ghost" type="button" id="leave">Leave with ${you.balance}</button>`));
        actions.querySelector('#stay').addEventListener('click', () => nextRound(true));
        actions.querySelector('#leave').addEventListener('click', () => nextRound(false));
      }
    }
  } else {
    panel.append(renderDebrief());
  }

}

const LEVEL_CODE = { low: '0', medium: 'M', high: 'H' };

function renderLog() {
  const box = document.getElementById('log');
  const rounds = G.game.rounds;
  const label = (id) => (id === 'you' && !G.watch ? 'You' : seatOf(id).name);
  const head = rounds.map((r) => `<th scope="col">R${r.round}</th>`).join('');
  const seatRows = G.seats.map((seat) => {
    const p = playerOf(G.game, seat.id);
    let gaveTotal = 0, gotTotal = 0, played = 0, levelSum = 0;
    const cells = rounds.map((r) => {
      if (!(seat.id in r.levels)) return '<td class="gone" title="Not at the table">·</td>';
      const lv = r.levels[seat.id], gave = r.contributions[seat.id], got = r.payouts[seat.id];
      gaveTotal += gave; gotTotal += got; played++; levelSum += LEVEL_INDEX[lv];
      const asked = r.downgraded?.[seat.id];
      const short = asked ? ` (wanted ${asked}, couldn't afford it)` : '';
      return `<td><span class="lv ${lv}" title="${esc(label(seat.id))}, round ${r.round}: chose ${lv === 'low' ? 'nothing' : lv}, gave ${gave}${short}, received ${got}">
        <span class="code">${LEVEL_CODE[lv]}</span>${gave}${asked ? '<span class="down" aria-hidden="true">↓</span>' : ''}</span></td>`;
    }).join('');
    const status = !p.active ? `<span class="muted small">left${p.leftAfterRound ? ` after R${p.leftAfterRound}` : ''}</span>` : '';
    const suspect = !G.watch && !seat.human && !G.checked
      ? `<select class="suspect" id="suspect-${seat.id}" data-id="${seat.id}" aria-label="Your guess for ${esc(seat.name)}">
          <option value="">Guess…</option>${STRATEGY_ORDER.map((k) => `<option value="${k}" ${G.guesses[seat.id] === k ? 'selected' : ''}>${esc(STRATEGIES[k].label)}</option>`).join('')}</select>`
      : '';
    return `<tr><th scope="row"><span class="who"><span class="dot" style="background:${seat.hue}"></span>${esc(label(seat.id))}</span>${status}${suspect}</th>
      ${cells}<td class="sum">${gaveTotal}</td><td class="sum">${gotTotal}</td>
      <td class="sum">${played ? fmt(Math.round((levelSum / played) * 100) / 100) : '–'}</td>
      <td class="sum strong">${p.balance}</td></tr>`;
  }).join('');
  const foot = (name, fn, title = '') => `<tr class="foot-row"><th scope="row" ${title ? `title="${title}"` : ''}>${name}</th>${rounds.map(fn).join('')}<td colspan="4"></td></tr>`;
  const commonsCell = (r) => {
    if (r.forfeited) return `<td class="pos" title="Forfeited pool received">+${r.forfeited}</td>`;
    if (r.topUp > 0) return `<td class="neg" title="Top-up paid${r.commonsShort ? ': all the Commons had left' : ''}">−${r.topUp}</td>`;
    if (r.topUp < 0) return `<td class="pos" title="Odd remainder kept">+${-r.topUp}</td>`;
    return '<td>0</td>';
  };
  box.replaceChildren(frag(`<div class="card">
    <div class="status-row"><h3>Round log</h3>
      <span class="legend small"><span class="lv low"><span class="code">0</span></span> nothing
      <span class="lv medium"><span class="code">M</span></span> medium
      <span class="lv high"><span class="code">H</span></span> high · number = points given · ↓ couldn't afford what they chose</span></div>
    ${rounds.length ? `<div class="log-wrap" id="log-scroll" tabindex="0" role="region" aria-label="Round log, scrolls sideways"><table class="grid">
      <thead><tr><th scope="col">Player</th>${head}<th scope="col" title="Total points given">Gave</th><th scope="col" title="Total points received">Got</th>
        <th scope="col" title="Average choice: 0 nothing, 1 medium, 2 high">Avg</th><th scope="col">Points</th></tr></thead>
      <tbody>${seatRows}</tbody>
      <tfoot>
        ${foot('Medium / high', (r) => `<td>${r.stakes.medium}/${r.stakes.high}</td>`)}
        ${foot('Pool', (r) => `<td>${r.pool}</td>`)}
        ${foot('Average gift', (r) => `<td>${fmt(Math.round(r.avg * 100) / 100)}</td>`)}
        ${foot('Result', (r) => `<td><span class="tag ${r.result}" title="${RESULT_TAG[r.result]}">${r.result === 'fail' ? '✕' : r.result === 'bonus' ? 'B' : 'S'}</span></td>`)}
        ${foot('Commons', commonsCell, 'Paid out as top-ups (−) or received from a failed pool (+)')}
        ${foot('Commons reserve', (r) => `<td class="${r.commonsShort || r.commonsAfter <= 0 ? 'neg' : ''}">${r.commonsAfter}</td>`)}
      </tfoot></table></div>
      <p class="muted small">The Commons started with ${G.game.commons.start}, has paid out ${G.game.commons.paidOut} in top-ups, and holds ${G.game.commons.reserve}. When it can't cover a top-up, the season ends. Result: S shared, B bonus, ✕ failed.</p>`
    : '<p class="muted small">Each player\'s choices will build up here round by round, so you can judge who to trust.</p>'}
  </div>`));
  box.querySelectorAll('select.suspect').forEach((sel) => sel.addEventListener('change', () => setGuess(sel.dataset.id, sel.value)));
  const wrap = box.querySelector('.log-wrap');
  if (wrap && rounds.length !== G.logRounds) { wrap.scrollLeft = wrap.scrollWidth; G.logRounds = rounds.length; } // show the latest round
}

// One guess per bot, shown in both the round log and the end-of-table check.
function setGuess(id, value) {
  G.guesses[id] = value;
  for (const sel of document.querySelectorAll(`#suspect-${id}, #guess-${id}`)) if (sel.value !== value) sel.value = value;
}

const STRATEGY_ORDER = Object.keys(FAMILIES).flatMap((f) => Object.keys(STRATEGIES).filter((k) => STRATEGIES[k].family === f));

function renderKey() {
  const groups = Object.entries(FAMILIES).map(([fam, name]) => {
    const items = STRATEGY_ORDER.filter((k) => STRATEGIES[k].family === fam);
    return `<div class="key-group"><div class="eyebrow">${esc(name)}</div>${items.map((k) => {
      const st = STRATEGIES[k];
      return `<div class="key-item"><b>${esc(st.label)}</b> <span>${esc(st.summary)}</span>
        <span class="key-tell"><span class="eyebrow">In the log</span> ${esc(st.tell)}</span></div>`;
    }).join('')}</div>`;
  }).join('');
  document.getElementById('key').replaceChildren(frag(`<p class="muted small key-note">Each table seats 5 of these 10, under random names.${G.watch ? '' : ' Use the Guess menus in the round log to mark who you think is who.'} Every strategy must pay in full: when one chooses a level it can't afford, it gives the highest level it can, marked ↓ in the log.</p>
    <div class="key-groups">${groups}</div>`));
}


const END_TEXT = {
  'pool-failed': (r) => `The pool fell short in round ${r}.${failCause()} Everything in the pool went to the Commons, and the table closed.`,
  'commons-exhausted': (r) => `The Commons ran dry in round ${r}. It paid out what it had left, and the season closed with the pool still alive.`,
  'season-end': (r) => `The season closed after round ${r}, with the pool still alive.`,
  'too-few': (r) => `Too few players stayed after round ${r} to keep the table going.`,
};

function commonsSummary(s) {
  const c = s.commons;
  const players = s.players.reduce((acc, p) => acc + p.balance - s.startBalance, 0);
  return `The Commons started with ${c.start}, paid ${c.paidOut} in top-ups, took back ${c.received}, and finished with ${c.reserve}. `
    + `Together the players finished ${signed(players)} on where they started. Every point the table gained came out of the Commons, and every point it lost went into it.`;
}

// What failed the pool in its last round: who chose nothing, and who couldn't afford what they
// chose (↓) (Jason, 2026-11-06, decision 7: name the cause, and that escalation is part of the lesson).
function failCause() {
  const r = G.game.rounds.at(-1);
  if (r?.result !== 'fail') return '';
  const who = (id) => (id === 'you' && !G.watch ? 'you' : seatOf(id).name);
  const list = (ids) => (ids.length <= 1 ? ids.join('') : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`);
  const ids = Object.keys(r.levels);
  const zeros = ids.filter((id) => r.levels[id] === 'low' && !r.downgraded?.[id]).map(who);
  const drops = ids.filter((id) => r.downgraded?.[id]).map(who);
  const parts = [];
  if (zeros.length) parts.push(`${list(zeros)} chose to give nothing`);
  if (drops.length) parts.push(`${list(drops)} couldn't afford what ${drops.length === 1 && drops[0] === 'you' ? 'you' : 'they'} chose (↓)`);
  if (!parts.length) return '';
  const said = parts.join(', and ');
  return ` ${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
}

function closingLead(s) {
  const last = s.rounds.at(-1)?.round ?? 0;
  if (G.humanLeftAfter === null) return END_TEXT[s.endReason](last);
  const a = G.afterYouLeft;
  return `You left after round ${G.humanLeftAfter} with ${playerOf(s, 'you').balance} points. ` +
    (a.rounds === 0 ? 'The table closed straight after.' :
      `The bots played ${a.rounds} more round${a.rounds === 1 ? '' : 's'} without you. ${END_TEXT[a.reason](last)}`);
}

function startOver() {
  saveWallet(START_BALANCE);
  newSession({ watch: false });
}

function renderBroke() {
  const piece = frag(`<div class="card debrief">
    <h2>Not enough points to join</h2>
    <p>You have ${walletMemory} point${walletMemory === 1 ? '' : 's'}. A table needs ${START_BALANCE} to join.</p>
    <p class="muted">Your points carry from table to table, so what you keep, give and lose adds up. You can watch the bots play, or start over with ${START_BALANCE} points.</p>
    <div class="btn-row"><button class="btn" type="button" id="start-over">Start over with ${START_BALANCE}</button>
      <button class="btn ghost" type="button" id="go-watch">Watch the bots</button></div>
  </div>`);
  piece.querySelector('#start-over').addEventListener('click', startOver);
  piece.querySelector('#go-watch').addEventListener('click', () => newSession({ watch: true }));
  return piece;
}

function renderDebrief() {
  const s = G.game;
  const ranking = G.seats.map((seat) => ({ seat, bal: playerOf(s, seat.id).balance })).sort((a, b) => b.bal - a.bal);
  const lead = closingLead(s);
  const piece = frag(`<div class="card debrief">
    <h2>Table closed</h2>
    <p>${esc(lead)}</p>
    <div class="log-wrap"><table><thead><tr><th>Player</th><th>Points</th><th>This table</th></tr></thead><tbody>
      ${ranking.map(({ seat, bal }) => `<tr><td><span class="who"><span class="dot" style="background:${seat.hue}"></span>${esc(seat.name)}</span></td>
        <td>${bal}</td>${(() => { const d = bal - playerOf(s, seat.id).start; return `<td class="${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${signed(d)}</td>`; })()}</tr>`).join('')}
    </tbody></table></div>
    <p>${commonsSummary(s)}</p>
    <p class="muted">Rising Pool is a threshold public good. In any single round, giving nothing pays you best, as long as enough others give. If too many reason that way, the pool fails and everyone loses what they put in. The stakes rise every round, so trust becomes worth more, and breaking it costs more. They also outrun what players hold: even a table that trusts completely runs out of points to give.</p>
  </div>`);
  const card = piece.firstElementChild;

  if (G.watch) {
    card.append(frag(`<div class="debrief"><h3>Who played what</h3>${G.seats.map((x) =>
      `<p class="small"><span class="who" style="display:inline-flex"><span class="dot" style="background:${x.hue}"></span>${esc(x.name)}</span>
       <b>${esc(STRATEGIES[x.strategy].label)}</b>: <span class="muted">${esc(STRATEGIES[x.strategy].summary)}</span></p>`).join('')}</div>`));
  }

  const mine = playerOf(s, 'you').balance;
  if (!G.watch) {
    saveWallet(mine);
    card.append(frag(mine >= START_BALANCE
      ? `<p><b>You take ${mine} points to your next table.</b></p>`
      : `<p><b>You have ${mine} point${mine === 1 ? '' : 's'} left.</b> A table needs ${START_BALANCE} to join, so this is as far as these points go.</p>`));
  }
  const canPlay = G.watch || mine >= START_BALANCE;
  card.append(frag(`<div class="btn-row">${canPlay
    ? `<button class="btn" type="button" id="again">${G.watch ? 'Watch another table' : `Play another table with ${mine}`}</button>`
    : `<button class="btn" type="button" id="again">Start over with ${START_BALANCE}</button>`}
    ${!G.watch && canPlay ? `<button class="btn ghost" type="button" id="reset">Start over with ${START_BALANCE}</button>` : ''}</div>`));
  card.querySelector('#again').addEventListener('click', () => (canPlay ? newSession({ watch: G.watch }) : startOver()));
  card.querySelector('#reset')?.addEventListener('click', startOver);
  return piece;
}

function renderProgress() {
  const have = store.load();
  if (store.complete(have)) unlock('centipede'); // players who finished before unlocks were stored
  const box = document.getElementById('ach-progress');
  box.innerHTML = `<span class="eyebrow">Achievements</span>${progressHtml(ACHIEVEMENTS, have, UNLOCK())}`;
  // Show on the left, Reset on the right, well apart (Jason, 2026-11-09).
  const row = document.createElement('div');
  row.className = 'ach-actions';
  row.append(showAchievementsButton());
  box.append(row);
  const list = document.getElementById('ach-list');
  if (list) list.innerHTML = achievementsListHtml(ACHIEVEMENTS, have, G?.earned ?? new Set(), { note: 'Easiest first.', ...UNLOCK() });
  row.append(resetControl({
    game: 'risingPool', keys: store.keys, count: ACHIEVEMENTS.filter((a) => have.has(a.id)).length,
    onChange: (reset) => { if (reset) { store.forget(); G.earned = new Set(); toast('Rising Pool achievements reset.', 6000); } render(); },
  }));
}

const fireworks = () => showFireworks({ colors: CELEBRATION_COLOURS });

const lbl = (k) => esc(STRATEGIES[k].label);
const listOf = (keys) => keys.map(lbl).join(', ');

// Read the table and Achievements sit in their own boxes below the game once a table closes.
function renderExtras() {
  const box = document.getElementById('extras');
  if (G.watch || G.phase !== 'ended') { box.replaceChildren(); return; }
  const bots = G.seats.filter((x) => !x.human);
  G.evidence ??= strategyEvidence(G.game, bots.map((b) => b.id));
  const rounds = G.game.rounds.length;

  const read = frag(`<section class="card extra" aria-labelledby="read-h"><h3 id="read-h">Read the table</h3>
    <p class="muted small">Each bot played one strategy from the key. A guess counts if that strategy would have made exactly the same moves: lookalikes count, because nothing at this table could tell them apart. These are the same guesses as in the round log.</p>
    ${rounds < MIN_READ_ROUNDS ? `<p class="muted small">This table lasted ${rounds} round${rounds === 1 ? '' : 's'}. You can check your reading, but the achievement needs ${MIN_READ_ROUNDS} or more.</p>` : ''}
    <div class="guess-list" id="guesses"></div>
    <div class="btn-row"><button class="btn" type="button" id="check" ${G.checked ? 'disabled' : ''}>${G.checked ? 'Checked' : 'Check my reading'}</button></div>
  </section>`);
  const list = read.querySelector('#guesses');
  for (const b of bots) {
    const ev = G.evidence[b.id];
    const g = G.guesses[b.id];
    let verdict = '';
    if (G.checked) {
      const fits = guessFits(ev, g, b.strategy);
      let head, body;
      if (!g) { head = '<span class="miss">No guess.</span>'; body = `It was <b>${lbl(b.strategy)}</b>.`; }
      else if (g === b.strategy) { head = '<span class="ok">Right.</span>'; body = `It was <b>${lbl(b.strategy)}</b>.`; }
      else if (fits) { head = '<span class="ok">Fits the evidence.</span>'; body = `It was <b>${lbl(b.strategy)}</b>, which made the same moves as ${lbl(g)} at this table.`; }
      else {
        const m = ev.misses[g];
        const why = !m ? '' : m.kind === 'move'
          ? `In round ${m.round}, ${lbl(g)} would have given ${m.expected === 'low' ? 'nothing' : m.expected}; ${esc(b.name)} gave ${m.actual === 'low' ? 'nothing' : m.actual}.`
          : `After round ${m.round}, ${lbl(g)} would have ${m.expected === 'leave' ? 'left' : 'stayed'}; ${esc(b.name)} ${m.actual === 'leave' ? 'left' : 'stayed'}.`;
        head = '<span class="miss">Doesn\'t fit.</span>'; body = `${why} It was <b>${lbl(b.strategy)}</b>.`;
      }
      const others = ev.fits.filter((k) => k !== b.strategy && k !== g);
      const downs = G.game.rounds.filter((r) => r.downgraded?.[b.id]);
      const downNote = downs.length
        ? ` Its ${downs.length === 1 ? 'move' : 'moves'} in round${downs.length === 1 ? '' : 's'} ${downs.map((r) => r.round).join(', ')} ${downs.length === 1 ? 'was a drop' : 'were drops'} (↓): it chose ${downs[0].downgraded[b.id]} but couldn't afford it.`
        : '';
      verdict = `<div class="reveal">${head} ${body}${downNote}${others.length ? ` <span class="muted">Also fits: ${listOf(others)}.</span>` : ''}</div>`;
    }
    const row = frag(`<div class="guess-row">
      <span class="who"><span class="dot" style="background:${b.hue}"></span>${esc(b.name)}</span>
      <select id="guess-${b.id}" ${G.checked ? 'disabled' : ''} aria-label="Your guess for ${esc(b.name)}"><option value="">Not sure</option>
        ${STRATEGY_ORDER.map((k) => `<option value="${k}" ${g === k ? 'selected' : ''}>${lbl(k)}</option>`).join('')}</select>
      ${verdict}</div>`);
    row.querySelector('select').addEventListener('change', (e) => setGuess(b.id, e.target.value));
    list.append(row);
  }
  read.querySelector('#check').addEventListener('click', () => {
    G.checked = true;
    const allFit = bots.every((b) => guessFits(G.evidence[b.id], G.guesses[b.id], b.strategy));
    if (allFit && rounds >= MIN_READ_ROUNDS) earn('read-table');
    render();
    const fit = bots.filter((b) => guessFits(G.evidence[b.id], G.guesses[b.id], b.strategy)).length;
    announce(`Read the table: ${fit} of ${bots.length} guesses fit the evidence. Each verdict is under its bot.`);
  });

  const have = store.load();
  const extra = [];
  if (store.complete(have)) {
    const card = frag(`<section class="card extra unlocked" aria-labelledby="unlock-h">
      <div class="eyebrow">All achievements</div>
      <h3 id="unlock-h">Game 2 unlocked</h3>
      <p>You've demonstrated skill and understanding in social dilemma strategies: holding a pool together, reading who is who, and seeing when leaving costs others.</p>
      <div class="btn-row"><a class="btn" href="../centipede-ultimatum/">Play Centipede &amp; Ultimatum</a><button class="btn ghost" type="button" id="celebrate-again">Celebrate again</button></div>
    </section>`);
    card.querySelector('#celebrate-again').addEventListener('click', () => fireworks());
    extra.push(card);
  }
  const ach = frag(achievementsCardHtml(ACHIEVEMENTS, have, G.earned, { note: 'Easiest first.', ...UNLOCK() }));
  G.moments ??= pickMoments(tableMoments(G.game, {
    names: Object.fromEntries(G.seats.map((x) => [x.id, x.human ? 'you' : x.name])),
    strategies: Object.fromEntries(G.seats.filter((x) => !x.human).map((x) => [x.id, x.strategy])),
    leftAfter: G.humanLeftAfter,
  }));
  const showed = G.moments.length ? frag(momentsCardHtml(G.moments)) : null;
  box.replaceChildren(...extra, ...(showed ? [showed] : []), read, ach);
}

function render() {
  keepFocus(() => {
    renderProgress();
    drawTable();
    renderPanel();
    renderExtras();
    renderLog();
    renderKey();
  }, ['panel', 'extras', 'log', 'ach-progress', 'key']);
  const w = document.getElementById('watch-toggle');
  w.setAttribute('aria-pressed', String(G.watch));
  w.textContent = G.watch ? 'Play yourself' : 'Watch the bots';
  if (G.celebrateNow) {
    G.celebrateNow = false;
    fireworks();
    if (G.phase !== 'ended') toast('All five achievements! Game 2 is unlocked. Finish this table to see your reward.', 6000);
    else document.getElementById('extras').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

document.getElementById('new-game').addEventListener('click', () => newSession({ watch: G.watch }));
document.getElementById('watch-toggle').addEventListener('click', () => newSession({ watch: !G.watch }));
rememberToggle('how-it-works', 'trunk.risingPool');
rememberToggle('achievements-list', 'trunk.risingPool');
wireCollapse();
rememberToggle('strategy-key', 'trunk.risingPool');
newSession();
