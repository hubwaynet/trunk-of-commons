// Strategy bots for the Wheel of Fortune Sharing Game (working title).
// Each strategy: create(rng) -> { decide(view) -> { vote, share, people } }, called every second.
//   vote:   -9..9 tokens a second to turn the wheel (positive is clockwise), 0 for no vote
//   share:  0..10, tenths of incoming tokens to pass on
//   people: 1..n, how many of the nearest people to share with, counting the bot itself
// Bots see only botView: what the 2017 indicators show (everyone's dials, balances and what each
// has shared), the wheel, and the boost fund. Use the supplied rng, never Math.random.
// SPDX-License-Identifier: AGPL-3.0-only

import { whiteId, blackId, seatAngle, turnTo, quotas, UNIT } from '../engine/wheel.js';
import { shuffle } from '../engine/rng.js';

export const FAMILIES = {
  sharer: 'Sharers',
  keeper: 'Keepers',
  steerer: 'Steerers',
};

export function botView(s, id) {
  const q = quotas(s);
  return {
    id,
    t: s.t,
    ticksLeft: s.maxTicks - s.t,
    n: s.n,
    theta: s.theta,
    dir: s.dir,
    speed: s.speed,
    minSpeed: s.minSpeed,
    reverseAbove: s.reverseAbove,
    canReverse: s.turned >= s.reverseAfter,
    white: whiteId(s),
    heldFor: s.t - s.holderSince, // seconds the current player has had the white arrow in their segment
    black: blackId(s),
    fund: s.fund.balance,
    stake: s.stake,
    me: s.players.find((p) => p.id === id),
    players: s.players.map((p, i) => ({
      id: p.id, pos: p.pos, angle: seatAngle(s, p.pos), balance: p.balance, owes: q[i],
      ...p.settings, sharesOut: p.stats.sharesOut, sharesIn: p.stats.sharesIn, reward: p.stats.reward,
    })),
  };
}

const everyone = (v) => v.n;
const others = (v) => v.players.filter((p) => p.id !== v.id);
const fixed = (share, people) => ({ decide: (v) => ({ vote: 0, share, people: people === 'all' ? everyone(v) : people }) });

/**
 * Steering, paying only when it makes a difference. The target collects while the white arrow is
 * anywhere in its segment, so a steerer lets the wheel drift there for free. It pays only when the
 * arrow is heading away and would leave (or is outside) the segment: just enough to turn the wheel,
 * if that is within `strength`, and nothing if it isn't.
 * Bots stop paying to steer when their balance falls below `reserve` tokens.
 */
export function steer(v, targetId, strength, reserve = 150) {
  if (v.me.balance < reserve * UNIT) return 0;
  const target = v.players.find((p) => p.id === targetId);
  const half = 180 / v.n;
  const othersNet = others(v).reduce((a, p) => a + p.vote, 0);
  // Where the wheel goes next second without this bot's vote.
  let coming = v.dir, speed = Math.max(v.minSpeed, Math.abs(othersNet));
  if (othersNet * v.dir < 0) {
    if (v.canReverse && Math.abs(othersNet) > v.reverseAbove) coming = -v.dir;
    else speed = v.minSpeed;
  }
  const next = turnTo(v.theta + coming * speed, target.angle);
  const now = turnTo(v.theta, target.angle);
  if (Math.abs(next) < half) return 0; // still in the target's segment next second
  if (Math.abs(next) < Math.abs(now)) return 0; // already heading towards it
  const want = Math.sign(now) || -coming;
  const againstMomentum = want !== v.dir;
  if (againstMomentum && !v.canReverse) return 0; // the wheel can't be turned back yet
  const needed = Math.abs(othersNet) + 1 + (v.reverseAbove > 0 && againstMomentum ? Math.max(0, v.reverseAbove - Math.abs(othersNet)) : 0);
  return needed <= strength ? want * needed : 0;
}

