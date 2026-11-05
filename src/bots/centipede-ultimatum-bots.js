// Strategy bots for Centipede & Ultimatum. Each bot has four habits: when to grab the pool,
// how to divide it (each player's share set separately), how to judge someone else's split,
// and whether to stay after a split.
// Each strategy: create(rng) -> { turn(view) -> 'give'|'grab', divide(view) -> shares,
//   vote(view) -> 0|1|2, stay?(view) -> boolean }
// SPDX-License-Identifier: AGPL-3.0-only

import { requirement, splitBy, activeIds } from '../engine/centipede-ultimatum.js';
import { shuffle } from '../engine/rng.js';

export const FAMILIES = {
  cooperator: 'Cooperators',
  reciprocator: 'Reciprocators',
  grabber: 'Grabbers',
  judge: 'Judges',
};

// Division habits
const ones = (v) => Object.fromEntries(v.ids.map((id) => [id, 1]));
const equal = (v) => splitBy(v.pool, ones(v));
const byStakes = (v) => splitBy(v.pool, Object.fromEntries(v.ids.map((id) => [id, v.stakes[id] ?? 0])));
const keepThenEqual = (frac) => (v) => splitBy(v.pool, ones(v), v.id, Math.round(frac * v.pool));
const keepThenStakes = (keep) => (v) =>
  splitBy(v.pool, Object.fromEntries(v.ids.map((id) => [id, v.stakes[id] ?? 0])), v.id, keep(v));

// Judging habits. Each bot measures an offer against its own idea of a fair share:
//   v.equal        an equal share of the pool
//   v.proportional a share in proportion to what it put in (the pool includes the Commons bonus)
//   v.myStake      exactly what it put in
// welcome: vote 2 at or above this; accept: vote 1 at or above this; otherwise 0.
// Bots always vote 2 on their own split.
const judge = ({ welcome = null, accept }) => (v) => {
  if (v.iDivided) return 2;
  if (welcome && v.myShare >= welcome(v)) return 2;
  return v.myShare >= accept(v) ? 1 : 0;
};
const eq = (k) => (v) => k * v.equal;
const prop = (k) => (v) => k * v.proportional;
const judgeBy = (ratio) => judge({ welcome: eq(1), accept: eq(ratio) });

