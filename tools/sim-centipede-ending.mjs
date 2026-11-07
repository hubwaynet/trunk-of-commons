// How should a Centipede & Ultimatum table end? Compares the round limit with tables that play
// on to a natural end (Jason's question, 2026-11-08).
// Usage: node tools/sim-centipede-ending.mjs [botTables] [tablesPerLearner]
// SPDX-License-Identifier: AGPL-3.0-only

import { playTable } from './sim-centipede.mjs';
import { LEARNERS, playWithLearner } from './sim-centipede-achievements.mjs';
import { selectRoster, STRATEGIES } from '../src/bots/centipede-ultimatum-bots.js';
import { mulberry32 } from '../src/engine/rng.js';

// The rules before 2026-11-08 and the variants Jason chose between. The last is now the default.
const OLD = { maxRound: 20, minGivers: 1, lastPool: 'refund' };
const VARIANTS = {
  'round limit 20 (until 2026-11-08)': OLD,
  'no limit': { ...OLD, maxRound: Infinity },
  'no limit, ends when fewer than 3 can give': { ...OLD, maxRound: Infinity, minGivers: 3 },
  'fewer than 3 can give, then a last split (default since 2026-11-08)': {},
};
const LEARNER_KEYS = ['giver', 'stake, votes 2 on own', 'fair + sanctions', 'patient skimmer', 'coalition'];

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (n, of) => `${Math.round((100 * n) / of)}%`;
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };

/** What a finished table looked like. */
function measure(s, you = null) {
  const rounds = s.rounds.length;
  const acting = (r) => r.moves.filter((m) => m.move !== 'pass').length;
  const thin = s.rounds.filter((r) => acting(r) < 3).length;
  const after20 = s.rounds.filter((r) => r.round > 20);
  const out = {
    rounds, thin, endReason: s.endReason,
    lastIsSplit: s.rounds.at(-1)?.result === 'ultimatum',
    poolBack: Object.values(s.finalShares ?? {}).reduce((a, b) => a + b, 0),
    splitsAfter20: after20.filter((r) => r.result === 'ultimatum').length,
    roundsAfter20: after20.length,
    thinAfter20: after20.filter((r) => acting(r) < 3).length,
    commons: s.commons.reserve,
    final: (() => {
      const u = s.rounds.at(-1)?.ultimatum;
      if (!u?.final) return null;
      const n = Object.keys(u.shares).length;
      return { result: u.result, pool: u.pool, grabber: u.grabber, kept: u.shares[u.grabber], fair: Math.floor(u.pool / n), stake: u.stakes[u.grabber] ?? 0 };
    })(),
  };
  if (you) {
    const p = s.players.find((x) => x.id === you);
    const mine = s.rounds.flatMap((r) => r.moves.filter((m) => m.id === you));
    Object.assign(out, { net: p.balance - p.start, atEnd: p.active, turns: mine.length, passes: mine.filter((m) => m.move === 'pass').length });
    // candidate wordings for Full distance once round 20 is no longer the end
    out.fd = {
      'at the table when it ended': p.active,
      'at the end, and the money ran out (not too few)': p.active && s.endReason !== 'too-few',
      'at the end of a table of 15+ rounds': p.active && rounds >= 15,
      'at the end of a table of 20+ rounds': p.active && rounds >= 20,
    };
  }
  return out;
}

function summarise(ms, title) {
  const n = ms.length;
  const r = ms.map((m) => m.rounds);
  const ends = {};
  for (const m of ms) ends[m.endReason] = (ends[m.endReason] ?? 0) + 1;
  const lines = [`  ${title}`];
  lines.push(`    rounds: median ${median(r)}, 90th percentile ${q(r, 0.9)}, longest ${Math.max(...r)}; past 20 ${pct(r.filter((x) => x > 20).length, n)}, past 30 ${pct(r.filter((x) => x > 30).length, n)}`);
  lines.push(`    ends: ${Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, n)}`).join(', ')}`);
  lines.push(`    last round was a split ${pct(ms.filter((m) => m.lastIsSplit).length, n)}; pool handed back at the end: median ${median(ms.map((m) => m.poolBack))}, 0 at ${pct(ms.filter((m) => m.poolBack === 0).length, n)} of tables`);
  const long = ms.filter((m) => m.roundsAfter20 > 0);
  if (long.length) lines.push(`    tables past 20: ${mean(long.map((m) => m.roundsAfter20)).toFixed(1)} extra rounds on average, of which ${pct(long.reduce((a, m) => a + m.thinAfter20, 0), long.reduce((a, m) => a + m.roundsAfter20, 0))} had fewer than 3 players able to act; ${mean(long.map((m) => m.splitsAfter20)).toFixed(1)} splits after round 20`);
  lines.push(`    rounds with fewer than 3 able to act: ${pct(ms.reduce((a, m) => a + m.thin, 0), ms.reduce((a, m) => a + m.rounds, 0))} of all rounds; Commons left median ${median(ms.map((m) => m.commons))}`);
  const fin = ms.filter((m) => m.final);
  if (fin.length) {
    const res = {};
    for (const m of fin) res[m.final.result] = (res[m.final.result] ?? 0) + 1;
    lines.push(`    last split at ${pct(fin.length, n)} of tables: pool median ${median(fin.map((m) => m.final.pool))}; ${Object.entries(res).map(([k, v]) => `${k} ${pct(v, fin.length)}`).join(', ')}; divider kept more than an equal share ${pct(fin.filter((m) => m.final.kept > m.final.fair + 1).length, fin.length)}`);
    if (ms[0].net !== undefined) {
      const mine = fin.filter((m) => m.final.grabber === 'you');
      lines.push(`    you divided the last split at ${pct(mine.length, n)} of tables`);
    }
  }
  if (ms[0].net !== undefined) {
    lines.push('    Full distance if it meant: ' + Object.keys(ms[0].fd).map((k) => `${k} ${pct(ms.filter((m) => m.fd[k]).length, n)}`).join('; '));
    lines.push(`    you: net mean ${mean(ms.map((m) => m.net)).toFixed(1)}, median ${median(ms.map((m) => m.net))}; at the table at the end ${pct(ms.filter((m) => m.atEnd).length, n)}; your turns median ${median(ms.map((m) => m.turns))}, 90th pct ${q(ms.map((m) => m.turns), 0.9)}, of which passes median ${median(ms.map((m) => m.passes))}`);
  }
  return lines.join('\n');
}

const T = Number(process.argv[2] ?? 4000);
const L = Number(process.argv[3] ?? 1500);
for (const [name, opts] of Object.entries(VARIANTS)) {
  console.log(`\n== ${name}`);
  const bots = [];
  const per = {};
  for (let t = 0; t < T; t++) {
    const keys = selectRoster(mulberry32(1000 + t), 6);
    const s = playTable(keys, 1000 + t, opts);
    bots.push(measure(s));
    for (const p of s.players) { const k = p.id.split('#')[0]; (per[k] ??= []).push(p.balance - p.start); }
  }
  console.log(summarise(bots, `bot tables (${T})`));
  console.log('    net per seat: ' + Object.entries(per).map(([k, v]) => [k, mean(v)]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${STRATEGIES[k].label} ${v.toFixed(1)}`).join(' · '));
  for (const k of LEARNER_KEYS) {
    const ms = [];
    for (let t = 0; t < L; t++) ms.push(measure(playWithLearner(k, 7000 + t, opts), 'you'));
    console.log(summarise(ms, `you play "${k}" (${L})`));
  }
}
