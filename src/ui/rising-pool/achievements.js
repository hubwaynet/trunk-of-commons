// Rising Pool achievements. Pure checks on a game state (no DOM), so tests and simulations can
// use them. Ordered easiest to hardest from simulated odds (see docs/design/rising-pool.md).
// "Read the table" is earned on the page, when the player checks their guesses.
// SPDX-License-Identifier: AGPL-3.0-only

export const STORAGE_KEY = 'trunk.risingPool.achievements';
export const CELEBRATED_KEY = 'trunk.risingPool.celebrated';
export const LONG_HAUL_ROUND = 8;
export const MIN_READ_ROUNDS = 4;
export const ACHIEVEMENTS = [
  { id: 'held-line', name: 'Held the line', text: 'Gave high in a round the pool would have failed without you.' },
  { id: 'timed-exit', name: 'Timed the exit', text: 'Left ahead, and the pool failed after you went. Was that fair?' },
  { id: 'long-haul', name: 'Long haul', text: `Kept the pool alive through round ${LONG_HAUL_ROUND} while you stayed at the table.` },
  { id: 'rising-tide', name: 'Rising tide', text: 'Three bonus rounds in a row while you were at the table.' },
  { id: 'read-table', name: 'Read the table', text: 'Every guess fitted the evidence, at a table of four rounds or more.' },
];

/** After a round you played: state is the game after the round, o the round's outcome. */
export function roundAchievements(state, o, id = 'you') {
  const got = new Set();
  if (!(id in o.levels)) return got;
  if (o.result !== 'fail' && o.levels[id] === 'high') {
    const withoutYou = (o.pool - o.contributions[id]) / o.n;
    if (withoutYou < o.stakes.medium) got.add('held-line');
  }
  const mine = state.rounds.filter((r) => id in r.levels).slice(-3);
  if (mine.length === 3 && mine.every((r) => r.result === 'bonus')) got.add('rising-tide');
  if (o.result !== 'fail' && o.round >= LONG_HAUL_ROUND) got.add('long-haul');
  return got;
}

/** When the table has closed. leftAfter: the round you left after (null if you stayed);
 *  afterReason: how the table ended once you'd gone. */
export function endAchievements(state, { leftAfter = null, afterReason = null } = {}, id = 'you') {
  const got = new Set();
  const p = state.players.find((x) => x.id === id);
  if (leftAfter !== null && afterReason === 'pool-failed' && p.balance > p.start) got.add('timed-exit');
  return got;
}
