// Headless simulation of Centipede & Ultimatum with bot-only tables.
// Usage: node tools/sim-centipede.mjs [tables] [mix]
//   mix: "random" (6 of the 9 strategies, default) or a comma list of 6 strategy keys.
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, currentPlayer, act, divide, vote, stay } from '../src/engine/centipede-ultimatum.js';
import { STRATEGIES, botView, botDivision, selectRoster } from '../src/bots/centipede-ultimatum-bots.js';
import { mulberry32 } from '../src/engine/rng.js';

export function playTable(keys, seed, opts = {}) {
  const rng = mulberry32(seed);
  const ids = keys.map((k, i) => `${k}#${i}`);
  const inst = Object.fromEntries(ids.map((id, i) => [id, STRATEGIES[keys[i]].create(rng)]));
  let s = createGame({ players: ids.map((id) => ({ id })), seed, ...opts });
  let guard = 0;
  while (s.status === 'playing' && guard++ < 10000) {
    if (s.phase === 'turn') {
      const id = currentPlayer(s);
      s = act(s, id, inst[id].turn(botView(s, id)));
    } else if (s.phase === 'divide') {
      const g = s.ultimatum.grabber;
      s = divide(s, botDivision(s, g, inst[g]));
    } else if (s.phase === 'vote') {
      const votes = {};
      for (const p of s.players.filter((x) => x.active)) votes[p.id] = inst[p.id].vote(botView(s, p.id));
      s = vote(s, votes);
    } else if (s.phase === 'stay') {
      const d = {};
      for (const p of s.players.filter((x) => x.active)) d[p.id] = inst[p.id].stay ? inst[p.id].stay(botView(s, p.id)) : true;
      s = stay(s, d);
    }
  }
  return s;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const tables = Number(process.argv[2] ?? 3000);
  const mix = process.argv[3] ?? 'random';
  const opts = JSON.parse(process.argv[4] ?? '{}');
  const stats = {
    ends: {}, rounds: [], ults: 0, ultResults: {}, firstGrabRound: [], forced: 0, ultsPerTable: [],
    rejectByFreeVote: 0, rejectByBroke: 0, roundOneEnd: 0, keptRatioAccepted: [], keptRatioRejected: [], poolAtGrab: [], leftTables: 0,
    perStrategy: {}, commonsEnd: [],
  };
  const bump = (o, k) => (o[k] = (o[k] ?? 0) + 1);
  for (let t = 0; t < tables; t++) {
    const rng = mulberry32(1000 + t);
    const keys = mix === 'random' ? selectRoster(rng, 6) : mix.split(',');
    const s = playTable(keys, 1000 + t, opts);
    bump(stats.ends, s.endReason);
    stats.rounds.push(s.rounds.length);
    stats.commonsEnd.push(s.commons.reserve);
    const ults = s.rounds.filter((r) => r.result === 'ultimatum').map((r) => r.ultimatum);
    stats.ultsPerTable.push(ults.length);
    if (ults.length) stats.firstGrabRound.push(ults[0].round);
    if (s.players.some((p) => p.leftAfterRound !== null)) stats.leftTables++;
    if (s.rounds.length === 1) stats.roundOneEnd++;
    for (const u of ults) {
      stats.ults++;
      bump(stats.ultResults, u.result);
      if (u.forced) stats.forced++;
      stats.poolAtGrab.push(u.pool);
      const n = Object.keys(u.shares).length;
      const ratio = u.pool ? u.shares[u.grabber] / (u.pool / n) : 1;
      (u.result === 'rejected' ? stats.keptRatioRejected : stats.keptRatioAccepted).push(ratio);
      if (u.result === 'rejected') {
        // would it have passed if the zero-voters who were treated fairly had voted 1?
        const sum = Object.values(u.votes).reduce((a, b) => a + b, 0);
        const fairZeros = Object.entries(u.votes).filter(([id, v]) => v === 0 && u.shares[id] >= Math.floor(u.pool / n)).length;
        if (sum < n && sum + fairZeros >= n) stats.rejectByFreeVote++;
        const brokeShort = Object.entries(u.capped).reduce((a, [id, want]) => a + want - u.votes[id], 0);
        if (sum < n && sum + brokeShort >= n) stats.rejectByBroke++;
      }
    }
    for (const p of s.players) {
      const k = p.id.split('#')[0];
      const ps = (stats.perStrategy[k] ??= { tables: 0, net: 0, grabs: 0 });
      ps.tables++;
      ps.net += p.balance - p.start;
      ps.grabs += ults.filter((u) => u.grabber === p.id).length;
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const pct = (x) => `${((100 * x) / tables).toFixed(1)}%`;
  console.log(`Tables: ${tables}  mix: ${mix}  options: ${JSON.stringify(opts)}`);
  console.log('End reasons:', Object.fromEntries(Object.entries(stats.ends).map(([k, v]) => [k, pct(v)])));
  console.log(`Rounds played: median ${median(stats.rounds)}, mean ${mean(stats.rounds).toFixed(1)}`);
  console.log(`Ultimatums per table: mean ${mean(stats.ultsPerTable).toFixed(2)}; first grab round median ${median(stats.firstGrabRound)}`);
  console.log('Ultimatum results:', Object.fromEntries(Object.entries(stats.ultResults).map(([k, v]) => [k, `${((100 * v) / stats.ults).toFixed(1)}%`])));
  console.log(`Forced grabs (couldn't afford to give): ${((100 * stats.forced) / stats.ults).toFixed(1)}% of ultimatums`);
  console.log(`Pool at grab: median ${median(stats.poolAtGrab)}, mean ${mean(stats.poolAtGrab).toFixed(1)}`);
  console.log(`Grabber kept (× fair share): accepted mean ${mean(stats.keptRatioAccepted).toFixed(2)}, rejected mean ${mean(stats.keptRatioRejected).toFixed(2)}`);
  console.log(`Rejections that fairly-treated 0-voters could have passed: ${stats.rejectByFreeVote} of ${stats.ultResults.rejected ?? 0}`);
  console.log(`Rejections caused by players too broke to pay the vote they wanted: ${stats.rejectByBroke}`);
  console.log(`Tables over in round 1: ${pct(stats.roundOneEnd)}`);
  console.log(`Tables where someone sat out: ${pct(stats.leftTables)}; Commons at end: median ${median(stats.commonsEnd)}`);
  console.log('Per strategy (mean net per table, grabs per table):');
  for (const [k, v] of Object.entries(stats.perStrategy).sort((a, b) => b[1].net / b[1].tables - a[1].net / a[1].tables)) {
    console.log(`  ${STRATEGIES[k].label.padEnd(14)} net ${(v.net / v.tables).toFixed(1).padStart(6)}  grabs ${(v.grabs / v.tables).toFixed(2)}  (${v.tables} seats)`);
  }
}
