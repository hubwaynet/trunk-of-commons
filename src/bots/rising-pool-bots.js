// Strategy bots for Rising Pool. Classic two-player strategies (Tit for Tat, Grudger,
// Win-Stay Lose-Shift, Generous Tit for Tat) translated for a group threshold game.
// Each strategy: create(rng) -> { choose(view) -> level, stay?(view) -> boolean }
// SPDX-License-Identifier: AGPL-3.0-only

import { LEVELS, LEVEL_INDEX } from '../engine/rising-pool.js';
import { shuffle } from '../engine/rng.js';

const toLevel = (i) => LEVELS[Math.max(0, Math.min(2, i))];
const nearest = (mean) => toLevel(Math.round(mean));

export const FAMILIES = {
  cooperator: 'Cooperators',
  exploiter: 'Exploiters',
  reciprocator: 'Reciprocators',
  learner: 'Learners',
  steward: 'Stewards',
  noisy: 'Noisy',
};

export const STRATEGIES = {
  steady: {
    label: 'Steady',
    family: 'cooperator',
    tell: 'A steady row of M, every round, until it can no longer afford M.',
    summary: 'Always gives the medium amount, whatever happens.',
    create: () => ({ choose: () => 'medium' }),
  },
  openHand: {
    label: 'Open Hand',
    family: 'cooperator',
    tell: 'H every round, even after others give nothing. Drops to M (↓) once it can no longer afford H.',
    summary: 'Always gives the high amount. Generous, and easy to exploit.',
    create: () => ({ choose: () => 'high' }),
  },
  freeRider: {
    label: 'Free Rider',
    family: 'exploiter',
    tell: '0 every round.',
    summary: 'Never gives. Collects an equal share whenever the others carry the pool.',
    create: () => ({ choose: () => 'low' }),
  },
  opportunist: {
    label: 'Opportunist',
    family: 'exploiter',
    tell: 'H for the first few rounds, then a single 0, then it leaves.',
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
    tell: "Starts with M, then copies the table's average from the round before, a round late.",
    summary: 'Starts at medium, then matches what the others gave last round. A group version of Tit for Tat.',
    create: () => ({ choose: (v) => (v.othersMean === null ? 'medium' : nearest(v.othersMean)) }),
  },
  generousMirror: {
    label: 'Generous Mirror',
    family: 'reciprocator',
    tell: 'Like Mirror, but now and then one step more generous than the table was.',
    summary: 'Plays Mirror, but one time in four gives a level more than the others did. Its generosity can lift a sagging table.',
    create: (rng) => ({
      choose: (v) => {
        if (v.othersMean === null) return 'medium';
        const base = Math.round(v.othersMean);
        return toLevel(rng() < 0.25 ? base + 1 : base);
      },
      // every move this strategy could make (used to check guesses against the evidence)
      possible: (v) => (v.othersMean === null ? ['medium'] : [toLevel(Math.round(v.othersMean)), toLevel(Math.round(v.othersMean) + 1)]),
    }),
  },
  grudger: {
    label: 'Grudger',
    family: 'reciprocator',
    tell: 'H until anyone gives 0, then 0 for the rest of the table.',
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
    tell: "Starts with H. Holds its choice after a round it didn't lose on; steps down after a loss.",
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
    tell: 'Mostly follows the table like Mirror, with an odd out-of-pattern choice now and then.',
    summary: 'Means to play Mirror, but one time in six picks at random. Shows how noise can set off a slide.',
    create: (rng) => ({
      choose: (v) => {
        if (rng() < 1 / 6) return LEVELS[Math.floor(rng() * 3)];
        return v.othersMean === null ? 'medium' : nearest(v.othersMean);
      },
      possible: () => LEVELS.slice(),
    }),
    catchAll: true, // can explain any move, so it only counts as a fit when nothing else does
  },
  keeper: {
    label: 'Keeper',
    family: 'steward',
    tell: 'M most rounds; jumps to H in the round after the others fell short.',
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
