// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, currentPlayer, act, divide, vote, stay, splitBy } from '../src/engine/centipede-ultimatum.js';
import { simulate, playTable } from '../tools/sim-centipede.mjs';
import { selectRoster } from '../src/bots/centipede-ultimatum-bots.js';
import { mulberry32 } from '../src/engine/rng.js';

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

test('split set per player; accepted split pays out; order reverses with the divider last', () => {
  let s = giveAll(fresh());
  s = act(act(s, 'a', 'give'), 'b', 'grab'); // pool 10
  s = divide(s, shares({ a: 4, b: 4, c: 1, d: 1 }));
  const before = total(s);
  s = vote(s, { a: 1, b: 2, c: 1, d: 1 }); // avg 1.25 -> accepted; vote pool 5 -> 1 each, 1 to Commons
  assert.equal(s.rounds.at(-1).ultimatum.result, 'accepted');
  assert.equal(total(s), before);
  s = stay(s, { a: true, b: true, c: true, d: true });
  assert.deepEqual(s.order, ['a', 'd', 'c', 'b']);
  assert.equal(currentPlayer(s), 'a');
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

test('old rule: 1.5 counts as closer to 1; above 1.5 the Commons rounds the vote pool up and adds 1 each', () => {
  let s = act(giveAll(fresh({ welcomeAt: 'above' })), 'a', 'grab');
  s = divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 }));
  assert.equal(vote(s, { a: 2, b: 2, c: 1, d: 1 }).rounds.at(-1).ultimatum.result, 'accepted');
  const u = vote(s, { a: 2, b: 2, c: 2, d: 1 }).rounds.at(-1).ultimatum; // 7 -> 8, 2 each
  assert.equal(u.result, 'welcomed');
  assert.equal(u.voteEach, 2);
  assert.equal(u.bonusEach, 1);
  assert.equal(u.topUp, 1 + 4);
});

test('default: an average of 1.5 is welcomed and pays 1 bonus each; the table stops after round 20', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 }));
  const before = total(s);
  const w = vote(s, { a: 2, b: 2, c: 1, d: 1 });
  const u = w.rounds.at(-1).ultimatum;
  assert.equal(u.result, 'welcomed');
  assert.equal(u.bonusEach, 1);
  assert.equal(total(w), before); // points only move between players and the Commons
  let t = createGame({ players: ['a', 'b', 'c'].map((id) => ({ id, balance: 500 })), commonsReserve: 500 });
  while (t.status === 'playing') t = act(t, currentPlayer(t), 'give');
  assert.equal(t.endReason, 'round-cap');
  assert.equal(t.rounds.length, 20);
});

test('2018 rule: rejection forfeits both pools and ends the table; rejecting is free', () => {
  let s = act(giveAll(fresh({ onReject: 'end', rejectedPool: 'commons' })), 'a', 'grab');
  s = divide(s, shares({ a: 8, b: 0, c: 0, d: 0 }));
  const bBefore = bal(s, 'b');
  s = vote(s, { a: 2, b: 0, c: 0, d: 1 });
  assert.equal(s.endReason, 'rejected');
  assert.equal(bal(s, 'b'), bBefore);
  assert.equal(s.commons.reserve, 116 + 8 + 3);
});

test('default: rejected grabber leaves, the pool is refunded by stake, play continues', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
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
  for (const opts of [{}, { onReject: 'end', rejectedPool: 'commons' }]) {
    const st = simulate(200, 'random', opts);
    assert.equal(Object.values(st.ends).reduce((a, b) => a + b, 0), 200);
  }
  // Points only move between players, the pool and the Commons, and nobody goes below 0.
  for (let t = 0; t < 300; t++) {
    const keys = selectRoster(mulberry32(3000 + t), 6);
    const s = playTable(keys, 3000 + t);
    assert.equal(s.status, 'ended');
    assert.equal(total(s), 6 * 20 + 120, `table ${t}`);
    assert.ok(s.players.every((p) => p.balance >= 0), `table ${t}`);
  }
});

import { splitAchievements, endAchievements, ACHIEVEMENTS } from '../src/ui/centipede-ultimatum/achievements.js';

