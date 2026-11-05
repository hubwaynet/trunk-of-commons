// Estimate how hard each Centipede & Ultimatum achievement is. The human seat is played by a
// mix of plausible learner styles against five bots.
// Usage: node tools/sim-centipede-achievements.mjs [tables] [options-json]
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, currentPlayer, act, divide, vote, stay, splitBy } from '../src/engine/centipede-ultimatum.js';
import { STRATEGIES, botView, selectRoster } from '../src/bots/centipede-ultimatum-bots.js';
import { mulberry32 } from '../src/engine/rng.js';
import { ACHIEVEMENTS, tableAchievements } from '../src/ui/centipede-ultimatum/achievements.js';

// Learner styles. Each judges others like a fair-minded player: 2 for at least an equal share,
// 1 for at least half, else 0. They differ in when they grab, how they split, and their own vote.
const judgeFair = (v) => (v.iDivided ? 2 : v.myShare >= v.equal ? 2 : v.myShare >= 0.5 * v.equal ? 1 : 0);
const ones = (v) => Object.fromEntries(v.ids.map((x) => [x, 1]));
const stakeW = (v) => Object.fromEntries(v.ids.map((x) => [x, v.stakes[x] ?? 0]));
const learner = ({ grabAt, split, ownVote, once = false }) => (rng) => {
  const at = grabAt[Math.floor(rng() * grabAt.length)];
  let grabbed = 0;
  return {
    turn: (v) => (at !== null && v.pool >= at && !(once && grabbed) ? (grabbed++, 'grab') : 'give'),
    divide: (v) => split(v),
    vote: (v) => (v.iDivided ? ownVote : judgeFair(v)),
  };
};
export const LEARNERS = {
  'giver': learner({ grabAt: [null], split: (v) => splitBy(v.pool, ones(v)), ownVote: 2 }),
  'stake, votes 1 on own': learner({ grabAt: [15, 25, 40, 60], split: (v) => splitBy(v.pool, stakeW(v)), ownVote: 1 }),
  'stake, votes 2 on own': learner({ grabAt: [15, 25, 40, 60], split: (v) => splitBy(v.pool, stakeW(v)), ownVote: 2 }),
  'equal, votes 2 on own': learner({ grabAt: [15, 25, 40, 60], split: (v) => splitBy(v.pool, ones(v)), ownVote: 2 }),
  'keeps 1.5x, votes 2': learner({ grabAt: [15, 25, 40, 60], split: (v) => splitBy(v.pool, stakeW(v), v.id, Math.round(1.5 * v.equal)), ownVote: 2 }),
  'grabs once, stake, 2': learner({ grabAt: [25, 40, 60], split: (v) => splitBy(v.pool, stakeW(v)), ownVote: 2, once: true }),
  // Jason's coalition (2026-11-05): grab whenever allowed, pay everyone their stake share,
  // except players who voted 0 on its last split, whose shares it keeps.
  'coalition': () => {
    let foes = new Set();
    return {
      turn: (v) => {
        const u = v.lastUltimatum;
        if (u && u.grabber === v.id) foes = new Set(Object.entries(u.votes).filter(([, x]) => x === 0).map(([id]) => id));
        return v.pool > 0 ? 'grab' : 'give';
      },
      divide: (v) => {
        const sh = splitBy(v.pool, stakeW(v));
        for (const id of foes) if (sh[id] !== undefined && id !== v.id) { sh[v.id] += sh[id]; sh[id] = 0; }
        return sh;
      },
      vote: (v) => (v.iDivided ? 2 : judgeFair(v)),
    };
  },
};

export function playWithLearner(styleKey, seed, opts = {}) {
  const rng = mulberry32(seed);
  const keys = selectRoster(rng, 5);
  const ids = ['you', ...keys.map((k, i) => `${k}#${i}`)];
  const inst = { you: LEARNERS[styleKey](rng) };
  keys.forEach((k, i) => (inst[ids[i + 1]] = STRATEGIES[k].create(rng)));
  let s = createGame({ players: ids.map((id) => ({ id })), seed, ...opts });
  const act_ = () => s.players.filter((p) => p.active);
  let g = 0;
  while (s.status === 'playing' && g++ < 20000) {
    if (s.phase === 'turn') { const id = currentPlayer(s); s = act(s, id, inst[id].turn(botView(s, id))); }
    else if (s.phase === 'divide') { const gr = s.ultimatum.grabber; s = divide(s, inst[gr].divide(botView(s, gr))); }
    else if (s.phase === 'vote') s = vote(s, Object.fromEntries(act_().map((p) => [p.id, inst[p.id].vote(botView(s, p.id))])));
    else s = stay(s, Object.fromEntries(act_().map((p) => [p.id, inst[p.id].stay ? inst[p.id].stay(botView(s, p.id)) : true])));
  }
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const T = Number(process.argv[2] ?? 2000);
  const opts = JSON.parse(process.argv[3] ?? '{}');
  const styles = Object.keys(LEARNERS);
  const hits = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, Object.fromEntries(styles.map((k) => [k, 0]))]));
  for (const k of styles) for (let t = 0; t < T; t++) {
    const got = tableAchievements(playWithLearner(k, 7000 + t, opts));
    for (const id of got) hits[id][k]++;
  }
  console.log(`${T} tables per learner style · options ${JSON.stringify(opts)}`);
  console.log('Achievement'.padEnd(22) + styles.map((k) => k.slice(0, 12).padStart(13)).join('') + '   mean   in 5 tables');
  const rows = ACHIEVEMENTS.map((a) => {
    const ps = styles.map((k) => hits[a.id][k] / T);
    const mean = ps.reduce((x, y) => x + y, 0) / ps.length;
    return { a, ps, mean };
  }).sort((x, y) => y.mean - x.mean);
  for (const { a, ps, mean } of rows) {
    console.log(a.name.padEnd(22) + ps.map((p) => `${(100 * p).toFixed(0)}%`.padStart(13)).join('') + `${(100 * mean).toFixed(0)}%`.padStart(7) + `${(100 * (1 - (1 - mean) ** 5)).toFixed(0)}%`.padStart(13));
  }
}
