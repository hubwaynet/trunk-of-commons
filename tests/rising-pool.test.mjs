// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, resolveRound, applyStayDecisions, stakes } from '../src/engine/rising-pool.js';
import { STRATEGIES, botView, selectRoster } from '../src/bots/rising-pool-bots.js';
import { mulberry32 } from '../src/engine/rng.js';

const ids = ['a', 'b', 'c', 'd'];
const game = (opts = {}) => createGame({ players: ids.map((id) => ({ id })), startBalance: 10, ...opts });
const all = (level) => Object.fromEntries(ids.map((id) => [id, level]));

test('stakes rise each round', () => {
  assert.deepEqual(stakes(1), { low: 0, medium: 1, high: 2 });
  assert.deepEqual(stakes(5), { low: 0, medium: 5, high: 10 });
});

test('average below medium forfeits the pool and ends the game', () => {
  const { state, outcome } = resolveRound(game(), { a: 'medium', b: 'low', c: 'low', d: 'low' });
  assert.equal(outcome.result, 'fail');
  assert.equal(outcome.forfeited, 1);
  assert.equal(state.status, 'ended');
  assert.equal(state.players.find((p) => p.id === 'a').balance, 9);
});

test('average near medium tops up to an equal share, free riders included', () => {
  // round 1: gifts 2,2,0,0 -> pool 4, avg 1 = medium -> base, each gets 1
  const { state, outcome } = resolveRound(game(), { a: 'high', b: 'high', c: 'low', d: 'low' });
  assert.equal(outcome.result, 'base');
  assert.equal(outcome.payouts.c, 1);
  assert.equal(state.players.find((p) => p.id === 'c').balance, 11);
  assert.equal(state.players.find((p) => p.id === 'a').balance, 9);
});

test('base result rounds the pool up to a multiple of the player count', () => {
  // gifts 1,1,1,2 -> pool 5, avg 1.25 nearer medium -> total 8, each 2, top-up 3
  const { outcome } = resolveRound(game(), { a: 'medium', b: 'medium', c: 'medium', d: 'high' });
  assert.equal(outcome.result, 'base');
  assert.equal(outcome.payouts.a, 2);
  assert.equal(outcome.topUp, 3);
});

test('average nearer high pays everyone the high amount', () => {
  // gifts 2,2,2,1 -> avg 1.75 nearer high -> everyone gets 2
  const { outcome } = resolveRound(game(), { a: 'high', b: 'high', c: 'high', d: 'medium' });
  assert.equal(outcome.result, 'bonus');
  assert.equal(outcome.payouts.d, 2);
  assert.equal(outcome.topUp, 1);
});

test('an average exactly halfway counts as medium', () => {
  const { outcome } = resolveRound(game(), { a: 'high', b: 'high', c: 'high', d: 'low' });
  assert.equal(outcome.result, 'base');
});

test('optional hard stop still works', () => {
  let s = game({ endRound: 2 });
  s = resolveRound(s, all('medium')).state;
  s = applyStayDecisions(s, {});
  s = resolveRound(s, all('medium')).state;
  assert.equal(s.status, 'ended');
  assert.equal(s.endReason, 'season-end');
});

test('too few players left ends the game', () => {
  let s = resolveRound(game(), all('medium')).state;
  s = applyStayDecisions(s, { a: false, b: false });
  assert.equal(s.status, 'ended');
  assert.equal(s.endReason, 'too-few');
});

test('a level you cannot pay in full drops to one you can', () => {
  const s = game({ startBalance: 1 }); // round 1: medium 1, high 2
  const { outcome } = resolveRound(s, all('high'));
  assert.equal(outcome.levels.a, 'medium');
  assert.equal(outcome.contributions.a, 1);
  assert.equal(outcome.downgraded.a, 'high');
});

test('players can bring their own balance to a table', () => {
  const s = createGame({ players: [{ id: 'a', balance: 42 }, { id: 'b' }, { id: 'c' }] });
  assert.equal(s.players[0].balance, 42);
  assert.equal(s.players[0].start, 42);
  assert.equal(s.players[1].balance, 20);
});

test('same seed gives the same game, and many seeds run cleanly', () => {
  const run = (seed) => {
    const rng = mulberry32(seed);
    const roster = selectRoster(rng, 6);
    const players = roster.map((sid, i) => ({ id: `p${i}`, sid }));
    const agents = Object.fromEntries(players.map((p) => [p.id, STRATEGIES[p.sid].create(rng)]));
    let s = createGame({ players });
    while (s.status === 'playing') {
      const choices = {};
      for (const p of s.players.filter((x) => x.active)) choices[p.id] = agents[p.id].choose(botView(s, p.id));
      s = resolveRound(s, choices).state;
      const stay = {};
      for (const p of s.players.filter((x) => x.active)) stay[p.id] = agents[p.id].stay ? agents[p.id].stay(botView(s, p.id)) : true;
      s = applyStayDecisions(s, stay);
    }
    return s;
  };
  assert.deepEqual(run(42), run(42));
  for (let seed = 1; seed < 300; seed++) {
    const s = run(seed);
    assert.ok(['pool-failed', 'commons-exhausted', 'too-few'].includes(s.endReason));
    for (const p of s.players) assert.ok(p.balance >= 0);
  }
});

test('the Commons ledger tracks reserve, top-ups and forfeits', () => {
  let s = resolveRound(game(), { a: 'medium', b: 'medium', c: 'medium', d: 'high' }).state; // top-up 3
  assert.equal(s.commons.reserve, 117);
  assert.equal(s.commons.paidOut, 3);
  s = applyStayDecisions(s, {});
  const r = resolveRound(s, { a: 'medium', b: 'low', c: 'low', d: 'low' }); // round 2 fails, forfeits 2
  assert.equal(r.state.commons.reserve, 119);
  assert.equal(r.outcome.commonsAfter, 119);
});

test('an exhausted Commons pays what it has and ends the season', () => {
  // round 1 bonus wants top-up 1 per... gifts 2,2,2,1 = 7, wants 8 -> needs 1, reserve 0
  const s = game({ commonsReserve: 0 });
  const r = resolveRound(s, { a: 'high', b: 'high', c: 'high', d: 'medium' });
  assert.equal(r.outcome.commonsShort, true);
  assert.equal(r.outcome.payouts.a, 1); // floor(7/4) = 1 each, remainder 3 stays in the Commons
  assert.equal(r.state.commons.reserve, 3);
  assert.equal(r.state.endReason, 'commons-exhausted');
});

test('a Commons that hits exactly zero also ends the season', () => {
  const r = resolveRound(game({ commonsReserve: 3 }), { a: 'medium', b: 'medium', c: 'medium', d: 'high' });
  assert.equal(r.outcome.commonsShort, false);
  assert.equal(r.state.commons.reserve, 0);
  assert.equal(r.state.endReason, 'commons-exhausted');
});
