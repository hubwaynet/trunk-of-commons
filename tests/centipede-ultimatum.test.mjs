// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, currentPlayer, act, divide, vote, stay, splitKeeping } from '../src/engine/centipede-ultimatum.js';

const ids = ['a', 'b', 'c', 'd'];
const fresh = (opts = {}) => createGame({ players: ids.map((id) => ({ id })), commonsReserve: 120, ...opts });
const giveAll = (s) => { for (const id of ids) s = act(s, id, 'give'); return s; };
const total = (s) => s.players.reduce((a, p) => a + p.balance, 0) + s.pool + s.commons.reserve;

test('a completed round adds 1 per player and the pool carries over', () => {
  let s = giveAll(fresh());
  assert.equal(s.pool, 4 + 4);
  assert.equal(s.round, 2);
  s = giveAll(s);
  assert.equal(s.pool, 8 + 8 + 4);
  assert.equal(s.commons.reserve, 112);
});

test('grab mid-round, accepted split pays out and the order reverses from the divider', () => {
  let s = giveAll(fresh());
  s = act(s, 'a', 'give');
  s = act(s, 'b', 'grab');
  assert.equal(s.phase, 'divide');
  s = divide(s, splitKeeping(s, 'b', 4)); // pool 10: b keeps 4, others 2 each
  assert.deepEqual(s.ultimatum.shares, { a: 2, b: 4, c: 2, d: 2 });
  const before = total(s);
  s = vote(s, { a: 1, b: 2, c: 1, d: 1 }); // avg 1.25 -> accepted, vote pool 5 -> 1 each, 1 to Commons
  assert.equal(s.rounds.at(-1).ultimatum.result, 'accepted');
  assert.equal(s.commons.reserve, 116 + 1);
  assert.equal(total(s), before);
  s = stay(s, { a: true, b: true, c: true, d: true });
  assert.deepEqual(s.order, ['b', 'a', 'd', 'c']);
  assert.equal(currentPlayer(s), 'b');
  assert.equal(s.pool, 0);
});

test('1.5 counts as closer to 1; above 1.5 the Commons rounds the vote pool up', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = divide(s, splitKeeping(s, 'a', 2));
  const t = vote(s, { a: 2, b: 2, c: 1, d: 1 }); // avg 1.5
  assert.equal(t.rounds.at(-1).ultimatum.result, 'accepted');
  const w = vote(s, { a: 2, b: 2, c: 2, d: 1 }); // 7 -> rounded up to 8, 2 each
  const u = w.rounds.at(-1).ultimatum;
  assert.equal(u.result, 'welcomed');
  assert.equal(u.topUp, 1);
  assert.equal(u.voteEach, 2);
});

test('rejection forfeits both pools and ends the table; rejecting is free', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = divide(s, splitKeeping(s, 'a', 8));
  const bBefore = s.players.find((p) => p.id === 'b').balance;
  s = vote(s, { a: 2, b: 0, c: 0, d: 1 });
  assert.equal(s.endReason, 'rejected');
  assert.equal(s.players.find((p) => p.id === 'b').balance, bBefore);
  assert.equal(s.commons.reserve, 116 + 8 + 3);
});

test('a player who cannot pay in full is made to grab', () => {
  let s = createGame({ players: [{ id: 'a', balance: 0 }, { id: 'b' }, { id: 'c' }] });
  s = act(s, 'a', 'give');
  assert.equal(s.phase, 'divide');
  assert.equal(s.ultimatum.forced, true);
});

test('sitting out after a split removes the player; fewer than 3 ends the table', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = vote(divide(s, splitKeeping(s, 'a', 2)), { a: 1, b: 1, c: 1, d: 1 });
  s = stay(s, { a: true, b: false, c: true, d: true });
  assert.equal(s.players.find((p) => p.id === 'b').active, false);
  assert.equal(s.status, 'playing');
});
