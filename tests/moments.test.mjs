// SPDX-License-Identifier: AGPL-3.0-only
// "What this table showed": the moment-finders for both games and the shared picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame as cg1, resolveRound } from '../src/engine/rising-pool.js';
import { createGame as cg2, currentPlayer, act, divide, vote, stay, splitBy } from '../src/engine/centipede-ultimatum.js';
import { STRATEGIES as S1 } from '../src/bots/rising-pool-bots.js';
import { STRATEGIES as S2, botView, selectRoster } from '../src/bots/centipede-ultimatum-bots.js';
import { mulberry32 } from '../src/engine/rng.js';
import { tableMoments as moments1 } from '../src/ui/rising-pool/moments.js';
import { tableMoments as moments2 } from '../src/ui/centipede-ultimatum/moments.js';
import { IDEAS, pickMoments } from '../src/ui/ideas.js';

const names = { you: 'you', a: 'Wren', b: 'Moss', c: 'Fig' };
const ids = ['you', 'a', 'b', 'c'];
const labels = [...Object.values(S1), ...Object.values(S2)].map((s) => s.label);
const noSpoilers = (m) => labels.every((l) => !m.line.includes(l));

test('Game 1: a failed round is one card, named by its cause', () => {
  // round 1 needs 1 for medium; "you" holds 0 so drops to nothing (↓)
  const broke = resolveRound(cg1({ players: ids.map((id) => ({ id, balance: id === 'you' ? 0 : 20 })) }), { you: 'medium', a: 'low', b: 'medium', c: 'low' }).state;
  const m = moments1(broke, { names });
  assert.equal(m.filter((x) => x.idea === 'congruence' || x.idea === 'threshold').length, 1);
  assert.match(m.find((x) => x.idea === 'congruence').line, /^Round 1 failed: .*You couldn't afford what you chose \(↓\), and Wren and Fig chose to give nothing\.$/);
  const chosen = resolveRound(cg1({ players: ids.map((id) => ({ id })) }), { you: 'medium', a: 'low', b: 'medium', c: 'low' }).state;
  assert.match(moments1(chosen, { names }).find((x) => x.idea === 'threshold').line, /Wren and Fig chose to give nothing/);
});

test('Game 1: a 0 answered by others is reciprocity, and nobody is named by strategy', () => {
  let s = cg1({ players: ids.map((id) => ({ id })) });
  s = resolveRound(s, { you: 'high', a: 'low', b: 'high', c: 'high' }).state;
  s = resolveRound({ ...s, round: 2 }, { you: 'high', a: 'high', b: 'low', c: 'high' }).state;
  const m = moments1(s, { names, strategies: { a: 'grudger' } });
  const r = m.find((x) => x.idea === 'reciprocity');
  assert.match(r.line, /In round 1, Wren gave nothing\. In round 2, Moss stopped giving too\./);
  assert.ok(m.every(noSpoilers));
});

test('Game 2: moments across 300 simulated tables are well formed and never spoil strategies', () => {
  const seen = new Set();
  for (let t = 0; t < 300; t++) {
    const rng = mulberry32(6100 + t);
    const keys = selectRoster(rng, 6);
    const pids = keys.map((k, i) => (i === 0 ? 'you' : `b${i}`));
    const inst = Object.fromEntries(pids.map((id, i) => [id, S2[keys[i]].create(rng)]));
    const nm = Object.fromEntries(pids.map((id, i) => [id, id === 'you' ? 'you' : `Seat${i}`]));
    let s = cg2({ players: pids.map((id) => ({ id })) });
    const reasons = {};
    const live = () => s.players.filter((p) => p.active);
    while (s.status === 'playing') {
      if (s.phase === 'turn') { const id = currentPlayer(s); s = act(s, id, inst[id].turn(botView(s, id))); }
      else if (s.phase === 'divide') { const g = s.ultimatum.grabber; s = divide(s, inst[g].divide(botView(s, g))); }
      else if (s.phase === 'vote') {
        const votes = {}; const why = {};
        for (const p of live()) { const r = inst[p.id].assess(botView(s, p.id)); votes[p.id] = r.vote; if (r.vote === 0) why[p.id] = r.reasons; }
        reasons[s.ultimatum.round] = why;
        s = vote(s, votes);
      } else s = stay(s, Object.fromEntries(live().map((p) => [p.id, inst[p.id].stay ? inst[p.id].stay(botView(s, p.id)) : true])));
    }
    const ms = moments2(s, { names: nm, reasons });
    for (const m of ms) {
      assert.ok(IDEAS[m.idea], m.idea);
      assert.ok(noSpoilers(m), m.line);
      assert.doesNotMatch(m.line, /undefined|NaN|\bnull\b/, m.line);
      seen.add(m.idea);
    }
    const picked = pickMoments(ms);
    assert.ok(picked.length <= 2);
    assert.equal(new Set(picked.map((m) => m.idea)).size, picked.length);
  }
  for (const k of ['protest', 'ultimatum', 'grudge', 'turns', 'centipede', 'risingAmount', 'sanctions']) assert.ok(seen.has(k), `never found: ${k}`);
});

test('Game 2: your equal split that short-changes a heavy giver is an equity moment', () => {
  // Fig can't give, so the other three carry the pool for six rounds; then you grab and split equally.
  let s = cg2({ players: ids.map((id) => ({ id, balance: id === 'c' ? 0 : 100 })) });
  while (s.round < 7) s = act(s, currentPlayer(s), 'give');
  s = act(s, 'you', 'grab');
  s = divide(s, splitBy(s.pool, { you: 1, a: 1, b: 1, c: 1 })); // 81 split 21/20/20/20; stakes 21
  s = vote(s, { you: 2, a: 1, b: 1, c: 1 });
  const m = moments2(s, { names, reasons: {} }).find((x) => x.idea === 'equity');
  assert.ok(m, 'an equity moment');
  assert.match(m.line, /^Your equal split in round 7 gave (Wren|Moss) back 20 of the 21 they put in\.$/);
});

test('every idea has a name, a sentence and a checked source (or none, by design)', () => {
  for (const [k, idea] of Object.entries(IDEAS)) {
    assert.ok(idea.name && idea.text.length > 40, k);
    if (idea.source) assert.match(idea.source.url, /^https:\/\//, k);
    else assert.equal(k, 'risingAmount');
  }
});
