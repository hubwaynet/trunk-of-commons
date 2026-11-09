// Headless simulation of the Wheel of Fortune Sharing Game (working title).
// Usage: node tools/sim-wheel.mjs [tables] [mode] [options-json]
//   mode: 'bots'     six random bots per table (default)
//         'learners' each learner style in the first seat (the initiator, yours on the page)
//                    against five random bots: is there a temptation for one player?
//         'same'     six players all of one style: what happens when everyone plays it?
//         'dilemma'  learners and same side by side
//         'stakes'   bot tables at a range of stakes
//         'split'    how the boost fund is shared out: equal, by the part passed on, by tokens passed on
//         'stake'    the stake with every bot learning: bot tables and lone styles, 400 to 1,000
//   Re-runs of the design doc's tables, with the bots of their time (tools/wheel-bots-then.mjs):
//         'votes'    votes never changed the wheel under the first rule
//         'floors'   votes that add and slow: floors and the pinned-player protection
//         'smart'    after decisions 21-23: smart bots, pricier votes against the wheel
//         'learning' decision 24 (two Learners) and decision 26 (every bot learns)
//   options: engine options, e.g. '{"stake":500,"selfShare":"kept"}'
// SPDX-License-Identifier: AGPL-3.0-only

import { createGame, step, totalUnits, whiteId, UNIT } from '../src/engine/wheel.js';
import { STRATEGIES, botView, selectRoster, steer, bring, rescue, steward } from '../src/bots/wheel-bots.js';
import { mulberry32 } from '../src/engine/rng.js';
import { ERAS, rosterOf } from './wheel-bots-then.mjs';

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
  holdPaysSelf: { label: 'shares half, brings the arrow to self (3), holding only if it pays', create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 3, 0.25, false), share: 5, people: v.n }) }) },
  holdSelf: { label: 'shares half, brings the arrow to self (3), holding even when it costs', create: () => ({ decide: (v) => ({ vote: bring(v, v.id, 3, 0.25, true), share: 5, people: v.n }) }) },
  opportunist: { label: 'shares 9/10, half at the white arrow', create: () => ({ decide: (v) => ({ vote: 0, share: v.white === v.id ? 5 : 9, people: v.n }) }) },
  lifeguard: {
    label: 'shares 7/10, steers to the poorest',
    create: () => ({ decide: (v) => ({ vote: steer(v, v.players.reduce((a, p) => (p.balance < a.balance ? p : a)).id, 2), share: 7, people: v.n }) }),
  },
};
const styleOf = (k) => STRATEGIES[k] ?? LEARNERS[k];

/**
 * Plays one table. keys are strategy keys (from the era's bots), learner styles, or keys of `styles`.
 * onTick(prev, s, d) sees every second, for measurements.
 */
