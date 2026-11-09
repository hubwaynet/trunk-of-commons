// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, joinPositions, quotas, feePct, transitTicks, whiteId, blackId, totalUnits, bonusPct, voteDelay, ledger, passedOn, UNIT,
} from '../src/engine/wheel.js';
import { STRATEGIES, botView, selectRoster, steer } from '../src/bots/wheel-bots.js';
import { playTable, simulate, measure } from '../tools/sim-wheel.mjs';
import { ERAS, rosterOf } from '../tools/wheel-bots-then.mjs';
import { mulberry32 } from '../src/engine/rng.js';

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const fresh = (opts = {}, settings = {}) =>
  createGame({ players: ids.map((id) => ({ id, settings: settings[id] ?? settings.all })), ...opts });
const bal = (s, id) => s.players.find((p) => p.id === id).balance;
const startTotal = (s) => s.players.reduce((a, p) => a + p.start, 0) + s.fund.start + s.commonIn;
const run = (s, ticks, d = {}) => { for (let i = 0; i < ticks && s.status === 'playing'; i++) s = step(s, i === 0 ? d : {}); return s; };

test('join order sets the seats: the initiator at the white arrow, the last to join at the black', () => {
  assert.deepEqual(joinPositions(6), [0, 1, 5, 2, 4, 3]);
  const s = fresh();
  assert.equal(whiteId(s), 'a');
  assert.equal(blackId(s), 'f');
});

test('the black side pays 9 at the black arrow and 1 at each neighbour: 11 a second', () => {
  const s = fresh();
  const q = quotas(s);
  assert.deepEqual(q.map((x) => x / UNIT), [0, 0, 0, 1, 1, 9]); // d (seat 2) and e (seat 4) flank f (seat 3)
});

test('the 2017 fee table: 95% when keeping everything, otherwise 100% minus the share', () => {
  assert.deepEqual([0, 0.1, 0.3, 0.5, 0.8, 1].map(feePct), [95, 90, 70, 50, 20, 0]);
});

test('shares travel 45 degrees a second round the rim: 2, 3 and 4 seconds at six seats', () => {
  const s = fresh();
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((p) => transitTicks(s, 0, p)), [0, 2, 3, 4, 3, 2]);
});

test('a keeper keeps 5% of the reward, two seconds after it is collected', () => {
  let s = fresh({}, { all: { share: 0, people: 1 } });
  const before = bal(s, 'a');
  s = run(s, 2);
  assert.equal(bal(s, 'a'), before); // still crossing the wheel
  s = step(s);
  // the reward collected in second 0 (11 tokens) lands on whoever is at the white arrow now
  const to = s.players.find((p) => p.stats.reward > 0);
  assert.equal(to.stats.reward, 11 * UNIT);
  assert.equal(to.stats.fees, Math.floor(11 * UNIT * 0.95));
});

test('a reward lands on whoever is at the white arrow when it arrives', () => {
  // Everyone votes 9 clockwise: 54 degrees a second, so the arrow has moved on two seats by arrival.
  let s = fresh({}, { all: { share: 0, people: 1, vote: 9 } });
  s = run(s, 3);
  const r = s.players.filter((p) => p.stats.reward > 0).map((p) => p.id);
  assert.deepEqual(r, [whiteId(s)]);
  assert.notEqual(r[0], 'a');
});

test('sharing half with everyone sends equal parcels to the five others, with travel times', () => {
  let s = fresh({}, { all: { share: 0, people: 1 }, a: { share: 5, people: 6 } });
  s = run(s, 1);
  s = step(s); s = step(s); // second 2: the first reward reaches a (the wheel has moved 12 degrees)
  const a = s.players.find((p) => p.id === 'a');
  assert.equal(a.stats.reward, 11 * UNIT);
  const out = s.transit.filter((x) => x.kind === 'share' && x.from === 'a');
  assert.equal(out.length, 5); // a's own slice counts as kept
  assert.deepEqual(out.map((x) => x.arrive - x.depart).sort(), [2, 2, 3, 3, 4]);
  // Of 11 tokens, a passes on five sixths of half (4.58) and keeps the rest, less a 58% fee.
  const shared = Math.floor(11 * UNIT * (25 / 60));
  assert.equal(a.stats.fees, Math.floor(((11 * UNIT - shared) * 58) / 100));
});

