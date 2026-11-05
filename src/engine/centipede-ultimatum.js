// Game 2: Centipede & Ultimatum, from "Game 2 - multiplayer iterated - centipede with
// ultimatum (MI-CU)" in TrunK of Commons, 2018-08-07.
//
// Pure rules. No DOM, no randomness. Play is sequential, so the state moves through
// phases: 'turn' (give, grab or pass), 'divide', 'vote', 'stay', then back to 'turn', until 'ended'.
// SPDX-License-Identifier: AGPL-3.0-only

export const VOTES = [0, 1, 2]; // unacceptable, acceptable, more than acceptable

/**
 * Default (Jason, 2026-11-04): a rejected grabber leaves the table and the pool is refunded.
 * rejectedPool: where a rejected pool goes. 'refund' (default: back to each player in proportion
 *   to what they put in; the votes still go to the Commons) or 'commons' (2018 rule).
 * welcomeAt: 'atLeast' (default; an average of 1.5 or more is welcomed, Jason 2026-11-05)
 *   or 'above' (1.5 counts as accepted, the earlier rule).
 * welcomeBonus: points the Commons adds per player when a split is welcomed (Jason, 2026-11-05).
 * grabOpens: when the pool can be grabbed. 'afterLap' (default): only once every player still at
 *   the table has had a turn since the last split (or the start), so no empty or token pools
 *   (Jason, 2026-11-05). 'nonEmpty': any time the pool has points. 'any': the first draft's rule.
 * rejectedGrabberPoints: 'pool' (default) — a grabber sent out by a rejection leaves all their
 *   points, refund included, in the pool for the players who remain (Jason, 2026-11-05);
 *   'keep' — they leave with their points (the earlier rule).
 * maxRound: the table ends after this round and any pool is shared equally (20, Jason 2026-11-05).
 * onReject: what else a rejected split does.
 *   'end'        the table ends (2018 rule)
 *   'continue'   play carries on
 *   'grabberOut' the grabber leaves the table and play carries on (default)
 */
export function createGame({
  players, seed = 0, startBalance = 20, commonsReserve = 120, minPlayers = 3, maxRound = 20,
  onReject = 'grabberOut', firstGrabRound = 1, rejectedPool = 'refund', welcomeAt = 'atLeast', welcomeBonus = 1, grabOpens = 'afterLap', rejectedGrabberPoints = 'pool',
}) {
  if (!players || players.length < minPlayers) throw new Error(`Need at least ${minPlayers} players`);
  return {
    seed, startBalance, minPlayers, maxRound, onReject, firstGrabRound, rejectedPool, welcomeAt, welcomeBonus, grabOpens, rejectedGrabberPoints,
    turnsSinceSplit: 0, // gives and passes since the last split (or the start)
    round: 1,
    phase: 'turn',
    order: players.map((p) => p.id), // turn order this round (join order to begin with)
    turnIndex: 0,
    pool: 0, // carries over from round to round until someone grabs
    stakes: {}, // what each player has put into the current pool
    players: players.map((p) => {
      const b = p.balance ?? startBalance;
      return { id: p.id, start: b, balance: b, active: true, leftAfterRound: null, leftBecause: null };
    }),
    current: null, // the round in progress: { round, moves: [{id, move, amount}] }
    ultimatum: null, // { round, grabber, pool, stakes, shares, votes }
    rounds: [], // finished rounds
    commons: { start: commonsReserve, reserve: commonsReserve, paidOut: 0, received: 0 },
    status: 'playing',
    endReason: null,
  };
}

export const activePlayers = (s) => s.players.filter((p) => p.active);
export const activeIds = (s) => s.order.filter((id) => s.players.find((p) => p.id === id).active);
const bal = (s, id) => s.players.find((p) => p.id === id).balance;
const setBal = (players, id, d) => players.map((p) => (p.id === id ? { ...p, balance: p.balance + d } : p));

export function requirement(round) {
  return round;
}

