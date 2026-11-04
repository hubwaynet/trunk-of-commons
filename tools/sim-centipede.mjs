// Headless simulation of Centipede & Ultimatum with bot-only tables.
// Usage: node tools/sim-centipede.mjs [tables] [mix] [options-json]
//   mix: "random" (a varied roster of 6, default) or a comma list of 6 strategy keys.
//   options: engine options, e.g. '{"onReject":"grabberOut","firstGrabRound":2}'
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, currentPlayer, act, divide, vote, stay } from '../src/engine/centipede-ultimatum.js';
import { STRATEGIES, botView, selectRoster } from '../src/bots/centipede-ultimatum-bots.js';
import { mulberry32 } from '../src/engine/rng.js';

export function playTable(keys, seed, opts = {}) {
  const rng = mulberry32(seed);
  const ids = keys.map((k, i) => `${k}#${i}`);
  const inst = Object.fromEntries(ids.map((id, i) => [id, STRATEGIES[keys[i]].create(rng)]));
  let s = createGame({ players: ids.map((id) => ({ id })), seed, ...opts });
  let guard = 0;
  const actives = () => s.players.filter((x) => x.active);
  while (s.status === 'playing' && guard++ < 20000) {
    if (s.phase === 'turn') {
      const id = currentPlayer(s);
      s = act(s, id, inst[id].turn(botView(s, id)));
    } else if (s.phase === 'divide') {
      const g = s.ultimatum.grabber;
      s = divide(s, inst[g].divide(botView(s, g)));
    } else if (s.phase === 'vote') {
      s = vote(s, Object.fromEntries(actives().map((p) => [p.id, inst[p.id].vote(botView(s, p.id))])));
    } else if (s.phase === 'stay') {
      s = stay(s, Object.fromEntries(actives().map((p) => [p.id, inst[p.id].stay ? inst[p.id].stay(botView(s, p.id)) : true])));
    }
  }
  return s;
}

export function simulate(tables, mix = 'random', opts = {}) {
  const st = {
    tables, ends: {}, rounds: [], ults: 0, results: {}, ultsPerTable: [], firstGrab: [], poolAtGrab: [],
    freeZeroDecided: 0, passes: 0, moves: 0, satOut: 0, grabberOut: 0, commonsEnd: [], per: {},
  };
  const bump = (o, k, by = 1) => (o[k] = (o[k] ?? 0) + by);
  for (let t = 0; t < tables; t++) {
    const keys = mix === 'random' ? selectRoster(mulberry32(1000 + t), 6) : mix.split(',');
    const s = playTable(keys, 1000 + t, opts);
    bump(st.ends, s.endReason);
    st.rounds.push(s.round > s.rounds.length ? s.rounds.length : s.round);
    st.commonsEnd.push(s.commons.reserve);
    for (const r of s.rounds) for (const m of r.moves) { st.moves++; if (m.move === 'pass') st.passes++; }
    const ults = s.rounds.filter((r) => r.result === 'ultimatum').map((r) => r.ultimatum);
    st.ultsPerTable.push(ults.length);
    if (ults.length) st.firstGrab.push(ults[0].round);
    st.satOut += s.players.filter((p) => p.leftBecause === 'chose').length;
    st.grabberOut += s.players.filter((p) => p.leftBecause === 'rejected').length;
    for (const u of ults) {
      st.ults++;
      bump(st.results, u.result);
      st.poolAtGrab.push(u.pool);
      if (u.result === 'rejected') {
        const n = Object.keys(u.shares).length;
        const sum = Object.values(u.votes).reduce((a, b) => a + b, 0);
        const fairZeros = Object.entries(u.votes).filter(([id, v]) => v === 0 && u.shares[id] >= Math.floor(u.pool / n)).length;
        if (sum + fairZeros >= n) st.freeZeroDecided++;
      }
    }
    for (const p of s.players) {
      const k = p.id.split('#')[0];
      const ps = (st.per[k] ??= { seats: 0, net: 0, grabs: 0, rounds: 0 });
      ps.seats++;
      ps.net += p.balance - p.start;
      ps.grabs += ults.filter((u) => u.grabber === p.id).length;
    }
  }
  return st;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

export function report(st, title = '') {
  const pct = (x, of = st.tables) => `${((100 * x) / of).toFixed(0)}%`;
  const lines = [];
  lines.push(`== ${title} (${st.tables} tables)`);
  lines.push(`Rounds: median ${median(st.rounds)}, mean ${mean(st.rounds).toFixed(1)}; 8+ rounds ${pct(st.rounds.filter((r) => r >= 8).length)}; over in round 1-2 ${pct(st.rounds.filter((r) => r <= 2).length)}`);
  lines.push(`Ends: ${Object.entries(st.ends).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  lines.push(`Splits per table ${mean(st.ultsPerTable).toFixed(1)}; ${Object.entries(st.results).map(([k, v]) => `${k} ${pct(v, st.ults)}`).join(', ')}; first grab round median ${median(st.firstGrab)}; pool at grab median ${median(st.poolAtGrab)}`);
  lines.push(`Rejections a fairly-treated 0 decided: ${pct(st.freeZeroDecided, st.results.rejected ?? 1)}; turns passed broke ${pct(st.passes, st.moves)}; chose to sit out ${(st.satOut / st.tables).toFixed(2)}/table; grabbers sent out ${(st.grabberOut / st.tables).toFixed(2)}/table; Commons at end median ${median(st.commonsEnd)}`);
  const rows = Object.entries(st.per).sort((a, b) => b[1].net / b[1].seats - a[1].net / a[1].seats);
  lines.push('Net per seat: ' + rows.map(([k, v]) => `${STRATEGIES[k].label} ${(v.net / v.seats).toFixed(1)}`).join(' · '));
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = JSON.parse(process.argv[4] ?? '{}');
  console.log(report(simulate(Number(process.argv[2] ?? 3000), process.argv[3] ?? 'random', opts), JSON.stringify(opts)));
}