test('sharing only with yourself: a loophole as written, ordinary keeping with selfShare kept', () => {
  const play = (selfShare) => {
    let s = fresh({ selfShare }, { all: { share: 0, people: 1 }, a: { share: 10, people: 1 } });
    s = run(s, 3);
    return s.players.find((p) => p.id === 'a');
  };
  const cascade = play('cascade');
  const kept = play('kept');
  assert.ok(cascade.balance - cascade.start + cascade.stats.paid + cascade.stats.voted > 0, 'cascade: keeps more than it received');
  assert.equal(kept.stats.fees, Math.floor(11 * UNIT * 0.95)); // kept: the 95% fee, as if keeping
});

test('votes: zero allowed; momentum needs more than one player can vote to turn the wheel back', () => {
  let s = step(fresh({}, { a: { vote: -9 } }));
  assert.equal(s.dir, 1); // one player's strongest vote can't turn it back (Jason, 2026-11-09)
  assert.equal(s.speed, 2); // but it slows the wheel, to the floor (Jason, 2026-11-09: "add speed, and slow it")
  assert.equal(bal(s, 'a'), s.stake - 9 * UNIT * s.voteCostAgainst); // against the wheel: a token a degree
  assert.equal(s.voteCostAgainst, 1);
  const w = step(fresh({}, { a: { vote: 4 } }));
  assert.equal(w.speed, 10); // with the wheel: adds to the minimum
  assert.equal(bal(w, 'a'), w.stake - 4 * UNIT * w.voteCost); // a quarter token a degree
  assert.equal(w.voteCost, 0.25);
  s = step(fresh({}, { a: { vote: -5 }, b: { vote: -5 } }));
  assert.equal(s.dir, -1); // two together can
  assert.equal(s.speed, 6); // and it starts the other way at the minimum
  assert.equal(step(fresh({ voteSpeed: 'pastMin' }, { a: { vote: -5 }, b: { vote: -5 } })).speed, 10); // the first rule
  let m = step(fresh({ reverseAbove: 6 }, { a: { vote: -6 } }));
  assert.equal(m.dir, 1); // 2017: 6 against isn't enough...
  m = step(fresh({ reverseAbove: 6 }, { a: { vote: -7 } }));
  assert.equal(m.dir, -1); // ...but one player alone can do it
  assert.equal(step(fresh({ reverseAbove: 0 }, { a: { vote: -1 } })).dir, -1); // the first core
  const forced = step(fresh({ minVote: 1 }));
  assert.equal(forced.fund.votes, 6 * UNIT * forced.voteCost); // 2017: no neutral, everyone pays for 1
});

test('a player who cannot pay ends the table; rewards still crossing go to the boost fund', () => {
  let s = createGame({ players: ids.map((id) => ({ id, balance: id === 'f' ? 20 : 1000 })) });
  s = run(s, 10);
  assert.equal(s.status, 'ended');
  assert.equal(s.endReason, 'bust');
  assert.deepEqual(s.bust, ['f']);
  assert.equal(s.t, 3); // 9 a second from 20 tokens: short in the third second
  assert.ok(s.fund.forfeits > 0);
  assert.equal(s.transit.length, 0);
  assert.equal(totalUnits(s), startTotal(s));
});

test('a table lasts at most 360 seconds', () => {
  const s = run(fresh({ stake: 5000 }, { all: { share: 8, people: 6 } }), 1000);
  assert.equal(s.endReason, 'time');
  assert.equal(s.t, 360);
});

test('the end bonus: 2% to 10% by the poorest player; at full time the fund is refunded equally', () => {
  const s = fresh();
  assert.equal(bonusPct(s), 10);
  const poorer = { ...s, players: s.players.map((p, i) => (i ? p : { ...p, balance: 0.15 * s.stake })) };
  assert.equal(bonusPct(poorer), 2);
  const r = run(fresh({ stake: 5000 }, { all: { share: 8, people: 6 } }), 400);
  assert.equal(r.endReason, 'time');
  assert.equal(r.bonus.pct, 10);
  assert.equal(r.fund.balance < r.n, true); // the fund was shared out (odd hundredths remain)
  assert.equal(r.commonIn, 6 * 500 * UNIT);
  assert.equal(totalUnits(r), startTotal(r));
});

