// The Wheel's bots as they were at earlier decisions, so the simulator can re-run every table in
// docs/design/wheel-of-fortune.md (Jason, 2026-11-09: "so every number in the design doc can be
// re-run"). The bots on the page are in src/bots/wheel-bots.js; these are for comparison only.
//
// Eras (the commits they come from):
//   'first'       decisions 12-20 (d6fc666, 7c7e2fa): fixed strategies; steering bots hold the white
//                 arrow back whatever it costs.
//   'smart'       decisions 21-23 (f2e3423): the same, but they hold only when holding pays.
//   'twoLearners' decision 24 (bd25c4f): 'smart' plus the Learner and the Reformed Keeper.
//   'now'         decision 26 on: every bot learns (src/bots/wheel-bots.js).
// Each era keeps its strategies in the order they had, so seeded rosters come out the same.
// SPDX-License-Identifier: AGPL-3.0-only

import { STRATEGIES as NOW, FAMILIES as NOW_FAMILIES, bring, rescue } from '../src/bots/wheel-bots.js';
import { shuffle } from '../src/engine/rng.js';

const everyone = (v) => v.n;
const others = (v) => v.players.filter((p) => p.id !== v.id);
const fixed = (share, people) => ({ decide: (v) => ({ vote: 0, share, people: people === 'all' ? everyone(v) : people }) });
function sharingMemory() {
  const score = {};
  return (v) => {
    for (const p of v.players) score[p.id] = (score[p.id] ?? p.share) * 0.95 + p.share * 0.05;
    return score;
  };
}

/** The eight fixed strategies of decisions 12-23. always: steering bots hold whatever it costs. */
function fixedStrategies(always) {
  return {
    sharer: { label: 'Sharer', family: 'sharer', create: () => fixed(8, 'all') },
    keeper: { label: 'Keeper', family: 'keeper', create: () => fixed(0, 1) },
    freeRider: { label: 'Free Rider', family: 'keeper', create: () => fixed(5, 1) },
    selfSteerer: { label: 'Self-Steerer', family: 'steerer', create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 3, 0.25, always), share: 5, people: everyone(v) }) }) },
    sharerSteerer: {
      label: 'Patron', family: 'steerer',
      create: () => {
        const memory = sharingMemory();
        return {
          decide: (v) => {
            const score = memory(v);
            const best = others(v).reduce((a, p) => (score[p.id] > score[a.id] + 1e-9 ? p : a));
            return { vote: bring(v, best.id, 2, 0.25, always), share: 7, people: everyone(v) };
          },
        };
      },
    },
    poorSteerer: { label: 'Lifeguard', family: 'steerer', create: () => ({ decide: (v) => ({ vote: rescue(v, 3), share: 7, people: everyone(v) }) }) },
    reciprocator: {
      label: 'Reciprocator', family: 'sharer',
      create: () => ({
        decide: (v) => {
          const avg = others(v).reduce((a, p) => a + p.share, 0) / (v.n - 1);
          return { vote: 0, share: Math.max(2, Math.min(9, Math.round(avg))), people: everyone(v) };
        },
      }),
    },
    opportunist: { label: 'Opportunist', family: 'keeper', create: () => ({ decide: (v) => ({ vote: 0, share: v.white === v.id ? 5 : 9, people: everyone(v) }) }) },
  };
}

/** Decision 24's Learner (bd25c4f): Win-Stay, Lose-Shift on what it kept per token of reward, a lap at a time. */
function learner24(rng) {
  let share = Math.floor(rng() * 11);
  let way = rng() < 0.5 ? -1 : 1;
  let last = null;
  let mark = null;
  let had = false;
  const lapMark = (v) => ({ kept: v.me.balance + v.me.stats.paid + v.me.stats.voted, reward: v.me.stats.reward });
  return {
    decide: (v) => {
      mark ??= lapMark(v);
      const has = v.white === v.id;
      const left = had && !has;
      had = has;
      if (left) {
        const now = lapMark(v);
        const reward = now.reward - mark.reward;
        if (reward > 0) {
          const score = (now.kept - mark.kept) / reward;
          if (last != null && score < last) way = -way;
          last = score;
          share = Math.max(0, Math.min(10, share + 2 * way));
          if (share === 0 || share === 10) way = -way;
          mark = now;
        }
      }
      return { vote: 0, share, people: v.n };
    },
  };
}
/** Decision 24's Reformed Keeper (bd25c4f): keeps until its tokens fall below 7/10 of the stake or
 * it is hurried past for 3 seconds, then shares 2 tenths more every 10 s, up to the others' average. */
function reformedKeeper24() {
  let hurried = 0;
  let reformed = null;
  let share = 0;
  let lastStep = 0;
  return {
    decide: (v) => {
      if (!reformed) {
        const othersNet = others(v).reduce((a, p) => a + p.vote, 0);
        if (v.white === v.id && othersNet * v.dir > 0) hurried++;
        if (v.me.balance < 0.7 * v.stake) reformed = { t: v.t, why: 'fees' };
        else if (hurried >= 3) reformed = { t: v.t, why: 'reactions' };
        if (reformed) lastStep = v.t - 10;
      }
      if (reformed && v.t - lastStep >= 10) {
        const o = others(v);
        const target = Math.max(5, Math.min(8, Math.round(o.reduce((a, p) => a + p.share, 0) / o.length)));
        if (share < target) { share = Math.min(target, share + 2); lastStep = v.t; }
      }
      return share ? { vote: 0, share, people: v.n, reformed } : { vote: 0, share: 0, people: 1, reformed };
    },
  };
}

function twoLearners() {
  const f = fixedStrategies(false);
  // the order bd25c4f had: the two Learners sat between the Reciprocator and the Opportunist
  const { opportunist, ...rest } = f;
  return {
    ...rest,
    learner: { label: 'Learner', family: 'learner', create: (rng) => learner24(rng) },
    reformedKeeper: { label: 'Reformed Keeper', family: 'learner', create: () => reformedKeeper24() },
    opportunist,
  };
}

const THREE = { sharer: 'Sharers', keeper: 'Keepers', steerer: 'Steerers' };
export const ERAS = {
  first: { label: 'decisions 12-20: fixed bots that hold whatever it costs', strategies: fixedStrategies(true), families: THREE },
  smart: { label: 'decisions 21-23: fixed bots that hold only when it pays', strategies: fixedStrategies(false), families: THREE },
  twoLearners: { label: 'decision 24: fixed bots plus the Learner and the Reformed Keeper', strategies: twoLearners(), families: NOW_FAMILIES },
  now: { label: 'decision 26 on: every bot learns', strategies: NOW, families: NOW_FAMILIES },
};

/** The roster rule of every era: one from each family, the rest at random, in a random join order. */
export function rosterOf(era, rng, count = 5) {
  const { strategies, families } = ERAS[era];
  const keys = Object.keys(strategies);
  const picks = Object.keys(families).map((fam) => shuffle(rng, keys.filter((k) => strategies[k].family === fam))[0]);
  const rest = shuffle(rng, keys.filter((k) => !picks.includes(k)));
  return shuffle(rng, [...picks, ...rest].slice(0, count));
}
