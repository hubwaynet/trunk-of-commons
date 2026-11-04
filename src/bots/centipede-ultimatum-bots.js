// Strategy bots for Centipede & Ultimatum. Each bot has three habits:
// when to grab the pool, how to divide it, and how to judge someone else's split.
// Each strategy: create(rng) -> { turn(view) -> 'give'|'grab', keep(view) -> points kept when dividing,
//   vote(view) -> 0|1|2, stay?(view) -> boolean }
// SPDX-License-Identifier: AGPL-3.0-only

import { requirement, splitKeeping, equalShare } from '../engine/centipede-ultimatum.js';
import { shuffle } from '../engine/rng.js';

export const FAMILIES = {
  cooperator: 'Cooperators',
  grabber: 'Grabbers',
  judge: 'Judges',
  reciprocator: 'Reciprocators',
};

const fairKeep = (v) => Math.ceil(v.equal);
const judgeBy = (ratio) => (v) => (v.iDivided ? 2 : v.myShare >= ratio * v.equal ? 1 : 0);

export const STRATEGIES = {
  patient: {
    label: 'Patient', family: 'cooperator',
    summary: 'Always gives. If forced to divide, splits equally. Accepts any split that gives it at least about half a fair share.',
    tell: 'G every turn. Votes 1, or 0 for a split that shortchanges it badly.',
    create: () => ({ turn: () => 'give', keep: fairKeep, vote: judgeBy(0.5) }),
  },
  pushover: {
    label: 'Pushover', family: 'cooperator',
    summary: 'Always gives, splits equally, and welcomes any split with a 2.',
    tell: 'G every turn, 2 on every vote.',
    create: () => ({ turn: () => 'give', keep: fairKeep, vote: () => 2 }),
  },
  earlyGrabber: {
    label: 'Early Grabber', family: 'grabber',
    summary: 'Grabs the pool at its first turn once there is anything in it, and keeps 60%.',
    tell: 'Grabs early, usually round 2. Keeps well over a fair share.',
    create: () => ({
      turn: (v) => (v.pool > 0 ? 'grab' : 'give'),
      keep: (v) => Math.round(0.6 * v.pool),
      vote: judgeBy(0.5),
    }),
  },
  poolWatcher: {
    label: 'Pool Watcher', family: 'grabber',
    summary: 'Gives until the pool reaches 40, then grabs and keeps 40%.',
    tell: 'Gives for a while, then grabs a big pool. Keeps about twice a fair share.',
    create: () => ({
      turn: (v) => (v.pool >= 40 ? 'grab' : 'give'),
      keep: (v) => Math.round(0.4 * v.pool),
      vote: judgeBy(0.5),
    }),
  },
  greedy: {
    label: 'Greedy', family: 'grabber',
    summary: 'Grabs once the pool reaches 20, keeps 80%, and leaves the table if the split goes through.',
    tell: 'Grabs a mid-sized pool, keeps most of it, then leaves.',
    create: () => {
      let cashedIn = false;
      return {
        turn: (v) => (v.pool >= 20 ? 'grab' : 'give'),
        keep: (v) => Math.round(0.8 * v.pool),
        vote: judgeBy(0.3),
        stay: (v) => {
          if (v.lastUltimatum?.grabber === v.id && v.lastUltimatum.result !== 'rejected') cashedIn = true;
          return !cashedIn;
        },
      };
    },
  },
  edgeWatcher: {
    label: 'Edge Watcher', family: 'grabber',
    summary: "Gives while it can keep up. Grabs when giving would leave it unable to afford next round's amount. Keeps a little over a fair share.",
    tell: 'Gives until its balance runs low, then grabs. Splits only a little in its own favour.',
    create: () => ({
      turn: (v) => (v.balance - v.req < requirement(v.round + 1) ? 'grab' : 'give'),
      keep: (v) => Math.round(1.25 * v.equal),
      vote: judgeBy(0.6),
    }),
  },
  spiteful: {
    label: 'Spiteful', family: 'judge',
    summary: 'Always gives and splits equally, but votes 0 against any split that gives it less than a fair share.',
    tell: 'G every turn. Votes 0 whenever someone keeps more than their share.',
    create: () => ({ turn: () => 'give', keep: fairKeep, vote: (v) => (v.iDivided ? 2 : v.myShare >= Math.floor(v.equal) ? 1 : 0) }),
  },
  freeVoter: {
    label: 'Free Voter', family: 'judge',
    summary: "Always gives, but never pays to vote. Votes 0 and counts on the others to carry the split, then takes a share of their vote tokens.",
    tell: 'G every turn. Votes 0 on every split but its own.',
    create: () => ({ turn: () => 'give', keep: fairKeep, vote: (v) => (v.iDivided ? 2 : 0) }),
  },
  mirror: {
    label: 'Mirror', family: 'reciprocator',
    summary: 'Gives until someone keeps more than a fair share and gets away with it. Then it grabs at its next turn and keeps what that divider kept.',
    tell: 'G until a greedy split goes through, then grabs back with the same greed.',
    create: () => {
      let owed = null; // fraction of the pool the last greedy divider kept
      return {
        turn: (v) => {
          const u = v.lastUltimatum;
          if (u && u.result !== 'rejected' && u.grabber !== v.id && u.keptRatio > 1.25) owed = u.keptFraction;
          return owed !== null && v.pool > 0 ? 'grab' : 'give';
        },
        keep: (v) => {
          const k = owed === null ? fairKeep(v) : Math.round(owed * v.pool);
          owed = null;
          return k;
        },
        vote: judgeBy(0.7),
      };
    },
  },
};

/** What a bot can see: public information only. */
export function botView(s, id) {
  const me = s.players.find((p) => p.id === id);
  const lastUlt = [...s.rounds].reverse().find((r) => r.result === 'ultimatum')?.ultimatum ?? null;
  const active = s.players.filter((p) => p.active).length;
  let lastUltimatum = null;
  if (lastUlt) {
    const n = Object.keys(lastUlt.shares).length;
    const eq = lastUlt.pool / n || 0;
    const kept = lastUlt.shares[lastUlt.grabber];
    lastUltimatum = {
      grabber: lastUlt.grabber, result: lastUlt.result, round: lastUlt.round,
      keptFraction: lastUlt.pool ? kept / lastUlt.pool : 0,
      keptRatio: eq ? kept / eq : 1,
      myShare: lastUlt.shares[id] ?? null,
    };
  }
  const u = s.ultimatum;
  return {
    id,
    round: s.round,
    req: requirement(s.round),
    balance: me.balance,
    pool: s.pool,
    n: active,
    equal: s.pool / active,
    movesSoFar: s.current?.moves ?? [],
    lastUltimatum,
    // during a vote
    iDivided: u?.grabber === id,
    myShare: u?.shares?.[id] ?? null,
  };
}

/** Run a bot's habit for the current phase and return the engine-ready input. */
export function botDivision(s, id, inst) {
  return splitKeeping(s, id, inst.keep(botView(s, id)));
}

export function selectRoster(rng, count = 5) {
  return shuffle(rng, Object.keys(STRATEGIES)).slice(0, count);
}

export { equalShare };
