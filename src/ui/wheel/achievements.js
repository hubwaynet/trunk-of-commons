// The Wheel's achievements (Game 3, working title). Pure checks (no DOM), so tests and the simulator
// (tools/sim-wheel-achievements.mjs) can estimate how hard each one is. A tracker watches the table
// second by second, as the page and the simulator step it, and endAchievements judges the finished
// table. Ordered easiest first by simulated odds against the learning bots (docs/design/wheel-of-fortune.md).
// They count at the play-test's default stake, 500 (agent's choice, 2026-11-10): at higher stakes
// the six minutes are nearly certain.
// SPDX-License-Identifier: AGPL-3.0-only

import { whiteId, blackId, passedOn } from '../../engine/wheel.js';

export const STORAGE_KEY = 'trunk.wheel.achievements';
export const CELEBRATED_KEY = 'trunk.wheel.celebrated';
export const ACHIEVEMENT_STAKE = 500; // tokens
export const POOR = 0.4; // a player below this share of the stake is in danger
export const REFORM_WINDOW = 60; // seconds after you hurried a keeper past in which their change counts

// Easiest first, by the mean odds over ten styles for the human seat (tools/sim-wheel-achievements.mjs,
// 300 tables each, 2026-11-10, after decision 34): 72%, 48%, 46%, 42%, 40%, 24%.
export const ACHIEVEMENTS = [
  { id: 'bonus', name: 'Six minutes, bonus and all', text: 'The table lasted the six minutes with the poorest player above a tenth of the stake, so the boost fund was shared out.' },
  { id: 'most-passed', name: 'Passed it on', text: 'Of everyone at the table, you passed on the biggest part of what reached you.' },
  { id: 'lifeline', name: 'Lifeline', text: 'You hurried the black arrow past a player below four tenths of the stake, and the table lasted the six minutes.' },
  { id: 'changed-mind', name: 'Changed a mind', text: 'You hurried the white arrow past a player who was keeping everything, and within a minute they started passing on to others.' },
  { id: 'ahead', name: 'Came out ahead', text: 'You ended with more than your stake.' },
  { id: 'hero', name: 'Who was the hero?', text: 'You passed on the biggest part of what reached you, came out ahead, and the table earned the bonus: the sharer and the winner at once.' },
];

const keeping = (st) => st.share === 0 || st.people <= 1; // passes nothing on to anyone else

/**
 * Watches a table for the achievements that need to see it happen. Call tick(prev, s) after each
 * step: prev is the state the second started from (where the arrows were), s the state after it
 * (your vote that second is in s's settings).
 */
export function createTracker(id = 'you') {
  const facts = { hurried: {}, changedMind: [], lifeline: [] };
  return {
    facts,
    tick(prev, s) {
      const me = s.players.find((p) => p.id === id);
      if (!me) return;
      const v = me.settings.vote;
      const withWheel = v * prev.dir > 0;
      const w = whiteId(prev);
      const holder = prev.players.find((p) => p.id === w);
      if (withWheel && w !== id && keeping(holder.settings)) facts.hurried[w] = s.t;
      for (const p of s.players) {
        const was = prev.players.find((x) => x.id === p.id);
        const at = facts.hurried[p.id];
        if (at != null && keeping(was.settings) && !keeping(p.settings) && s.t - at <= REFORM_WINDOW) facts.changedMind.push({ who: p.id, t: s.t });
      }
      const b = blackId(prev);
      const pinned = prev.players.find((p) => p.id === b);
      if (withWheel && b !== id && pinned.balance < POOR * prev.stake) facts.lifeline.push({ who: b, t: s.t });
    },
  };
}

/**
 * Achievements that can be earned while the table is still playing, so the page can celebrate them
 * as they happen (Jason, 2026-11-10: "Add some celebration for achievements, as they occur").
 */
export function midAchievements(s, facts) {
  const got = new Set();
  if (Math.round(s.stake / 100) !== ACHIEVEMENT_STAKE) return got;
  if (facts.changedMind.length) got.add('changed-mind');
  return got;
}

/** Achievements for a finished table. facts come from createTracker. */
export function endAchievements(s, facts, id = 'you') {
  const got = new Set();
  if (s.status !== 'ended' || Math.round(s.stake / 100) !== ACHIEVEMENT_STAKE) return got;
  const me = s.players.find((p) => p.id === id);
  if (!me) return got;
  const lasted = s.endReason === 'time';
  if (s.bonus) got.add('bonus');
  if (facts.changedMind.length) got.add('changed-mind');
  if (lasted && facts.lifeline.length) got.add('lifeline');
  const ahead = me.balance > me.start;
  if (ahead) got.add('ahead');
  const mine = passedOn(me);
  const most = mine > 0 && s.players.every((p) => p.id === id || passedOn(p) < mine);
  if (most) got.add('most-passed');
  if (most && ahead && s.bonus) got.add('hero');
  return got;
}
