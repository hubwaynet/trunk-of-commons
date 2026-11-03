// Game 1: Rising Pool (working title), from "Game 1 - multiplayer iterated - dilemma (MI-D)"
// in TrunK of Commons, 2018-08-07.
//
// Pure rules. No DOM, no randomness: the same choices always give the same result,
// so this module can run in the browser now and on a server referee later.
// SPDX-License-Identifier: AGPL-3.0-only

export const LEVELS = ['low', 'medium', 'high'];
export const LEVEL_INDEX = { low: 0, medium: 1, high: 2 };

/** Stakes rise every round: low stays 0, medium = round, high = 2 x round. */
export function stakes(round) {
  return { low: 0, medium: round, high: 2 * round };
}

export function createGame({ players, seed = 0, startBalance = 20, commonsReserve = 120, endRound = null, minPlayers = 3 }) {
  if (!players || players.length < minPlayers) throw new Error(`Need at least ${minPlayers} players`);
  return {
    seed,
    round: 1,
    endRound, // optional hard stop (null = none); the season normally ends when the Commons runs out
    startBalance,
    minPlayers,
    players: players.map((p) => {
      const b = p.balance ?? startBalance; // a player may bring points from an earlier table
      return { id: p.id, start: b, balance: b, active: true, leftAfterRound: null };
    }),
    rounds: [],
    // The Commons is a finite shared reserve: it funds top-ups and receives forfeited pools.
    // When it can no longer cover a full top-up it pays what it has and the season ends.
    commons: { start: commonsReserve, reserve: commonsReserve, paidOut: 0, received: 0 },
    status: 'playing',
    endReason: null,
  };
}

export function activePlayers(state) {
  return state.players.filter((p) => p.active);
}

/**
 * A player can only choose a level they can pay in full. If they ask for more than
 * they hold, they drop to the highest level they can afford (possibly nothing).
 */
export function affordableLevel(level, round, balance) {
  const s = stakes(round);
  let i = LEVEL_INDEX[level];
  while (i > 0 && s[LEVELS[i]] > balance) i--;
  return LEVELS[i];
}

/**
 * Resolve one round.
 * - average below medium: the pool is forfeit to the Commons and the game ends.
 * - average at or nearer medium: the Commons tops the pool up to the next multiple
 *   of the player count and it is shared equally.
 * - average nearer high: the Commons tops up so every player receives the high amount.
 * - if the Commons can't afford the top-up it pays what it has, and the season ends.
 * Everyone gets an equal share, whatever they gave. That is the dilemma.
 */
export function resolveRound(state, choices) {
  if (state.status !== 'playing') throw new Error('Game is over');
  const active = activePlayers(state);
  const n = active.length;
  const r = state.round;
  const s = stakes(r);

  const contributions = {};
  const levels = {};
  const downgraded = {}; // id -> level they asked for but couldn't afford
  let pool = 0;
  for (const p of active) {
    const asked = choices[p.id];
    if (!LEVELS.includes(asked)) throw new Error(`Missing or invalid choice for ${p.id}`);
    const level = affordableLevel(asked, r, p.balance);
    if (level !== asked) downgraded[p.id] = asked;
    const amount = s[level];
    contributions[p.id] = amount;
    levels[p.id] = level;
    pool += amount;
  }
  const avg = pool / n;

  let result;
  let each = 0;
  let topUp = 0;
  let forfeited = 0;
  let commonsShort = false;
  const reserve = state.commons.reserve;
  if (avg < s.medium) {
    result = 'fail';
    forfeited = pool;
  } else {
    result = avg - s.medium <= s.high - avg ? 'base' : 'bonus';
    const wanted = result === 'base' ? Math.ceil(pool / n) * n - pool : s.high * n - pool;
    if (wanted <= reserve) {
      topUp = wanted;
    } else {
      // The Commons can't cover it: share the pool plus whatever is left, in whole points.
      commonsShort = true;
      topUp = Math.floor((pool + reserve) / n) * n - pool; // any odd remainder stays in the Commons
    }
    each = (pool + topUp) / n;
  }

  const payouts = {};
  for (const p of active) payouts[p.id] = each;

  const players = state.players.map((p) =>
    p.active ? { ...p, balance: p.balance - contributions[p.id] + payouts[p.id] } : p,
  );
  const commons = {
    ...state.commons,
    reserve: reserve - topUp + forfeited,
    paidOut: state.commons.paidOut + Math.max(0, topUp),
    received: state.commons.received + forfeited + Math.max(0, -topUp),
  };
  const outcome = {
    round: r, n, stakes: s, contributions, levels, downgraded, pool, avg, result, payouts, topUp, forfeited,
    commonsShort, commonsAfter: commons.reserve,
  };
  const next = { ...state, players, commons, rounds: [...state.rounds, outcome] };
  if (result === 'fail') {
    next.status = 'ended';
    next.endReason = 'pool-failed';
  } else if (commonsShort || commons.reserve <= 0) {
    next.status = 'ended';
    next.endReason = 'commons-exhausted';
  } else if (state.endRound && r >= state.endRound) {
    next.status = 'ended';
    next.endReason = 'season-end';
  }
  return { state: next, outcome };
}

/** Between rounds each player chooses to stay or leave. decisions: { id: true|false } */
export function applyStayDecisions(state, decisions) {
  if (state.status !== 'playing') return state;
  const players = state.players.map((p) =>
    p.active && decisions[p.id] === false ? { ...p, active: false, leftAfterRound: state.round } : p,
  );
  const next = { ...state, players, round: state.round + 1 };
  if (players.filter((p) => p.active).length < state.minPlayers) {
    next.status = 'ended';
    next.endReason = 'too-few';
  }
  return next;
}