export function playTable(keys, seed, opts = {}, era = 'now', onTick = null, styles = null) {
  const bots = ERAS[era].strategies;
  const style = (k) => bots[k] ?? styles?.[k] ?? LEARNERS[k];
  const rng = mulberry32(seed);
  const ids = keys.map((k, i) => `${k}#${i}`);
  const inst = ids.map((id, i) => style(keys[i]).create(rng));
  let s = createGame({ players: ids.map((id) => ({ id })), seed, record: false, ...opts });
  while (s.status === 'playing') {
    const d = {};
    ids.forEach((id, i) => { d[id] = inst[i].decide(botView(s, id)); });
    const prev = s;
    s = step(s, d);
    onTick?.(prev, s, d);
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

// ---------- measured sets: the tables in the design doc ----------

const dialOf = (p) => (p.settings.people > 1 ? p.settings.share : 0); // a keeper (or sharing only with yourself) counts 0
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const pc = (x) => `${Math.round(100 * x)}%`;
const sgn = (x) => (x >= 0 ? `+${Math.round(x)}` : `${Math.round(x)}`);

/**
 * Plays a set of tables and measures what the design doc reports. rosterFor(t, rng) gives the keys;
 * the seeds are those of simulate(): table t uses seed 5000 + t, its roster mulberry32(seed + 7).
 */
export function measure(tables, rosterFor, opts = {}, era = 'now') {
  const M = {
    tables, era, lasted: 0, bonus: 0, voteSecs: 0, changedSecs: 0, secs: 0, votes: [], fund: [], length: [], poorest: [],
    dial: { 30: [], 120: [], 240: [], end: [] }, maxBlackRun: 0, busters: {}, per: {}, low: [],
  };
  for (let t = 0; t < tables; t++) {
    const seed = 5000 + t;
    const keys = rosterFor(t, mulberry32(seed + 7));
    const seats = keys.map((k) => ({ key: k, white: 0, notes: [], first: null, moves: 0, last: null, reformed: null }));
    let blackRun = 0;
    let low = Infinity;
    const s = playTable(keys, seed, opts, era, (prev, now, d) => {
      M.secs++;
      low = Math.min(low, ...now.players.map((p) => p.balance));
      const ids = now.players.map((p) => p.id);
      const voted = ids.some((id) => d[id].vote);
      if (voted) {
        M.voteSecs++;
        if (now.speed !== now.minSpeed || now.dir !== prev.dir) M.changedSecs++;
      }
      const w = whiteId(now);
      ids.forEach((id, i) => {
        const x = seats[i];
        if (w === id && now.status === 'playing') x.white++;
        const dd = d[id];
        if (x.first == null) x.first = dd.share;
        else if (x.last != null && dd.share !== x.last) x.moves++;
        x.last = dd.share;
        if (dd.note) x.notes.push({ t: now.t, note: dd.note });
        if (dd.reformed && !x.reformed) x.reformed = dd.reformed;
      });
      blackRun = Math.max(blackRun, ...now.players.map((p) => p.atBlack));
      if (now.t === 30 || now.t === 120 || now.t === 240) M.dial[now.t].push(mean(now.players.map(dialOf)));
    });
    M.dial.end.push(mean(s.players.map(dialOf)));
    M.low.push(low / s.stake); // the poorest player's lowest point during the table, as a share of the stake
    M.maxBlackRun = Math.max(M.maxBlackRun, blackRun);
    if (s.endReason === 'time') M.lasted++;
    if (s.bonus) M.bonus++;
    M.votes.push(s.fund.votes / UNIT);
    M.fund.push((s.fund.balance + s.fund.refunded) / UNIT); // the fund before it was shared out (or lost)
    M.length.push(s.t);
    M.poorest.push(Math.min(...s.players.map((p) => p.balance)) / s.stake);
    s.players.forEach((p, i) => {
      const x = seats[i];
      const ps = (M.per[x.key] ??= { seats: 0, net: [], white: 0, secs: 0, bust: 0, lasted: 0, notes: [], first: [], end: [], moves: [], reformed: [] });
      ps.seats++; ps.net.push((p.balance - p.start) / UNIT); ps.white += x.white; ps.secs += s.t;
      if (s.endReason === 'time') ps.lasted++;
      if (s.bust.includes(p.id)) { ps.bust++; M.busters[x.key] = (M.busters[x.key] ?? 0) + 1; }
      ps.notes.push(x.notes); ps.first.push(x.first); ps.end.push(p.settings.share); ps.moves.push(x.moves);
      if (x.reformed) ps.reformed.push(x.reformed);
    });
  }
  return M;
}
/** Of the seats a style sat in: the share where a note matched, and the median time of the first match. */
export function lesson(M, key, re) {
  const ps = M.per[key];
  if (!ps) return null;
  const firsts = ps.notes.map((ns) => ns.find((n) => re.test(n.note))).filter(Boolean).map((n) => n.t);
  return { share: firsts.length / ps.seats, median: median(firsts) };
}
const net = (M, k) => mean(M.per[k]?.net ?? []);
const whiteShare = (M, k) => (M.per[k] ? M.per[k].white / M.per[k].secs : NaN);
const alone = (k, era) => (t, rng) => [k, ...rosterOf(era, rng, 5)];
const botsOf = (era) => (t, rng) => rosterOf(era, rng, 6);

/** Votes never changed the wheel under the first rule (finding after Jason's first play). */
export function votesMode(tables = 300) {
  const M = measure(tables, botsOf('first'), { stake: 650, voteSpeed: 'pastMin', voteCostAgainst: null, refundBy: 'equal' }, 'first');
  return ['== Votes under the first rule (bots of decisions 12-20, stake 650)',
    `Bots voted in ${pc(M.voteSecs / M.secs)} of all seconds; their votes changed the wheel's speed or direction in ${pc(M.changedSecs / Math.max(1, M.voteSecs))} of them (${M.changedSecs} seconds); votes cost ${mean(M.votes).toFixed(0)} tokens a table.`].join('\n');
}

/** Votes that add and slow: floors, and the pinned-player protection (bots of decisions 12-20). */
export function floorsMode(tables = 300) {
  const L = ['== Votes that add and slow: floors and protection (bots of decisions 12-20; a vote costs a quarter either way)',
    'rule | votes that changed the wheel | bot tables lasted | bonus | Self-Steerer: white arrow, net | hard holder alone: white arrow, net, lasted'];
  const rows = [
    ['first rule (pastMin)', { voteSpeed: 'pastMin' }], ['adds, no slowing', { voteSpeed: 'adds' }],
    ['adds and slows, floor 4', { slowest: 4 }], ['floor 3', { slowest: 3 }], ['floor 2', { slowest: 2 }], ['floor 0', { slowest: 0 }],
    ['floor 2 + protection', { slowest: 2, blackRun: 10 }], ['floor 0 + protection', { slowest: 0, blackRun: 10 }],
  ];
  for (const stake of [650, 1000]) {
    L.push(`-- stake ${stake}`);
    for (const [label, o] of rows) {
      const opts = { stake, voteSpeed: 'addsSlows', voteCostAgainst: null, refundBy: 'equal', ...o };
      const B = measure(tables, botsOf('first'), opts, 'first');
      const H = measure(tables, alone('bringSelf', 'first'), opts, 'first');
      L.push(`${label} | ${pc(B.changedSecs / Math.max(1, B.voteSecs))} | ${pc(B.lasted / tables)} | ${pc(B.bonus / tables)} | ${pc(whiteShare(B, 'selfSteerer'))}, ${sgn(net(B, 'selfSteerer'))} | ${pc(whiteShare(H, 'bringSelf'))}, ${sgn(net(H, 'bringSelf'))}, ${pc(H.lasted / tables)}`);
    }
  }
  return L.join('\n');
}

/** After decisions 21-23: smart bots, pricier votes against the wheel. */
export function smartMode(tables = 300) {
  const L = ['== After decisions 21-23 (smart bots)', 'measure | first rule, 650 | now, 650 | first rule, 1,000 | now, 1,000'];
  const cols = [];
  for (const stake of [650, 1000]) {
    for (const now of [false, true]) {
      const opts = now ? { stake, refundBy: 'equal' } : { stake, voteSpeed: 'pastMin', voteCostAgainst: null, refundBy: 'equal' };
      const B = measure(tables, botsOf('smart'), opts, 'smart');
      const solo = Object.fromEntries(['half', 'holdPaysSelf', 'holdSelf', 'bringSelf', 'stewardHalf'].map((k) => [k, measure(tables, alone(k, 'smart'), opts, 'smart')]));
      cols.push({ B, solo });
    }
  }
  const row = (label, f) => L.push(`${label} | ${cols.map(f).join(' | ')}`);
  row('votes that changed the wheel', (c) => pc(c.B.changedSecs / Math.max(1, c.B.voteSecs)));
  row('bot tables lasted', (c) => pc(c.B.lasted / tables));
  row('bonus earned', (c) => pc(c.B.bonus / tables));
  row('Self-Steerer: white arrow, net', (c) => `${pc(whiteShare(c.B, 'selfSteerer'))}, ${sgn(net(c.B, 'selfSteerer'))}`);
  row('alone: shares half, no steering', (c) => sgn(net(c.solo.half, 'half')));
  row('alone: holds if it pays', (c) => sgn(net(c.solo.holdPaysSelf, 'holdPaysSelf')));
  row('alone: holds when it costs', (c) => sgn(net(c.solo.holdSelf, 'holdSelf')));
  row('alone: hard holder (9, stubborn)', (c) => sgn(net(c.solo.bringSelf, 'bringSelf')));
  row('alone: shares half and stewards', (c) => sgn(net(c.solo.stewardHalf, 'stewardHalf')));
  row('steward\'s tables lasted, bonus (plain sharer\'s)', (c) => `${pc(c.solo.stewardHalf.lasted / tables)}, ${pc(c.solo.stewardHalf.bonus / tables)} (${pc(c.solo.half.lasted / tables)}, ${pc(c.solo.half.bonus / tables)})`);
  const B = cols[1].B;
  L.push(`At 650 now: ${tables - B.lasted} of ${tables} bot tables ended early; who couldn't pay: ${Object.entries(B.busters).map(([k, v]) => `${k} ${v}`).join(', ') || 'nobody'}; longest run at the black arrow ${B.maxBlackRun} s.`);
  return L.join('\n');
}

/** Bots that learn: decision 24 (two Learners) and decision 26 (every bot learns). */
export function learningMode(tables24 = 400, tables26 = 300) {
  const L = ['== Decision 24: the Learner and the Reformed Keeper (400 bot tables per stake)'];
  for (const stake of [650, 1000]) {
    const M = measure(tables24, botsOf('twoLearners'), { stake, refundBy: 'equal' }, 'twoLearners');
    const lr = M.per.learner;
    const hist = Array.from({ length: 11 }, (_, i) => lr.end.filter((x) => x === i).length);
    const rk = M.per.reformedKeeper;
    const fees = rk.reformed.filter((r) => r.why === 'fees').length;
    L.push(`stake ${stake}: lasted ${pc(M.lasted / tables24)}, bonus ${pc(M.bonus / tables24)}; went bust: ${Object.entries(M.busters).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
    L.push(`  Learner: dial at the start ${mean(lr.first).toFixed(1)}, at the end ${mean(lr.end).toFixed(1)}; moves per table ${mean(lr.moves).toFixed(0)}; end dial 0-10: ${hist.join(' ')}`);
    L.push(`  Reformed Keeper reformed at ${pc(rk.reformed.length / rk.seats)} of its tables: ${pc(fees / Math.max(1, rk.reformed.length))} by the fees, ${pc(1 - fees / Math.max(1, rk.reformed.length))} by reactions, after ${mean(rk.reformed.map((r) => r.t)).toFixed(0)} s on average`);
    L.push(`  Net: Reformed Keeper ${sgn(net(M, 'reformedKeeper'))} against Keeper ${sgn(net(M, 'keeper'))}; Learner ${sgn(net(M, 'learner'))} (Sharer ${sgn(net(M, 'sharer'))})`);
  }
  L.push('', '== Decision 26: as they were (decision 24) against every bot learning (300 bot tables per column)');
  const cols = [];
  for (const stake of [650, 1000]) for (const era of ['twoLearners', 'now']) cols.push({ stake, era, M: measure(tables26, botsOf(era), { stake, refundBy: 'equal' }, era) });
  const row = (label, f) => L.push(`${label} | ${cols.map((c) => f(c.M)).join(' | ')}`);
  L.push('measure | 650 as they were | 650 every bot learns | 1,000 as they were | 1,000 every bot learns');
  row('bot tables lasted', (M) => pc(M.lasted / tables26));
  row('bonus earned', (M) => pc(M.bonus / tables26));
  row('boost fund at the end (median)', (M) => median(M.fund).toFixed(0));
  row('table\'s mean share dial at 30 s, 2 min, 4 min, the end', (M) => [30, 120, 240, 'end'].map((k) => mean(M.dial[k]).toFixed(1)).join(', '));
  row('Keeper net', (M) => sgn(net(M, 'keeper')));
  row('Free Rider net', (M) => sgn(net(M, 'freeRider')));
  row('Self-Steerer net', (M) => sgn(net(M, 'selfSteerer')));
  for (const { stake, M } of cols.filter((c) => c.era === 'now')) {
    const f = (k, re) => lesson(M, k, re);
    const ks = f('keeper', /starts sharing/);
    L.push(`How often each lesson comes, stake ${stake} (share of the tables where the bot sits):`);
    L.push(`  Keeper starts sharing ${pc(ks.share)}, after a median ${fmtTime(ks.median)}; Free Rider widens ${pc(f('freeRider', /widens/).share)}; Opportunist drops its trick ${pc(f('opportunist', /drops its trick/).share)}, says nobody reacted ${pc(f('opportunist', /nobody has reacted/).share)}`);
    const ss = f('selfSteerer', /steers less|stops steering/);
    L.push(`  Self-Steerer stops steering for itself ${pc(f('selfSteerer', /stops steering/).share)}, starting after a median ${fmtTime(ss.median)}; Patron hurries the arrow past someone ${pc(f('sharerSteerer', /hurries the white arrow past/).share)}; Lifeguard stops sending the white arrow ${pc(f('poorSteerer', /stops hurrying/).share)}; Sharer eases ${pc(f('sharer', /eases/).share)}; Learner moves its dial ${mean(M.per.learner.moves).toFixed(1)} times a table`);
  }
  return L.join('\n');
}

/**
 * The stake with every bot learning (step 3 of the 2026-11-09 evening session): bot tables, and each
 * lone style for the human seat, at each stake, with the fund shared out by sharing (decision 27).
 */
export function stakeMode(tables = 300, stakes = [400, 450, 500, 550, 600, 650, 800, 1000], styles = ['keep', 'half', 'generous', 'all', 'stewardHalf', 'stewardAll']) {
  const L = ['== The stake with every bot learning (fund shared out by sharing)',
    'stake | bot tables: lasted, bonus, poorest at the end (median), poorest\'s lowest point (median, 10th percentile) | alone: net, lasted, bonus for ' + styles.join(', ')];
  for (const stake of stakes) {
    const B = measure(tables, botsOf('now'), { stake });
    const low = [...B.low].sort((a, b) => a - b);
    const solo = styles.map((k) => { const M = measure(tables, alone(k, 'now'), { stake }); return `${k} ${sgn(net(M, k))} ${pc(M.lasted / tables)} ${pc(M.bonus / tables)}`; });
    L.push(`${stake} | ${pc(B.lasted / tables)}, ${pc(B.bonus / tables)}, ${pc(median(B.poorest))}, ${pc(median(low))} (${pc(low[Math.floor(low.length / 10)])}) | ${solo.join(' · ')}`);
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
  if (mode === 'votes') console.log(votesMode(tables));
  if (mode === 'stake') console.log(stakeMode(tables));
  if (mode === 'floors') console.log(floorsMode(tables));
  if (mode === 'smart') console.log(smartMode(tables));
  if (mode === 'learning') console.log(learningMode(Math.round((tables * 4) / 3), tables));
  if (mode === 'stakes') {
    for (const stake of [300, 400, 500, 600, 800, 1000]) console.log(report(simulate(tables, bots, { ...opts, stake }), `bots stake ${stake} ${tag}`));
  }
}
