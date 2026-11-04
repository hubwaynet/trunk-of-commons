// Which strategies fit what a bot actually did?
// Replays a finished table and checks every strategy in the key against each bot's
// recorded moves (and its stay-or-leave decisions). Used to score "Read the table":
// a guess is right if it fits the evidence, because strategies that behave the same
// on these moves can't be told apart.
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, resolveRound, applyStayDecisions, affordableLevel } from '../engine/rising-pool.js';
import { STRATEGIES, botView } from './rising-pool-bots.js';

const fixedRng = () => 0.5; // never used for decisions here; random strategies declare possible()

/**
 * game: a finished game state. botIds: ids to check.
 * Returns { [id]: { fits: [strategyKey...], misses: { [strategyKey]: { round, expected, actual, kind } } } }
 */
export function strategyEvidence(game, botIds) {
  const keys = Object.keys(STRATEGIES);
  const cands = {};
  for (const id of botIds) {
    cands[id] = {};
    for (const k of keys) cands[id][k] = { inst: STRATEGIES[k].create(fixedRng), miss: null };
  }

  // Rebuild the table round by round from the record.
  let s = createGame({
    players: game.players.map((p) => ({ id: p.id, balance: p.start })),
    seed: game.seed, startBalance: game.startBalance, commonsReserve: game.commons.start,
    endRound: game.endRound, minPlayers: game.minPlayers,
  });
  for (const rec of game.rounds) {
    for (const id of botIds) {
      if (!(id in rec.levels)) continue;
      const v = botView(s, id);
      const me = s.players.find((p) => p.id === id);
      for (const [k, c] of Object.entries(cands[id])) {
        if (c.miss) continue;
        const asked = c.inst.possible ? c.inst.possible(v) : [c.inst.choose(v)];
        const could = asked.map((lv) => affordableLevel(lv, rec.round, me.balance));
        if (!could.includes(rec.levels[id])) {
          c.miss = { round: rec.round, expected: could[0], actual: rec.levels[id], kind: 'move' };
        }
      }
    }
    s = resolveRound(s, rec.levels).state;
    if (s.status !== 'playing') break;
    const stay = {};
    for (const p of s.players.filter((x) => x.active)) {
      const left = game.players.find((g) => g.id === p.id).leftAfterRound === rec.round;
      stay[p.id] = !left;
      if (!cands[p.id]) continue;
      const v = botView(s, p.id);
      for (const c of Object.values(cands[p.id])) {
        if (c.miss) continue;
        const would = c.inst.stay ? c.inst.stay(v) : true;
        if (would !== !left) c.miss = { round: rec.round, expected: would ? 'stay' : 'leave', actual: left ? 'leave' : 'stay', kind: 'stay' };
      }
    }
    s = applyStayDecisions(s, stay);
  }

  const out = {};
  for (const id of botIds) {
    const all = Object.entries(cands[id]).filter(([, c]) => !c.miss).map(([k]) => k);
    const specific = all.filter((k) => !STRATEGIES[k].catchAll);
    out[id] = {
      fits: specific.length ? specific : all,
      misses: Object.fromEntries(Object.entries(cands[id]).filter(([, c]) => c.miss).map(([k, c]) => [k, c.miss])),
    };
  }
  return out;
}

/** A guess is right if it is the true strategy or fits the evidence just as well. */
export function guessFits(evidence, guess, truth) {
  return !!guess && (guess === truth || evidence.fits.includes(guess));
}
