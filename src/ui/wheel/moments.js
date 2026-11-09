// What this Wheel table showed: finds moments in a finished table and links each to an idea in
// src/ui/ideas.js (sources checked 2026-11-10). Pure (no DOM). Strategy names are never used.
// SPDX-License-Identifier: AGPL-3.0-only

import { passedOn } from '../../engine/wheel.js';
import { cap } from '../ideas.js';

const clock = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
const tok = (u) => Math.round(u / 100);
const keeping = (st) => st.share === 0 || st.people <= 1;

/**
 * s: a finished table. names: { id: display name } ('you' for the player).
 * facts: from the achievements tracker (your seat), or null when watching.
 * lessons: { id: [{ t, text }] }, what each bot said it learned (as the page shows it).
 * first: { id: settings at the start }.
 */
export function tableMoments(s, { names, facts = null, lessons = {}, first = {} }) {
  const nm = (id) => names[id] ?? id;
  const out = [];
  const me = s.players.find((p) => p.id === 'you');

  // 1. You changed a keeper's mind by hurrying the white arrow past them
  const changed = facts?.changedMind?.[0];
  if (changed) {
    const at = facts.hurried[changed.who];
    out.push({ idea: 'sanctions', priority: 1, you: true,
      line: `You hurried the white arrow past ${nm(changed.who)} while they kept everything, and ${Math.max(1, changed.t - at)} seconds later they started passing on to others.` });
  }

  // 2. You paid to steer for the table, and everyone shared what came of it
  if (me && me.stats.voted >= 10 * 100 && facts && (facts.lifeline.length || Object.keys(facts.hurried).length)) {
    out.push({ idea: 'secondOrder', priority: 3, you: true,
      line: `You spent ${tok(me.stats.voted)} tokens on votes, hurrying the arrows past ${facts.lifeline.length ? 'a player in danger' : 'players who kept everything'}. Everyone at the table shared what came of it; only you paid for it.` });
  }

  // 3. The table went bust: the pot stops going round
  if (s.endReason === 'bust') {
    const who = s.bust.map(nm);
    out.push({ idea: 'rosca', priority: 2, you: s.bust.includes('you'),
      line: `The table ended at ${clock(s.t)}, when ${who.join(' and ')} couldn't pay at the black arrow, and the boost fund was lost for everyone.` });
  }

  // 4. The bonus hung on the poorest player
  if (s.endReason === 'time') {
    const bell = s.ending?.bell ?? s.players.map((p) => p.balance);
    const i = bell.indexOf(Math.min(...bell));
    const poor = s.players[i];
    const pct = Math.round((100 * bell[i]) / s.stake);
    const helped = facts?.lifeline?.some((x) => x.who === poor.id);
    out.push({ idea: 'difference', priority: 3, you: poor.id === 'you' || Boolean(helped),
      line: `The whole table's bonus hung on its poorest player, ${nm(poor.id)}, who had ${tok(bell[i])} at the bell (${pct}% of the stake)${s.bonus ? `: enough for a ${s.bonus.pct}% bonus for everyone` : ': under a tenth, so no bonus and no share-out'}${helped ? '. You had hurried the black arrow past them when they were in danger.' : '.'}` });
  }

  // 5. A bot that learned by trying (win-stay, lose-shift)
  for (const [id, ls] of Object.entries(lessons)) {
    const tries = ls.filter((l) => /per token of reward|trying a change/.test(l.text));
    if (tries.length >= 3) {
      const p = s.players.find((x) => x.id === id);
      out.push({ idea: 'wsls', priority: 4, you: false,
        line: `${cap(nm(id))} moved its share dial ${tries.length} times, keeping each change that left it more of every token that reached it and turning back after each that didn't. It ended passing on ${p.settings.share}/10.` });
      break;
    }
  }

  // 6. A keeper who let others share with them, until the fees bit
  for (const p of s.players) {
    if (p.id === 'you' || !first[p.id] || !keeping(first[p.id])) continue;
    const l = (lessons[p.id] ?? []).find((x) => /fees|fee took/.test(x.text));
    if (l && p.stats.sharesIn > 0) {
      out.push({ idea: 'freeRider', priority: 5, you: false,
        line: `${cap(nm(p.id))} passed nothing on for the first ${clock(l.t)}, though others' shares kept reaching them, until the fees taught them otherwise.` });
      break;
    }
  }

  // 7. The fund shared out by sharing
  if (s.bonus && s.refundBy !== 'equal') {
    const ranked = [...s.players].sort((a, b) => passedOn(b) - passedOn(a));
    const top = ranked[0];
    const low = ranked.at(-1);
    if (top.refund > low.refund) {
      out.push({ idea: 'equity', priority: 5, you: top.id === 'you' || low.id === 'you',
        line: `The boost fund was shared out by what each passed on: ${nm(top.id)} passed on ${Math.round(100 * passedOn(top))}% of what reached ${top.id === 'you' ? 'you' : 'them'} and got ${tok(top.refund)}; ${nm(low.id)} passed on ${Math.round(100 * passedOn(low))}% and got ${tok(low.refund)}.` });
    }
  }

  // 8. How far the reward travelled
  const reward = s.players.reduce((a, p) => a + p.stats.reward, 0);
  const passed = s.players.reduce((a, p) => a + Math.max(0, p.stats.sharesOut - p.stats.boost), 0);
  if (reward > 0) {
    out.push({ idea: 'cascade', priority: 6, you: false,
      line: `For every 10 tokens of reward that reached the white arrow, ${(10 * passed / reward).toFixed(1)} changed hands as shares, passed on by the holder and then by those they shared with.` });
  }
  return out;
}
