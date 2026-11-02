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

export function createGame({ players, seed = 0, startBalance = 10, endRound = 10, minPlayers = 3 }) {
  if (!players || players.length < minPlayers) throw new Error(`Need at least ${minPlayers} players`);
  return {
    seed,
    round: 1,
    endRound, // hidden from players: the season closes without warning
    startBalance,
    minPlayers,
    players: players.map((p) => ({ id: p.id, balance: startBalance, active: true, leftAfterRound: null })),
    rounds: [],
    status: 'playing',
    endReason: null,
  };
}

export function activePlayers(state) {
  return state.players.filter((p) => p.active);
}

/** A player can never give more than they hold. */
export function contributionFor(level, round, balance) {
  return Math.min(stakes(round)[level], Math.max(0, balance));
}

/**
 * Resolve one round.
 * - average below medium: the pool is forfeit to the Commons and the game ends.
 * - average at or nearer medium: the Commons tops the pool up to the next multiple
 *   of the player count and it is shared equally.
 * - average nearer high: the Commons tops up so every player receives the high amount.
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
  let pool = 0;
  for (const p of active) {
    const level = choices[p.id];
    if (!LEVELS.includes(level)) throw new Error(`Missing or invalid choice for ${p.id}`);
    const amount = contributionFor(level, r, p.balance);
    contributions[p.id] = amount;
    levels[p.id] = level;
    pool += amount;
  }
  const avg = pool / n;

  let result;
  let each = 0;
  let topUp = 0;
  let forfeited = 0;
  if (avg < s.medium) {
    result = 'fail';
    forfeited = pool;
  } else if (avg - s.medium <= s.high - avg) {
    result = 'base';
    const total = Math.ceil(pool / n) * n;
    each = total / n;
    topUp = total - pool;
  } else {
    result = 'bonus';
    each = s.high;
    topUp = each * n - pool;
  }

  const payouts = {};
  for (const p of active) payouts[p.id] = each;

  const players = state.players.map((p) =>
    p.active ? { ...p, balance: p.balance - contributions[p.id] + payouts[p.id] } : p,
  );
  const outcome = { round: r, n, stakes: s, contributions, levels, pool, avg, result, payouts, topUp, forfeited };
  const next = { ...state, players, rounds: [...state.rounds, outcome] };
  if (result === 'fail') {
    next.status = 'ended';
    next.endReason = 'pool-failed';
  } else if (r >= state.endRound) {
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