/** Tracks each player's share setting, smoothed over roughly the last 20 seconds. */
function sharingMemory() {
  const score = {};
  return (v) => {
    for (const p of v.players) score[p.id] = (score[p.id] ?? p.share) * 0.95 + p.share * 0.05;
    return score;
  };
}

export const STRATEGIES = {
  sharer: {
    label: 'Sharer', family: 'sharer',
    summary: 'Passes on eight tenths of everything it receives, to everyone. Never steers.',
    tell: 'Share bar long and yellow; never votes.',
    create: () => fixed(8, 'all'),
  },
  keeper: {
    label: 'Keeper', family: 'keeper',
    summary: 'Keeps everything it receives and never steers, even though the fee takes most of what it keeps.',
    tell: 'Share bar empty; never votes.',
    create: () => fixed(0, 1),
  },
  freeRider: {
    label: 'Free Rider', family: 'keeper',
    summary: 'Shares half of what it receives, but only with itself, so nothing reaches anyone else.',
    tell: 'Share bar at half, people dial at one.',
    create: () => fixed(5, 1),
  },
  selfSteerer: {
    label: 'Self-Steerer', family: 'steerer',
    summary: 'Pays to turn the white arrow towards itself and hold it there. Shares half, the most it can keep.',
    tell: 'Votes whenever the wheel turns away from it.',
    create: () => ({ decide: (v) => ({ vote: steer(v, v.id, 3), share: 5, people: everyone(v) }) }),
  },
  sharerSteerer: {
    label: 'Patron', family: 'steerer',
    summary: 'Pays to turn the white arrow towards whoever else has shared most lately. Shares seven tenths.',
    tell: 'Votes towards the most generous player.',
    create: () => {
      const memory = sharingMemory();
      return {
        decide: (v) => {
          const score = memory(v);
          const best = others(v).reduce((a, p) => (score[p.id] > score[a.id] + 1e-9 ? p : a));
          return { vote: steer(v, best.id, 2), share: 7, people: everyone(v) };
        },
      };
    },
  },
  poorSteerer: {
    label: 'Lifeguard', family: 'steerer',
    summary: 'Pays to turn the white arrow towards the poorest player, which also turns the black arrow away from them. Shares seven tenths.',
    tell: 'Votes towards whoever is lowest.',
    create: () => ({
      decide: (v) => {
        const poorest = v.players.reduce((a, p) => (p.balance < a.balance ? p : a));
        return { vote: steer(v, poorest.id, 2), share: 7, people: everyone(v) };
      },
    }),
  },
  reciprocator: {
    label: 'Reciprocator', family: 'sharer',
    summary: 'Shares as much as the others do on average, between two and nine tenths. Never steers.',
    tell: 'Its share bar follows the table.',
    create: () => ({
      decide: (v) => {
        const avg = others(v).reduce((a, p) => a + p.share, 0) / (v.n - 1);
        return { vote: 0, share: Math.max(2, Math.min(9, Math.round(avg))), people: everyone(v) };
      },
    }),
  },
  opportunist: {
    label: 'Opportunist', family: 'keeper',
    summary: 'Shows a generous share bar, nine tenths, until the white arrow reaches it; then it drops to half while the reward flows in.',
    tell: 'Share bar shrinks at the white arrow.',
    create: () => ({ decide: (v) => ({ vote: 0, share: v.white === v.id ? 5 : 9, people: everyone(v) }) }),
  },
};

/** A varied roster: at least one from each family, the rest at random, in a random join order. */
export function selectRoster(rng, count = 5) {
  const keys = Object.keys(STRATEGIES);
  const picks = Object.keys(FAMILIES).map((fam) => shuffle(rng, keys.filter((k) => STRATEGIES[k].family === fam))[0]);
  const rest = shuffle(rng, keys.filter((k) => !picks.includes(k)));
  return shuffle(rng, [...picks, ...rest].slice(0, count));
}
