// Game 3: the Wheel of Fortune Sharing Game (working title), from "Wheel of Fortune Sharing
// Game", 2017-11-19, and Game 3 in TrunK of Commons, 2018-08-07.
//
// Pure rules. No DOM, no randomness. Time moves in ticks of one second (Jason, 2026-11-09:
// "tick is fine for accounting"). Every token movement is a parcel with a departure tick and an
// arrival tick, so the page can draw it as a smooth stream that arrives on time.
//
// One tick:
//   1. rotation votes are paid into the boost fund; their sum sets the wheel's direction and speed
//   2. players on the black side pay into the reward stream, which leaves for the white arrow
//   3. the wheel turns
//   4. parcels due this tick arrive: each player keeps part (less the fee) and shares the rest
//   5. the table ends if anyone couldn't pay, or the clock has run out
//
// Amounts are whole hundredths of a token (UNIT = 100), so every token is accounted for exactly.
// SPDX-License-Identifier: AGPL-3.0-only

export const UNIT = 100; // hundredths of a token
export const MAX_TICKS = 360; // six minutes (Jason, 2026-11-09)

/**
 * Core rules first (Jason, 2026-11-09). Options keep the 2017 variants so simulations can compare.
 * stake: tokens each player brings: 1,000 (Jason, 2026-11-09, from simulation; 2017 had 100).
 * maxTicks: the table's length in seconds. 360 = six minutes (Jason, 2026-11-09).
 * minSpeed: the wheel never turns slower than this, in degrees a second (2017: 6).
 * minVote: 0 lets a player not vote (core, 2026-11-09); 1 is 2017's "no neutral position".
 * maxVote: the strongest vote, in degrees a second (2017: 9).
 * voteCost: tokens a second for each degree of vote. 0.25 (default, Jason 2026-11-09: "Cheaper votes"),
 *   a quarter of 2017's price of 1, so steering can help the table without bankrupting the steerer.
 * reverseAbove: the net vote against the wheel's direction must be more than this to turn it round.
 *   9 (default, Jason 2026-11-09: "Make momentum too difficult for one player to hold back"): more
 *   than one player's strongest vote, so momentum carries the arrow round to every seat and only
 *   two or more players together can turn it back. 6 is 2017's rule, which one player could beat
 *   alone; 0 lets any net vote turn it (the first core).
 * blackRun: the most seconds in a row a player pays the black arrow's amount; after that they pay
 *   the grey amount until the black arrow moves on (Infinity: no limit). An experiment
 *   (2026-11-09) against one player pinning another; not needed while momentum is above one
 *   player's vote, but kept for when gangs can hold the arrow.
 * collect: what the black side pays each second: the seat holding the black arrow pays `black`,
 *   other seats within `greyReach` degrees of it pay `grey` (2017: 9, 1 and 90°).
 * rewardTransit: seconds for the reward to cross from the black arrow to the white (2017: 2). It
 *   lands on whoever is at the white arrow when it arrives.
 * shareSpeed: degrees a second a share travels round the rim (2017: 45).
 * minParcel: a parcel smaller than this (tokens) isn't split again; it is kept (2017: 0.1).
 * boostMax: the boost, in % of the amount shared, for sharing with everyone (2017: 10). Sharing
 *   with fewer people boosts in proportion.
 * selfShare: what happens to the slice a player shares with themselves.
 *   'kept' (default, Jason 2026-11-09): it counts as kept, so the fee and the boost follow only what
 *     goes to other people, and sharing only with yourself is keeping.
 *   'cascade' (2017 as written): it comes back as incoming and is shared again by their settings.
 *     A loophole: sharing everything with only yourself was the best style of all (+622).
 * boostStart: tokens in the boost fund when the table starts (2017 doesn't say; 0).
 * endBonus: what finishing the full six minutes earns, when the poorest player still holds at least
 *   10% of the stake. The bonus is 2% (poorest holds 10-20% of the stake) up to 10% (90% or more).
 *   'refund' (default, Jason 2026-11-09): the game's boost fund is shared equally among the players
 *            instead of going to the common fund, and the common fund adds the bonus, as a % of
 *            each player's stake. A table that busts loses its fund.
 *   '2017'   as written: the bonus is added to the boost on shares still travelling at the end.
 *            Simulated: it changes nothing (nets moved by 3 tokens at most).
 *   'none'   no bonus (the first core)
 * delays: 2017's "privilege as latency": a change to a vote dial takes effect after a delay of up to
 *   1.5 seconds by seat (none at the white arrow, the most at the black) plus up to 1.5 seconds for an
 *   extreme vote (none for 1, the most for 9), rounded to whole seconds. Off in the core.
 * maxDepth: settling rounds within one second (a slice shared with yourself comes straight back);
 *   after this many, what's left is kept, so a loop can't run for ever.
 * record: keep a per-tick history for the page and the round log (simulations turn it off).
 */
