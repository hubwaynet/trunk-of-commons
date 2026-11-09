// Strategy bots for the Wheel of Fortune Sharing Game (working title).
// Each strategy: create(rng) -> { decide(view) -> { vote, share, people } }, called every second.
//   vote:   -9..9 tokens a second to turn the wheel (positive is clockwise), 0 for no vote
//   share:  0..10, tenths of incoming tokens to pass on
//   people: 1..n, how many of the nearest people to share with, counting the bot itself
// Bots see only botView: what the 2017 indicators show (everyone's dials, balances and what each
// has shared), the wheel, and the boost fund. Use the supplied rng, never Math.random.
// SPDX-License-Identifier: AGPL-3.0-only

import { whiteId, blackId, seatAngle, turnTo, quotas, feePct, UNIT } from '../engine/wheel.js';
import { shuffle } from '../engine/rng.js';

export const FAMILIES = {
  sharer: 'Sharers',
  keeper: 'Keepers',
  steerer: 'Steerers',
  learner: 'Learners',
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
    voteCost: s.voteCost,
    voteCostAgainst: s.voteCostAgainst,
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
/**
 * What one second of the white arrow on `id` is worth to the bot, in tokens: the reward stream (what
 * the black side pays this second) times the part of it that ends up with the bot. For itself, that
 * is what it keeps after sharing and the fee; for someone else, the slice of their shares that comes
 * to the bot (with the boost), if the bot is among the people they share with.
 */
export function arrowWorth(v, id) {
  const reward = v.players.reduce((a, p) => a + p.owes, 0) / UNIT;
  const p = v.players.find((x) => x.id === id);
  const others = Math.max(0, Math.min(p.people, v.n) - 1);
  const f = others ? (p.share * others) / (10 * (others + 1)) : 0;
  if (id === v.id) return reward * (1 - f) * (1 - feePct(f) / 100);
  if (!others) return 0;
  const d = (a, b) => { const x = (((a - b) % v.n) + v.n) % v.n; return Math.min(x, v.n - x); };
  const me = v.players.find((x) => x.id === v.id);
  const reach = [...v.players].filter((x) => x.id !== p.id).sort((a, b) => d(a.pos, p.pos) - d(b.pos, p.pos)).slice(0, others);
  if (!reach.some((x) => x.id === me.id)) return 0;
  return (reward * f * (1 + others / (v.n - 1) / 10)) / others;
}
/**
 * Holding pays only if slowing the wheel by a degree buys more than it costs (Jason, 2026-11-09:
 * "Smarter bots, not protection"). Slowing by k degrees a second keeps the arrow there about k/speed
 * of a second longer each second, at k times the price of a vote against the wheel.
 */
export const holdPays = (v, id) => arrowWorth(v, id) / Math.max(1, v.minSpeed) > (v.voteCostAgainst ?? v.voteCost ?? 1);
/**
 * Bring the white arrow to a player: hurry it when it is next; hold it back while it is there, but
 * only when that pays (unless `always`, the stubborn holder kept for learner styles and comparisons).
 */
export function bring(v, id, strength, reserve = 0.25, always = false) {
  if (!canPay(v, reserve)) return 0;
  const at = arrowAt(v, v.theta, id);
  if (at === 'next') return v.dir * strength;
  if (at === 'on' && (always || holdPays(v, id))) return -v.dir * strength;
  return 0;
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
    summary: 'Pays to hurry the white arrow towards itself, and to hold it back while it is there when that pays more than it costs. Shares half, the most it can keep.',
    tell: 'Votes as the white arrow nears it; against the wheel while it has it, if holding pays.',
    create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 3), share: 5, people: everyone(v) }) }),
  },
  sharerSteerer: {
    label: 'Patron', family: 'steerer',
    summary: 'Pays to bring the white arrow to whoever else has shared most lately: hurrying it there, and holding it back while it is there when what comes back to it pays for that. Shares seven tenths.',
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
  learner: {
    label: 'Learner', family: 'learner',
    summary: 'Learns from its own results: starts at a random share, and after each turn of the wheel moves its share dial again the same way if it kept more per token of reward than the turn before, or turns back if it kept less (Win-Stay, Lose-Shift).',
    tell: 'Its share bar moves by two tenths once a lap, just after the white arrow leaves it.',
    create: (rng) => learner(rng),
  },
  reformedKeeper: {
    label: 'Reformed Keeper', family: 'learner',
    summary: 'Keeps everything until experience tells it otherwise: when the fees have cost it three tenths of its stake, or when others hurry the white arrow past it. Then it starts sharing with everyone, a little more every 10 seconds, up to the table\'s average.',
    tell: 'Share bar empty, then filling after it is hurried past or its tokens fall.',
    create: () => reformedKeeper(),
  },
  opportunist: {
    label: 'Opportunist', family: 'keeper',
    summary: 'Shows a generous share bar, nine tenths, until the white arrow reaches it; then it drops to half while the reward flows in.',
    tell: 'Share bar shrinks at the white arrow.',
    create: () => ({ decide: (v) => ({ vote: 0, share: v.white === v.id ? 5 : 9, people: everyone(v) }) }),
  },
};