/** Whose turn it is, or null outside the turn phase. */
export function currentPlayer(s) {
  if (s.status !== 'playing' || s.phase !== 'turn') return null;
  return activeIds(s)[s.turnIndex];
}

/** Players must pay in full. A player who can't sits the turn out: no giving, no grabbing. */
export function canGive(s, id) {
  return bal(s, id) >= requirement(s.round);
}
export function canGrab(s, id) {
  if (!canGive(s, id) || s.round < s.firstGrabRound) return false;
  if (s.grabOpens === 'afterLap') return s.turnsSinceSplit >= activeIds(s).length;
  if (s.grabOpens === 'nonEmpty') return s.pool > 0;
  return true;
}

/** move: 'give' or 'grab'. A broke player's move is recorded as 'pass' whatever they asked for. */
export function act(s, id, move) {
  if (currentPlayer(s) !== id) throw new Error(`Not ${id}'s turn`);
  if (move !== 'give' && move !== 'grab') throw new Error('Move must be give or grab');
  const r = s.round;
  const cur = s.current ?? { round: r, moves: [] };
  if (!canGive(s, id)) return advance({ ...s, turnsSinceSplit: s.turnsSinceSplit + 1, current: { ...cur, moves: [...cur.moves, { id, move: 'pass', amount: 0, asked: move }] } });
  if (move === 'grab' && !canGrab(s, id)) move = 'give';
  if (move === 'give') {
    const amount = requirement(r);
    return advance({
      ...s,
      players: setBal(s.players, id, -amount),
      pool: s.pool + amount,
      stakes: { ...s.stakes, [id]: (s.stakes[id] ?? 0) + amount },
      turnsSinceSplit: s.turnsSinceSplit + 1,
      current: { ...cur, moves: [...cur.moves, { id, move: 'give', amount }] },
    });
  }
  return {
    ...s,
    phase: 'divide',
    current: { ...cur, moves: [...cur.moves, { id, move: 'grab', amount: 0 }] },
    ultimatum: { round: r, grabber: id, pool: s.pool, stakes: { ...s.stakes }, shares: null, votes: null },
  };
}

function advance(s) {
  const next = { ...s, turnIndex: s.turnIndex + 1 };
  return next.turnIndex >= activeIds(next).length ? completeRound(next) : next;
}

/** Everyone had their turn and nobody grabbed: the Commons adds 1 for each player who gave. */
function completeRound(s) {
  const r = s.round;
  const givers = s.current.moves.filter((m) => m.move === 'give').length;
  if (givers === 0) {
    const rec = { ...s.current, result: 'stalled', topUp: 0, poolAfter: s.pool };
    return endSeason({ ...s, rounds: [...s.rounds, rec], current: null }, 'all-broke');
  }
  if (s.commons.reserve < givers) {
    const rec = { ...s.current, result: 'complete', topUp: 0, poolAfter: s.pool };
    return endSeason({ ...s, rounds: [...s.rounds, rec], current: null }, 'commons-exhausted');
  }
  const next = {
    ...s,
    pool: s.pool + givers,
    commons: { ...s.commons, reserve: s.commons.reserve - givers, paidOut: s.commons.paidOut + givers },
    rounds: [...s.rounds, { ...s.current, result: 'complete', topUp: givers, poolAfter: s.pool + givers }],
    current: null,
    round: r + 1,
    turnIndex: 0,
  };
  return checkStart(next);
}

/** Before a round starts: end the table if nobody can give, or the round cap is passed. */
function checkStart(s) {
  if (s.round > s.maxRound) return endSeason(s, 'round-cap');
  if (!activeIds(s).some((id) => canGive(s, id))) return endSeason(s, 'all-broke');
  return s;
}

/**
 * The table ends with a pool still on it: it goes back to each player in proportion to what
 * they put in, like a rejected pool (Jason, 2026-11-05; it was shared equally before).
 */