test('the boost fund is shared out by sharing: a keeper gets none of it (Jason, 2026-11-09)', () => {
  const settings = { all: { share: 8, people: 6 }, a: { share: 0, people: 1 }, b: { share: 4, people: 6 } };
  const play = (refundBy) => run(fresh({ stake: 5000, ...(refundBy ? { refundBy } : {}) }, settings), 400);
  const of = (s, id) => s.players.find((p) => p.id === id);
  const r = play();
  assert.equal(r.refundBy, 'rate', 'by sharing is the default');
  assert.equal(r.endReason, 'time');
  assert.equal(of(r, 'a').refund, 0, 'the keeper gets none of the fund');
  assert.ok(of(r, 'b').refund > 0 && of(r, 'c').refund > of(r, 'b').refund, 'more for passing on more');
  const ratio = of(r, 'c').refund / of(r, 'b').refund;
  const expected = passedOn(of(r, 'c')) / passedOn(of(r, 'b'));
  assert.ok(Math.abs(ratio - expected) < 0.001, `in proportion to the part passed on (${ratio} against ${expected})`);
  assert.ok(r.fund.balance < r.n, 'the whole fund is shared out, but for odd hundredths');
  assert.equal(totalUnits(r), startTotal(r));
  const eq = play('equal');
  assert.ok(eq.players.every((p) => p.refund === eq.players[0].refund), 'equal shares, as an option');
  const tk = play('tokens');
  assert.equal(of(tk, 'a').refund, 0);
  // nobody passed anything on: equal shares
  const keepers = run(fresh({ stake: 5000 }, { all: { share: 0, people: 1 } }), 400);
  assert.ok(keepers.bonus && keepers.players.every((p) => p.refund === keepers.players[0].refund && p.refund > 0));
});

test('every token is accounted for, under every rule variant', () => {
  const variants = [{}, { selfShare: 'cascade' }, { reverseAbove: 6, minVote: 1 }, { endBonus: 'none', stake: 600 }, { endBonus: '2017', stake: 2000 }, { refundBy: 'equal' }, { refundBy: 'tokens' }];
  for (const opts of variants) {
    for (let t = 0; t < 40; t++) {
      const s = playTable(selectRoster(mulberry32(t), 6), 100 + t, opts);
      assert.equal(s.status, 'ended');
      assert.equal(totalUnits(s), startTotal(s), JSON.stringify({ opts, t }));
      assert.ok(s.players.every((p) => p.balance >= 0));
    }
  }
});

test('tables replay exactly from their seed', () => {
  const keys = selectRoster(mulberry32(9), 6);
  const a = playTable(keys, 42);
  const b = playTable(keys, 42);
  assert.deepEqual(a.players.map((p) => p.balance), b.players.map((p) => p.balance));
  assert.equal(a.t, b.t);
});

test('each player\'s ledger closes exactly, and the ending is recorded for the page', () => {
  let lasted = 0, busted = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const keys = selectRoster(mulberry32(seed), 6);
    for (const [ks, stake] of [[keys, 600], [keys, 1000], [Array(6).fill('keep'), 400]]) { // six fixed keepers go bust
      const s = playTable(ks, seed, { record: true, stake });
      if (s.endReason === 'time') lasted++; else busted++;
      const e = s.ending;
      assert.ok(e && e.bell.length === 6 && e.beforeSplit.length === 6, 'ending recorded');
      for (const [i, p] of s.players.entries()) {
        const L = ledger(s, p.id);
        assert.equal(L.start - L.paid - L.voted + L.received - L.sharesOut + L.boost - L.fees, L.beforeSplit, `${p.id} before the split`);
        assert.equal(L.beforeSplit, e.beforeSplit[i], `${p.id} matches the recorded balance before the split`);
        assert.equal(L.beforeSplit + L.refund + L.bonus, p.balance, `${p.id} ends with`);
      }
      const refunded = e.refunds.reduce((a, x) => a + x, 0);
      if (s.bonus) assert.ok(refunded > 0 && e.topUp > 0); else assert.equal(refunded + e.topUp, 0);
      // the flows the page draws after the bell: shares that were still travelling all land
      assert.ok(e.shares.every((x) => x.arrive > s.t - 1 && x.kind === 'share'));
    }
  }
  assert.ok(lasted > 0 && busted > 0, `both endings covered (${lasted} lasted, ${busted} busted)`);
});

test('voteSpeed: the first rule ignores small votes; adds speeds up; addsSlows also slows, to a floor', () => {
  const one = (opts, vote) => step(fresh(opts), { a: { vote } }).speed;
  assert.equal(one({ voteSpeed: 'pastMin' }, 4), 6, 'pastMin: a lone 4 with the wheel changes nothing');
  assert.equal(one({ voteSpeed: 'pastMin' }, 8), 8);
  assert.equal(one({ voteSpeed: 'pastMin' }, -4), 6, 'pastMin: a lone 4 against changes nothing');
  assert.equal(one({ voteSpeed: 'adds' }, 4), 10);
  assert.equal(one({ voteSpeed: 'adds' }, -4), 6, 'adds: votes against cancel down to the minimum');
  assert.equal(one({ voteSpeed: 'addsSlows' }, 4), 10);
  assert.equal(one({ voteSpeed: 'addsSlows' }, -3), 3);
  assert.equal(one({}, -3), 3, 'addsSlows is the default');
  assert.equal(one({ voteSpeed: 'addsSlows', slowest: 2 }, -9), 2, 'never below the floor');
  assert.equal(one({ voteSpeed: 'addsSlows', slowest: 0 }, -9), 0);
  // turning round still needs more than 9 together, and starts at the minimum the other way
  const s = step(fresh({ voteSpeed: 'addsSlows' }), { a: { vote: -6 }, b: { vote: -5 } });
  assert.equal(s.dir, -1);
  assert.equal(s.speed, 6);
});