/**
 * Learning from experience (Jason, 2026-11-09: "Bots are standing in for human players. As long as
 * there is feedback, and time to learn, a player should eventually adjust from experience. While the
 * rules and fees are one feedback, player reactions are another.")
 *
 * A lap is the time between one white-arrow visit and the next: each lap holds one visit of each
 * arrow, so laps compare fairly. `lapWatcher` reports when the white arrow has just left a player.
 */
function lapWatcher() {
  let had = false;
  return (v) => {
    const has = v.white === v.id;
    const left = had && !has;
    had = has;
    return left;
  };
}
/** What a player made over a lap from what reached it: everything except what the black side took
 * and what it spent on votes, per token of reward that reached it. */
const lapMark = (v) => ({ kept: v.me.balance + v.me.stats.paid + v.me.stats.voted, reward: v.me.stats.reward });

/**
 * The Learner: Win-Stay, Lose-Shift on its own results (the rules and fees as feedback). It starts at
 * a random share dial. After each lap it compares what it kept per token of reward with the lap
 * before: if it did at least as well, it moves its dial again the same way; if worse, it turns back.
 */
function learner(rng) {
  let share = Math.floor(rng() * 11);
  let way = rng() < 0.5 ? -1 : 1;
  let last = null;
  let mark = null;
  let result = null; // 'start', 'better' or 'worse', for the page to say why the dial moved
  const lap = lapWatcher();
  return {
    decide: (v) => {
      mark ??= lapMark(v);
      if (lap(v)) {
        const now = lapMark(v);
        const reward = now.reward - mark.reward;
        if (reward > 0) {
          const score = (now.kept - mark.kept) / reward;
          result = last == null ? 'start' : score < last ? 'worse' : 'better';
          if (result === 'worse') way = -way; // lose: shift
          last = score;
          share = Math.max(0, Math.min(10, share + 2 * way));
          if (share === 0 || share === 10) way = -way; // at an end, the next try goes back
          mark = now;
        }
      }
      return { vote: 0, share, people: v.n, learning: { share, way, result } };
    },
  };
}

/**
 * The Reformed Keeper: keeps everything until experience tells it otherwise. Two kinds of feedback
 * count: the fees biting (its tokens fall below 7/10 of the stake), and other players reacting
 * (3 seconds in which the others' votes hurried the white arrow on while it had it). Then it starts
 * sharing with everyone, 2 tenths more every 10 seconds, up to the others' average (at least half,
 * at most 8 tenths).
 */
function reformedKeeper() {
  let hurried = 0;
  let reformed = null; // { t, why }
  let share = 0;
  let lastStep = 0;
  return {
    decide: (v) => {
      if (!reformed) {
        const othersNet = v.players.filter((p) => p.id !== v.id).reduce((a, p) => a + p.vote, 0);
        if (v.white === v.id && othersNet * v.dir > 0) hurried++;
        if (v.me.balance < 0.7 * v.stake) reformed = { t: v.t, why: 'fees' };
        else if (hurried >= 3) reformed = { t: v.t, why: 'reactions' };
        if (reformed) lastStep = v.t - 10;
      }
      if (reformed && v.t - lastStep >= 10) {
        const others = v.players.filter((p) => p.id !== v.id);
        const target = Math.max(5, Math.min(8, Math.round(others.reduce((a, p) => a + p.share, 0) / others.length)));
        if (share < target) { share = Math.min(target, share + 2); lastStep = v.t; }
      }
      return share ? { vote: 0, share, people: v.n, reformed } : { vote: 0, share: 0, people: 1, reformed };
    },
  };
}

/** A varied roster: at least one from each family, the rest at random, in a random join order. */
export function selectRoster(rng, count = 5) {
  const keys = Object.keys(STRATEGIES);
  const picks = Object.keys(FAMILIES).map((fam) => shuffle(rng, keys.filter((k) => STRATEGIES[k].family === fam))[0]);
  const rest = shuffle(rng, keys.filter((k) => !picks.includes(k)));
  return shuffle(rng, [...picks, ...rest].slice(0, count));
}