function endSeason(s, reason) {
  const ids = activeIds(s);
  const back = s.pool > 0 ? splitBy(s.pool, Object.fromEntries(ids.map((id) => [id, s.stakes[id] ?? 0]))) : {};
  let players = s.players;
  for (const id of ids) players = setBal(players, id, back[id] ?? 0);
  return {
    ...s, players, pool: 0, stakes: {}, status: 'ended', endReason: reason, phase: 'ended',
    finalShares: back,
  };
}

/**
 * The grabber divides the pool among players still at the table, setting each share
 * separately (so givers can be rewarded and others shortchanged). shares: { id: wholeNumber },
 * summing to the pool. Nothing is paid yet: the split waits for judgement.
 */
export function divide(s, shares) {
  if (s.phase !== 'divide') throw new Error('Not dividing now');
  const ids = activeIds(s);
  for (const id of Object.keys(shares)) if (!ids.includes(id)) throw new Error(`${id} is not at the table`);
  for (const id of ids) {
    const v = shares[id] ?? 0;
    if (!Number.isInteger(v) || v < 0) throw new Error('Shares must be whole and not negative');
  }
  const total = ids.reduce((a, id) => a + (shares[id] ?? 0), 0);
  if (total !== s.pool) throw new Error(`Shares add to ${total}, pool is ${s.pool}`);
  const clean = Object.fromEntries(ids.map((id) => [id, shares[id] ?? 0]));
  return { ...s, phase: 'vote', ultimatum: { ...s.ultimatum, shares: clean } };
}

/**
 * Everyone, the grabber included, votes 0, 1 or 2. Every vote counts at face value.
 * A vote is paid from the voter's share first, then their balance, so a broke player can
 * still vote on a split that pays them (Jason, 2026-11-04). On a rejected split there is no
 * share, so a voter pays only what their balance covers. Rejecting (0) is free.
 * - average below 1: rejected. Both pools go to the Commons; then onReject applies.
 * - average 1 to 1.5 (1.5 counts as closer to 1): the split is paid; the vote pool is
 *   shared equally in whole points, any remainder to the Commons.
 * - average above 1.5: the split is paid; the Commons rounds the vote pool up to a whole
 *   number per player and it is shared equally.
 */
export function vote(s, votes) {
  if (s.phase !== 'vote') throw new Error('Not voting now');
  const ids = activeIds(s);
  const n = ids.length;
  const u = s.ultimatum;
  let sum = 0;
  for (const id of ids) {
    if (!VOTES.includes(votes[id])) throw new Error(`Missing or invalid vote for ${id}`);
    sum += votes[id];
  }
  const avg = sum / n;
  const accepted = avg >= 1;
  let players = s.players;
  if (accepted) for (const id of ids) players = setBal(players, id, u.shares[id]);
  const paid = {};
  let vpool = 0;
  for (const id of ids) {
    const p = Math.min(votes[id], players.find((x) => x.id === id).balance);
    paid[id] = p;
    vpool += p;
    players = setBal(players, id, -p);
  }
  let result, voteEach = 0, topUp = 0, toCommons = 0, bonusEach = 0;
  let refunds = null;
  if (!accepted) {
    result = 'rejected';
    if (s.rejectedPool === 'refund') {
      refunds = splitBy(u.pool, Object.fromEntries(ids.map((id) => [id, u.stakes[id] ?? 0])));
      for (const id of ids) players = setBal(players, id, refunds[id]);
      toCommons = vpool;
    } else toCommons = u.pool + vpool;
  } else {
    if (s.welcomeAt === 'atLeast' ? avg < 1.5 : avg <= 1.5) {
      result = 'accepted';
      voteEach = Math.floor(vpool / n);
      toCommons = vpool - voteEach * n;
    } else {
      result = 'welcomed';
      topUp = Math.min(Math.ceil(vpool / n) * n - vpool, s.commons.reserve);
      voteEach = Math.floor((vpool + topUp) / n);
      toCommons = vpool + topUp - voteEach * n;
      bonusEach = Math.min(s.welcomeBonus, Math.floor((s.commons.reserve - topUp) / n));
      topUp += bonusEach * n;
    }
    for (const id of ids) players = setBal(players, id, voteEach + bonusEach);
  }
  const commons = {
    ...s.commons,
    reserve: s.commons.reserve - topUp + toCommons,
    paidOut: s.commons.paidOut + topUp,
    received: s.commons.received + toCommons,
  };
  const record = { ...u, votes: { ...votes }, paid, voteAvg: avg, result, voteEach, bonusEach, topUp, toCommons, refunds };
  const next = {
    ...s, players, commons, pool: 0, stakes: {}, ultimatum: null, current: null, turnsSinceSplit: 0,
    rounds: [...s.rounds, { ...s.current, result: 'ultimatum', ultimatum: record }],
  };
  if (result === 'rejected') {
    if (s.onReject === 'end') return { ...next, phase: 'ended', status: 'ended', endReason: 'rejected' };
    if (s.onReject === 'grabberOut') {
      const left = s.rejectedGrabberPoints === 'pool' ? next.players.find((p) => p.id === u.grabber).balance : 0;
      next.players = next.players.map((p) => (p.id === u.grabber
        ? { ...p, active: false, leftAfterRound: s.round, leftBecause: 'rejected', balance: p.balance - left } : p));
      next.pool = left;
      next.rounds = [...next.rounds.slice(0, -1), { ...next.rounds.at(-1), ultimatum: { ...record, forfeit: left } }];
    }
  }
  return { ...next, phase: 'stay' };
}