test('achievements: covered by your own 2, nobody short-changed, welcomed', () => {
  // a, b, c, d each put in 1 + 2; a grabs in round 3 before giving: pool 20 (stakes 3 each)
  let s = giveAll(giveAll(fresh()));
  s = act(s, 'a', 'grab');
  s = divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 })); // 5 each, more than the 3 each put in
  const carried = vote(s, { a: 2, b: 0, c: 1, d: 1 }); // total 4 = needed 4; a's 2 carried it
  assert.deepEqual([...splitAchievements(carried, 'a')].sort(), ['no-one-short', 'your-vote-counted']);
  const welcomed = vote(s, { a: 2, b: 2, c: 2, d: 1 });
  assert.ok(splitAchievements(welcomed, 'a').has('welcomed'));
    const atHalfRule = vote(divide(act(giveAll(giveAll(fresh({ welcomeAt: 'atLeast' }))), 'a', 'grab'), splitBy(20, { a: 1, b: 1, c: 1, d: 1 })), { a: 2, b: 2, c: 1, d: 1 });
  assert.ok(splitAchievements(atHalfRule, 'a').has('welcomed'));
});

test('achievements: end-of-table checks need a finished table', () => {
  const s = giveAll(fresh());
  assert.equal(endAchievements(s, 'a').size, 0);
  assert.equal(ACHIEVEMENTS.length, 6);
});

test('a pool left at the end goes back by what each put in', () => {
  let s = createGame({ players: [{ id: 'a', balance: 1 }, { id: 'b', balance: 3 }, { id: 'c', balance: 3 }] });
  for (const id of ['a', 'b', 'c']) s = act(s, id, 'give'); // round 1: pool 3 + 3 bonus
  s = act(s, 'a', 'give'); // a is broke: passes
  s = act(act(s, 'b', 'give'), 'c', 'give'); // round 2: b, c give 2 each, +2 bonus -> pool 12; round 3 needs 3, nobody can
  assert.equal(s.endReason, 'all-broke');
  assert.deepEqual(s.finalShares, { a: 2, b: 5, c: 5 }); // stakes 1, 3, 3 of 12
  assert.equal(s.players.reduce((x, p) => x + p.balance, 0), 12);
});

test('grabbing opens only after the pool has gone round the table since the last split', () => {
  let s = fresh();
  s = act(s, 'a', 'grab'); // round 1, nobody has had a turn yet: treated as give
  assert.equal(s.phase, 'turn');
  assert.equal(s.current.moves[0].move, 'give');
  s = act(act(act(s, 'b', 'give'), 'c', 'give'), 'd', 'give'); // lap complete
  s = act(s, 'a', 'grab');
  assert.equal(s.phase, 'divide');
  s = vote(divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 })), { a: 2, b: 1, c: 1, d: 1 });
  s = stay(s, { a: true, b: true, c: true, d: true });
  assert.deepEqual(s.order, ['d', 'c', 'b', 'a']); // the divider goes last...
  s = act(s, 'd', 'grab'); // ...and nobody can grab the empty pool
  assert.equal(s.phase, 'turn');
  assert.ok(s.pool > 0);
  s = act(act(act(s, 'c', 'give'), 'b', 'give'), 'a', 'give'); // lap done on the divider's turn
  assert.equal(currentPlayer(s), 'd'); // first chance to grab goes to the next player
  assert.equal(act(s, 'd', 'grab').phase, 'divide');
});

test('a grabber sent out by a rejection leaves all their points in the pool', () => {
  let s = act(giveAll(fresh()), 'a', 'grab');
  s = divide(s, splitBy(s.pool, { a: 1, b: 0, c: 0, d: 0 }));
  const before = total(s);
  s = vote(s, { a: 2, b: 0, c: 0, d: 0 });
  const a = s.players.find((p) => p.id === 'a');
  assert.equal(a.active, false);
  assert.equal(a.balance, 0);
  assert.equal(s.pool, s.rounds.at(-1).ultimatum.forfeit);
  assert.ok(s.pool > 0);
  assert.equal(total(s), before);
});

test('a split judged in the last round ends the table there (no stay step for a round 21)', () => {
  const rich = () => createGame({ players: ids.map((id) => ({ id, balance: 400 })), commonsReserve: 500 });
  let s = rich();
  while (s.round < 20) s = act(s, currentPlayer(s), 'give');
  s = act(act(act(s, 'a', 'give'), 'b', 'give'), 'c', 'grab');
  s = divide(s, splitBy(s.pool, { a: 1, b: 1, c: 1, d: 1 }));
  const before = total(s);
  const passed = vote(s, { a: 1, b: 1, c: 2, d: 1 });
  assert.equal(passed.status, 'ended');
  assert.equal(passed.endReason, 'round-cap'); // not 'too-few', even if players would have left
  assert.equal(passed.round, 20);
  assert.equal(total(passed), before);
  const rejected = vote(s, { a: 0, b: 0, c: 2, d: 0 }); // the grabber's points still go back to those left
  assert.equal(rejected.endReason, 'round-cap');
  assert.equal(rejected.pool, 0);
  assert.equal(total(rejected), before);
});