test('smarter bots: the Self-Steerer holds the arrow back only when holding pays (Jason, 2026-11-09)', () => {
  const rng = mulberry32(3);
  const bot = STRATEGIES.selfSteerer.create(rng);
  // put the white arrow in the bot's segment: it would hold at a quarter token a degree, not at 1
  const at = (opts) => {
    const s = createGame({ players: ids.map((id) => ({ id, settings: { share: 5, people: 6 } })), stake: 1000, ...opts });
    return bot.decide(botView(s, 'a')).vote;
  };
  assert.equal(at({ voteCostAgainst: 0.25 }), -3, 'cheap: holding pays, so it holds');
  assert.equal(at({}), 0, 'at a token a degree: holding costs more than it gains, so it lets go');
});

test('the Keeper keeps until the fees bite or others keep hurrying the arrow past it, and says why', () => {
  // others' reactions: five seconds of being hurried past while it has the white arrow
  let bot = STRATEGIES.keeper.create(mulberry32(1));
  let s = createGame({ players: ids.map((id) => ({ id, settings: id === 'b' ? { vote: 4 } : {} })), stake: 1000 });
  const view = (st) => botView(st, 'a');
  for (let i = 0; i < 4; i++) { const d = bot.decide({ ...view(s), t: i }); assert.equal(d.share, 0, 'still keeping'); assert.equal(d.note, null); }
  const d = bot.decide({ ...view(s), t: 4 });
  assert.match(d.note, /starts sharing: others kept hurrying the white arrow past it/);
  assert.ok(d.share > 0 && d.people === 6, 'starts sharing with everyone');
  // the fees: its tokens below 6/10 of the stake
  bot = STRATEGIES.keeper.create(mulberry32(1));
  s = createGame({ players: ids.map((id) => ({ id, balance: id === 'a' ? 550 : 1000 })), stake: 1000 });
  assert.match(bot.decide(view(s)).note, /the fees have cost it four tenths of its stake/);
});

test('the Learner moves its share dial after each lap and learns away from keeping', () => {
  let start = 0, end = 0, low = 0, moved = 0, n = 0;
  for (let t = 0; t < 40; t++) {
    const keys = ['learner', 'sharer', 'keeper', 'reciprocator', 'selfSteerer', 'poorSteerer'];
    const rng = mulberry32(500 + t);
    const inst = keys.map((k) => STRATEGIES[k].create(rng));
    let s = createGame({ players: keys.map((k, i) => ({ id: `${k}#${i}` })), seed: t, record: false });
    let first = null;
    while (s.status === 'playing') {
      const d = {};
      s.players.forEach((p, i) => { d[p.id] = inst[i].decide(botView(s, p.id)); });
      first ??= d['learner#0'].share;
      s = step(s, d);
    }
    const last = s.players[0].settings.share;
    start += first; end += last; n++;
    if (last <= 2) low++;
    if (last !== first) moved++;
  }
  assert.ok(moved >= 30, `the dial moved at ${moved} of 40 tables`);
  assert.ok(low <= 4, `${low} of 40 ended keeping or nearly`);
  assert.ok(end / n >= 4 && end / n <= 8, `ends near the middle (${(end / n).toFixed(1)}, from ${(start / n).toFixed(1)})`);
});

// The old holding logic (pay just enough to keep the arrow in your segment), and the Self-Steerer bot.
const holder = { create: () => ({ decide: (v) => ({ vote: steer(v, v.id, 9), share: 5, people: v.n }) }) };
const heldBy = (who, opts) => {
  const keys = ['keeper', 'keeper', 'me', 'keeper', 'keeper', 'keeper'];
  const rng = mulberry32(1);
  const inst = keys.map((k) => (k === 'me' ? who : STRATEGIES[k]).create(rng));
  let s = createGame({ players: keys.map((k, i) => ({ id: `${k}#${i}` })), stake: 2000, ...opts });
  let held = 0;
  for (let t = 0; t < 120 && s.status === 'playing'; t++) {
    const d = {};
    s.players.forEach((p, i) => { d[p.id] = inst[i].decide(botView(s, p.id)); });
    s = step(s, d);
    if (t >= 60 && whiteId(s) === 'me#2') held++;
  }
  return held;
};

