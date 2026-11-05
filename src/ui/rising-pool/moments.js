// What this Rising Pool table showed: finds moments in a finished table and links each to an
// idea in src/ui/ideas.js. Pure (no DOM), so it can be tested and sampled in simulation.
// Names come from the page; strategy names are never used, so the card can't spoil Read the table.
// SPDX-License-Identifier: AGPL-3.0-only

import { LEVEL_INDEX } from '../../engine/rising-pool.js';
import { listOf, cap } from '../ideas.js';

const chose = (r, id, lv) => r.levels[id] === lv && !r.downgraded?.[id];
const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
const LEVEL_WORD = { low: 'nothing', medium: 'medium', high: 'high' };

/**
 * game: a finished Rising Pool state. names: { id: display name } ('you' for the player).
 * strategies: { id: strategy key } for bots (used only to tell a random slip from a choice).
 * leftAfter: the round you left after, or null.
 */
export function tableMoments(game, { names, strategies = {}, leftAfter = null }) {
  const nm = (id) => names[id] ?? id;
  const L = (ids) => listOf(ids.map(nm));
  const out = [];
  const rounds = game.rounds;
  const ids = game.players.map((p) => p.id);

  // 1. The pool failed: who chose nothing, and who couldn't afford (↓)
  const last = rounds.at(-1);
  if (last?.result === 'fail') {
    const zeros = ids.filter((id) => chose(last, id, 'low'));
    const drops = ids.filter((id) => last.downgraded?.[id]);
    const short = `the average gift (${fmt(last.avg)}) fell short of medium (${last.stakes.medium})`;
    // One failed round, one card, named by its cause: couldn't afford (escalation) or chose nothing.
    if (drops.length) {
      out.push({ idea: 'congruence', priority: 1, you: drops.includes('you') || zeros.includes('you'),
        line: `Round ${last.round} failed: ${short}. ${cap(L(drops))} couldn't afford what ${drops.length === 1 && drops[0] === 'you' ? 'you' : 'they'} chose (↓)${zeros.length ? `, and ${L(zeros)} chose to give nothing` : ''}.` });
    } else if (zeros.length) {
      out.push({ idea: 'threshold', priority: 1, you: zeros.includes('you'),
        line: `Round ${last.round} failed: ${L(zeros)} chose to give nothing, and ${short}. Everything in the pool went to the Commons.` });
    }
  }

  // 2. One 0 answered by others: retaliation, or a slip that set off a slide
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1], cur = rounds[i];
    const zeros = ids.filter((id) => id in prev.levels && chose(prev, id, 'low'));
    if (!zeros.length) continue;
    const followers = ids.filter((id) => id in cur.levels && !zeros.includes(id)
      && LEVEL_INDEX[prev.levels[id]] >= 1 && chose(cur, id, 'low'));
    if (!followers.length) continue;
    const back = followers.filter((id) => rounds.slice(i + 1).some((r) => id in r.levels && LEVEL_INDEX[r.levels[id]] >= 1 && !r.downgraded?.[id]));
    const slip = zeros.find((id) => strategies[id] === 'jitteryMirror' && wasSlip(rounds, i - 1, id));
    out.push({ idea: slip ? 'noise' : 'reciprocity', priority: 3, you: zeros.includes('you') || followers.includes('you'),
      line: `In round ${prev.round}, ${L(zeros)} gave nothing${slip ? `, out of step with the table` : ''}. In round ${cur.round}, ${L(followers)} stopped giving too.`
        + (back.length ? ` ${cap(L(back))} came back to giving later.` : ' Nobody who stopped came back.') });
    break; // the first time is the one that shaped the table
  }

  // 3. A free rider came out ahead
  for (const p of game.players) {
    const mine = rounds.filter((r) => p.id in r.levels);
    const zeros = mine.filter((r) => chose(r, p.id, 'low')).length;
    if (mine.length >= 3 && zeros >= Math.ceil(mine.length / 2) && p.balance > p.start) {
      out.push({ idea: 'freeRider', priority: 4, you: p.id === 'you',
        line: `${cap(nm(p.id))} gave nothing in ${zeros} of ${mine.length} rounds and finished ${p.balance - p.start > 0 ? '+' : ''}${p.balance - p.start}, carried by the others' gifts.` });
      break;
    }
  }

  // 4. Leaving: you left before the end, or someone gave high, then nothing once, then left
  if (leftAfter !== null) {
    const failedAfter = last?.result === 'fail' && last.round > leftAfter;
    out.push({ idea: 'endgame', priority: 5, you: true,
      line: `You left after round ${leftAfter}${failedAfter ? `, and the pool failed in round ${last.round}` : ''}.` });
  }
  for (const p of game.players.filter((x) => x.id !== 'you' && x.leftAfterRound)) {
    const mine = rounds.filter((r) => p.id in r.levels);
    const lastMine = mine.at(-1);
    const highs = mine.slice(0, -1).filter((r) => chose(r, p.id, 'high')).length;
    if (lastMine && chose(lastMine, p.id, 'low') && highs >= 2 && highs === mine.length - 1) {
      out.push({ idea: 'endgame', priority: 5, you: false,
        line: `${nm(p.id)} gave high for ${highs} rounds, gave nothing in round ${lastMine.round}, then left.` });
      break;
    }
  }

  // 5. A run of bonus rounds
  let run = 0, best = null;
  for (const r of rounds) { run = r.result === 'bonus' ? run + 1 : 0; if (run >= 3) best = { to: r.round, len: run }; }
  if (best) {
    out.push({ idea: 'shadow', priority: 6, you: false,
      line: `Rounds ${best.to - best.len + 1} to ${best.to} were bonus rounds: the table gave nearer high, and the Commons topped everyone up to the high amount.` });
  }
  return out;
}

// Did this player's choice differ from copying the others' average the round before?
function wasSlip(rounds, i, id) {
  if (i === 0) return rounds[0].levels[id] !== 'medium';
  const prev = rounds[i - 1];
  const others = Object.entries(prev.levels).filter(([x]) => x !== id).map(([, lv]) => LEVEL_INDEX[lv]);
  const copy = Math.max(0, Math.min(2, Math.round(others.reduce((a, b) => a + b, 0) / others.length)));
  return LEVEL_INDEX[rounds[i].levels[id]] !== copy;
}

export { LEVEL_WORD };
