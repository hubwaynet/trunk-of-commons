// Game 2: Centipede & Ultimatum, from "Game 2 - multiplayer iterated - centipede with
// ultimatum (MI-CU)" in TrunK of Commons, 2018-08-07.
//
// Pure rules. No DOM, no randomness. Play is sequential, so the state moves through
// phases: 'turn' (give or grab), 'divide', 'vote', 'stay', then back to 'turn', until 'ended'.
// SPDX-License-Identifier: AGPL-3.0-only

export const VOTES = [0, 1, 2]; // unacceptable, acceptable, more than acceptable

export function createGame({ players, seed = 0, startBalance = 20, commonsReserve = 120, minPlayers = 3, maxRound = 60, rejectEndsGame = true, firstGrabRound = 1 }) {
  if (!players || players.length < minPlayers) throw new Error(`Need at least ${minPlayers} players`);
  return {
    seed, startBalance, minPlayers, maxRound, rejectEndsGame, firstGrabRound,
    round: 1,
    phase: 'turn',
    order: players.map((p) => p.id), // turn order this round (join order to begin with)
    turnIndex: 0,
    pool: 0, // carries over from round to round until someone grabs
    players: players.map((p) => {
      const b = p.balance ?? startBalance;
      return { id: p.id, start: b, balance: b, active: true, leftAfterRound: null };
    }),
    current: null, // the round in progress: { round, moves: [{id, move, amount}] }
    ultimatum: null, // { round, grabber, forced, pool, shares, votes }
    rounds: [], // finished rounds
    commons: { start: commonsReserve, reserve: commonsReserve, paidOut: 0, received: 0 },
    status: 'playing',
    endReason: null,
  };
}

export const activePlayers = (s) => s.players.filter((p) => p.active);
const activeIds = (s) => s.order.filter((id) => s.players.find((p) => p.id === id).active);
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

/** A player who can't pay the requirement in full must take hold of the pool. */
export function canGive(s, id) {
  return bal(s, id) >= requirement(s.round);
}

/** move: 'give' or 'grab'. */
export function act(s, id, move) {
  if (currentPlayer(s) !== id) throw new Error(`Not ${id}'s turn`);
  if (move !== 'give' && move !== 'grab') throw new Error('Move must be give or grab');
  const forced = move === 'give' && !canGive(s, id);
  if (forced) move = 'grab';
  else if (move === 'grab' && s.round < s.firstGrabRound) move = 'give'; // grabbing not open yet
  const r = s.round;
  const cur = s.current ?? { round: r, moves: [] };
  if (move === 'give') {
    const amount = requirement(r);
    const next = {
      ...s,
      players: setBal(s.players, id, -amount),
      pool: s.pool + amount,
      current: { ...cur, moves: [...cur.moves, { id, move: 'give', amount }] },
      turnIndex: s.turnIndex + 1,
    };
    if (next.turnIndex >= activeIds(next).length) return completeRound(next);
    return next;
  }
  return {
    ...s,
    phase: 'divide',
    current: { ...cur, moves: [...cur.moves, { id, move: 'grab', amount: 0, forced }] },
    ultimatum: { round: r, grabber: id, forced, pool: s.pool, shares: null, votes: null },
  };
}

/** Everyone gave: the Commons adds 1 per player and the pool grows. */
function completeRound(s) {
  const n = activeIds(s).length;
  const r = s.round;
  const want = n;
  let next;
  if (s.commons.reserve >= want) {
    next = {
      ...s,
      pool: s.pool + want,
      commons: { ...s.commons, reserve: s.commons.reserve - want, paidOut: s.commons.paidOut + want },
      rounds: [...s.rounds, { ...s.current, result: 'complete', topUp: want, poolAfter: s.pool + want }],
      current: null,
      round: r + 1,
      turnIndex: 0,
    };
    if (r + 1 > s.maxRound) return endSeason(next, 'round-cap');
    return next;
  }
  // The Commons can't cover the bonus: the season ends and the pool is shared equally.
  next = { ...s, rounds: [...s.rounds, { ...s.current, result: 'complete', topUp: 0, poolAfter: s.pool }], current: null };
  return endSeason(next, 'commons-exhausted');
}

function endSeason(s, reason) {
  const ids = activeIds(s);
  const each = Math.floor(s.pool / ids.length);
  let players = s.players;
  for (const id of ids) players = setBal(players, id, each);
  const rem = s.pool - each * ids.length;
  return {
    ...s, players, pool: 0, status: 'ended', endReason: reason, phase: 'ended',
    finalShare: each,
    commons: { ...s.commons, reserve: s.commons.reserve + rem, received: s.commons.received + rem },
  };
}

/**
 * The grabber divides the pool among players still in play.
 * shares: { id: wholeNumber }, summing to the pool. Nothing is paid yet: the split waits for judgement.
 */