export function createGame({
  players, seed = 0, stake = 1000, maxTicks = MAX_TICKS, minSpeed = 6, minVote = 0, maxVote = 9, voteCost = 0.25, reverseAbove = 9, blackRun = Infinity,
  collect = { black: 9, grey: 1 }, greyReach = 90, rewardTransit = 2, shareSpeed = 45, minParcel = 0.1, boostMax = 10,
  selfShare = 'kept', boostStart = 0, endBonus = 'refund', delays = false, maxDepth = 40, record = true,
}) {
  if (!players || players.length < 3) throw new Error('Need at least 3 players');
  const n = players.length;
  const pos = joinPositions(n);
  const start = Math.round(stake * UNIT);
  return {
    seed, n, maxTicks, minSpeed, minVote, maxVote, voteCost, reverseAbove, blackRun, greyReach, rewardTransit, shareSpeed, boostMax, selfShare, endBonus, delays, maxDepth, record,
    collect: { black: Math.round(collect.black * UNIT), grey: Math.round(collect.grey * UNIT) },
    minParcel: Math.round(minParcel * UNIT),
    stake: start,
    t: 0, // ticks played
    holder: players[0].id, // who has had the white arrow in their segment, and since when
    holderSince: 0,
    theta: 0, // angle of the white arrow, degrees clockwise from seat 0 (the initiator)
    dir: 1, // 1 clockwise, -1 anticlockwise. 2017: clockwise, towards the second player to join
    speed: minSpeed,
    players: players.map((p, i) => ({
      id: p.id,
      join: i,
      pos: pos[i],
      balance: p.balance != null ? Math.round(p.balance * UNIT) : start,
      start: p.balance != null ? Math.round(p.balance * UNIT) : start,
      settings: { vote: 0, share: 0, people: 1, ...(p.settings ?? {}) },
      voteLog: [], // with delays on: recent dial values, { t, v, at } (at: when each takes effect)
      effVote: 0, // the vote in effect (equals the dial unless delays are on)
      atBlack: 0, // seconds in a row at the black arrow
      stats: { paid: 0, voted: 0, reward: 0, sharesIn: 0, sharesOut: 0, fees: 0, boost: 0 },
    })),
    fund: { start: Math.round(boostStart * UNIT), balance: Math.round(boostStart * UNIT), fees: 0, votes: 0, boostPaid: 0, forfeits: 0, refunded: 0 },
    commonIn: 0, // tokens the common fund added (the end bonus); the only tokens that enter a table
    bonus: null, // { pct, poorest } when the table earns the end bonus
    transit: [], // parcels on their way: { id, kind, from, to, amount, depart, arrive }
    nextParcel: 0,
    ticks: [], // per-tick records when record is on
    status: 'playing',
    endReason: null, // 'time' or 'bust'
    bust: [], // ids that couldn't pay
  };
}

/**
 * Where each player sits, by join order (2017): the initiator at the white arrow, then each new
 * player in the next closest seat, alternating sides, so the last to join sits at the black arrow.
 * Returns the seat (0..n-1, clockwise) for each join index. Six players: [0, 1, 5, 2, 4, 3].
 */
export function joinPositions(n) {
  const out = [0];
  for (let k = 1; out.length < n; k++) {
    out.push(k);
    if (out.length < n) out.push(n - k);
  }
  return out;
}

const mod = (a, m) => ((a % m) + m) % m;
export const seatAngle = (s, pos) => (pos * 360) / s.n;
/** 2017 vote delay in whole seconds: up to 1.5 by seat (darker seats wait longer) plus up to 1.5 for
 * an extreme vote. */
export function voteDelay(s, p, v) {
  const bySeat = (1.5 * angDist(seatAngle(s, p.pos), s.theta)) / 180;
  const byVote = v === 0 ? 0 : (1.5 * (Math.abs(v) - 1)) / (s.maxVote - 1);
  return Math.round(bySeat + byVote);
}

