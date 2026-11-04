// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, currentPlayer, act, divide, vote, stay, splitBy } from '../src/engine/centipede-ultimatum.js';
import { simulate } from '../tools/sim-centipede.mjs';

const ids = ['a', 'b', 'c', 'd'];
const fresh = (opts = {}, balances = {}) =>
  createGame({ players: ids.map((id) => ({ id, balance: balances[id] })), commonsReserve: 120, ...opts });
const giveAll = (s) => { for (const id of ids) s = act(s, id, 'give'); return s; };
const total = (s) => s.players.reduce((a, p) => a + p.balance, 0) + s.pool + s.commons.reserve;
const bal = (s, id) => s.players.find((p) => p.id === id).balance;
const shares = (o) => o;

test('a completed round adds 1 per giver and the pool carries over', () => {
  let s = giveAll(fresh());
  assert.equal(s.pool, 4 + 4);
  assert.equal(s.round, 2);
  s = giveAll(s);
  assert.equal(s.pool, 8 + 8 + 4);
  assert.deepEqual(s.stakes, { a: 3, b: 3, c: 3, d: 3 });
});

test('a broke player passes: no giving, no grabbing, no bonus for them', () => {
  let s = fresh({}, { b: 0 });
  s = act(s, 'a', 'give');
  s = act(s, 'b', 'grab');
  assert.equal(s.phase, 'turn');
  assert.equal(s.current.moves[1].move, 'pass');
  s = act(act(s, 'c', 'give'), 'd', 'give');
  assert.equal(s.pool, 3 + 3);
});

test('split set per player; accepted split pays out; order reverses from the divider', () => {
  let s = giveAll(fresh());
  s = act(act(s, 'a', 'give'), 'b', 'grab'); // pool 10
  s = divide(s, shares({ a: 4, b: 4, c: 1, d: 1 }));
  const before = total(s);
  s = vote(s, { a: 1, b: 2, c: 1, d: 1 }); // avg 1.25 -> accepted; vote pool 5 -> 1 each, 1 to Commons
  assert.equal(s.rounds.at(-1).ultimatum.result, 'accepted');
  assert.equal(total(s), before);
  s = stay(s, { a: true, b: true, c: true, d: true });
  assert.deepEqual(s.order, ['b', 'a', 'd', 'c']);
  assert.equal(currentPlayer(s), 'b');
});

test('a broke voter can still vote: the vote is paid from their share', () => {
  let s = fresh({}, { d: 0 });
  s = act(act(act(act(s, 'a', 'give'), 'b', 'give'), 'c', 'give'), 'd', 'give'); // d passes
  assert.equal(s.rounds[0].moves[3].move, 'pass');
  s = act(s, 'a', 'grab'); // round 2
  s = divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 }));
  s = vote(s, { a: 1, b: 1, c: 1, d: 2 });
  const u = s.rounds.at(-1).ultimatum;
  assert.equal(u.shares.d, 1);
  assert.equal(u.paid.d, 1); // paid what its share covered
  assert.equal(u.voteAvg, 5 / 4); // but its 2 counted in full
  assert.ok(bal(s, 'd') >= 0);
});

test('1.5 counts as closer to 1; above 1.5 the Commons rounds the vote pool up', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 }));
  assert.equal(vote(s, { a: 2, b: 2, c: 1, d: 1 }).rounds.at(-1).ultimatum.result, 'accepted');
  const u = vote(s, { a: 2, b: 2, c: 2, d: 1 }).rounds.at(-1).ultimatum; // 7 -> 8, 2 each
  assert.equal(u.result, 'welcomed');
  assert.equal(u.topUp, 1);
  assert.equal(u.voteEach, 2);
});

test('2018 rule: rejection forfeits both pools and ends the table; rejecting is free', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = divide(s, shares({ a: 8, b: 0, c: 0, d: 0 }));
  const bBefore = bal(s, 'b');
  s = vote(s, { a: 2, b: 0, c: 0, d: 1 });
  assert.equal(s.endReason, 'rejected');
  assert.equal(bal(s, 'b'), bBefore);
  assert.equal(s.commons.reserve, 116 + 8 + 3);
});

test('variant: rejected grabber leaves, the pool is refunded by stake, play continues', () => {
  let s = act(giveAll(fresh({ onReject: 'grabberOut', rejectedPool: 'refund' })), 'a', 'grab');
  s = divide(s, shares({ a: 8, b: 0, c: 0, d: 0 }));
  const before = total(s);
  s = vote(s, { a: 2, b: 0, c: 0, d: 0 });
  assert.equal(s.players.find((p) => p.id === 'a').active, false);
  assert.deepEqual(s.rounds.at(-1).ultimatum.refunds, { a: 2, b: 2, c: 2, d: 2 });
  assert.equal(total(s), before);
  s = stay(s, { b: true, c: true, d: true });
  assert.equal(s.status, 'playing');
});

test('the table ends, pool shared, when nobody can afford to give', () => {
  let s = createGame({ players: ['a', 'b', 'c'].map((id) => ({ id, balance: 1 })) });
  for (const id of ['a', 'b', 'c']) s = act(s, id, 'give'); // round 2 needs 2, everyone has 0
  assert.equal(s.endReason, 'all-broke');
  assert.equal(s.players.reduce((a, p) => a + p.balance, 0), 6);
});

test('splitBy gives whole shares that add to the pool', () => {
  const sh = splitBy(23, { a: 3, b: 3, c: 0, d: 1 }, 'a', 10);
  assert.equal(Object.values(sh).reduce((x, y) => x + y, 0), 23);
  assert.equal(sh.c, 0);
});

test('simulated tables conserve points and finish', () => {
  for (const opts of [{}, { onReject: 'grabberOut', rejectedPool: 'refund' }]) {
    const st = simulate(200, 'random', opts);
    assert.equal(Object.values(st.ends).reduce((a, b) => a + b, 0), 200);
  }
});
