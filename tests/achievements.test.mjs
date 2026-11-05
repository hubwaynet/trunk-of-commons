// SPDX-License-Identifier: AGPL-3.0-only
// Rising Pool achievement checks (now a pure module) and the shared achievement store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, resolveRound, applyStayDecisions } from '../src/engine/rising-pool.js';
import { roundAchievements, endAchievements, ACHIEVEMENTS } from '../src/ui/rising-pool/achievements.js';
import { achievementStore } from '../src/ui/common.js';

const ids = ['you', 'a', 'b', 'c'];
const fresh = (balance = 50) => createGame({ players: ids.map((id) => ({ id, balance })) });
const play = (s, levels) => resolveRound(s, levels);

test('Held the line: your high gift kept the pool from failing', () => {
  const { state, outcome } = play(fresh(), { you: 'high', a: 'high', b: 'low', c: 'low' }); // average 1 passes; without you 0.5
  assert.equal(outcome.result, 'base');
  assert.ok(roundAchievements(state, outcome).has('held-line'));
  const easy = play(fresh(), { you: 'high', a: 'high', b: 'high', c: 'high' });
  assert.ok(!roundAchievements(easy.state, easy.outcome).has('held-line'));
});

test('Rising tide needs three bonus rounds in a row; Long haul needs round 8', () => {
  let s = fresh(200);
  let got = new Set();
  for (let r = 1; r <= 8; r++) {
    const { state, outcome } = play(s, { you: 'high', a: 'high', b: 'high', c: 'medium' });
    got = new Set([...got, ...roundAchievements(state, outcome)]);
    if (r === 2) assert.ok(!got.has('rising-tide'));
    s = applyStayDecisions(state, {});
  }
  assert.ok(got.has('rising-tide'));
  assert.ok(got.has('long-haul'));
});

test('Timed the exit: left ahead, then the pool failed', () => {
  const { state } = play(fresh(), { you: 'low', a: 'high', b: 'high', c: 'high' }); // you gain
  assert.ok(endAchievements(state, { leftAfter: 1, afterReason: 'pool-failed' }).has('timed-exit'));
  assert.equal(endAchievements(state, { leftAfter: 1, afterReason: 'commons-exhausted' }).size, 0);
  assert.equal(endAchievements(state, {}).size, 0);
  assert.equal(ACHIEVEMENTS.length, 5);
});

function fakeStorage({ broken = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => { if (broken) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (broken) throw new Error('blocked'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
  };
}

test('achievement store: new ids, completion, one celebration', () => {
  globalThis.localStorage = fakeStorage();
  const all = [{ id: 'x' }, { id: 'y' }];
  const st = achievementStore({ key: 'k', celebratedKey: 'c', all });
  assert.deepEqual(st.add(['x']), ['x']);
  assert.deepEqual(st.add(['x']), []);
  assert.equal(st.complete(), false);
  st.add(['y']);
  assert.equal(st.complete(), true);
  assert.equal(st.firstCelebration(), true);
  assert.equal(st.firstCelebration(), false);
  assert.deepEqual(JSON.parse(localStorage.getItem('k')), ['x', 'y']);
});

test('achievement store still works this visit when browser storage is blocked', () => {
  globalThis.localStorage = fakeStorage({ broken: true });
  const st = achievementStore({ key: 'k', celebratedKey: 'c', all: [{ id: 'x' }] });
  assert.deepEqual(st.add(['x']), ['x']);
  assert.equal(st.complete(), true);
  assert.equal(st.firstCelebration(), true);
  assert.equal(st.firstCelebration(), false);
  st.forget();
  assert.equal(st.complete(), false);
  delete globalThis.localStorage;
});