/** Smallest angle between two directions, 0..180. */
export const angDist = (a, b) => { const d = mod(a - b, 360); return Math.min(d, 360 - d); };
/** Signed shortest turn from angle a to angle b, in (-180, 180]. Positive is clockwise. */
export const turnTo = (a, b) => { const d = mod(b - a, 360); return d > 180 ? d - 360 : d; };
/** The seat whose segment holds this angle. */
export const posAt = (s, angle) => mod(Math.round(mod(angle, 360) / (360 / s.n)), s.n);
export const playerAtPos = (s, pos) => s.players.find((p) => p.pos === pos);
export const whiteId = (s) => playerAtPos(s, posAt(s, s.theta)).id;
export const blackId = (s) => playerAtPos(s, posAt(s, s.theta + 180)).id;
export const seatDistance = (s, a, b) => { const d = mod(a - b, s.n); return Math.min(d, s.n - d); };

/** What each player owes the reward stream this second, by where the black arrow is. */
export function quotas(s) {
  const black = s.theta + 180;
  const bpos = posAt(s, black);
  return s.players.map((p) => {
    if (p.pos === bpos) return s.collect.black;
    return angDist(seatAngle(s, p.pos), black) < s.greyReach ? s.collect.grey : 0;
  });
}

/** Seconds for a share to travel round the rim from one seat to another (0 to oneself). */
export function transitTicks(s, fromPos, toPos) {
  const d = seatDistance(s, fromPos, toPos);
  return d === 0 ? 0 : Math.ceil((d * 360) / s.n / s.shareSpeed - 1e-9);
}

/**
 * The 2017 fee on kept tokens, by the share of incoming tokens passed on (0..1): 95% when sharing
 * nothing, otherwise 100% minus the share. Sharing half keeps the most: a quarter of what came in.
 */
export const feePct = (f) => (f <= 0 ? 95 : Math.round((1 - f) * 100));

/**
 * The nearest people to a seat, the player first, then alternately clockwise and anticlockwise.
 * people counts the player (Jason, 2026-11-09: the dial counts people, not tenths).
 */
export function nearest(s, pos, people) {
  const out = [pos];
  for (let d = 1; out.length < Math.min(people, s.n); d++) {
    out.push(mod(pos + d, s.n));
    if (out.length < people) out.push(mod(pos - d, s.n));
  }
  return out;
}

/** Validate and apply setting changes: { id: { vote?, share?, people? } }. */
function applyDecisions(s, decisions = {}) {
  return s.players.map((p) => {
    const d = decisions[p.id];
    if (!d) return p;
    const st = { ...p.settings };
    if (d.vote != null) st.vote = Math.max(-s.maxVote, Math.min(s.maxVote, Math.trunc(d.vote)));
    if (d.share != null) st.share = Math.max(0, Math.min(10, Math.round(d.share)));
    if (d.people != null) st.people = Math.max(1, Math.min(s.n, Math.round(d.people)));
    return { ...p, settings: st };
  });
}

