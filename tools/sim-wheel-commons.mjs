// How big should CommonWeal's common fund start? (Jason, 2026-11-10: "simulate a starting amount
// likely to still pay out in game 3".) The common fund sits outside every table: it pays each
// table's bonus and takes any boost fund a table loses (2017: "what's left in the game's boost fund
// goes to a common fund that helps start and finish future games"). The bots don't react to it and
// the bonus is paid only at the end, so each table is played once and the fund's path is replayed
// for each starting amount.
// Usage: node tools/sim-wheel-commons.mjs [sequences] [tables per sequence]
// SPDX-License-Identifier: AGPL-3.0-only

import { playTable } from './sim-wheel.mjs';
import { rosterOf } from './wheel-bots-then.mjs';
import { STYLES } from './sim-wheel-achievements.mjs';
import { mulberry32 } from '../src/engine/rng.js';
import { UNIT } from '../src/engine/wheel.js';

const STAKE = 500;
export const PLAYERS = ['keep', 'half', 'generous', 'all', 'nudgeGenerous', 'mixed'];

/** One player's tables in a row: what each asked of the common fund and what it gave back. */
function sequence(style, seq, tables) {
  const out = [];
  const pick = mulberry32(90000 + seq);
  for (let k = 0; k < tables; k++) {
    const seed = 100000 + seq * 1000 + k;
    const key = style === 'mixed' ? PLAYERS[Math.floor(pick() * (PLAYERS.length - 1))] : style;
    const keys = [key, ...rosterOf('now', mulberry32(seed + 7), 5)];
    const s = playTable(keys, seed, { stake: STAKE }, 'now', null, STYLES);
    out.push({ bonus: s.commonIn / UNIT, back: s.fund.balance / UNIT }); // back: a lost fund, or a share-out's odd hundredths
  }
  return out;
}

/** Replays a sequence from a starting amount: how many tables paid the bonus in full before it fell short. */
function replay(seqData, start) {
  let cf = start;
  let shortAt = null;
  for (const [k, t] of seqData.entries()) {
    const paid = Math.min(t.bonus, Math.floor(cf / 6) * 6);
    if (paid < t.bonus && shortAt == null) shortAt = k + 1;
    cf += t.back - paid;
  }
  return { shortAt, end: cf };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seqs = Number(process.argv[2] ?? 60);
  const tables = Number(process.argv[3] ?? 30);
  const starts = [500, 1000, 2000, 3000, 5000, 8000];
  console.log(`== The common fund at stake ${STAKE}: ${seqs} players of each style, ${tables} tables each, against five random learning bots`);
  console.log('style | bonus tables | bonus paid per bonus table (mean) | lost funds per table (mean) | for each starting amount: share of players whose bonus was paid in full through table 10, 20, 30; fund after 30 (median)');
  for (const style of PLAYERS) {
    const data = Array.from({ length: seqs }, (_, q) => sequence(style, q, tables));
    const all = data.flat();
    const bonusTables = all.filter((t) => t.bonus > 0);
    const row = starts.map((S) => {
      const r = data.map((d) => replay(d, S));
      const ok = (k) => r.filter((x) => x.shortAt == null || x.shortAt > k).length / r.length;
      const ends = r.map((x) => x.end).sort((a, b) => a - b);
      return `${S}: ${[10, 20, 30].map((k) => `${Math.round(100 * ok(k))}%`).join('/')} (${Math.round(ends[Math.floor(ends.length / 2)])})`;
    });
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    console.log(`${style} | ${Math.round((100 * bonusTables.length) / all.length)}% | ${mean(bonusTables.map((t) => t.bonus)).toFixed(0)} | ${mean(all.map((t) => t.back)).toFixed(0)} | ${row.join(' · ')}`);
  }
}
