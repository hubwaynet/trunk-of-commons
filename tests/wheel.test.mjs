// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, step, joinPositions, quotas, feePct, transitTicks, whiteId, blackId, totalUnits, bonusPct, voteDelay, UNIT,
} from '../src/engine/wheel.js';
import { STRATEGIES, botView, selectRoster, steer } from '../src/bots/wheel-bots.js';
import { playTable, simulate } from '../tools/sim-wheel.mjs';
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
  assert.equal(s.speed, 6);
  assert.equal(bal(s, 'a'), s.stake - 9 * UNIT); // and it still costs
  s = step(fresh({}, { a: { vote: -5 }, b: { vote: -5 } }));
  assert.equal(s.dir, -1); // two together can
  assert.equal(s.speed, 10);
  let m = step(fresh({ reverseAbove: 6 }, { a: { vote: -6 } }));
  assert.equal(m.dir, 1); // 2017: 6 against isn't enough...
  m = step(fresh({ reverseAbove: 6 }, { a: { vote: -7 } }));
  assert.equal(m.dir, -1); // ...but one player alone can do it
  assert.equal(step(fresh({ reverseAbove: 0 }, { a: { vote: -1 } })).dir, -1); // the first core
  const forced = step(fresh({ minVote: 1 }));
  assert.equal(forced.fund.votes, 6 * UNIT); // 2017: no neutral, everyone pays 1
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

test('every token is accounted for, under every rule variant', () => {
  const variants = [{}, { selfShare: 'cascade' }, { reverseAbove: 6, minVote: 1 }, { endBonus: 'none', stake: 600 }, { endBonus: '2017', stake: 2000 }];
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