/** Play one second. decisions change players' dials from this tick on (they persist). */
export function step(s, decisions = {}) {
  if (s.status !== 'playing') throw new Error('The table is over');
  const t = s.t;
  const players = applyDecisions(s, decisions).map((p) => ({ ...p, stats: { ...p.stats } }));
  const fund = { ...s.fund };
  const st = { ...s, players, fund, transit: s.transit.slice(), bust: [] };
  const rec = st.record ? { t, votes: [], paid: [], kept: [], reward: null, sent: [], theta: 0, dir: 0, speed: 0 } : null;

  // 1. Rotation votes: paid into the boost fund; the net sets direction and speed.
  let net = 0;
  for (const p of players) {
    let v = p.settings.vote;
    if (st.delays) {
      // The most recent dial value whose delay has run out takes effect.
      p.voteLog = [...p.voteLog, { t, v, at: t + voteDelay(st, p, v) }].filter((x) => x.t > t - 4);
      const arrived = p.voteLog.filter((x) => x.at <= t);
      v = arrived.length ? arrived[arrived.length - 1].v : p.effVote;
      p.effVote = v;
    }
    if (v === 0 && st.minVote > 0) v = st.dir * st.minVote; // 2017: no neutral position
    const afford = Math.floor(p.balance / (UNIT * st.voteCost));
    if (Math.abs(v) > afford) v = Math.sign(v) * afford;
    const cost = Math.round(Math.abs(v) * UNIT * st.voteCost);
    p.balance -= cost; p.stats.voted += cost; fund.balance += cost; fund.votes += cost;
    net += v;
    if (rec) rec.votes.push(v);
  }
  if (net * st.dir >= 0) st.speed = Math.max(st.minSpeed, Math.abs(net));
  else if (Math.abs(net) > st.reverseAbove) { st.dir = -st.dir; st.speed = Math.max(st.minSpeed, Math.abs(net)); }
  else st.speed = st.minSpeed; // momentum holds: votes against it only cancel out

  // 2. Collection from the black side, at the wheel's position at the start of the second.
  const q = quotas(st);
  const bpos = posAt(st, st.theta + 180);
  for (const p of players) p.atBlack = p.pos === bpos ? p.atBlack + 1 : 0;
  players.forEach((p, i) => { if (p.atBlack > st.blackRun) q[i] = st.collect.grey; });
  let collected = 0;
  players.forEach((p, i) => {
    const pay = Math.min(q[i], p.balance);
    if (pay < q[i]) st.bust.push(p.id);
    p.balance -= pay; p.stats.paid += pay; collected += pay;
    if (rec) rec.paid.push(pay);
  });
  if (collected > 0) st.transit.push({ id: st.nextParcel++, kind: 'reward', from: null, to: null, amount: collected, depart: t, arrive: t + st.rewardTransit });

  // 3. The wheel turns.
  st.theta = mod(st.theta + st.dir * st.speed, 360);
  const w = whiteId(st);
  if (w !== st.holder) { st.holder = w; st.holderSince = t + 1; }

  // 4. Arrivals.
  const keptBefore = players.map((p) => p.balance);
  deliver(st, t, false, rec);
  if (rec) {
    rec.kept = players.map((p, i) => p.balance - keptBefore[i]);
    Object.assign(rec, { theta: st.theta, dir: st.dir, speed: st.speed, net, white: whiteId(st), black: blackId(st) });
  }

  st.t = t + 1;
  if (rec) st.ticks = [...s.ticks, rec];
  if (st.bust.length) return endTable(st, 'bust');
  if (st.t >= st.maxTicks) return endTable(st, 'time');
  return st;
}

/**
 * Deliver everything due by tick t (or everything when flushing at the end). Each player's
 * arrivals for the second are added up and settled once (Jason, 2026-11-09: "tick is fine for
 * accounting"). A slice shared with yourself arrives the same second, so it is settled again in a
 * further round, up to maxDepth rounds.
 */
function deliver(st, t, flush, rec) {
  let inc = new Map();
  const add = (id, a) => inc.set(id, (inc.get(id) ?? 0) + a);
  st.transit = st.transit.filter((x) => {
    if (!flush && x.arrive > t) return true;
    if (x.kind === 'reward') {
      const to = whiteId(st);
      st.players.find((p) => p.id === to).stats.reward += x.amount;
      if (rec) rec.reward = { to, amount: (rec.reward?.amount ?? 0) + x.amount };
      add(to, x.amount);
    } else add(x.to, x.amount);
    return false;
  });
  for (let round = 0; inc.size; round++) {
    const due = st.players.filter((p) => inc.has(p.id)).map((p) => [p, inc.get(p.id)]);
    inc = new Map();
    for (const [p, x] of due) receive(st, p, x, round, t, flush, add, rec);
  }
}

/** A player receives tokens: keeps part (paying the fee on what they keep) and shares the rest. */
function receive(st, p, x, round, t, flush, add, rec) {
  const { share, people } = p.settings;
  // The fraction of incoming tokens passed on, which sets the fee. With selfShare 'kept', the
  // slice for yourself counts as kept, so sharing only with yourself isn't sharing.
  const kept = st.selfShare === 'kept';
  const targets = kept ? nearest(st, p.pos, people).filter((q) => q !== p.pos) : nearest(st, p.pos, people);
  const f = kept ? (share * targets.length) / (10 * (targets.length + 1)) : share / 10;
  const keepAll = () => {
    const fee = Math.floor((x * feePct(f)) / 100);
    p.balance += x - fee; p.stats.fees += fee; st.fund.balance += fee; st.fund.fees += fee;
  };
  if (x < st.minParcel || f === 0 || round >= st.maxDepth) return keepAll();

  const shared = Math.floor(x * f);
  const keep = x - shared;
  const fee = Math.floor((keep * feePct(f)) / 100);
  p.balance += keep - fee; p.stats.fees += fee; st.fund.balance += fee; st.fund.fees += fee;

  // The boost: boostMax% for sharing with everyone, in proportion for fewer.
  const reach = kept ? targets.length / (st.n - 1) : targets.length / st.n;
  const boost = Math.min(st.fund.balance, Math.floor((shared * st.boostMax * reach) / 100));
  st.fund.balance -= boost; st.fund.boostPaid += boost; p.stats.boost += boost;
  const out = shared + boost;
  const each = Math.floor(out / targets.length);
  p.balance += out - each * targets.length; // the odd hundredths stay with the sharer
  if (each === 0) return;
  for (const pos of targets) {
    const to = playerAtPos(st, pos);
    if (to.id !== p.id) { p.stats.sharesOut += each; to.stats.sharesIn += each; }
    const travel = flush ? 0 : transitTicks(st, p.pos, pos);
    if (travel === 0) { add(to.id, each); continue; }
    const arrive = t + travel;
    const same = st.transit.find((y) => y.kind === 'share' && y.from === p.id && y.to === to.id && y.arrive === arrive);
    if (same) same.amount += each;
    else {
      const parcel = { id: st.nextParcel++, kind: 'share', from: p.id, to: to.id, amount: each, depart: t, arrive };
      st.transit.push(parcel);
      if (rec) rec.sent.push(parcel);
    }
  }
}

