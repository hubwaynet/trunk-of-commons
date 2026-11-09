// Headless simulation of the Wheel of Fortune Sharing Game (working title).
// Usage: node tools/sim-wheel.mjs [tables] [mode] [options-json]
//   mode: 'bots'     six random bots per table (default)
//         'learners' each learner style in the first seat (the initiator, yours on the page)
//                    against five random bots: is there a temptation for one player?
//         'same'     six players all of one style: what happens when everyone plays it?
//         'dilemma'  learners and same side by side
//         'stakes'   bot tables at a range of stakes
//         'split'    how the boost fund is shared out: equal, by the part passed on, by tokens passed on
//   options: engine options, e.g. '{"stake":500,"selfShare":"kept"}'
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, step, totalUnits, UNIT } from '../src/engine/wheel.js';
import { STRATEGIES, botView, selectRoster, steer, bring, rescue, steward } from '../src/bots/wheel-bots.js';
import { mulberry32 } from '../src/engine/rng.js';

const fixed = (share, people) => () => ({ decide: (v) => ({ vote: 0, share, people: people === 'all' ? v.n : people }) });

/** Styles for the human seat. They play fixed settings, so their results are easy to compare. */
export const LEARNERS = {
  keep: { label: 'keeps everything', create: fixed(0, 1) },
  half: { label: 'shares half with everyone', create: fixed(5, 'all') },
  generous: { label: 'shares 8/10 with everyone', create: fixed(8, 'all') },
  all: { label: 'shares everything with everyone', create: fixed(10, 'all') },
  halfNear: { label: 'shares half with the 2 nearest', create: fixed(5, 3) },
  selfHalf: { label: 'shares half with only themself', create: fixed(5, 1) },
  selfAll: { label: 'shares everything with only themself', create: fixed(10, 1) },
  steerSelf: { label: 'shares half, steers to self (up to 3)', create: () => ({ decide: (v) => ({ vote: steer(v, v.id, 3), share: 5, people: v.n }) }) },
  steerSelfHard: { label: 'shares half, steers to self (up to 9)', create: () => ({ decide: (v) => ({ vote: steer(v, v.id, 9, 0), share: 5, people: v.n }) }) },
  rescueKeep: { label: 'keeps everything, rescues the poorest (6)', create: () => ({ decide: (v) => ({ vote: rescue(v, 6, 0.3), share: 0, people: 1 }) }) },
  rescueHalf: { label: 'shares half, rescues the poorest (6)', create: () => ({ decide: (v) => ({ vote: rescue(v, 6, 0.3), share: 5, people: v.n }) }) },
  rescueGenerous: { label: 'shares 8/10, rescues the poorest (6)', create: () => ({ decide: (v) => ({ vote: rescue(v, 6, 0.3), share: 8, people: v.n }) }) },
  rescueAll: { label: 'shares everything, rescues the poorest (6)', create: () => ({ decide: (v) => ({ vote: rescue(v, 6, 0.3), share: 10, people: v.n }) }) },
  patronHalf: { label: 'shares half, brings the arrow to the biggest sharer (6)', create: () => ({ decide: (v) => { const o = v.players.filter((p) => p.id !== v.id); const best = o.reduce((a, p) => (p.share > a.share ? p : a)); return { vote: bring(v, best.id, 6, 0.25, true), share: 5, people: v.n }; } }) },
  stewardKeep: { label: 'keeps everything, stewards the wheel (4)', create: () => ({ decide: (v) => ({ vote: steward(v, 4, 0.4, 3, 0.35), share: 0, people: 1 }) }) },
  stewardHalf: { label: 'shares half, stewards the wheel (4)', create: () => ({ decide: (v) => ({ vote: steward(v, 4, 0.4, 3, 0.35), share: 5, people: v.n }) }) },
  stewardGenerous: { label: 'shares 8/10, stewards the wheel (4)', create: () => ({ decide: (v) => ({ vote: steward(v, 4, 0.4, 3, 0.35), share: 8, people: v.n }) }) },
  stewardAll: { label: 'shares everything, stewards the wheel (4)', create: () => ({ decide: (v) => ({ vote: steward(v, 4, 0.4, 3, 0.35), share: 10, people: v.n }) }) },
  bringSelf: { label: 'shares half, brings the arrow to self (up to 9)', create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 9, 0.1, true), share: 5, people: v.n }) }) },
  holdSelf: { label: 'shares half, brings the arrow to self (3), holding even when it costs', create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 3, 0.25, true), share: 5, people: v.n }) }) },
  opportunist: { label: 'shares 9/10, half at the white arrow', create: () => ({ decide: (v) => ({ vote: 0, share: v.white === v.id ? 5 : 9, people: v.n }) }) },
  lifeguard: {
    label: 'shares 7/10, steers to the poorest',
    create: () => ({ decide: (v) => ({ vote: steer(v, v.players.reduce((a, p) => (p.balance < a.balance ? p : a)).id, 2), share: 7, people: v.n }) }),
  },
};
const styleOf = (k) => STRATEGIES[k] ?? LEARNERS[k];

