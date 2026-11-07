// What this Centipede & Ultimatum table showed: finds moments in a finished table and links each
// to an idea in src/ui/ideas.js. Pure (no DOM). The bots' reasons for their 0 votes come from the
// page, which records them as they vote. Strategy names are never used.
// SPDX-License-Identifier: AGPL-3.0-only

import { isFreeZero } from '../../bots/centipede-ultimatum-bots.js';
import { listOf, cap } from '../ideas.js';

/**
 * game: a finished state. names: { id: display name } ('you' for the player).
 * reasons: { round: { voter: [reasons for a 0] } }, as recorded by the page.
 */
export function tableMoments(game, { names, reasons = {} }) {
  const nm = (id) => names[id] ?? id;
  const poss = (id) => (id === 'you' ? 'your' : `${nm(id)}'s`);
  const L = (ids) => listOf(ids.map(nm));
  const splits = game.rounds.filter((r) => r.result === 'ultimatum').map((r) => r.ultimatum);
  const why = (u, kind) => Object.entries(reasons[u.round] ?? {}).flatMap(([v, rs]) => rs.filter((r) => r.kind === kind).map((r) => ({ v, r })));
  const total = (u) => Object.values(u.votes).reduce((a, b) => a + b, 0);
  const out = [];

  // 1. Your split was rejected: say who and why first
  const yours = splits.find((u) => u.grabber === 'you' && u.result === 'rejected');
  if (yours) {
    // Lead with the most telling reason: someone else short-changed, a grudge, keeping the grab,
    // then the voter's own share, then a vote that is always 0.
    const RANK = { protest: 0, grudge: 1, turns: 2, dominance: 2, share: 3, 'never-pays': 4 };
    const all = Object.entries(reasons[yours.round] ?? {}).flatMap(([v, rs]) => rs.map((r) => ({ v, r })));
    const best = all.sort((a, b) => (RANK[a.r.kind] ?? 9) - (RANK[b.r.kind] ?? 9))[0];
    const r = best?.r;
    const V = best ? cap(nm(best.v)) : '';
    const said = !r ? '' : r.kind === 'protest' ? `${V} voted 0 because ${nm(r.who)} got back ${r.got} of the ${r.put} ${r.who === 'you' ? 'you' : 'they'} put in.`
      : r.kind === 'grudge' ? `${V} voted 0 because you had short-changed them in round ${r.round}.`
      : r.kind === 'turns' || r.kind === 'dominance' ? `${V} voted 0 because you kept taking the grab and more than a fair share.`
      : r.kind === 'share' ? `${V} voted 0 because they were offered ${r.offered} and wanted ${r.wanted}.` : `${V} voted 0, as they always do.`;
    const idea = !r ? 'ultimatum' : { protest: 'protest', grudge: 'grudge', turns: 'turns', dominance: 'turns', share: 'ultimatum', 'never-pays': 'freeRider' }[r.kind] ?? 'ultimatum';
    out.push({ idea, priority: 1, you: true,
      line: `Your split in round ${yours.round} was rejected (votes totalled ${total(yours)}, ${Object.keys(yours.votes).length} needed), and you were sent out.${said ? ` ${said}` : ''}` });
  }

  // 2. Your equal split short-changed a heavy contributor, or your split by stake left a passer with little
  for (const u of splits.filter((x) => x.grabber === 'you' && x !== yours)) {
    const ids = Object.keys(u.shares);
    const others = ids.filter((id) => id !== 'you');
    const vals = ids.map((id) => u.shares[id]);
    const equalish = Math.max(...vals) - Math.min(...vals) <= 1;
    const short = others.find((id) => (u.stakes[id] ?? 0) > u.shares[id]);
    if (equalish && short) {
      out.push({ idea: 'equity', priority: 2, you: true,
        line: `Your equal split in round ${u.round} gave ${nm(short)} back ${u.shares[short]} of the ${u.stakes[short]} they put in.` });
      break;
    }
    const eq = u.pool / ids.length;
    // someone who put in little got back what they put in, but far less than an equal share (not a sanction)
    const passer = others.find((id) => (u.stakes[id] ?? 0) < eq / 2 && u.shares[id] >= (u.stakes[id] ?? 0) && u.shares[id] < eq / 2);
    if (!equalish && passer) {
      out.push({ idea: 'equity', priority: 2, you: true,
        line: `Your split in round ${u.round} followed what each put in, so ${nm(passer)}, who had put in ${(u.stakes[passer] ?? 0) || 'nothing'}, got ${u.shares[passer] || 'nothing'} against an equal share of about ${Math.round(eq)}.` });
      break;
    }
  }

  // 3. Free riders: cut, or never cut and ahead
  const counts = {};
  for (const u of splits) {
    for (const [id, n] of Object.entries(counts)) {
      if (n >= 2 && u.result !== 'rejected' && u.shares[id] !== undefined && u.shares[id] < (u.stakes[id] ?? 0)) {
        out.push({ idea: 'sanctions', priority: 2, you: u.grabber === 'you' || id === 'you',
          line: `In round ${u.round}, after ${poss(id)} free 0s, ${nm(u.grabber)} gave ${nm(id)} ${u.shares[id]} of the ${u.stakes[id]} they put in, and the table let it pass.` });
        counts[id] = -Infinity; // said once
      }
    }
    for (const id of Object.keys(u.votes)) if (isFreeZero(u, id) && counts[id] !== -Infinity) counts[id] = (counts[id] ?? 0) + 1;
  }
  for (const p of game.players) {
    const n = counts[p.id];
    if (n >= 2 && p.balance > p.start) {
      out.push({ idea: 'freeRider', priority: 2, you: p.id === 'you',
        line: `${cap(nm(p.id))} voted 0 on ${n} fair splits that passed anyway, never paying to vote, and finished +${p.balance - p.start}. Nobody cut ${poss(p.id)} share.` });
      break;
    }
  }

  // 4. Protest, grudge and turn-taking vetoes (the first of each)
  const firstWith = (kind) => splits.map((u) => ({ u, hits: why(u, kind) })).find((x) => x.hits.length);
  const p = firstWith('protest');
  if (p) {
    const { u, hits: [{ v, r }] } = p;
    out.push({ idea: 'protest', priority: 3, you: u.grabber === 'you' || r.who === 'you',
      line: `In round ${u.round}, ${nm(v)} voted 0 on ${poss(u.grabber)} split because ${nm(r.who)} got back ${r.got} of the ${r.put} ${r.who === 'you' ? 'you' : 'they'} put in.${u.result === 'rejected' ? ' The split was rejected.' : ''}` });
  }
  const g = firstWith('grudge');
  if (g) {
    const { u, hits: [{ v, r }] } = g;
    out.push({ idea: 'grudge', priority: 3, you: u.grabber === 'you',
      line: `In round ${u.round}, ${nm(v)} voted 0 on ${poss(u.grabber)} split: ${nm(u.grabber)} had short-changed ${nm(v)} in round ${r.round}.` });
  }
  const t = splits.map((u) => ({ u, hits: [...why(u, 'turns'), ...why(u, 'dominance')] })).find((x) => x.hits.length);
  if (t) {
    const { u, hits } = t;
    const voters = [...new Set(hits.map((x) => x.v))];
    out.push({ idea: 'turns', priority: 3, you: u.grabber === 'you',
      line: `In round ${u.round}, ${L(voters)} voted 0 on ${poss(u.grabber)} split: ${nm(u.grabber)} kept taking the grab and more than a fair share.${u.result === 'rejected' ? ` ${u.grabber === 'you' ? 'You were' : `${nm(u.grabber)} was`} sent out.` : ''}` });
  }

  // 5. A greedy split turned down
  const greedy = splits.find((u) => u.result === 'rejected' && u.shares[u.grabber] > 1.5 * (u.pool / Object.keys(u.shares).length));
  if (greedy) {
    out.push({ idea: 'ultimatum', priority: 4, you: greedy.grabber === 'you',
      line: `In round ${greedy.round}, the table turned down ${poss(greedy.grabber)} split, which kept ${greedy.shares[greedy.grabber]} of the ${greedy.pool} for ${greedy.grabber === 'you' ? 'you' : 'themselves'}.` });
  }

  // 6. The first grab came at the first chance, while later pools grew much bigger
  const grabs = splits.filter((u) => !u.final); // the last split is handed out, not grabbed
  if (grabs.length >= 2) {
    const [first, ...rest] = grabs;
    const later = Math.round(rest.reduce((a, u) => a + u.pool, 0) / rest.length);
    if (first.round <= 2 && later >= 2 * first.pool) {
      out.push({ idea: 'centipede', priority: 5, you: first.grabber === 'you',
        line: `${cap(nm(first.grabber))} grabbed at the first chance, in round ${first.round}, a pool of ${first.pool}. Later grabs at this table averaged ${later}.` });
    }
  }

  // 7. Your split was welcomed
  const welcomed = splits.find((u) => u.grabber === 'you' && u.result === 'welcomed');
  if (welcomed) {
    out.push({ idea: 'trust', priority: 6, you: true,
      line: `Your split in round ${welcomed.round} was welcomed (average ${welcomed.voteAvg.toFixed(2)}), and everyone got a bonus point.` });
  }

  // 8. The rising amount ended the table
  const lastRound = game.rounds.at(-1)?.round ?? 0;
  if (game.endReason === 'all-broke' || game.endReason === 'few-can-give') {
    out.push({ idea: 'risingAmount', priority: 7, you: false,
      line: `The table ended in round ${lastRound}: ${game.endReason === 'all-broke' ? 'nobody' : 'fewer than three players'} could afford the amount of ${lastRound + 1}.` });
  }
  return out;
}