/**
 * The table ends (2017): rewards still crossing the wheel are forfeited to the boost fund; shares
 * still travelling complete their journeys with everyone's settings frozen.
 */
function endTable(st, reason) {
  // With record on, keep what the page needs to draw the ending (Jason, 2026-11-09: "The end game
  // flows shut off immediately, and bonus boost is not seen"). Recording changes no rule.
  const ending = st.record ? {
    shares: st.transit.filter((y) => y.kind === 'share').map((y) => ({ ...y })), // still travelling at the bell
    rewards: st.transit.filter((y) => y.kind === 'reward').map((y) => ({ ...y })), // still crossing: forfeited
    bell: st.players.map((p) => p.balance), // balances at the bell
    fundAtBell: st.fund.balance,
  } : null;
  for (const x of st.transit.filter((y) => y.kind === 'reward')) { st.fund.balance += x.amount; st.fund.forfeits += x.amount; }
  st.transit = st.transit.filter((y) => y.kind !== 'reward');
  const pct = reason === 'time' ? bonusPct(st) : 0;
  if (pct && st.endBonus !== 'none') st.bonus = { pct, poorest: Math.min(...st.players.map((p) => p.balance)) };
  if (pct && st.endBonus === '2017') st.boostMax += pct;
  deliver(st, st.t, true, null);
  if (ending) Object.assign(ending, { beforeSplit: st.players.map((p) => p.balance), fundBeforeSplit: st.fund.balance, refundEach: 0, topUp: 0 });
  if (pct && st.endBonus === 'refund') {
    const each = Math.floor(st.fund.balance / st.n);
    const topUp = Math.floor((st.stake * pct) / 100);
    for (const p of st.players) p.balance += each + topUp;
    st.fund.balance -= each * st.n; st.fund.refunded += each * st.n;
    st.commonIn += topUp * st.n;
    if (ending) Object.assign(ending, { refundEach: each, topUp });
  }
  return { ...st, status: 'ended', endReason: reason, ending };
}

/**
 * Each player's account for the table, in hundredths: where every token came from and went. It
 * closes exactly: start - paid - voted + received - sharesOut + boost - fees = beforeSplit, and
 * beforeSplit + refund + bonus = balance. `received` is rewards plus shares in, before sharing.
 */
export function ledger(s, id) {
  const p = s.players.find((x) => x.id === id);
  const st = p.stats;
  const refund = s.ending?.refundEach ?? (s.fund.refunded / s.n);
  const bonus = s.ending?.topUp ?? (s.commonIn / s.n);
  const received = st.reward + st.sharesIn;
  return {
    start: p.start, paid: st.paid, voted: st.voted, reward: st.reward, sharesIn: st.sharesIn, received,
    sharesOut: st.sharesOut, boost: st.boost, fees: st.fees,
    beforeSplit: p.balance - refund - bonus, refund, bonus, balance: p.balance,
  };
}

/** The 2017 end bonus, in %: 0 unless the poorest player holds at least 10% of the stake. */
export function bonusPct(s) {
  const poorest = Math.min(...s.players.map((p) => p.balance)) / s.stake;
  return poorest < 0.1 ? 0 : Math.min(10, Math.floor(poorest * 10) + 1);
}

/** Every token at the table: balances, the boost fund and parcels in transit. Equals the stakes, plus
 * boostStart and anything the common fund added. */
export function totalUnits(s) {
  return s.players.reduce((a, p) => a + p.balance, 0) + s.fund.balance + s.transit.reduce((a, x) => a + x.amount, 0);
}

export const tokens = (units) => units / UNIT;
