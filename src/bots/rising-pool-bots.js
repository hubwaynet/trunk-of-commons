// Strategy bots for Rising Pool. Classic two-player strategies (Tit for Tat, Grudger,
// Win-Stay Lose-Shift, Generous Tit for Tat) translated for a group threshold game.
// Each strategy: create(rng) -> { choose(view) -> level, stay?(view) -> boolean }
// SPDX-License-Identifier: AGPL-3.0-only

import { LEVELS, LEVEL_INDEX } from '../engine/rising-pool.js';
import { shuffle } from '../engine/rng.js';

const toLevel = (i) => LEVELS[Math.max(0, Math.min(2, i))];
const nearest = (mean) => toLevel(Math.round(mean));

export const STRATEGIES = {
  steady: {
    label: 'Steady',
    family: 'cooperator',
    summary: 'Always gives the medium amount, whatever happens.',
    create: () => ({ choose: () => 'medium' }),
  },
  openHand: {
    label: 'Open Hand',
    family: 'cooperator',
    summary: 'Always gives the high amount. Generous, and easy to exploit.',
    create: () => ({ choose: () => 'high' }),
  },
  freeRider: {
    label: 'Free Rider',
    family: 'exploiter',
    summary: 'Never gives. Collects an equal share whenever the others carry the pool.',
    create: () => ({ choose: () => 'low' }),
  },
  opportunist: {
    label: 'Opportunist',
    family: 'exploiter',
    summary: 'Gives high to look trustworthy. Once the table is generous enough it gives nothing for a round, takes its share, and leaves.',
    create: () => {
      let cashedIn = false;
      return {
        choose: (v) => {
          if (cashedIn) return 'low';
          if (v.round >= 4 && v.othersMean !== null && v.othersMean >= 1.5) {
            cashedIn = true;
            return 'low';
          }
          return 'high';
        },
        stay: () => !cashedIn,
      };
    },
  },
  mirror: {
    label: 'Mirror',
    family: 'reciprocator',
    summary: 'Starts at medium, then matches what the others gave last round. A group version of Tit for Tat.',
    create: () => ({ choose: (v) => (v.othersMean === null ? 'medium' : nearest(v.othersMean)) }),
  },
  generousMirror: {
    label: 'Generous Mirror',
    family: 'reciprocator',
    summary: 'Plays Mirror, but one time in four gives a level more than the others did. Its generosity can lift a sagging table.',
    create: (rng) => ({
      choose: (v) => {
        if (v.othersMean === null) return 'medium';
        const base = Math.round(v.othersMean);
        return toLevel(rng() < 0.25 ? base + 1 : base);
      },
    }),
  },
  grudger: {
    label: 'Grudger',
    family: 'reciprocator',
    summary: 'Gives high until anyone gives nothing. After that it never gives again.',
    create: () => {
      let betrayed = false;
      return {
        choose: (v) => {
          if (v.anyOtherLow) betrayed = true;
          return betrayed ? 'low' : 'high';
        },
      };
    },
  },
  winStay: {
    label: 'Win-Stay',
    family: 'learner',
    summary: 'Starts high. Repeats its last choice if it came out even or ahead, and steps down a level after a loss. Win-Stay, Lose-Shift, adapted for groups.',
    create: () => ({
      choose: (v) => {
        if (!v.myLastLevel) return 'high';
        return v.myLastNet < 0 ? toLevel(LEVEL_INDEX[v.myLastLevel] - 1) : v.myLastLevel;
      },
    }),
  },
  jitteryMirror: {
    label: 'Jittery Mirror',
    family: 'noisy',
    summary: 'Means to play Mirror, but one time in six picks at random. Shows how noise can set off a slide.',
    create: (rng) => ({
      choose: (v) => {
        if (rng() < 1 / 6) return LEVELS[Math.floor(rng() * 3)];
        return v.othersMean === null ? 'medium' : nearest(v.othersMean);
      },
    }),
  },
  keeper: {
    label: 'Keeper',
    family: 'steward',
    summary: 'Watches the threshold. Gives high when the others fell short last round, medium otherwise.',
    create: () => ({ choose: (v) => (v.othersMean !== null && v.othersMean < 1 ? 'high' : 'medium') }),
  },
};

/** What a bot can see: only public information from finished rounds. */
export function botView(state, id) {
  const last = state.rounds.at(-1) ?? null;
  const me = state.players.find((p) => p.id === id);
  const othersLevels = last
    ? Object.entries(last.levels).filter(([pid]) => pid !== id).map(([, lv]) => LEVEL_INDEX[lv])
    : [];
  const othersMean = othersLevels.length ? othersLevels.reduce((a, b) => a + b, 0) / othersLevels.length : null;
  const playedLast = last && id in last.levels;
  return {
    round: state.round,
    balance: me.balance,
    last,
    myLastLevel: playedLast ? last.levels[id] : null,
    myLastNet: playedLast ? last.payouts[id] - last.contributions[id] : null,
    othersLevels,
    othersMean,
    anyOtherLow: othersLevels.includes(0),
  };
}

/** Pick a varied table: always one exploiter, at least two conditional players. */
export function selectRoster(rng, count = 5) {
  const ids = Object.keys(STRATEGIES);
  const exploiters = ids.filter((k) => STRATEGIES[k].family === 'exploiter');
  const conditional = ids.filter((k) => ['reciprocator', 'learner', 'noisy', 'steward'].includes(STRATEGIES[k].family));
  const picked = [shuffle(rng, exploiters)[0], ...shuffle(rng, conditional).slice(0, 2)];
  const rest = shuffle(rng, ids.filter((k) => !picked.includes(k)));
  while (picked.length < count) picked.push(rest.shift());
  return shuffle(rng, picked);
}
