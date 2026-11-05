// Strategy bots for Centipede & Ultimatum. Each bot has four habits: when to grab the pool,
// how to divide it (each player's share set separately), how to judge someone else's split,
// and whether to stay after a split.
// Each strategy: create(rng) -> { turn(view) -> 'give'|'grab', divide(view) -> shares,
//   vote(view) -> 0|1|2, assess(view) -> { vote, reasons }, stay?(view) -> boolean }
// assess() gives the vote and, for a 0, the reasons behind it (shown to the player after the
// vote; Jason, 2026-11-06). vote() is assess().vote, so the two can't disagree.
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
// Sanctioning free riders (Jason, 2026-11-05). A free rider has voted 0 at least twice on
// splits that treated them fairly and passed anyway, living off others' vote tokens.
// cut: what a free rider is left with — 'half' of what they put in, or 'none'.
// to: where the cut goes — 'others' (shared by stake among the rest) or 'me' (kept).
const sanction = (div, { cut = 'half', to = 'others' } = {}) => (v) => {
  const sh = div(v);
  const riders = v.freeRiders.filter((x) => x !== v.id && sh[x] !== undefined);
  if (!riders.length) return sh;
  let freed = 0;
  for (const x of riders) {
    const keep = cut === 'none' ? 0 : Math.floor((v.stakes[x] ?? 0) / 2);
    if (sh[x] > keep) { freed += sh[x] - keep; sh[x] = keep; }
  }
  if (!freed) return sh;
  if (to === 'me') { sh[v.id] += freed; return sh; }
  const rest = v.ids.filter((x) => !riders.includes(x));
  const extra = splitBy(freed, Object.fromEntries(rest.map((x) => [x, (v.stakes[x] ?? 0) || 1])));
  for (const x of rest) sh[x] += extra[x];
  return sh;
};
const keepThenStakes = (keep) => (v) =>
  splitBy(v.pool, Object.fromEntries(v.ids.map((id) => [id, v.stakes[id] ?? 0])), v.id, keep(v));

// Judging habits. Each bot measures an offer against its own idea of a fair share:
//   v.equal        an equal share of the pool
//   v.proportional a share in proportion to what it put in (the pool includes the Commons bonus)
//   v.myStake      exactly what it put in
// welcome: vote 2 at or above this; accept: vote 1 at or above this; otherwise 0.
// Bots always vote 2 on their own split.
// A threshold is a function of the view, tagged with what it measures so a 0 can be explained:
// basis 'equal' (k times an equal share), 'proportional', or 'stake'.
const tag = (fn, basis, k = 1) => Object.assign(fn, { basis, k });
const eq = (k) => tag((v) => k * v.equal, 'equal', k);
const prop = (k) => tag((v) => k * v.proportional, 'proportional', k);
const stake = tag((v) => v.myStake, 'stake');
const ok = (vote) => ({ vote, reasons: [] });
const judge = ({ welcome = null, accept }) => (v) => {
  if (v.iDivided) return ok(2);
  if (welcome && v.myShare >= welcome(v)) return ok(2);
  if (v.myShare >= accept(v)) return ok(1);
  const wanted = Math.ceil(accept(v) - 1e-9); // shares are whole points
  return { vote: 0, reasons: [{ kind: 'share', offered: v.myShare, wanted, basis: accept.basis, k: accept.k }] };
};
const judgeBy = (ratio) => judge({ welcome: eq(1), accept: eq(ratio) });
const voter = (assess) => ({ assess, vote: (v) => assess(v).vote });