import { STRATEGIES, botView, isFreeZero } from '../src/bots/centipede-ultimatum-bots.js';

test('a divider who gives themselves less than they put in is not "short-changed"', () => {
  let s = giveAll(giveAll(fresh())); // stakes 3 each, pool 20
  s = act(s, 'a', 'grab');
  s = divide(s, { a: 1, b: 3, c: 3, d: 13 }); // a keeps 1 of the 3 it put in, keeps d alive
  assert.deepEqual(botView(s, 'b').shortChanged, []);
  const bk = STRATEGIES.bookkeeper.create(() => 0.5);
  assert.equal(bk.vote(botView(s, 'b')), 1); // gets back exactly its stake: accepts
});

test('every bot 0 vote comes with reasons that are true, and other votes have none', () => {
  const kinds = new Set(['share', 'protest', 'turns', 'dominance', 'dominance-fair', 'grudge', 'never-pays']);
  let zeros = 0;
  for (let t = 0; t < 300; t++) {
    const rng = mulberry32(8000 + t);
    const keys = selectRoster(rng, 6);
    const pids = keys.map((k, i) => `${k}#${i}`);
    const inst = Object.fromEntries(pids.map((id, i) => [id, STRATEGIES[keys[i]].create(rng)]));
    let s = createGame({ players: pids.map((id) => ({ id })) });
    const act_ = () => s.players.filter((p) => p.active);
    while (s.status === 'playing') {
      if (s.phase === 'turn') { const id = currentPlayer(s); s = act(s, id, inst[id].turn(botView(s, id))); }
      else if (s.phase === 'divide') { const g = s.ultimatum.grabber; s = divide(s, inst[g].divide(botView(s, g))); }
      else if (s.phase === 'vote') {
        const votes = {};
        for (const p of act_()) {
          const v = botView(s, p.id);
          const { vote: n, reasons } = inst[p.id].assess(v);
          assert.equal(n, inst[p.id].vote(v));
          votes[p.id] = n;
          if (n > 0) { assert.deepEqual(reasons, []); continue; }
          zeros++;
          assert.ok(reasons.length > 0, `${p.id} voted 0 with no reason`);
          for (const r of reasons) {
            assert.ok(kinds.has(r.kind), r.kind);
            if (r.kind === 'protest') { assert.notEqual(r.who, p.id); assert.ok(v.shares[r.who] < (v.stakes[r.who] ?? 0)); assert.equal(r.got, v.shares[r.who]); }
            if (r.kind === 'grudge') assert.ok(r.round < s.round);
            if (r.kind === 'share') assert.ok(r.offered < r.wanted);
          }
        }
        s = vote(s, votes);
      } else s = stay(s, Object.fromEntries(act_().map((p) => [p.id, inst[p.id].stay ? inst[p.id].stay(botView(s, p.id)) : true])));
    }
  }
  assert.ok(zeros > 500, `only ${zeros} zero votes checked`);
});

test('Bookkeeper protests when someone else gets back less than they put in', () => {
  let s = giveAll(giveAll(fresh())); // stakes 3 each, pool 20
  s = act(s, 'a', 'grab');
  s = divide(s, { a: 9, b: 6, c: 4, d: 1 }); // d gets 1 of the 3 it put in
  const bk = STRATEGIES.bookkeeper.create(() => 0.5);
  const r = bk.assess(botView(s, 'b'));
  assert.equal(r.vote, 0);
  assert.deepEqual(r.reasons[0], { kind: 'protest', who: 'd', got: 1, put: 3 });
});

test('a 0 against a greedy divider is a protest, not a free 0 (Jason, 2026-11-06)', () => {
  let s = giveAll(giveAll(fresh())); // stakes 3 each, pool 20
  s = act(s, 'a', 'grab');
  const greedy = vote(divide(s, { a: 8, b: 4, c: 4, d: 4 }), { a: 2, b: 2, c: 1, d: 0 }); // passes; a keeps 8 > fair 5
  const fair = vote(divide(s, { a: 5, b: 5, c: 5, d: 5 }), { a: 2, b: 2, c: 1, d: 0 });
  assert.equal(isFreeZero(greedy.rounds.at(-1).ultimatum, 'd'), false);
  assert.equal(isFreeZero(fair.rounds.at(-1).ultimatum, 'd'), true);
});
