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
export function rescue(v, strength, below = 0.4, reserve = 0.25, whiteTo = () => true) {
  const p = poorest(v, below);
  if (!p || !canPay(v, reserve)) return 0;
  if (arrowAt(v, v.theta + 180, p.id) === 'on') return v.dir * strength;
  if (arrowAt(v, v.theta, p.id) === 'next' && whiteTo(p.id)) return v.dir * strength;
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

/*
 * Every bot learns, and shows what it learned (Jason, 2026-11-09: "Bots are standing in for human
 * players. As long as there is feedback, and time to learn, a player should eventually adjust from
 * experience. While the rules and fees are one feedback, player reactions are another." ... "Every
 * bot should learn and demonstrate what they learn.")
 *
 * Each bot keeps its character as its opening habit, so its tell shows early, and learns from both
 * kinds of feedback with its own temperament. When it learns something it says so: decide() returns
 * `note`, a sentence the page shows in What's happening ("@[id]" stands for a player's name).
 */

/**
 * Experience: a player's results lap by lap. A lap runs from the end of one white-arrow visit to the
 * end of the next, so each lap holds one visit of each arrow and laps compare fairly. Also counts
 * reactions: seconds in which the others' votes hurried the white arrow on while this player had it.
 */
function experience() {
  let mark = null;
  let had = false;
  let laps = 0;
  let hurried = 0;
  let hurriedVisit = 0;
  let last = null;
  return (v) => {
    const st = v.me.stats;
    const now = { kept: v.me.balance + st.paid + st.voted, reward: st.reward, sharesIn: st.sharesIn, sharesOut: st.sharesOut, voted: st.voted, boost: st.boost, t: v.t };
    mark ??= now;
    const has = v.white === v.id;
    if (has && others(v).reduce((a, p) => a + p.vote, 0) * v.dir > 0) { hurried++; hurriedVisit++; }
    let lap = null;
    if (had && !has) {
      const d = (k) => now[k] - mark[k];
      lap = { reward: d('reward'), kept: d('kept'), sharesIn: d('sharesIn'), sharesOut: d('sharesOut'), voted: d('voted'), boost: d('boost'), hurried: hurriedVisit, secs: d('t') };
      lap.keptRate = lap.reward > 0 ? lap.kept / lap.reward : null; // what it kept per token of reward
      lap.backRate = lap.sharesOut > 0 ? lap.sharesIn / lap.sharesOut : null; // what came back per token passed on
      laps++;
      mark = now;
      hurriedVisit = 0;
      last = lap;
    }
    had = has;
    return { lap, laps, hurried, last, visitHurried: hurriedVisit };
  };
}
/**
 * Builds a bot from a step function that may set a note. Each bot speaks at most once a lap (Jason,
 * 2026-11-09: "Each bot once a lap at most"): a lap starts as the white arrow leaves it, and a note
 * that comes after one already given in the same lap is not said (the change still shows on its dials).
 */
function teach(stepFn) {
  let had = false;
  let spoke = false;
  return {
    decide: (v) => {
      const out = stepFn(v);
      const has = v.white === v.id;
      if (had && !has) spoke = false; // a new lap
      had = has;
      let note = out.note ?? null;
      if (note && spoke) note = null;
      else if (note) spoke = true;
      return { vote: out.vote ?? 0, share: out.share, people: out.people, note };
    },
  };
}
const othersAverageShare = (v) => { const o = others(v); return o.reduce((a, p) => a + p.share, 0) / o.length; };
const tenths = (x) => Math.round(x * 10);

/** The Sharer: passes on 8/10 to everyone. It learns from what comes back: when others give back
 * less than half of what it passes on, it eases down a tenth at a time (never below half); when they
 * give back more, it shares more again. */
function sharer() {
  const xp = experience();
  let share = 8;
  return teach((v) => {
    const e = xp(v);
    let note = null;
    if (e.lap && e.laps >= 2 && e.lap.backRate != null) {
      const back = e.lap.backRate;
      if (back < 0.5 && share > 5) { share--; note = `eases to ${share}/10: only ${tenths(back)} came back to it for every 10 it passed on last lap`; }
      else if (back >= 0.8 && share < 8) { share++; note = `shares more again, ${share}/10: ${tenths(back)} came back to it for every 10 it passed on last lap`; }
    }
    return { share, people: v.n, note };
  });
}

/** The Keeper: keeps everything, and is stubborn about it. It starts sharing only when the fees have
 * cost it four tenths of its stake, or others have hurried the white arrow past it for 5 seconds;
 * then it shares a little more every 10 seconds, up to the others' average (between half and 8/10). */
function keeper() {
  const xp = experience();
  let share = 0;
  let reformed = false;
  let lastStep = 0;
  return teach((v) => {
    const e = xp(v);
    let note = null;
    if (!reformed) {
      if (v.me.balance < 0.6 * v.stake) { reformed = true; note = 'starts sharing: the fees have cost it four tenths of its stake'; }
      else if (e.hurried >= 5) { reformed = true; note = 'starts sharing: others kept hurrying the white arrow past it'; }
      if (reformed) lastStep = v.t - 10;
    }
    if (reformed && v.t - lastStep >= 10) {
      const target = Math.max(5, Math.min(8, Math.round(othersAverageShare(v))));
      if (share < target) { share = Math.min(target, share + 2); lastStep = v.t; }
    }
    return share ? { share, people: v.n, note } : { share: 0, people: 1, note };
  });
}

/** The Free Rider: passes on half, but only to itself, which counts as keeping. It learns from the fee:
 * after two laps in which the fee left it with less than a tenth of its reward, or once others have
 * hurried the white arrow past it for 3 seconds, it widens its sharing, a step a lap, to everyone. */
function freeRider() {
  const xp = experience();
  let people = 1;
  let poorLaps = 0;
  let reacted = false;
  return teach((v) => {
    const e = xp(v);
    let note = null;
    const widen = (why) => {
      people = people === 1 ? 3 : v.n;
      note = `${people >= v.n ? 'widens its sharing to everyone' : 'widens its sharing to the 2 nearest'}: ${why}`;
    };
    if (e.lap && e.lap.keptRate != null) {
      poorLaps = e.lap.keptRate < 0.1 ? poorLaps + 1 : 0;
      if (people < v.n && poorLaps >= 2) widen('the fee took nearly all it kept, because sharing only with itself counts as keeping');
      else if (people > 1 && people < v.n && e.lap.keptRate >= 0.1) widen('sharing beyond itself left it with more');
    }
    if (!reacted && people === 1 && e.hurried >= 3) { reacted = true; widen('others hurried the white arrow past it'); }
    return { share: 5, people, note };
  });
}

/** The Opportunist: shows 9/10, but cuts to half while the white arrow is with it. It learns from
 * reactions: if others hurry the white arrow past it while it cuts its sharing, it drops the trick.
 * If three laps go by and nobody has reacted, it says so: the trick is working. */
function opportunist() {
  const xp = experience();
  let trick = true;
  let saidWorks = false;
  return teach((v) => {
    const e = xp(v);
    let note = null;
    if (trick && v.white === v.id && e.visitHurried >= 2) { trick = false; note = 'drops its trick and keeps sharing 9/10 at the white arrow: others hurried the arrow past it while it cut its sharing'; }
    if (trick && !saidWorks && e.laps >= 3 && e.hurried === 0) { saidWorks = true; note = 'keeps cutting its sharing at the white arrow: in three laps nobody has reacted'; }
    return { share: trick && v.white === v.id ? 5 : 9, people: v.n, note };
  });
}

/** The Reciprocator: shares as much as the others do on average (between 2 and 9 tenths). Once a lap,
 * as the white arrow leaves it, it says where following them has taken it since it last spoke. */
function reciprocator() {
  let share = null;
  let said = null;
  let had = false;
  return teach((v) => {
    share = Math.max(2, Math.min(9, Math.round(othersAverageShare(v))));
    said ??= share;
    const has = v.white === v.id;
    let note = null;
    if (had && !has && share !== said) {
      note = `${share > said ? 'shares more' : 'shares less'}, ${share}/10 (from ${said}/10): following the others' average sharing`;
      said = share;
    }
    had = has;
    return { share, people: v.n, note };
  });
}

/** The Self-Steerer: hurries the white arrow towards itself (and holds it back when that pays). It
 * learns from its results: after a lap in which its votes cost more than its reward rose, it steers
 * less, until it stops steering for itself. Hurrying brings the arrow sooner, not for longer. */
function selfSteerer() {
  const xp = experience();
  let strength = 3;
  let prevReward = null;
  return teach((v) => {
    const e = xp(v);
    let note = null;
    if (e.lap) {
      if (strength > 0 && e.lap.voted > 0 && prevReward != null && e.lap.reward - prevReward <= e.lap.voted) {
        strength--;
        note = strength
          ? `steers less: it spent ${tok(e.lap.voted)} on votes last lap, and its reward didn't rise to match`
          : 'stops steering for itself: hurrying the arrow brought it no more reward than its votes cost';
      }
      prevReward = e.lap.reward;
    }
    return { vote: strength ? bring(v, v.id, strength) : 0, share: 5, people: v.n, note };
  });
}

/** The Patron: hurries the white arrow towards whoever else has shared most lately. It learns whose
 * turn at the white arrow brings it nothing back: after two laps, it hurries the arrow past a player
 * who sends it almost nothing while they have it. */
function patron() {
  const memory = sharingMemory();
  const xp = experience();
  const back = {}; // per holder: shares that reached the patron while they had the white arrow, and seconds
  let lastIn = null;
  const passOver = new Set();
  return teach((v) => {
    const score = memory(v);
    const e = xp(v);
    let note = null;
    if (lastIn != null && v.white !== v.id) {
      const b = (back[v.white] ??= { got: 0, secs: 0 });
      b.got += v.me.stats.sharesIn - lastIn;
      b.secs++;
    }
    lastIn = v.me.stats.sharesIn;
    if (e.lap && e.laps >= 2) {
      const rates = Object.entries(back).filter(([, b]) => b.secs >= 6).map(([id, b]) => [id, b.got / b.secs]);
      const avg = rates.reduce((a, [, r]) => a + r, 0) / Math.max(1, rates.length);
      for (const [id, r] of rates) {
        if (!passOver.has(id) && r < 0.15 * avg) { passOver.add(id); note = `hurries the white arrow past @[${id}]: almost nothing comes back to it while @[${id}] has the arrow`; break; }
      }
    }
    let vote;
    if (passOver.has(v.white) && canPay(v, 0.25)) vote = v.dir * 2;
    else {
      const best = others(v).filter((p) => !passOver.has(p.id)).reduce((a, p) => (!a || score[p.id] > score[a.id] + 1e-9 ? p : a), null);
      vote = best ? bring(v, best.id, 2) : 0;
    }
    return { vote, share: 7, people: v.n, note };
  });
}

/** The Lifeguard: hurries the black arrow past the poorest player and the white arrow to them. It
 * learns when that help is swallowed: if the poorest keeps less than a tenth of the reward that
 * reaches them, it stops hurrying the white arrow to them, but still hurries the black arrow past. */
function lifeguard() {
  const noWhite = new Set();
  const visit = {}; // the current white-arrow holder's balance and reward when its visit began
  let holder = null;
  return teach((v) => {
    let note = null;
    if (v.white !== holder) {
      const h = holder && v.players.find((p) => p.id === holder);
      if (h && visit.reward != null) {
        const got = h.reward - visit.reward;
        const kept = h.balance - visit.balance + (h.owes ?? 0);
        const poor = h.balance < 0.4 * v.stake;
        if (poor && got > 5 * UNIT && kept < 0.1 * got && !noWhite.has(h.id)) {
          noWhite.add(h.id);
          note = `stops hurrying the white arrow to @[${h.id}]: the fee swallowed what reached them; it still hurries the black arrow past them`;
        }
      }
      holder = v.white;
      const w = v.players.find((p) => p.id === holder);
      visit.reward = w.reward;
      visit.balance = w.balance;
    }
    return { vote: rescue(v, 3, 0.4, 0.25, (id) => !noWhite.has(id)), share: 7, people: v.n, note };
  });
}
const tok = (u) => Math.round(u / UNIT);

/**
 * The Learner: Win-Stay, Lose-Shift on its own results. It starts at a random share dial. After each
 * lap it compares what it kept per token of reward with the lap before: if it did at least as well,
 * it moves its dial 2 tenths further the same way; if worse, it turns back.
 */
function learner(rng) {
  const xp = experience();
  let share = Math.floor(rng() * 11);
  let way = rng() < 0.5 ? -1 : 1;
  let last = null;
  return teach((v) => {
    const e = xp(v);
    let note = null;
    if (e.lap && e.lap.keptRate != null) {
      const score = e.lap.keptRate;
      const result = last == null ? 'start' : score < last ? 'worse' : 'better';
      if (result === 'worse') way = -way; // lose: shift
      last = score;
      const was = share;
      share = Math.max(0, Math.min(10, share + 2 * way));
      if (share === 0 || share === 10) way = -way; // at an end, the next try goes back
      if (share !== was) {
        note = `${share > was ? 'shares more' : 'shares less'}, ${share}/10: ${result === 'start' ? 'trying a change after its first lap'
          : result === 'better' ? 'it kept more per token of reward last lap than the lap before, so it tries further the same way'
            : 'it kept less per token of reward last lap than the lap before, so it turns back'}`;
      }
    }
    return { share, people: v.n, note };
  });
}

export const STRATEGIES = {
  sharer: {
    label: 'Sharer', family: 'sharer',
    summary: 'Starts passing on eight tenths of everything to everyone, and never steers. Learns from what comes back: eases down (never below half) when others give back less than half of what it passes on, and shares more again when they give back more.',
    tell: 'Share bar long; dips a tenth at a time when little comes back.',
    create: () => sharer(),
  },
  keeper: {
    label: 'Keeper', family: 'keeper',
    summary: 'Starts keeping everything, and is stubborn about it. Starts sharing only once the fees have cost it four tenths of its stake, or others have hurried the white arrow past it for 5 seconds; then shares a little more every 10 seconds.',
    tell: 'Share bar empty, then filling, late.',
    create: () => keeper(),
  },
  freeRider: {
    label: 'Free Rider', family: 'keeper',
    summary: 'Starts sharing half of what it receives, but only with itself, so nothing reaches anyone else. Learns from the fee: after two laps in which it kept less than a tenth of its reward, or once others hurry the arrow past it, it widens its sharing to more people.',
    tell: 'Share bar at half, people dial at one, then widening.',
    create: () => freeRider(),
  },
  selfSteerer: {
    label: 'Self-Steerer', family: 'steerer',
    summary: 'Starts paying to hurry the white arrow towards itself, holding it back only when that pays. Shares half. Learns from its results: when its votes cost more than its reward rose, it steers less, until it stops.',
    tell: 'Votes as the white arrow nears it, less each lap.',
    create: () => selfSteerer(),
  },
  sharerSteerer: {
    label: 'Patron', family: 'steerer',
    summary: 'Starts paying to hurry the white arrow towards whoever else has shared most lately. Shares seven tenths. Learns whose turn at the white arrow brings it nothing back, and hurries the arrow past them.',
    tell: 'Votes as the white arrow nears the most generous, and to hurry it past a keeper.',
    create: () => patron(),
  },
  poorSteerer: {
    label: 'Lifeguard', family: 'steerer',
    summary: 'When a player falls below four tenths of the stake, it pays to hurry the black arrow past them and the white arrow to them. Shares seven tenths. Learns when its help is swallowed by the fee, and then only hurries the black arrow past them.',
    tell: 'Votes when an arrow nears the poorest player.',
    create: () => lifeguard(),
  },
  reciprocator: {
    label: 'Reciprocator', family: 'sharer',
    summary: 'Shares as much as the others do on average, between two and nine tenths, following them up or down, and says once a lap where that has taken it. Never steers.',
    tell: 'Its share bar follows the table.',
    create: () => reciprocator(),
  },
  learner: {
    label: 'Learner', family: 'learner',
    summary: 'Starts at a random share and learns from its own results: after each turn of the wheel it moves its share dial again the same way if it kept more per token of reward than the turn before, or turns back if it kept less (Win-Stay, Lose-Shift).',
    tell: 'Its share bar moves by two tenths once a lap, just after the white arrow leaves it.',
    create: (rng) => learner(rng),
  },
  opportunist: {
    label: 'Opportunist', family: 'keeper',
    summary: 'Shows a generous share bar, nine tenths, but cuts to half while the white arrow is with it. Learns from reactions: drops the trick if others hurry the arrow past it while it cuts; says so if nobody reacts.',
    tell: 'Share bar shrinks at the white arrow, until someone reacts.',
    create: () => opportunist(),
  },
};

/** A varied roster: at least one from each family, the rest at random, in a random join order. */
export function selectRoster(rng, count = 5) {
  const keys = Object.keys(STRATEGIES);
  const picks = Object.keys(FAMILIES).map((fam) => shuffle(rng, keys.filter((k) => STRATEGIES[k].family === fam))[0]);
  const rest = shuffle(rng, keys.filter((k) => !picks.includes(k)));
  return shuffle(rng, [...picks, ...rest].slice(0, count));
}
