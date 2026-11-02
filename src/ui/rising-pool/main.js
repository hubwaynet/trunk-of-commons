// Rising Pool — browser UI. One human seat plus five strategy bots, or six bots in watch mode.
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, resolveRound, applyStayDecisions, stakes, activePlayers, LEVEL_INDEX } from '../../engine/rising-pool.js';
import { STRATEGIES, botView, selectRoster } from '../../bots/rising-pool-bots.js';
import { mulberry32, newSeed, randInt, shuffle } from '../../engine/rng.js';

const START_BALANCE = 20;
const NAMES = ['Wren', 'Quoll', 'Tern', 'Moss', 'Ember', 'Reed', 'Kestrel', 'Fig', 'Banksia', 'Curlew'];
const HUES = ['#d1386f', '#d9741c', '#6fa52a', '#1f9c66', '#2f78cc', '#7650c8']; // rose, orange, chartreuse, spring, azure, violet
const HUMAN_HUE = '#a06f17';
const SVGNS = 'http://www.w3.org/2000/svg';
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACH_KEY = 'trunk.risingPool.achievements';

const ACHIEVEMENTS = [
  { id: 'held-line', name: 'Held the line', text: 'Gave high in a round the pool would have failed without you.' },
  { id: 'rising-tide', name: 'Rising tide', text: 'Three bonus rounds in a row while you were at the table.' },
  { id: 'season', name: 'Season survivor', text: 'Stayed until the season closed, with the pool still alive.' },
  { id: 'read-table', name: 'Read the table', text: 'Named at least four of the five bot strategies correctly.' },
  { id: 'timed-exit', name: 'Timed the exit', text: 'Left ahead, and the pool failed after you went. Was that fair?' },
];

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
  const endRound = randInt(rng, 7, 12);
  const game = createGame({ players: seats.map((s) => ({ id: s.id })), seed, startBalance: START_BALANCE, endRound });
  const agents = {};
  for (const s of seats) if (s.strategy) agents[s.id] = STRATEGIES[s.strategy].create(rng);
  G = {
    seed, rng, seats, game, agents, watch,
    phase: 'choose', choice: null, outcome: null, timer: null,
    humanLeftAfter: null, afterYouLeft: null,
    guesses: {}, checked: false, speed: 1400,
    poolRatio: 0, earned: new Set(),
  };
  render();
  if (watch) scheduleAuto();
}

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
  const before = G.game;
  const { state, outcome } = resolveRound(before, choices);
  G.game = state;
  G.outcome = outcome;
  if (humanPlays) checkRoundAchievements(before, outcome);
  G.phase = state.status === 'ended' ? 'ended' : 'revealed';
  if (G.phase === 'ended' && !G.watch) checkEndAchievements();
  render();
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
}

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

// ---------- achievements ----------
function loadAch() {
  try { return new Set(JSON.parse(localStorage.getItem(ACH_KEY) || '[]')); } catch { return new Set(); }
}
function earn(id) {
  G.earned.add(id);
  const all = loadAch();
  all.add(id);
  try { localStorage.setItem(ACH_KEY, JSON.stringify([...all])); } catch { /* storage unavailable */ }
}
function checkRoundAchievements(before, o) {
  if (o.result !== 'fail' && o.levels.you === 'high') {
    const withoutYou = (o.pool - o.contributions.you) / o.n;
    if (withoutYou < o.stakes.medium) earn('held-line');
  }
  const mine = G.game.rounds.filter((r) => 'you' in r.levels).slice(-3);
  if (mine.length === 3 && mine.every((r) => r.result === 'bonus')) earn('rising-tide');
}
function checkEndAchievements() {
  const s = G.game;
  if (s.endReason === 'season-end' && G.humanLeftAfter === null) earn('season');
  if (G.humanLeftAfter !== null && G.afterYouLeft?.reason === 'pool-failed'
      && playerOf(s, 'you').balance > s.startBalance) earn('timed-exit');
}