/**
 * After a split is judged, each player stays or sits out the rest of the table. Those who
 * leave are excluded from later rounds (Jason, 2026-11-04). The next round runs in the opposite
 * order, starting with the player after the divider, so the divider has the last turn.
 */
export function stay(s, decisions) {
  if (s.phase !== 'stay') throw new Error('Not deciding now');
  const r = s.round;
  const players = s.players.map((p) =>
    p.active && decisions[p.id] === false ? { ...p, active: false, leftAfterRound: r, leftBecause: 'chose' } : p,
  );
  const last = s.rounds.at(-1).ultimatum;
  // Reverse the order. The divider goes last, so the first chance to grab after the lap goes to
  // the next player, not the divider again (Jason, 2026-11-05; the 2018 notes started with the divider).
  const rev = s.order.slice().reverse();
  const at = rev.indexOf(last.grabber);
  const order = [...rev.slice(at + 1), ...rev.slice(0, at + 1)];
  const next = { ...s, players, order, round: r + 1, turnIndex: 0, phase: 'turn' };
  if (players.filter((p) => p.active).length < s.minPlayers) return { ...next, phase: 'ended', status: 'ended', endReason: 'too-few' };
  return checkStart(next);
}

/** Split helpers for bots and the page. All return whole-number shares that add to the pool. */
export function splitBy(pool, weights, keeper = null, keep = 0) {
  const ids = Object.keys(weights);
  keep = keeper ? Math.max(0, Math.min(pool, keep)) : 0;
  const rest = pool - keep;
  const others = keeper ? ids.filter((id) => id !== keeper) : ids;
  const w = others.reduce((a, id) => a + weights[id], 0);
  const shares = Object.fromEntries(ids.map((id) => [id, 0]));
  if (keeper) shares[keeper] = keep;
  if (!others.length) { if (keeper) shares[keeper] = pool; return shares; }
  const exact = Object.fromEntries(others.map((id) => [id, w > 0 ? (rest * weights[id]) / w : rest / others.length]));
  let given = 0;
  for (const id of others) { shares[id] = Math.floor(exact[id]); given += shares[id]; }
  // Leftover points go to the keeper if there is one; otherwise one each to the largest
  // fractions left over by rounding down, ties to the larger weight, then seat order.
  let left = rest - given;
  if (keeper) { shares[keeper] += left; left = 0; }
  const byFraction = [...others].sort((a, b) => (exact[b] - shares[b]) - (exact[a] - shares[a]) || weights[b] - weights[a]);
  for (let i = 0; left > 0; i = (i + 1) % byFraction.length, left--) shares[byFraction[i]]++;
  return shares;
}