export function playTable(keys, seed, opts = {}) {
  const rng = mulberry32(seed);
  const ids = keys.map((k, i) => `${k}#${i}`);
  const inst = ids.map((id, i) => styleOf(keys[i]).create(rng));
  let s = createGame({ players: ids.map((id) => ({ id })), seed, record: false, ...opts });
  while (s.status === 'playing') {
    const d = {};
    ids.forEach((id, i) => { d[id] = inst[i].decide(botView(s, id)); });
    s = step(s, d);
  }
  return s;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const pct = (x, of) => `${((100 * x) / of).toFixed(0)}%`;

/** Plays many tables. rosterFor(t, rng) returns the six style keys for table t. */
export function simulate(tables, rosterFor, opts = {}) {
  const st = { tables, ends: {}, length: [], fundShare: [], poorest: [], lost: [], votes: [], fees: [], boost: [], per: {}, bySeat: [], bustBy: {}, firstSeat: [], conserved: 0 };
  for (let t = 0; t < tables; t++) {
    const seed = 5000 + t;
    const keys = rosterFor(t, mulberry32(seed + 7));
    const s = playTable(keys, seed, opts);
    const start = s.players.reduce((a, p) => a + p.start, 0) + s.fund.start + s.commonIn;
    if (totalUnits(s) === start) st.conserved++;
    st.ends[s.endReason] = (st.ends[s.endReason] ?? 0) + 1;
    st.length.push(s.t);
    const all = totalUnits(s);
    st.fundShare.push(s.fund.balance / all);
    if (s.bonus) st.bonus = (st.bonus ?? 0) + 1;
    st.poorest.push(Math.min(...s.players.map((p) => p.balance)) / s.stake);
    st.lost.push(1 - s.players.reduce((a, p) => a + p.balance, 0) / s.players.reduce((a, p) => a + p.start, 0));
    st.votes.push(s.fund.votes / UNIT); st.fees.push(s.fund.fees / UNIT); st.boost.push(s.fund.boostPaid / UNIT);
    s.players.forEach((p, i) => {
      const k = keys[i];
      const ps = (st.per[k] ??= { seats: 0, net: [], bust: 0 });
      ps.seats++; ps.net.push((p.balance - p.start) / UNIT);
      if (s.bust.includes(p.id)) { ps.bust++; st.bustBy[i] = (st.bustBy[i] ?? 0) + 1; }
      (st.bySeat[i] ??= []).push((p.balance - p.start) / UNIT);
    });
    st.firstSeat.push((s.players[0].balance - s.players[0].start) / UNIT);
  }
  return st;
}

export function report(st, title = '') {
  const L = [];
  const n = st.tables;
  L.push(`== ${title} (${n} tables)`);
  L.push(`Ends: ${Object.entries(st.ends).map(([k, v]) => `${k} ${pct(v, n)}`).join(', ')}; length median ${median(st.length)}s, mean ${mean(st.length).toFixed(0)}s; conserved ${pct(st.conserved, n)}`);
  L.push(`End bonus earned: ${pct(st.bonus ?? 0, n)}`);
  L.push(`Boost fund at end: median ${(100 * median(st.fundShare)).toFixed(0)}% of all tokens; players lost median ${(100 * median(st.lost)).toFixed(0)}% of their stakes; poorest ends at median ${(100 * median(st.poorest)).toFixed(0)}% of the stake`);
  L.push(`Per table (tokens, mean): votes ${mean(st.votes).toFixed(0)}, fees ${mean(st.fees).toFixed(0)}, boost paid ${mean(st.boost).toFixed(0)}`);
  L.push(`Net by join order (seat 1 = initiator, white arrow; seat 6 = black arrow): ${st.bySeat.map((a, i) => `${i + 1}: ${mean(a).toFixed(0)}`).join(' · ')}`);
  L.push(`Who went bust, by join order: ${Object.entries(st.bustBy).map(([i, v]) => `${Number(i) + 1}: ${pct(v, n)}`).join(', ') || 'nobody'}`);
  const rows = Object.entries(st.per).sort((a, b) => mean(b[1].net) - mean(a[1].net));
  L.push('Net per seat (mean, median, went bust): ' + rows.map(([k, v]) => `${styleOf(k).label} ${mean(v.net).toFixed(0)} (${median(v.net).toFixed(0)}, ${pct(v.bust, v.seats)})`).join(' · '));
  return L.join('\n');
}

/** For each learner style: alone against five random bots, and at a table of six of the same. */
export function dilemma(tables, opts = {}, styles = Object.keys(LEARNERS)) {
  return styles.map((k) => {
    const solo = simulate(tables, (t, rng) => [k, ...selectRoster(rng, 5)], opts);
    const same = simulate(tables, () => Array(6).fill(k), opts);
    return {
      style: k, label: LEARNERS[k].label,
      soloNet: mean(solo.firstSeat), soloTime: (solo.ends.time ?? 0) / tables, soloBust: solo.per[k].bust / solo.per[k].seats,
      sameNet: mean(same.per[k].net), sameTime: (same.ends.time ?? 0) / tables, sameLen: mean(same.length),
    };
  });
}

export function dilemmaReport(rows, title = '') {
  const L = [`== Dilemma ${title}`, 'style | you vs 5 random bots: your net, table lasted, you went bust | 6 of this style: net per seat, table lasted, mean length'];
  for (const r of [...rows].sort((a, b) => b.soloNet - a.soloNet)) {
    L.push(`${r.label.padEnd(40)} | ${r.soloNet.toFixed(0).padStart(5)}  ${pct(r.soloTime, 1).padStart(4)}  ${pct(r.soloBust, 1).padStart(4)} | ${r.sameNet.toFixed(0).padStart(5)}  ${pct(r.sameTime, 1).padStart(4)}  ${r.sameLen.toFixed(0).padStart(4)}s`);
  }
  return L.join('\n');
}

/**
 * How the boost fund is shared out (Jason, 2026-11-09, after playing: "according to sharing behaviour
 * instead of equal"). Each style alone against five random bots, and six of one style, at each stake
 * and each way of sharing out the fund.
 */
export function splitCompare(tables, opts = {}, stakes = [650, 800, 1000], ways = ['equal', 'rate', 'tokens'], styles = ['keep', 'half', 'generous', 'all', 'stewardHalf', 'stewardAll']) {
  const L = ['== How the boost fund is shared out: your net alone against five random bots (six of this style: net each)'];
  for (const stake of stakes) {
    for (const refundBy of ways) {
      const rows = dilemma(tables, { ...opts, stake, refundBy }, styles);
      L.push(`stake ${stake}, ${refundBy}: ${rows.map((r) => `${r.style} ${r.soloNet.toFixed(0)} (${r.sameNet.toFixed(0)})`).join(' · ')}`);
    }
  }
  return L.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tables = Number(process.argv[2] ?? 1000);
  const mode = process.argv[3] ?? 'bots';
  const opts = JSON.parse(process.argv[4] ?? '{}');
  const tag = JSON.stringify(opts);
  const bots = (t, rng) => selectRoster(rng, 6);
  if (mode === 'bots') console.log(report(simulate(tables, bots, opts), `bots ${tag}`));
  if (mode === 'learners' || mode === 'dilemma' || mode === 'same') console.log(dilemmaReport(dilemma(tables, opts), tag));
  if (mode === 'split') console.log(splitCompare(tables, opts));
  if (mode === 'stakes') {
    for (const stake of [300, 400, 500, 600, 800, 1000]) console.log(report(simulate(tables, bots, { ...opts, stake }), `bots stake ${stake} ${tag}`));
  }
}