export const STRATEGIES = {
  patient: {
    label: 'Patient', family: 'cooperator',
    summary: 'Always gives. If it divides, everyone gets an equal share. Welcomes a split that gives it at least an equal share; accepts one that gives it at least half.',
    tell: 'G every turn. Votes 2 for an equal share or better, 0 when badly shortchanged.',
    create: () => ({ turn: () => 'give', divide: equal, vote: judgeBy(0.5) }),
  },
  pushover: {
    label: 'Pushover', family: 'cooperator',
    summary: 'Always gives, splits equally, and welcomes every split with a 2.',
    tell: 'G every turn, 2 on every vote.',
    create: () => ({ turn: () => 'give', divide: equal, vote: () => 2 }),
  },
  bookkeeper: {
    label: 'Bookkeeper', family: 'reciprocator',
    summary: 'Always gives. Divides in proportion to what each player put in, so players who passed get less or nothing. Accepts a split if it gets back at least what it put in; welcomes one that pays in proportion to what it put in.',
    tell: 'G every turn. Its splits pay givers and leave passers with 0.',
    create: () => ({
      turn: () => 'give', divide: byStakes, vote: judge({ welcome: prop(1), accept: (v) => v.myStake }),
      stay: (v) => !(v.lastUltimatum && v.lastUltimatum.result !== 'rejected' && v.lastUltimatum.myNet < 0 && v.lastUltimatum.round === v.round),
    }),
  },
  earlyGrabber: {
    label: 'Early Grabber', family: 'grabber',
    summary: 'Grabs the pool at its first turn once grabbing is open and there is anything in it. Keeps 60%.',
    tell: 'Grabs early. Keeps well over a fair share.',
    create: () => ({ turn: (v) => (v.pool > 0 ? 'grab' : 'give'), divide: keepThenEqual(0.6), vote: judgeBy(0.5) }),
  },
  poolWatcher: {
    label: 'Pool Watcher', family: 'grabber',
    summary: 'Gives until the pool reaches 40, then grabs. Keeps 40% and shares the rest by what each put in. Judges others by what it put in.',
    tell: 'Gives for a while, then grabs a big pool. Keeps about twice a fair share.',
    create: () => ({
      turn: (v) => (v.pool >= 40 ? 'grab' : 'give'),
      divide: keepThenStakes((v) => Math.round(0.4 * v.pool)),
      vote: judge({ welcome: prop(1), accept: eq(0.5) }),
    }),
  },
  greedy: {
    label: 'Greedy', family: 'grabber',
    summary: 'Grabs once the pool reaches 20, keeps 80%, and leaves the table if the split goes through. Never pays 2 for anyone else\'s split.',
    tell: 'Grabs a mid-sized pool, keeps most of it, then leaves.',
    create: () => {
      let cashedIn = false;
      return {
        turn: (v) => (v.pool >= 20 ? 'grab' : 'give'),
        divide: keepThenEqual(0.8),
        vote: judge({ accept: eq(0.3) }),
        stay: (v) => {
          const u = v.lastUltimatum;
          if (u && u.grabber === v.id && u.result !== 'rejected') cashedIn = true;
          return !cashedIn;
        },
      };
    },
  },
  edgeWatcher: {
    label: 'Edge Watcher', family: 'grabber',
    summary: "Gives while it can keep up. Grabs when giving would leave it unable to afford next round. Keeps a little over a fair share and shares the rest by what each put in.",
    tell: 'Gives until its balance runs low, then grabs. Splits only a little in its own favour.',
    create: () => ({
      turn: (v) => (v.balance - v.req < requirement(v.round + 1) ? 'grab' : 'give'),
      divide: keepThenStakes((v) => Math.round(1.25 * v.equal)),
      vote: judge({ welcome: prop(1), accept: eq(0.6) }),
    }),
  },
  spiteful: {
    label: 'Spiteful', family: 'judge',
    summary: 'Always gives and splits equally, but votes 0 against any split that gives it less than an equal share. Never votes 2 for anyone else.',
    tell: 'G every turn. Votes 0 whenever it gets less than an equal share, otherwise 1.',
    create: () => ({ turn: () => 'give', divide: equal, vote: judge({ accept: (v) => Math.floor(v.equal) }) }),
  },
  freeVoter: {
    label: 'Free Voter', family: 'judge',
    summary: 'Always gives, but never pays to vote. Votes 0 and counts on the others to carry the split, then takes a share of their vote tokens.',
    tell: 'G every turn. Votes 0 on every split but its own.',
    create: () => ({ turn: () => 'give', divide: equal, vote: (v) => (v.iDivided ? 2 : 0) }),
  },
  mirror: {
    label: 'Mirror', family: 'reciprocator',
    summary: 'Gives and splits equally, until someone keeps more than a fair share and gets away with it. Then it grabs at its next turn and gives that divider nothing.',
    tell: 'G until a greedy split goes through, then grabs and cuts the greedy divider out.',
    create: () => {
      let target = null;
      return {
        turn: (v) => {
          const u = v.lastUltimatum;
          if (u && u.round === v.round - 1 && u.result !== 'rejected' && u.grabber !== v.id && u.keptRatio > 1.25) target = u.grabber;
          if (target && !v.ids.includes(target)) target = null;
          return target && v.pool > 0 ? 'grab' : 'give';
        },
        divide: (v) => {
          const w = Object.fromEntries(v.ids.map((id) => [id, id === target ? 0 : 1]));
          target = null;
          return splitBy(v.pool, w);
        },
        vote: judgeBy(0.7),
      };
    },
  },
};

/** What a bot can see: public information only. */
export function botView(s, id) {
  const me = s.players.find((p) => p.id === id);
  const ids = activeIds(s);
  const lastRec = [...s.rounds].reverse().find((r) => r.result === 'ultimatum')?.ultimatum ?? null;
  let lastUltimatum = null;
  if (lastRec) {
    const n = Object.keys(lastRec.shares).length;
    const eq = lastRec.pool / n || 0;
    const kept = lastRec.shares[lastRec.grabber];
    lastUltimatum = {
      grabber: lastRec.grabber, result: lastRec.result, round: lastRec.round, votes: lastRec.votes,
      keptRatio: eq ? kept / eq : 1,
      myShare: lastRec.shares[id] ?? null,
      myNet: (lastRec.result === 'rejected' ? 0 : lastRec.shares[id] ?? 0) - (lastRec.stakes[id] ?? 0),
    };
  }
  const u = s.ultimatum;
  const stakes = u?.stakes ?? s.stakes;
  const totalStakes = ids.reduce((a, x) => a + (stakes[x] ?? 0), 0);
  const myStake = stakes[id] ?? 0;
  return {
    id,
    ids,
    myStake,
    totalStakes,
    proportional: totalStakes ? (s.pool * myStake) / totalStakes : s.pool / ids.length,
    round: s.round,
    req: requirement(s.round),
    balance: me.balance,
    pool: s.pool,
    stakes: s.stakes,
    n: ids.length,
    equal: s.pool / ids.length,
    movesSoFar: s.current?.moves ?? [],
    lastUltimatum,
    iDivided: u?.grabber === id,
    myShare: u?.shares?.[id] ?? null,
  };
}

/** Five varied seats beside the human: one grabber, one judge, one reciprocator, two others. */
export function selectRoster(rng, count = 5) {
  const keys = Object.keys(STRATEGIES);
  const from = (fam) => shuffle(rng, keys.filter((k) => STRATEGIES[k].family === fam))[0];
  const picked = [from('grabber'), from('judge'), from('reciprocator')];
  const rest = shuffle(rng, keys.filter((k) => !picked.includes(k)));
  while (picked.length < count) picked.push(rest.shift());
  return shuffle(rng, picked);
}
