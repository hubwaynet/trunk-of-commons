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

// ---------- The Wheel (Game 3) ----------
import { createGame as wheelGame, step as wheelStep, whiteId as wheelWhite } from '../src/engine/wheel.js';
import * as Wheel from '../src/ui/wheel/achievements.js';

const wheelIds = ['you', 'b', 'c', 'd', 'e', 'f'];
const wheelPlay = (opts, settings, plan) => {
  let s = wheelGame({ players: wheelIds.map((id) => ({ id, settings: settings[id] ?? settings.all, balance: opts.balances?.[id] })), stake: 500, ...opts });
  const tracker = Wheel.createTracker('you');
  while (s.status === 'playing') { const prev = s; s = wheelStep(s, plan?.(s) ?? {}); tracker.tick(prev, s); }
  return { s, facts: tracker.facts };
};

test('Wheel: six achievements, easiest first, counted only at the 500 stake', () => {
  assert.equal(Wheel.ACHIEVEMENTS.length, 6);
  assert.equal(new Set(Wheel.ACHIEVEMENTS.map((a) => a.id)).size, 6);
  const { s, facts } = wheelPlay({ stake: 2000 }, { all: { share: 8, people: 6 } });
  assert.equal(s.endReason, 'time');
  assert.equal(Wheel.endAchievements(s, facts).size, 0, 'nothing counts at another stake');
});

test('Wheel: Changed a mind, when you hurry the white arrow past a keeper and they start passing on', () => {
  // b keeps everything; you vote with the wheel while b has the white arrow; b starts sharing soon after
  let reformAt = null;
  const plan = (s) => {
    const w = wheelWhite(s);
    if (w === 'b' && reformAt == null) reformAt = s.t + 15;
    const d = { you: { vote: w === 'b' ? 4 : 0 } };
    if (reformAt != null && s.t === reformAt) d.b = { share: 5, people: 6 };
    return d;
  };
  const { s, facts } = wheelPlay({ stake: 2000 }, { all: { share: 8, people: 6 }, b: { share: 0, people: 1 } }, plan);
  assert.ok(facts.changedMind.some((x) => x.who === 'b'), 'b changed its mind after being hurried past');
  assert.equal(s.endReason, 'time');
});

test('Wheel: Lifeline needs a player below four tenths at the black arrow, and the table to last', () => {
  const plan = (s) => ({ you: { vote: s.t < 3 ? 3 : 0 } });
  const { facts } = wheelPlay({ balances: { f: 150 } }, { all: { share: 8, people: 6 } }, plan);
  assert.ok(facts.lifeline.some((x) => x.who === 'f'), 'f (at the black arrow, below 200) was hurried past');
  const ended = (endReason, bonus) => ({
    status: 'ended', endReason, bonus, stake: 500 * 100,
    players: wheelIds.map((id) => ({ id, start: 50000, balance: id === 'you' ? 52000 : 49000, stats: { reward: 1000, sharesIn: 1000, sharesOut: id === 'you' ? 1800 : 1000, boost: 0 } })),
  });
  const got = Wheel.endAchievements(ended('time', { pct: 4 }), facts);
  for (const a of ['lifeline', 'bonus', 'ahead', 'most-passed', 'hero']) assert.ok(got.has(a), a);
  assert.ok(!Wheel.endAchievements(ended('bust', null), facts).has('lifeline'), 'no lifeline when the table goes bust');
  assert.ok(!Wheel.endAchievements(ended('time', null), facts).has('hero'), 'no hero without the bonus');
});
