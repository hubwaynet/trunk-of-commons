// How hard is each Wheel achievement? The human seat is played by learner styles against five
// random learning bots, at the achievement stake (500), and each achievement's odds are averaged
// over the styles to order them easiest first.
// Usage: node tools/sim-wheel-achievements.mjs [tables] [options-json]
// SPDX-License-Identifier: AGPL-3.0-only

import { playTable, LEARNERS } from './sim-wheel.mjs';
import { rosterOf } from './wheel-bots-then.mjs';
import { mulberry32 } from '../src/engine/rng.js';
import { ACHIEVEMENTS, ACHIEVEMENT_STAKE, POOR, createTracker, endAchievements } from '../src/ui/wheel/achievements.js';

/** Hurries the white arrow past a player who keeps everything, and the black arrow past one in danger. */
const nudge = (v, strength) => {
  if (v.me.balance < 0.25 * v.stake) return 0;
  const w = v.players.find((p) => p.id === v.white);
  if (w.id !== v.id && (w.share === 0 || w.people <= 1)) return v.dir * strength;
  const b = v.players.find((p) => p.id === v.black);
  if (b.id !== v.id && b.balance < POOR * v.stake) return v.dir * strength;
  return 0;
};
const nudger = (share) => ({ label: `shares ${share}/10, hurries the arrows past keepers and the poorest (4)`, create: () => ({ decide: (v) => ({ vote: nudge(v, 4), share, people: v.n }) }) });

/** The styles that stand in for people playing the human seat. */
export const STYLES = {
  keep: LEARNERS.keep,
  half: LEARNERS.half,
  generous: LEARNERS.generous,
  all: LEARNERS.all,
  stewardHalf: LEARNERS.stewardHalf,
  stewardGenerous: LEARNERS.stewardGenerous,
  stewardAll: LEARNERS.stewardAll,
  nudgeHalf: nudger(5),
  nudgeGenerous: nudger(8),
  nudgeAll: nudger(10),
};

export function achievementOdds(tables = 300, opts = {}, styles = Object.keys(STYLES)) {
  const out = {};
  for (const k of styles) {
    const counts = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, 0]));
    for (let t = 0; t < tables; t++) {
      const seed = 5000 + t;
      const keys = [k, ...rosterOf('now', mulberry32(seed + 7), 5)];
      const id = `${k}#0`;
      const tracker = createTracker(id);
      const s = playTable(keys, seed, { stake: ACHIEVEMENT_STAKE, ...opts }, 'now', (prev, now) => tracker.tick(prev, now), STYLES);
      for (const a of endAchievements(s, tracker.facts, id)) counts[a]++;
    }
    out[k] = Object.fromEntries(Object.entries(counts).map(([a, c]) => [a, c / tables]));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tables = Number(process.argv[2] ?? 300);
  const opts = JSON.parse(process.argv[3] ?? '{}');
  const odds = achievementOdds(tables, opts);
  const styles = Object.keys(odds);
  const avg = ACHIEVEMENTS.map((a) => ({ ...a, mean: styles.reduce((x, k) => x + odds[k][a.id], 0) / styles.length, best: Math.max(...styles.map((k) => odds[k][a.id])) }));
  console.log(`== Wheel achievements at stake ${ACHIEVEMENT_STAKE}, ${tables} tables per style against five random learning bots`);
  console.log(`style | ${ACHIEVEMENTS.map((a) => a.id).join(' | ')}`);
  for (const k of styles) console.log(`${k} | ${ACHIEVEMENTS.map((a) => `${Math.round(100 * odds[k][a.id])}%`).join(' | ')}`);
  console.log('Easiest first (mean over the styles, best style):');
  for (const a of [...avg].sort((x, y) => y.mean - x.mean)) console.log(`  ${a.name}: ${Math.round(100 * a.mean)}% (best ${Math.round(100 * a.best)}%)`);
}