// Social judging (Jason, 2026-11-05): most people look past their own share.
//   v.shortChanged    players who put something in but are offered less than they put in
//   v.repeatDivider   the same player divided the last split too, and it went through
//   v.dividerKeeps    the divider's own share as a multiple of an equal share
// solidarity: 'veto' votes 0 if anyone is short-changed; 'withhold' won't welcome it (votes at most 1).
// turns: 'veto' votes 0 against a repeat divider who keeps more than 1.25 equal shares;
//        'withhold' won't welcome any repeat divider.
//   v.dominant        the divider also divided at least 2 of the last 3 splits
//   v.grudge          this divider short-changed me in an earlier split at this table
//   v.dividerFair     the divider keeps no more than a fair share for themselves (the larger of an
//                     equal share and their share by stake, rounded up)
// Punishment targets greed, not frequency (Jason, 2026-11-05: three fair grabs got him sent out
// while a greedy bot got away with two):
//   turns         a greedy divider dividing twice running
//   dominance     a greedy divider who divided 2 of the last 3 splits
//   dominanceFair a fair divider who divided 2 of the last 3 splits (at most a lost welcome)
// Each takes 'veto' (vote 0) or 'withhold' (vote at most 1).
const social = (base, { solidarity = null, turns = null, dominance = null, dominanceFair = null, grudge = null } = {}) => (v) => {
  if (v.iDivided) return ok(2);
  const own = base(v);
  let vote = own.vote;
  const protested = v.shortChanged.find((id) => id !== v.id && !v.freeRiders.includes(id));
  const greedy = !v.dividerFair;
  const flags = [
    [protested !== undefined, solidarity, () => ({ kind: 'protest', who: protested, got: v.shares[protested], put: v.stakes[protested] ?? 0 })],
    [v.repeatDivider && greedy, turns, () => ({ kind: 'turns' })],
    [v.dominant && greedy, dominance, () => ({ kind: 'dominance' })],
    [v.dominant && !greedy, dominanceFair, () => ({ kind: 'dominance-fair' })],
    [v.grudge, grudge, () => ({ kind: 'grudge', round: v.grudgeRound })],
  ];
  const vetoes = [];
  for (const [hit, how, why] of flags) {
    if (!hit || !how) continue;
    if (how === 'veto') vetoes.push(why());
    else vote = Math.min(vote, 1);
  }
  if (vetoes.length) return { vote: 0, reasons: [...vetoes, ...own.reasons] };
  return { vote, reasons: vote === 0 ? own.reasons : [] };
};