export function divide(s, shares) {
  if (s.phase !== 'divide') throw new Error('Not dividing now');
  const ids = activeIds(s);
  const total = ids.reduce((a, id) => a + (shares[id] ?? 0), 0);
  if (total !== s.pool) throw new Error(`Shares add to ${total}, pool is ${s.pool}`);
  for (const id of ids) if (!Number.isInteger(shares[id] ?? 0) || (shares[id] ?? 0) < 0) throw new Error('Shares must be whole and not negative');
  const clean = Object.fromEntries(ids.map((id) => [id, shares[id] ?? 0]));
  return { ...s, phase: 'vote', ultimatum: { ...s.ultimatum, shares: clean } };
}

/** Helper for "keep k, share the rest equally" divisions, in whole points. Leftovers go to the grabber. */
export function splitKeeping(s, grabber, keep) {
  const ids = activeIds(s);
  const others = ids.filter((id) => id !== grabber);
  keep = Math.max(0, Math.min(s.pool, keep));
  const each = others.length ? Math.floor((s.pool - keep) / others.length) : 0;
  const shares = Object.fromEntries(others.map((id) => [id, each]));
  shares[grabber] = s.pool - each * others.length;
  return shares;
}

export const equalShare = (s) => s.pool / activeIds(s).length;

/**
 * Everyone, the grabber included, votes 0, 1 or 2 tokens. Votes cost what they say
 * (a player who can't afford a vote casts the most they can).
 * - average below 1: both pools are forfeit to the Commons and the game ends.
 * - average 1 to 1.5 (1.5 counts as closer to 1): the split is paid; the vote pool is
 *   shared equally in whole points, any remainder to the Commons.
 * - average above 1.5: the split is paid; the Commons rounds the vote pool up to a whole
 *   number per player and it is shared equally.
 * Rejecting costs nothing. That's deliberate (Jason, 2026-11-04).
 */
export function vote(s, votes) {
  if (s.phase !== 'vote') throw new Error('Not voting now');
  const ids = activeIds(s);
  const n = ids.length;
  let players = s.players;
  const cast = {};
  const capped = {};
  let vpool = 0;
  for (const id of ids) {
    const want = votes[id];
    if (!VOTES.includes(want)) throw new Error(`Missing or invalid vote for ${id}`);
    const v = Math.min(want, bal({ ...s, players }, id));
    if (v !== want) capped[id] = want;
    cast[id] = v;
    vpool += v;
    players = setBal(players, id, -v);
  }
  const avg = vpool / n;
  const u = s.ultimatum;
  let result, voteEach = 0, topUp = 0, toCommons = 0;
  if (avg < 1) {
    result = 'rejected';
    toCommons = u.pool + vpool;
  } else {
    for (const id of ids) players = setBal(players, id, u.shares[id]);
    if (avg <= 1.5) {
      result = 'accepted';
      voteEach = Math.floor(vpool / n);
      toCommons = vpool - voteEach * n;
    } else {
      result = 'welcomed';
      const want = Math.ceil(vpool / n) * n - vpool;
      topUp = Math.min(want, s.commons.reserve);
      voteEach = Math.floor((vpool + topUp) / n);
      toCommons = vpool + topUp - voteEach * n;
    }
    for (const id of ids) players = setBal(players, id, voteEach);
  }
  const commons = {
    ...s.commons,
    reserve: s.commons.reserve - topUp + toCommons,
    paidOut: s.commons.paidOut + topUp,
    received: s.commons.received + toCommons,
  };
  const record = { ...u, votes: cast, capped, voteAvg: avg, result, voteEach, topUp, toCommons };
  const roundRec = { ...s.current, result: 'ultimatum', ultimatum: record };
  const next = { ...s, players, commons, pool: 0, ultimatum: null, current: null, rounds: [...s.rounds, roundRec] };
  if (result === 'rejected' && s.rejectEndsGame) return { ...next, phase: 'ended', status: 'ended', endReason: 'rejected' };
  return { ...next, phase: 'stay' };
}

/**
 * After an accepted split, each player chooses to stay or sit out the rest of the table.
 * Those who leave are excluded from later rounds. The next round starts with the divider
 * (if still in) and runs in the opposite order.
 */
export function stay(s, decisions) {
  if (s.phase !== 'stay') throw new Error('Not deciding now');
  const r = s.round;
  const players = s.players.map((p) =>
    p.active && decisions[p.id] === false ? { ...p, active: false, leftAfterRound: r } : p,
  );
  const last = s.rounds.at(-1).ultimatum;
  // Reverse the order, starting from the divider.
  const rev = s.order.slice().reverse();
  const at = rev.indexOf(last.grabber);
  const order = [...rev.slice(at), ...rev.slice(0, at)];
  const next = { ...s, players, order, round: r + 1, turnIndex: 0, phase: 'turn' };
  if (players.filter((p) => p.active).length < s.minPlayers) return { ...next, phase: 'ended', status: 'ended', endReason: 'too-few' };
  if (r + 1 > s.maxRound) return { ...next, phase: 'ended', status: 'ended', endReason: 'round-cap' };
  return next;
}
