// Centipede & Ultimatum achievements. Pure checks on a game state (no DOM), so the
// simulator can estimate how hard each one is. Order: easiest first, from simulated odds
// (tools/sim-centipede-achievements.mjs; see docs/design/centipede-ultimatum.md).
// SPDX-License-Identifier: AGPL-3.0-only

import { dividerKeptFair } from '../../bots/centipede-ultimatum-bots.js';

export const STORAGE_KEY = 'trunk.centipede.achievements';
export const CELEBRATED_KEY = 'trunk.centipede.celebrated';

export const ACHIEVEMENTS = [
  { id: 'no-one-short', name: 'Nobody short-changed', text: 'Your split passed and every other player got back at least what they put in.' },
  { id: 'steady-hand', name: 'Steady hand', text: 'Reached the end of a table without grabbing, still seated and ahead.' },
  { id: 'one-clean-grab', name: 'One clean grab', text: 'Grabbed exactly once at a table, the split passed, and you finished ahead.' },
  { id: 'welcomed', name: 'Welcomed', text: 'The table welcomed your split: an average vote of 1.5 or more.' },
  { id: 'your-vote-counted', name: 'Your vote counted', text: 'Someone voted 0 on your fair split, and your own 2 is what carried it.' },
  // Last, as the hardest since the table has no last round (Jason, 2026-11-08)
  { id: 'full-distance', name: 'Full distance', text: 'Still at the table when it ended, in round 20 or later.' },
];

const splitsBy = (s, id) => s.rounds.filter((r) => r.result === 'ultimatum' && r.ultimatum.grabber === id).map((r) => r.ultimatum);
const passed = (u) => u.result !== 'rejected';
// The last split is handed to the next player in turn: it counts as your split, not as a grab.
const grabsBy = (s, id) => splitsBy(s, id).filter((u) => !u.final);

/** Achievements earned by a split just judged (or any judged so far). */
export function splitAchievements(s, id = 'you') {
  const got = new Set();
  for (const u of splitsBy(s, id)) {
    if (!passed(u)) continue;
    const ids = Object.keys(u.shares);
    if (ids.every((x) => x === id || u.shares[x] >= (u.stakes[x] ?? 0))) got.add('no-one-short');
    const total = ids.reduce((a, x) => a + u.votes[x], 0);
    // a fair split only (Jason, 2026-11-06): otherwise a greedy keep earns it by provoking the 0s
    if (u.votes[id] === 2 && ids.some((x) => u.votes[x] === 0) && total - 1 < ids.length && dividerKeptFair(u)) got.add('your-vote-counted');
    if (u.result === 'welcomed') got.add('welcomed');
  }
  return got;
}

/** Achievements that need the whole table: call once it has ended. */
export function endAchievements(s, id = 'you') {
  const got = new Set();
  if (s.status !== 'ended') return got;
  const p = s.players.find((x) => x.id === id);
  const net = p.balance - p.start;
  const grabs = grabsBy(s, id);
  if (grabs.length === 0 && p.active && net > 0) got.add('steady-hand');
  if (grabs.length === 1 && passed(grabs[0]) && net > 0) got.add('one-clean-grab');
  // Full distance (Jason, 2026-11-08): the table has no last round now, so "the distance" is 20
  if (p.active && (s.rounds.at(-1)?.round ?? 0) >= 20) got.add('full-distance');
  return got;
}

export function tableAchievements(s, id = 'you') {
  return new Set([...splitAchievements(s, id), ...endAchievements(s, id)]);
}