// ---------- reputation ----------
function reputation() {
  const sums = {}, counts = {};
  let total = 0, n = 0;
  for (const r of G.game.rounds) for (const [id, lv] of Object.entries(r.levels)) {
    const v = LEVEL_INDEX[lv];
    sums[id] = (sums[id] || 0) + v; counts[id] = (counts[id] || 0) + 1; total += v; n++;
  }
  const tableMean = n ? total / n : null;
  const rep = {};
  for (const s of G.seats) rep[s.id] = counts[s.id] ? (sums[s.id] / counts[s.id] >= tableMean - 1e-9 ? 'good' : 'low') : 'none';
  return rep;
}

// ---------- drawing ----------
function el(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
const C = 200, R_SEAT = 138, R_POOL = 70;
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

  // seats
  G.seats.forEach((seat, i) => {
    const p = playerOf(G.game, seat.id);
    const deg = 90 + i * 60;
    const [x, y] = polar(deg, R_SEAT);
    const g = el('g', { class: p.active || (o && seat.id in o.levels) ? 'seat' : 'seat left' });
    const repColor = rep[seat.id] === 'good' ? 'var(--good)' : rep[seat.id] === 'low' ? 'var(--low)' : 'var(--line)';
    g.append(el('circle', { cx: x, cy: y, r: 27, class: 'seat-rep', stroke: repColor }));
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
const signed = (x) => (x > 0 ? `+${x}` : String(x));
function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const RESULT_TEXT = {
  fail: (o) => `The average gift was ${fmt(o.avg)}, short of ${o.stakes.medium}. The pool of ${o.pool} went to the Commons.`,
  base: (o) => `The average reached medium. The Commons added ${o.topUp} and everyone received ${o.payouts[Object.keys(o.payouts)[0]]}.`,
  bonus: (o) => `The average was nearer high. The Commons added ${o.topUp} so everyone received ${o.stakes.high}.`,
};
const RESULT_TAG = { fail: 'Pool failed', base: 'Shared', bonus: 'Bonus' };

function renderPanel() {
  const panel = document.getElementById('panel');
  panel.replaceChildren();
  const you = playerOf(G.game, 'you');
  const o = G.outcome;

  if (G.watch) {
    panel.append(h(`<div class="card"><div class="watch-bar">
      <span><b>Watching six bots.</b> The stand-in is playing ${esc(STRATEGIES[seatOf('you').strategy].label)}.</span>
      <label for="speed">Speed</label>
      <select id="speed"><option value="2200">Slow</option><option value="1400">Normal</option><option value="600">Fast</option></select>
    </div></div>`));
    const sel = panel.querySelector('#speed');
    sel.value = String(G.speed);
    sel.addEventListener('change', () => { G.speed = Number(sel.value); scheduleAuto(); });
  }

  if (G.phase !== 'ended') {
    const r = o ? o.round : G.game.round;
    const s = stakes(r);
    const card = h(`<div class="card">
      <div class="status-row">
        <h2>Round ${r}</h2>
        <span class="muted small">${G.watch ? 'Stand-in' : 'Your'} points <span class="big">${you.balance}</span></span>
      </div>
      ${G.watch ? '' : `<div class="choices" role="group" aria-label="Your gift this round">
        ${['low', 'medium', 'high'].map((lv) => {
          const amt = Math.min(s[lv], o ? Infinity : you.balance);
          const capped = !o && s[lv] > you.balance;
          return `<button class="choice" type="button" id="choice-${lv}" data-level="${lv}" aria-pressed="${G.choice === lv}" ${G.phase !== 'choose' ? 'disabled' : ''}>
            <span class="lbl">${lv === 'low' ? 'Nothing' : lv}</span><span class="amt">${amt}</span>${capped ? '<span class="lbl">all you have</span>' : ''}
          </button>`;
        }).join('')}
      </div>`}
      <div class="btn-row" id="actions"></div>
      <div id="outcome" aria-live="polite"></div>
    </div>`);
    panel.append(card);
    const actions = panel.querySelector('#actions');
    panel.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => { G.choice = b.dataset.level; render(); }));
    if (!G.watch && G.phase === 'choose') {
      actions.append(h(`<button class="btn" type="button" id="reveal" ${G.choice ? '' : 'disabled'}>Reveal round ${r}</button>
        <span class="muted small" style="align-self:center">${G.choice ? '' : 'Choose a gift first.'}</span>`));
      actions.querySelector('#reveal').addEventListener('click', reveal);
    }
    if (o) {
      panel.querySelector('#outcome').append(h(`<div class="outcome ${o.result}">
        <p><span class="tag ${o.result}">${RESULT_TAG[o.result]}</span></p>
        <p>${RESULT_TEXT[o.result](o)}</p>
        ${'you' in o.levels && !G.watch ? `<p class="muted small">You gave ${o.contributions.you} and received ${o.payouts.you}: ${signed(o.payouts.you - o.contributions.you)} this round.</p>` : ''}
      </div>`));
      if (!G.watch && G.phase === 'revealed') {
        actions.append(h(`<button class="btn" type="button" id="stay">Stay for round ${o.round + 1}</button>
          <button class="btn ghost" type="button" id="leave">Leave with ${you.balance}</button>`));
        actions.querySelector('#stay').addEventListener('click', () => nextRound(true));
        actions.querySelector('#leave').addEventListener('click', () => nextRound(false));
      }
    }
  } else {
    panel.append(renderDebrief());
  }

  panel.append(renderLog());
}

function renderLog() {
  const rows = G.game.rounds.map((r) => {
    const mine = 'you' in r.levels ? r.payouts.you - r.contributions.you : null;
    return `<tr><td>${r.round}</td><td>${r.n}</td><td>${r.pool}</td><td>${fmt(r.avg)}</td>
      <td><span class="tag ${r.result}">${RESULT_TAG[r.result]}</span></td>
      <td class="${mine > 0 ? 'pos' : mine < 0 ? 'neg' : ''}">${mine === null ? '–' : signed(mine)}</td></tr>`;
  }).join('');
  return h(`<div class="card"><h3>Round log</h3><div class="log-wrap"><table>
    <thead><tr><th>Round</th><th>Players</th><th>Pool</th><th>Avg</th><th>Result</th><th>${G.watch ? 'Stand-in' : 'You'}</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">No rounds played yet.</td></tr>'}</tbody></table></div></div>`);
}

const END_TEXT = {
  'pool-failed': (r) => `The pool fell short in round ${r}. Everything in it went to the Commons, and the table closed.`,
  'season-end': (r) => `The season closed after round ${r}, with the pool still alive.`,
  'too-few': (r) => `Too few players stayed after round ${r} to keep the table going.`,
};

function renderDebrief() {
  const s = G.game;
  const last = s.rounds.at(-1)?.round ?? 0;
  const ranking = G.seats.map((seat) => ({ seat, bal: playerOf(s, seat.id).balance })).sort((a, b) => b.bal - a.bal);
  let lead;
  if (G.humanLeftAfter !== null) {
    const a = G.afterYouLeft;
    lead = `You left after round ${G.humanLeftAfter} with ${playerOf(s, 'you').balance} points. ` +
      (a.rounds === 0 ? 'The table closed straight after.' :
        `The bots played ${a.rounds} more round${a.rounds === 1 ? '' : 's'} without you. ${END_TEXT[a.reason](last)}`);
  } else {
    lead = END_TEXT[s.endReason](last);
  }
  const frag = h(`<div class="card debrief">
    <h2>Table closed</h2>
    <p>${esc(lead)}</p>
    <div class="log-wrap"><table><thead><tr><th>Player</th><th>Points</th><th>Net</th></tr></thead><tbody>
      ${ranking.map(({ seat, bal }) => `<tr><td><span class="who"><span class="dot" style="background:${seat.hue}"></span>${esc(seat.name)}</span></td>
        <td>${bal}</td><td class="${bal > s.startBalance ? 'pos' : bal < s.startBalance ? 'neg' : ''}">${signed(bal - s.startBalance)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted">Rising Pool is a threshold public good. In any single round, giving nothing pays you best, as long as enough others give. If too many reason that way, the pool fails and everyone loses what they put in. The stakes rise every round, so trust becomes worth more, and breaking it costs more.</p>
  </div>`);
  const card = frag.firstElementChild;

  if (!G.watch) {
    const bots = G.seats.filter((x) => !x.human);
    G.guessOptions ??= shuffle(G.rng, bots.map((b) => b.strategy));
    const options = G.guessOptions;
    const guess = h(`<div class="debrief"><h3>Read the table</h3>
      <p class="muted small">Each bot played one strategy. Which was which?</p>
      <div class="debrief" id="guesses"></div>
      <div class="btn-row"><button class="btn" type="button" id="check" ${G.checked ? 'disabled' : ''}>Check my reading</button></div></div>`);
    const box = guess.querySelector('#guesses');
    for (const b of bots) {
      const row = h(`<div class="guess-row">
        <span class="who"><span class="dot" style="background:${b.hue}"></span>${esc(b.name)}</span>
        <select id="guess-${b.id}" ${G.checked ? 'disabled' : ''}><option value="">Not sure</option>
          ${options.map((k) => `<option value="${k}" ${G.guesses[b.id] === k ? 'selected' : ''}>${esc(STRATEGIES[k].label)}</option>`).join('')}</select>
        ${G.checked ? `<div class="reveal"><span class="${G.guesses[b.id] === b.strategy ? 'ok' : 'miss'}">${G.guesses[b.id] === b.strategy ? 'Right.' : 'Not quite.'}</span>
          <b>${esc(STRATEGIES[b.strategy].label)}</b>: ${esc(STRATEGIES[b.strategy].summary)}</div>` : ''}
      </div>`);
      row.querySelector('select').addEventListener('change', (e) => { G.guesses[b.id] = e.target.value; });
      box.append(row);
    }
    guess.querySelector('#check').addEventListener('click', () => {
      G.checked = true;
      const right = bots.filter((b) => G.guesses[b.id] === b.strategy).length;
      if (right >= 4) earn('read-table');
      render();
    });
    card.append(guess);

    const have = loadAch();
    card.append(h(`<div class="debrief"><h3>Achievements</h3><ul class="achievements">
      ${ACHIEVEMENTS.map((a) => `<li class="${have.has(a.id) ? '' : 'locked'}"><span class="badge">${have.has(a.id) ? (G.earned.has(a.id) ? 'NEW' : 'DONE') : '····'}</span>
        <span><b>${esc(a.name)}</b> ${esc(a.text)}</span></li>`).join('')}
    </ul></div>`));
  } else {
    card.append(h(`<div class="debrief"><h3>Who played what</h3>${G.seats.map((x) =>
      `<p class="small"><span class="who" style="display:inline-flex"><span class="dot" style="background:${x.hue}"></span>${esc(x.name)}</span>
       <b>${esc(STRATEGIES[x.strategy].label)}</b>: <span class="muted">${esc(STRATEGIES[x.strategy].summary)}</span></p>`).join('')}</div>`));
  }

  card.append(h(`<div class="btn-row"><button class="btn" type="button" id="again">${G.watch ? 'Watch another table' : 'Play another table'}</button></div>`));
  card.querySelector('#again').addEventListener('click', () => newSession({ watch: G.watch }));
  return frag;
}

function render() {
  drawTable();
  renderPanel();
  const w = document.getElementById('watch-toggle');
  w.setAttribute('aria-pressed', String(G.watch));
  w.textContent = G.watch ? 'Play yourself' : 'Watch the bots';
}

document.getElementById('new-game').addEventListener('click', () => newSession({ watch: G.watch }));
document.getElementById('watch-toggle').addEventListener('click', () => newSession({ watch: !G.watch }));
newSession();
