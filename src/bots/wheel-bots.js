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
    voteSpeed: s.voteSpeed,
    slowest: s.slowest,
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
    if (Math.abs(othersNet) > v.reverseAbove) coming = -v.dir;
    else speed = v.minSpeed;
  }
  const next = turnTo(v.theta + coming * speed, target.angle);
  const now = turnTo(v.theta, target.angle);
  if (Math.abs(next) < half) return 0; // still in the target's segment next second
  if (Math.abs(next) < Math.abs(now)) return 0; // already heading towards it
  const want = Math.sign(now) || -coming;
  const againstMomentum = want !== v.dir;
  const needed = Math.abs(othersNet) + 1 + (v.reverseAbove > 0 && againstMomentum ? Math.max(0, v.reverseAbove - Math.abs(othersNet)) : 0);
  return needed <= strength ? want * needed : 0;
}

/**
 * Wishes (Jason, 2026-11-09: "Bots show their wish"). With momentum above one player's vote, a bot
 * can't turn the wheel back alone, but its vote still counts: with the momentum it speeds the wheel
 * up; against it, it cancels others' speed-ups, and together with others (more than 9) it turns the
 * wheel back. Bots vote their wish at the moments that matter to them, even when they can't win
 * alone, so the player can see it (2017: the vote direction shows on each disc) and tip the balance.
 */
const HALF = (v) => 180 / v.n;
/** Where an arrow is relative to a player: 'on' (in their segment), 'next' (heading their way, within a
 * seat and a half), or null. */
export function arrowAt(v, angle, id) {
  const p = v.players.find((x) => x.id === id);
  const d = turnTo(angle, p.angle);
  if (Math.abs(d) < HALF(v)) return 'on';
  if (Math.sign(d) === v.dir && Math.abs(d) < 3 * HALF(v)) return 'next';
  return null;
}
/** Bots keep a reserve: they stop paying to steer below this share of the stake. */
const canPay = (v, reserve) => v.me.balance >= reserve * v.stake;
/** Bring the white arrow to a player: hurry it when it is next, hold it back while it is there. */
export function bring(v, id, strength, reserve = 0.25) {
  if (!canPay(v, reserve)) return 0;
  const at = arrowAt(v, v.theta, id);
  return at === 'next' ? v.dir * strength : at === 'on' ? -v.dir * strength : 0;
}
/** The poorest player, if below `below` of the stake. */
const poorest = (v, below) => {
  const p = v.players.reduce((a, x) => (x.balance < a.balance ? x : a));
  return p.balance < below * v.stake ? p : null;
};
/**
 * Rescue the poorest player, if they are below `below` of the stake: hurry the black arrow past them,
 * and hurry the white arrow to them. It never tries to turn the wheel back, which would send the
 * black arrow over the player who has just paid.
 */
export function rescue(v, strength, below = 0.4, reserve = 0.25) {
  const p = poorest(v, below);
  if (!p || !canPay(v, reserve)) return 0;
  if (arrowAt(v, v.theta + 180, p.id) === 'on') return v.dir * strength;
  if (arrowAt(v, v.theta, p.id) === 'next') return v.dir * strength;
  return 0;
}

/**
 * Stewarding the table: hurry the black arrow past a player in danger (below `below` of the stake),
 * and hurry the white arrow past a player who passes on little (share dial at `stingy` tenths or
 * less), whose fee would swallow most of the reward. Both help everyone, at the steward's cost.
 */
export function steward(v, strength, below = 0.4, stingy = 3, reserve = 0.25) {
  if (!canPay(v, reserve)) return 0;
  const p = poorest(v, below);
  if (p && arrowAt(v, v.theta + 180, p.id) === 'on') return v.dir * strength;
  const w = v.players.find((x) => x.id === v.white);
  if (w.id !== v.id && w.share <= stingy) return v.dir * strength;
  return 0;
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
    summary: 'Pays to hurry the white arrow towards itself and to hold it back while it is there. Shares half, the most it can keep.',
    tell: 'Votes as the white arrow nears it, and against the wheel while it has it.',
    create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 3), share: 5, people: everyone(v) }) }),
  },
  sharerSteerer: {
    label: 'Patron', family: 'steerer',
    summary: 'Pays to bring the white arrow to whoever else has shared most lately: hurrying it there, holding it back while it is there. Shares seven tenths.',
    tell: 'Votes as the white arrow nears the most generous player.',
    create: () => {
      const memory = sharingMemory();
      return {
        decide: (v) => {
          const score = memory(v);
          const best = others(v).reduce((a, p) => (score[p.id] > score[a.id] + 1e-9 ? p : a));
          return { vote: bring(v, best.id, 2), share: 7, people: everyone(v) };
        },
      };
    },
  },
  poorSteerer: {
    label: 'Lifeguard', family: 'steerer',
    summary: 'When a player falls below four tenths of the stake, it pays to hurry the black arrow past them and the white arrow to them. Shares seven tenths.',
    tell: 'Votes when an arrow nears the poorest player.',
    create: () => ({ decide: (v) => ({ vote: rescue(v, 3), share: 7, people: everyone(v) }) }),
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