export const STRATEGIES = {
  patient: {
    label: 'Patient', family: 'cooperator',
    summary: 'Always gives. If it divides, everyone gets an equal share. Welcomes a split that gives it at least an equal share, unless someone else is short-changed, a greedy divider keeps dividing, or that divider short-changed it before; accepts one that gives it at least half.',
    tell: 'G every turn. Votes 2 for an equal share or better, 0 when badly shortchanged.',
    create: () => ({ turn: () => 'give', divide: equal, ...voter(social(judgeBy(0.5), { solidarity: 'withhold', turns: 'withhold', dominance: 'withhold', grudge: 'withhold' })) }),
  },
  pushover: {
    label: 'Pushover', family: 'cooperator',
    summary: 'Always gives, splits equally, and welcomes every split with a 2.',
    tell: 'G every turn, 2 on every vote.',
    create: () => ({ turn: () => 'give', divide: equal, ...voter(() => ok(2)) }),
  },
  bookkeeper: {
    label: 'Bookkeeper', family: 'reciprocator',
    summary: 'Always gives. Divides in proportion to what each player put in, so players who passed get less or nothing. Accepts a split if it gets back at least what it put in; welcomes one that pays in proportion to what it put in. Votes 0 if anyone who put something in gets back less (free riders excepted), and holds a grudge against a divider who short-changed it.',
    tell: 'G every turn. Its splits pay givers and leave passers with 0. Votes 0 when anyone is short-changed.',
    create: () => ({
      turn: () => 'give', divide: byStakes, ...voter(social(judge({ welcome: prop(1), accept: stake }), { solidarity: 'veto', grudge: 'veto' })),
      stay: (v) => !(v.lastUltimatum && v.lastUltimatum.result !== 'rejected' && v.lastUltimatum.myNet < 0 && v.lastUltimatum.round === v.round),
    }),
  },
  earlyGrabber: {
    label: 'Early Grabber', family: 'grabber',
    summary: 'Grabs the pool at its first turn once grabbing is open and there is anything in it. Keeps 60%. Votes 0 against a greedy player who keeps taking the grab; won\'t welcome even a fair one.',
    tell: 'Grabs early. Keeps well over a fair share.',
    create: () => ({ turn: (v) => (v.pool > 0 ? 'grab' : 'give'), divide: keepThenEqual(0.6), ...voter(social(judgeBy(0.5), { turns: 'veto', dominance: 'veto', dominanceFair: 'withhold' })) }),
  },
  poolWatcher: {
    label: 'Pool Watcher', family: 'grabber',
    summary: 'Gives until the pool reaches 40, then grabs. Keeps 40% and shares the rest by what each put in, giving free riders only half of what they put in. Judges others by what it put in, and votes 0 against a greedy player who keeps taking the grab; won\'t welcome even a fair one.',
    tell: 'Gives for a while, then grabs a big pool. Keeps about twice a fair share.',
    create: () => ({
      turn: (v) => (v.pool >= 40 ? 'grab' : 'give'),
      divide: sanction(keepThenStakes((v) => Math.round(0.4 * v.pool))),
      ...voter(social(judge({ welcome: prop(1), accept: eq(0.5) }), { turns: 'veto', dominance: 'veto', dominanceFair: 'withhold' })),
    }),
  },
  greedy: {
    label: 'Greedy', family: 'grabber',
    summary: 'Grabs once the pool reaches 20, keeps 80%, and leaves the table if the split goes through. Never pays 2 for anyone else\'s split, and votes 0 against a greedy player who keeps taking the grab.',
    tell: 'Grabs a mid-sized pool, keeps most of it, then leaves.',
    create: () => {
      let cashedIn = false;
      return {
        turn: (v) => (v.pool >= 20 ? 'grab' : 'give'),
        divide: keepThenEqual(0.8),
        ...voter(social(judge({ accept: eq(0.3) }), { dominance: 'veto' })),
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
    summary: "Gives while it can keep up. Grabs when giving would leave it unable to afford next round. Keeps a little over a fair share and shares the rest by what each put in, giving free riders only half of what they put in. Votes 0 against a greedy player who keeps taking the grab, or one who short-changed it before; won't welcome even a fair one.",
    tell: 'Gives until its balance runs low, then grabs. Splits only a little in its own favour.',
    create: () => ({
      turn: (v) => (v.balance - v.req < requirement(v.round + 1) ? 'grab' : 'give'),
      divide: sanction(keepThenStakes((v) => Math.round(1.25 * v.equal))),
      ...voter(social(judge({ welcome: prop(1), accept: eq(0.6) }), { turns: 'veto', dominance: 'veto', dominanceFair: 'withhold', grudge: 'veto' })),
    }),
  },
  skimmer: {
    label: 'Skimmer', family: 'grabber',
    summary: 'Gives until the pool reaches its mark (somewhere from 20 to 40), then grabs at its first chance. Pays everyone back exactly what they put in and keeps the Commons bonus for itself. Free riders get back only half of what they put in, and it keeps the difference. Competes for the grab: votes 0 against a greedy player who keeps taking it, and won\'t welcome even a fair one.',
    tell: 'Grabs a mid-sized pool. Its splits give everyone exactly what they put in, and it keeps the rest.',
    create: (rng) => {
      const mark = 20 + Math.floor(rng() * 21);
      return {
        turn: (v) => (v.pool >= mark ? 'grab' : 'give'),
        divide: sanction((v) => {
          const sh = Object.fromEntries(v.ids.map((x) => [x, x === v.id ? 0 : (v.stakes[x] ?? 0)]));
          sh[v.id] = v.pool - Object.values(sh).reduce((a, b) => a + b, 0);
          return sh;
        }, { cut: 'half', to: 'me' }),
        ...voter(social(judge({ welcome: prop(1), accept: stake }), { turns: 'veto', dominance: 'veto', dominanceFair: 'withhold' })),
      };
    },
  },
  spiteful: {
    label: 'Spiteful', family: 'judge',
    summary: 'Always gives and splits equally, but votes 0 against any split that gives it less than an equal share. Also votes 0 if anyone else is short-changed (free riders excepted), if a greedy player divides twice running or keeps taking the grab, or if the divider short-changed it before. Never votes 2 for anyone else.',
    tell: 'G every turn. Votes 0 whenever it, or anyone, is shortchanged, otherwise 1.',
    create: () => ({ turn: () => 'give', divide: equal, ...voter(social(judge({ accept: tag((v) => Math.floor(v.equal), 'equal', 1) }), { solidarity: 'veto', turns: 'veto', dominance: 'veto', grudge: 'veto' })) }),
  },
  freeVoter: {
    label: 'Free Voter', family: 'judge',
    summary: 'Always gives, but never pays to vote. Votes 0 and counts on the others to carry the split, then takes a share of their vote tokens. After two such votes the table treats it as a free rider: it can be cut without the solidarity voters defending it.',
    tell: 'G every turn. Votes 0 on every split but its own.',
    create: () => ({ turn: () => 'give', divide: equal, ...voter((v) => (v.iDivided ? ok(2) : { vote: 0, reasons: [{ kind: 'never-pays' }] })) }),
  },
  mirror: {
    label: 'Mirror', family: 'reciprocator',
    summary: 'Gives and splits equally, until someone keeps more than a fair share and gets away with it. Then it grabs at its next turn and gives that divider nothing. Does the same to free riders (players who keep voting 0 on fair splits). Votes 0 against a greedy player dividing twice running or keeping the grab, or a divider who short-changed it before.',
    tell: 'G until a greedy split goes through or a free rider shows up, then grabs and cuts them out.',
    create: () => {
      let target = null;
      return {
        turn: (v) => {
          const u = v.lastUltimatum;
          if (u && u.round === v.round - 1 && u.result !== 'rejected' && u.grabber !== v.id && u.keptRatio > 1.25) target = u.grabber;
          if (target && !v.ids.includes(target)) target = null;
          if (target && v.pool > 0) return 'grab';
          // also steps in to sanction free riders once the pool is worth dividing
          return v.freeRiders.some((x) => x !== v.id) && v.pool >= 20 ? 'grab' : 'give';
        },
        divide: (v) => {
          const w = Object.fromEntries(v.ids.map((id) => [id, id === target || (id !== v.id && v.freeRiders.includes(id)) ? 0 : 1]));
          target = null;
          return splitBy(v.pool, w);
        },
        ...voter(social(judgeBy(0.7), { solidarity: 'withhold', turns: 'veto', dominance: 'veto', grudge: 'veto' })),
      };
    },
  },
};

/**
 * A free 0: a 0 vote on a split that passed anyway and was fair, so it wasn't a protest. Fair
 * means the voter got at least what they put in and at least 80% of an equal share, nobody else
 * was short-changed, and the divider kept no more than a fair share. Two make a free rider
 * (Jason, 2026-11-05). "A protest of an unfair split should be different from free rider": a 0
 * against a greedy divider is a protest, not a free 0 (Jason, 2026-11-06). Bots, the vote result,
 * the debrief and the reputation ring all use this one test.
 */
export function isFreeZero(split, voter) {
  if (split.result === 'rejected' || split.votes[voter] !== 0 || voter === split.grabber) return false;
  if (!dividerKeptFair(split)) return false; // protesting a greedy split
  const ids = Object.keys(split.shares);
  const sh = split.shares[voter] ?? 0;
  const othersShort = ids.some((y) => y !== split.grabber && y !== voter && (split.stakes[y] ?? 0) > 0 && split.shares[y] < split.stakes[y]);
  return sh >= (split.stakes[voter] ?? 0) && sh >= 0.8 * (split.pool / ids.length) && !othersShort;
}
/**
 * A fair divider keeps no more than the larger of an equal share and their share by what each
 * put in, rounded up (Jason, 2026-11-05). Bots judge greed by this, and "Your vote counted" needs it.
 */
export function dividerKeptFair(split) {
  const ids = Object.keys(split.shares);
  const total = ids.reduce((a, x) => a + (split.stakes[x] ?? 0), 0);
  const byStake = total ? (split.pool * (split.stakes[split.grabber] ?? 0)) / total : 0;
  return split.shares[split.grabber] <= Math.ceil(Math.max(split.pool / ids.length, byStake));
}
/** Free 0s per player across judged splits. */
export function freeZeroCounts(splits) {
  const counts = {};
  for (const x of splits) for (const y of Object.keys(x.votes)) if (isFreeZero(x, y)) counts[y] = (counts[y] ?? 0) + 1;
  return counts;
}

/**
 * Reputation from the 2018 notes: each player's play so far, judged as exploitive, free loading,
 * cooperative or generous (Jason, 2026-11-06, decision 8; rule from simulation, see the design log).
 * - exploitive: their latest split kept more than a fair share. Fair is worked out after setting
 *   aside anyone being sanctioned (free riders, and the divider of a greedy split just before), so
 *   punishing isn't exploiting. A later fair split clears it.
 * - free loading: two free 0s (the free-rider label).
 * - generous: never exploitive at this table, and either kept less than their own fair share on a
 *   split or voted 2 on at least two-thirds of the others' splits (three or more).
 * - cooperative: everyone else. null before the first split.
 */
export function reputations(splits, ids) {
  const out = Object.fromEntries(ids.map((id) => [id, null]));
  if (!splits.length) return out;
  const fz = {}, lastGreedy = {}, everGreedy = {}, gave = {}, twos = {}, judged = {};
  let prevGreedy = null;
  for (const u of splits) {
    const set = new Set(Object.keys(fz).filter((x) => fz[x] >= 2));
    if (prevGreedy) set.add(prevGreedy);
    const keep = Object.keys(u.shares).filter((x) => !set.has(x) || x === u.grabber);
    const pool = keep.reduce((a, x) => a + u.shares[x], 0);
    const total = keep.reduce((a, x) => a + (u.stakes[x] ?? 0), 0);
    const byStake = total ? (pool * (u.stakes[u.grabber] ?? 0)) / total : pool / keep.length;
    const mine = u.shares[u.grabber];
    const greedy = mine > Math.ceil(Math.max(pool / keep.length, byStake));
    lastGreedy[u.grabber] = greedy;
    if (greedy) everGreedy[u.grabber] = true;
    if (mine < Math.floor(Math.min(pool / keep.length, byStake))) gave[u.grabber] = true;
    prevGreedy = greedy && u.result !== 'rejected' ? u.grabber : null;
    for (const id of Object.keys(u.votes)) {
      if (id === u.grabber) continue;
      judged[id] = (judged[id] ?? 0) + 1;
      if (u.votes[id] === 2) twos[id] = (twos[id] ?? 0) + 1;
      if (isFreeZero(u, id)) fz[id] = (fz[id] ?? 0) + 1;
    }
  }
  for (const id of ids) {
    out[id] = lastGreedy[id] ? 'exploitive' : (fz[id] ?? 0) >= 2 ? 'free loading'
      : !everGreedy[id] && (gave[id] || ((judged[id] ?? 0) >= 3 && (twos[id] ?? 0) / judged[id] >= 2 / 3)) ? 'generous' : 'cooperative';
  }
  return out;
}

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
  // A divider who gives themselves less than they put in is being generous, not short-changed
  // (Jason, 2026-11-05: Bookkeeper vetoed him for keeping another player alive).
  const shortChanged = u?.shares ? Object.keys(u.shares).filter((x) => x !== u.grabber && (stakes[x] ?? 0) > 0 && u.shares[x] < stakes[x]) : [];
  const repeatDivider = Boolean(u && lastRec && lastRec.grabber === u.grabber && lastRec.result !== 'rejected');
  const pastSplits = s.rounds.filter((r) => r.result === 'ultimatum').map((r) => r.ultimatum);
  const freeZeros = freeZeroCounts(pastSplits);
  const freeRiders = Object.keys(freeZeros).filter((y) => freeZeros[y] >= 2 && ids.includes(y));
  const dominant = Boolean(u) && pastSplits.slice(-3).filter((x) => x.grabber === u.grabber).length >= 2;
  const wronged = u ? pastSplits.filter((x) => x.grabber === u.grabber && x.result !== 'rejected'
    && (x.stakes[id] ?? 0) > 0 && (x.shares[id] ?? 0) < x.stakes[id]) : [];
  const grudge = wronged.length > 0;
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
    shortChanged,
    freeRiders,
    freeZeros, // per player: 0 votes on fair splits that passed anyway (2 makes a free rider)
    repeatDivider,
    dominant,
    grudge,
    grudgeRound: wronged.at(-1)?.round ?? null, // the latest split in which this divider short-changed me
    shares: u?.shares ?? null, // the split being judged (public)
    dividerKeeps: u?.shares ? u.shares[u.grabber] / (s.pool / ids.length || 1) : 0,
    dividerFair: u?.shares ? dividerKeptFair({ ...u, pool: s.pool, stakes }) : true,
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