test('with any vote able to turn the wheel, one player can hold the white arrow in their segment', () => {
  assert.ok(heldBy(holder, { reverseAbove: 0 }) >= 50, 'held most of the last 60 seconds');
});

test('with momentum above one player\'s vote, the arrow swings round: no more than a fair share', () => {
  assert.ok(heldBy(holder, {}) <= 12, 'old holding logic: about 10 of 60 seconds');
  assert.ok(heldBy(STRATEGIES.selfSteerer, {}) <= 12, 'the Self-Steerer bot: about 10 of 60 seconds');
});

test('every strategy has a label, family, summary and tell, and decides valid dials', () => {
  const s = fresh();
  for (const [k, st] of Object.entries(STRATEGIES)) {
    for (const f of ['label', 'family', 'summary', 'tell']) assert.ok(st[f], `${k}.${f}`);
    const d = st.create(mulberry32(1)).decide(botView(s, 'a'));
    assert.ok(Number.isInteger(d.vote) && Math.abs(d.vote) <= 9, k);
    assert.ok(d.share >= 0 && d.share <= 10 && d.people >= 1 && d.people <= 6, k);
  }
});

test('the simulator re-runs earlier eras: under the first rule, votes never change the wheel', () => {
  for (const era of Object.keys(ERAS)) {
    const keys = rosterOf(era, mulberry32(3), 6);
    const fams = new Set(keys.map((k) => ERAS[era].strategies[k].family));
    assert.equal(fams.size, Object.keys(ERAS[era].families).length, `${era}: one of each family`);
  }
  const M = measure(20, (t, rng) => rosterOf('first', rng, 6), { stake: 650, voteSpeed: 'pastMin', voteCostAgainst: null, refundBy: 'equal' }, 'first');
  assert.ok(M.voteSecs > 0, 'the bots voted');
  assert.equal(M.changedSecs, 0, 'and their votes changed nothing');
  const N = measure(20, (t, rng) => rosterOf('smart', rng, 6), { stake: 650 }, 'smart');
  assert.ok(N.changedSecs / N.voteSecs > 0.9, 'under decisions 21-23 they nearly always do');
});

test('the simulator reports every table conserved', () => {
  const st = simulate(30, (t, rng) => selectRoster(rng, 6));
  assert.equal(st.conserved, 30);
});

test('a table that goes bust keeps no refund and earns no bonus', () => {
  let s = createGame({ players: ids.map((id) => ({ id, balance: id === 'f' ? 20 : 1000 })) });
  s = run(s, 10);
  assert.equal(s.endReason, 'bust');
  assert.equal(s.bonus, null);
  assert.equal(s.fund.refunded, 0);
  assert.equal(s.commonIn, 0);
});

test('blackRun: after 10 seconds in a row at the black arrow, a player pays the grey amount', () => {
  // Hold the wheel still-ish by rocking it: a votes against the wheel every second.
  const play = (blackRun) => {
    let s = fresh({ blackRun, reverseAbove: 0 }, { all: { share: 0, people: 1 } });
    for (let t = 0; t < 30; t++) s = step(s, { a: { vote: t % 2 ? 6 : -6 } });
    return s.players.find((p) => p.id === 'f').stats.paid / UNIT;
  };
  assert.equal(play(Infinity), 30 * 9); // pinned at the black arrow for 30 seconds
  assert.equal(play(10), 10 * 9 + 20 * 1);
});

test('2017 delays: darker seats and stronger votes wait longer', () => {
  const s = fresh({ delays: true });
  const at = (id) => s.players.find((p) => p.id === id);
  assert.equal(voteDelay(s, at('a'), 1), 0); // at the white arrow, a small vote: at once
  assert.equal(voteDelay(s, at('f'), 1), 2); // at the black arrow: 1.5 s, rounded
  assert.equal(voteDelay(s, at('a'), 9), 2);
  assert.equal(voteDelay(s, at('f'), 9), 3);
  let t = step(fresh({ delays: true, reverseAbove: 0 }, { f: { vote: -1 } }));
  assert.equal(t.dir, 1); // f's vote hasn't arrived yet
  t = step(step(t));
  assert.equal(t.dir, -1);
});
