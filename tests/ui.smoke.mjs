// Play-through test: opens the real pages in a headless browser and plays whole tables of both
// games, at desktop width in light theme and phone width in dark theme. It fails on page errors,
// sideways scrolling, lost keyboard focus, a round past the last, or new accessibility problems.
// Run: npm run test:ui   (needs Playwright with Chromium; see CLAUDE.md)
// SPDX-License-Identifier: AGPL-3.0-only

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test-results');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  throw new Error('Playwright is not installed here. Install it (npm i -D playwright && npx playwright install chromium) to run the play-through test.');
}
const AXE = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

// Known issues the review left for Jason (claude/review-2026-11-06.md, L5 and L6). Anything else fails.
const KNOWN = [
  { rule: 'label-content-name-mismatch', target: /wordmark/ }, // L6: wordmark's spoken name
  { rule: 'color-contrast', target: /\.grab|\.bonus/ }, // L5: white on brass (GRAB chip, Welcomed tag)
];

// ---------- a tiny static server for the repo ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
let server, BASE, browser;
before(async () => {
  server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body); }
    catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  await mkdir(OUT, { recursive: true });
});
after(async () => { await browser?.close(); server?.close(); });

// Tables are random. Each run seeds the page's randomness so a failure can be replayed:
// UI_SEED=12345 npm run test:ui
const SEED = Number(process.env.UI_SEED ?? 20261106) >>> 0;
console.log(`# UI_SEED=${SEED}`);
const seedRandom = (seed) => {
  let a = seed;
  Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

const DESKTOP = { name: 'desktop-light', viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference' };
const PHONE = { name: 'phone-dark', viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' };

async function open(path, setup, { init } = {}) {
  const ctx = await browser.newContext({ viewport: setup.viewport, colorScheme: setup.colorScheme, reducedMotion: setup.reducedMotion });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // offline-safe; fallback fonts are fine here
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.location()?.url ?? '')) errors.push(`console: ${m.text()}`); });
  await page.addInitScript(seedRandom, SEED);
  if (init) await page.addInitScript(init);
  await page.goto(BASE + path);
  return { ctx, page, errors };
}

async function axeCheck(page, label) {
  await page.addScriptTag({ content: AXE });
  const found = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .flatMap((v) => v.nodes.map((n) => ({ rule: v.id, target: n.target.join(' '), help: v.help }))));
  const fresh = found.filter((f) => !KNOWN.some((k) => k.rule === f.rule && k.target.test(f.target)));
  assert.deepEqual(fresh, [], `${label}: new accessibility problems`);
}

// "What this table showed": one or two moments, each naming an idea, with https links
async function showedCard(page, label) {
  const moments = await page.$$eval('.showed .moment', (ms) => ms.map((m) => ({ text: m.textContent, links: [...m.querySelectorAll('a')].map((a) => a.href) })));
  assert.ok(moments.length >= 1 && moments.length <= 2, `${label}: ${moments.length} moments on the card`);
  for (const m of moments) {
    assert.doesNotMatch(m.text, /undefined|NaN/, `${label}: ${m.text}`);
    for (const url of m.links) assert.match(url, /^https:\/\//);
  }
}

async function noSidewaysScroll(page, label) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(extra <= 0, `${label}: page scrolls sideways by ${extra}px`);
}

// Click a button that starts the next round or table: if part of the table was off the screen, the
// table comes back to the top; if it was all in view, the page doesn't jump.
async function clickBringsUpTable(page, selector, label) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const where = () => page.evaluate(() => {
    const t = document.querySelector('.table-wrap').getBoundingClientRect();
    return { top: Math.round(document.querySelector('.game').getBoundingClientRect().top), inView: t.top >= 0 && t.bottom <= innerHeight };
  });
  const before = await where();
  await page.click(selector);
  let after = await where();
  for (let i = 0; i < 30 && !before.inView && (after.top < 0 || after.top >= 40); i++) { await page.waitForTimeout(50); after = await where(); } // smooth scroll on desktop
  if (!before.inView) assert.ok(after.top >= 0 && after.top < 40, `${label}: the table is at ${after.top}px, not the top of the screen`);
  else assert.equal(after.top, before.top, `${label}: the page jumped though the table was in view`);
}

const focusId = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a === document.body || !a ? 'BODY' : a.id || a.closest('[id]')?.id || a.tagName;
});

async function finish(t, { ctx, page, errors }, label) {
  try { assert.deepEqual(errors, [], `${label}: errors in the page`); }
  catch (e) { await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true }).catch(() => {}); throw e; }
  finally { await ctx.close(); }
}

// ---------- home page ----------
test('home page loads and shows unlocked levels from this browser', async (t) => {
  const run = await open('/', DESKTOP, { init: () => localStorage.setItem('trunk.unlocked.centipede', '1') });
  assert.match(await run.page.textContent('#level2-status'), /Unlocked/);
  assert.match(await run.page.textContent('#level3-status'), /Play-test/);
  await finish(t, run, 'home');
});

// ---------- Game 1 ----------
for (const setup of [DESKTOP, PHONE]) {
  test(`Rising Pool: a whole table at ${setup.name}`, { timeout: 120_000 }, async (t) => {
    const run = await open('/games/rising-pool/', setup);
    const { page } = run;
    const label = `rising-pool-${setup.name}`;
    await page.waitForSelector('#choice-medium');
    // keyboard: choosing a gift keeps focus on it, and Tab carries on to the next control
    await page.focus('#choice-medium');
    await page.keyboard.press('Space');
    assert.equal(await focusId(page), 'choice-medium', 'focus stays on the gift after choosing it');
    await page.keyboard.press('Tab');
    assert.equal(await focusId(page), 'choice-high');
    await page.keyboard.press('Tab');
    assert.equal(await focusId(page), 'reveal');
    let rounds = 0;
    while (rounds < 40 && !(await page.$('.debrief'))) {
      if (await page.$('#reveal')) {
        for (const lv of ['high', 'medium', 'low']) {
          const b = await page.$(`#choice-${lv}`);
          if (b && await b.isEnabled()) { await b.click(); break; }
        }
        await page.click('#reveal');
        rounds++;
      } else if (await page.$('#stay')) await page.click('#stay');
      else if (await page.$('#start-over')) await page.click('#start-over');
    }
    assert.ok(await page.$('.debrief'), 'the table closes with a debrief');
    await page.click('#check');
    assert.ok((await page.$$('.reveal')).length >= 5, 'Read the table gives a verdict for each bot');
    await showedCard(page, label);
    await noSidewaysScroll(page, label);
    if (setup === DESKTOP) await axeCheck(page, label);
    await clickBringsUpTable(page, '#again', `${label} new table`);
    await finish(t, run, label);
  });
}

// ---------- both games: the ring legend sits in How it works, and "Collapse and play" closes it ----------
for (const path of ['/games/rising-pool/', '/games/centipede-ultimatum/?preview']) {
  test(`${path}: Collapse and play brings up the table and is remembered`, async (t) => {
    const run = await open(path, PHONE);
    const { page } = run;
    const label = `collapse-${path.split('/')[2]}`;
    await page.waitForSelector('#panel .card');
    assert.ok(await page.$('#how-it-works .ring-legend'), `${label}: the ring legend is in How it works`);
    assert.equal(await page.$('.game .ring-legend'), null, `${label}: no ring legend under the table`);
    await page.click('.fold-close');
    assert.equal(await page.$eval('#how-it-works', (d) => d.open), false, `${label}: How it works closes`);
    assert.equal(await focusId(page), 'panel', `${label}: keyboard focus moves to the panel`);
    const tableTop = await page.$eval('.table-wrap', (e) => Math.round(e.getBoundingClientRect().top));
    assert.ok(tableTop >= 0 && tableTop < 40, `${label}: the table is at the top of the screen (${tableTop}px)`);
    // the section saves its state on the details "toggle" event, which fires a moment after closing
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('.how-it-works') && localStorage.getItem(k) === '0'));
    await page.reload();
    await page.waitForSelector('#panel .card');
    assert.equal(await page.$eval('#how-it-works', (d) => d.open), false, `${label}: still closed on return`);
    await noSidewaysScroll(page, label);
    await finish(t, run, label);
  });
}

// ---------- Game 2 ----------
async function playCentipede(page, { grabAt = 25, label }) {
  await page.clock.install();
  await page.goto(page.url()); // reload so the page's timers run on the test clock
  await page.waitForSelector('#panel .card');
  const seen = { grabbed: false, keyedTurn: false, keyedDivide: false, logChecked: false, lastSplit: false, steps: 0, botZeros: 0, skipped: false };
  while (seen.steps++ < 4000) {
    if (await page.$('#again')) break;
    const headings = await page.$$eval('#panel h2', (hs) => hs.map((h) => h.textContent).join(' | '));
    if (/closing split/i.test(headings)) seen.lastSplit = true;
    if (!seen.logChecked && await page.$('#log details[open]')) {
      // the round log stays collapsed after the next bot move
      await page.click('#log summary');
      await page.clock.runFor(1500);
      assert.equal(await page.$eval('#log details', (d) => d.open), false, `${label}: the log reopened itself`);
      await page.click('#log summary');
      seen.logChecked = true;
      continue;
    }
    if (!seen.skipped && await page.$('#skip')) { seen.skipped = true; await page.click('#skip'); continue; } // once you're out
    if (await page.$('#give')) {
      const open = await page.$eval('#grab', (b) => !b.disabled);
      const pool = Number(await page.$eval('#grab .amt', (e) => e.textContent));
      if (open && !seen.grabbed && pool >= grabAt) {
        seen.grabbed = true;
        await page.focus('#grab');
        await page.keyboard.press('Enter');
      } else if (!seen.keyedTurn) {
        seen.keyedTurn = true;
        await page.focus('#give');
        await page.keyboard.press('Enter');
        assert.notEqual(await focusId(page), 'BODY', `${label}: focus fell to the top of the page after giving`);
      } else await page.click('#give');
      continue;
    }
    if (await page.$('#pass')) { await page.click('#pass'); continue; }
    if (await page.$('#offer')) {
      if (!seen.keyedDivide) {
        seen.keyedDivide = true;
        await page.focus('#more-you');
        await page.keyboard.press('Enter');
        assert.equal(await focusId(page), 'more-you', `${label}: focus stays on + after pressing it`);
        await page.click('#preset-stakes');
      }
      await page.click('#offer');
      continue;
    }
    if (await page.$('#vote-2')) { await page.click('#vote-2'); continue; }
    if (await page.$('#stay')) {
      // every 0 from a bot on the result card comes with its reason
      const zeros = await page.$$eval('.outcome .split-row:not(.head):not(.me) .vote.v0', (z) => z.length);
      const reasons = await page.$$eval('.outcome .why0 li', (li) => li.length);
      assert.equal(reasons, zeros, `${label}: ${zeros} bot 0 votes but ${reasons} reasons`);
      seen.botZeros += zeros;
      if (!seen.stayChecked) { seen.stayChecked = true; await clickBringsUpTable(page, '#stay', `${label} Stay & play`); continue; }
      await page.click('#stay');
      continue;
    }
    await page.clock.runFor(700); // let the bots move
  }
  return seen;
}

for (const setup of [DESKTOP, PHONE]) {
  test(`Centipede & Ultimatum: a whole table at ${setup.name}`, { timeout: 120_000 }, async (t) => {
    const label = `centipede-${setup.name}`;
    const run = await open('/games/centipede-ultimatum/?preview', setup);
    const { page } = run;
    const seen = await playCentipede(page, { label });
    assert.ok(await page.$('#again'), `${label}: the table ends with the end card`);
    // No last round since 2026-11-08: a table ending with a pool on it finishes with a closing split
    const endText = await page.textContent('.debrief');
    // (when you were still at the table: once you're out, the panel only shows that you're watching)
    if (/closing split/.test(endText) && !seen.skipped) assert.ok(seen.lastSplit, `${label}: the end card names a last split the panel never showed`);
    assert.doesNotMatch(endText, /undefined|NaN/, `${label}: end card text`);
    const roundLabel = await page.$$eval('#table text', (ts) => ts.map((x) => x.textContent).find((x) => /ROUND|TABLE OVER/.test(x)));
    assert.match(roundLabel, /^TABLE OVER AFTER ROUND \d+$/);
    await showedCard(page, label);
    // the Commons row: "COMMONS [bar] 37 / 120" never runs into the round label
    const clash = await page.$$eval('#table text', (ts) => {
      const row = ts.filter((x) => Number(x.getAttribute('y')) > 415).map((x) => x.getBBox());
      return row.some((a, i) => row.slice(i + 1).some((c) => a.x < c.x + c.width && c.x < a.x + a.width));
    });
    assert.equal(clash, false, `${label}: labels overlap in the Commons row`);
    assert.match(await page.textContent('.debrief'), /The Commons started with 120/);
    await noSidewaysScroll(page, label);
    if (setup === DESKTOP) await axeCheck(page, label);
    await clickBringsUpTable(page, '#again', `${label} new table`);
    await finish(t, run, label);
  });
}

test('Centipede & Ultimatum: locked until Rising Pool is done, then opens', async (t) => {
  const locked = await open('/games/centipede-ultimatum/', DESKTOP);
  assert.ok(await locked.page.$('.locked-card'), 'shows the lock card');
  await finish(t, locked, 'centipede-locked');
  const opened = await open('/games/centipede-ultimatum/', DESKTOP, { init: () => localStorage.setItem('trunk.unlocked.centipede', '1') });
  await opened.page.waitForSelector('#panel .card');
  assert.equal(await opened.page.$('.locked-card'), null, 'opens once unlocked');
  await finish(t, opened, 'centipede-unlocked');
});

test('all six Game 2 achievements show the mastered card; Reset clears them but keeps unlocks', { timeout: 120_000 }, async (t) => {
  const run = await open('/games/centipede-ultimatum/?preview', DESKTOP);
  const { page } = run;
  await page.evaluate(() => {
    localStorage.setItem('trunk.centipede.achievements', JSON.stringify(['no-one-short', 'steady-hand', 'one-clean-grab', 'full-distance', 'welcomed', 'your-vote-counted']));
    localStorage.setItem('trunk.centipede.celebrated', '1');
  });
  await playCentipede(page, { label: 'centipede-mastered' }); // reloads, then plays a table to the end
  assert.match(await page.textContent('#ach-progress'), /6 of 6 · Game 3 unlocked/);
  assert.match(await page.textContent('.extra.unlocked'), /mastered/);
  assert.equal(await page.$('#ach-progress #reset-centipede'), null, 'Reset is not in the top strip');
  await page.click('#ach-show'); // opens the Achievements section, where Reset lives
  assert.ok(await page.$eval('#achievements-list', (d) => d.open), 'Show opens the section');
  await page.click('#ach-list #reset-centipede');
  await page.click('#ach-list #reset-centipede-yes');
  assert.match(await page.textContent('#ach-progress'), /0 of 6 · Game 3 unlocked/, 'achievements cleared, unlock kept');
  assert.equal(await page.$('.extra.unlocked'), null);
  const home = await run.ctx.newPage();
  await home.goto(BASE + '/');
  assert.match(await home.textContent('#level3-status'), /Unlocked/);
  await finish(t, run, 'centipede-mastered');
});

// The announcer (src/ui/announce.js) speaks when the player needs to act, after each split and at
// the end, never on every bot move (Jason, 2026-11-06).
const listenToAnnouncer = () => {
  window.__said = [];
  new MutationObserver(() => { const t = document.getElementById('announcer').textContent; if (t) window.__said.push(t); })
    .observe(document.getElementById('announcer'), { childList: true, characterData: true, subtree: true });
};
test('Centipede & Ultimatum: the announcer speaks at your turn, not on every bot move', { timeout: 120_000 }, async (t) => {
  const run = await open('/games/centipede-ultimatum/?preview', DESKTOP);
  const { page } = run;
  await page.clock.install();
  await page.goto(page.url());
  await page.waitForSelector('#give');
  assert.equal(await page.$('[aria-live]:not(#announcer):not(.remaining)'), null, 'only the announcer (and the divide card\'s running total) is live');
  await page.evaluate(listenToAnnouncer);
  for (let lap = 0; lap < 3; lap++) {
    await page.evaluate(() => { window.__said = []; });
    await page.click('#give');
    for (let i = 0; i < 40 && !(await page.$('#give, #vote-2, #pass')); i++) await page.clock.runFor(700);
    await page.clock.runFor(200);
    const said = await page.evaluate(() => window.__said);
    assert.ok(said.length >= 1 && said.length <= 2, `lap ${lap}: ${said.length} announcements: ${said.join(' | ')}`);
    assert.match(said.at(-1), /your turn|Vote 0|you pass/);
    if (!(await page.$('#give'))) break;
  }
  // watching: one sentence per split, plus the start and the end
  await page.click('#watch-toggle');
  await page.evaluate(() => { window.__said = []; });
  for (let i = 0; i < 3000 && !(await page.$('#again')); i++) await page.clock.runFor(700);
  await page.clock.runFor(500);
  const said = await page.evaluate(() => window.__said);
  const splits = await page.$$eval('#log tfoot .tag', (tags) => tags.length);
  assert.ok(said.length <= splits + 2, `${said.length} announcements for ${splits} splits`);
  assert.match(said.at(-1), /Table over after round/); // may follow the last split's result
  await finish(t, run, 'centipede-announcer');
});

test('Centipede & Ultimatum: watching six bots runs to the end', { timeout: 120_000 }, async (t) => {
  const run = await open('/games/centipede-ultimatum/?preview', PHONE);
  const { page } = run;
  await page.clock.install();
  await page.goto(page.url());
  await page.click('#watch-toggle');
  for (let i = 0; i < 3000 && !(await page.$('#again')); i++) await page.clock.runFor(700);
  assert.ok(await page.$('#again'), 'the watched table ends');
  await finish(t, run, 'centipede-watch');
});

// ---------- The Wheel (Game 3, play-test) ----------
async function playWheel(page, label) {
  await page.clock.install();
  await page.goto(page.url()); // reload so the page's timers run on the test clock
  await page.waitForSelector('#pause');
  assert.equal(await page.$eval('#clock', (e) => e.textContent), '6:00', `${label}: the clock waits for Start`);
  assert.equal(await page.$eval('#stake', (e) => e.value), '500', `${label}: the play-test stake is 500 by default`);
  // the dials work from the keyboard, and keep focus while the clock runs
  await page.focus('#d-share');
  await page.keyboard.press('ArrowRight');
  assert.match(await page.$eval('#o-share', (o) => o.textContent), /6\/10/, `${label}: the share dial moved`);
  await page.click('#pause'); // Start
  await page.focus('#d-vote');
  await page.keyboard.press('ArrowRight');
  assert.match(await page.$eval('#o-vote', (o) => o.textContent), /clockwise 1/, `${label}: the vote dial moved`);
  await page.clock.runFor(5000);
  assert.equal(await focusId(page), 'd-vote', `${label}: focus stays on the vote dial as the clock runs`);
  // your vote fades back to 0, one step a second (Jason, 2026-11-09)
  assert.match(await page.$eval('#o-vote', (o) => o.textContent), /no vote/, `${label}: the vote faded back to 0`);
  assert.equal(await page.$eval('#d-vote', (k) => k.getAttribute('aria-valuenow')), '0', `${label}: the vote dial shows 0`);
  // the dials are round: a tap picks the bar under it (top of the Pass on dial is 5/10; the cap of the vote dial is 0)
  const tap = async (sel, fx, fy) => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); };
  await tap('#d-share', 0.5, 0.06);
  assert.match(await page.$eval('#o-share', (o) => o.textContent), /^5\/10/, `${label}: tapping the top of the Pass on dial picks 5/10`);
  await tap('#d-vote', 0.94, 0.5);
  assert.match(await page.$eval('#o-vote', (o) => o.textContent), /clockwise [56]/, `${label}: tapping the right of the vote dial votes clockwise`);
  await tap('#d-vote', 0.5, 0.5);
  assert.match(await page.$eval('#o-vote', (o) => o.textContent), /no vote/, `${label}: tapping the vote dial's cap stops voting`);
  // the fee and the boost made visible: where every 100 tokens go, and a receipt after your visit
  assert.match(await page.$eval('#fee-note', (e) => e.textContent), /Of every 100 that reach you, 42 go to the others/, `${label}: the split follows the Pass on dial`);
  assert.equal(await page.$$eval('#split-bar .split-seg', (s) => s.length), 3, `${label}: others, fee and you in the split`);
  const receiptText = await page.$$eval('#events li', (l) => l.map((x) => x.textContent).join(' | '));
  assert.match(receiptText, /Your \d+ s at the white arrow: \d+ reached you( \(\d+ reward, \d+ in shares from others\))?\. You passed on \d+, and the fund added \d+ to it; the fee took \d+; you kept \d+\./, `${label}: a receipt for your visit (${receiptText})`);
  // the picture follows the white arrow by default (Jason, 2026-11-09), or the black arrow, or anyone
  assert.equal(await page.$eval('#flow-focus', (s) => s.value), 'white', `${label}: follows the white arrow by default`);
  const marked = () => page.$$eval('#seats .seat.focused', (g) => g.map((x) => x.dataset.id));
  const holder = (cls) => page.$$eval(`#seats .seat-ring.${cls}`, (r) => r.map((x) => x.closest('.seat').dataset.id));
  assert.deepEqual(await marked(), await holder('receiving'), `${label}: the seat at the white arrow is the one followed`);
  await page.selectOption('#flow-focus', 'black');
  assert.deepEqual(await marked(), await holder('paying'), `${label}: following the black arrow marks the seat paying 9`);
  const other = await page.$eval('#flow-focus', (s) => s.options[4].value);
  await page.selectOption('#flow-focus', other);
  assert.deepEqual(await marked(), [other], `${label}: the followed bot is marked`);
  await page.selectOption('#flow-focus', 'white');
  assert.match(await page.$eval('#clock', (e) => e.textContent), /^5:5\d$/, `${label}: the clock runs`);
  // Pause, then Step moves on exactly one second
  await page.click('#pause');
  const before = await page.$eval('#clock', (e) => e.textContent);
  await page.click('#step');
  const after = await page.$eval('#clock', (e) => e.textContent);
  const secs = (x) => Number(x.split(':')[0]) * 60 + Number(x.split(':')[1]);
  assert.equal(secs(before) - secs(after), 1, `${label}: Step moves on one second`);
  await page.click('#pause'); // Play
  await page.selectOption('#speed', '8');
  for (let i = 0; i < 100 && !(await page.$('#again')); i++) await page.clock.runFor(5000);
  assert.ok(await page.$('#again'), `${label}: the table ends`);
  const end = await page.$eval('.end-card', (e) => e.textContent);
  assert.doesNotMatch(end, /undefined|NaN/, `${label}: end card`);
  assert.match(end, /Who was the hero/, `${label}: end card asks the hero question`);
  // the what-if replays your table with one other Pass on setting (Jason, 2026-11-09); the page logs
  // an error (failing this test) if replaying your own dials doesn't reproduce your table
  assert.match(await page.$eval('.what-if', (e) => e.textContent), /passing on (8|5)\/10 to everyone all the way through: you'd have ended with \d/, `${label}: the what-if`);
  // what this table showed: moments with ideas and their sources
  const showed = await page.$eval('.showed', (e) => e.textContent);
  assert.doesNotMatch(showed, /undefined|NaN/, `${label}: what this table showed`);
  assert.ok((await page.$$('.showed .moment')).length >= 1, `${label}: at least one moment`);
  // achievements: the card under the end card, and the strip at the top (Jason's play-test stake, 500)
  assert.match(await page.$eval('#extras', (e) => e.textContent), /Achievements[\s\S]*Six minutes, bonus and all[\s\S]*Who was the hero\?/, `${label}: the achievements card`);
  assert.match(await page.$eval('#ach-progress', (e) => e.textContent), /\d of 6/, `${label}: the achievements strip`);
  // what the bots learned: one entry for each bot, with no gaps in the words
  const learned = await page.$$eval('.learned > ul > li', (l) => l.map((x) => x.textContent));
  assert.equal(learned.length, 5, `${label}: five bots in What the bots learned`);
  for (const l of learned) assert.doesNotMatch(l, /undefined|NaN|@\[/, `${label}: ${l}`);
  // your account in full: the lines add up to what you end with (Jason, 2026-11-09)
  const acct = await page.$$eval('.ledger tbody tr td', (tds) => tds.map((td) => td.textContent));
  const num = (x) => Number(x.replace(/\u2212/g, '-').replace(/[^0-9+-]/g, '').replace(/^\+/, ''));
  const total = num(acct.at(-1).split('(')[0]);
  const sub = acct.findIndex((x, i) => i > 0 && !/^[+\u2212]/.test(x) && x !== '0');
  const sum = (a) => a.reduce((x, y) => x + num(y), 0);
  assert.equal(sum(acct.slice(0, sub)), num(acct[sub]), `${label}: the account adds up before the split (${acct.join(' | ')})`);
  assert.equal(num(acct[sub]) + sum(acct.slice(sub + 1, -1)), total, `${label}: the account adds up to what you end with`);
  assert.equal(total, num(await page.$eval('#mine', (e) => e.textContent)), `${label}: the account ends with your tokens`);
  const rows = await page.$$eval('#scoreboard tbody tr', (r) => r.length);
  assert.equal(rows, 6, `${label}: six seats on the scoreboard`);
}

for (const setup of [DESKTOP, PHONE]) {
  test(`The Wheel: a whole table at ${setup.name}`, { timeout: 180_000 }, async (t) => {
    const label = `wheel-${setup.name}`;
    const run = await open('/games/wheel/?preview', setup);
    await playWheel(run.page, label);
    await noSidewaysScroll(run.page, label);
    await axeCheck(run.page, label);
    await clickBringsUpTable(run.page, '#again', `${label} New table`);
    await finish(t, run, label);
  });
}

test('The Wheel: locked without the Game 2 achievements, open with ?preview', async (t) => {
  const run = await open('/games/wheel/', DESKTOP);
  assert.ok(await run.page.$('.locked-card'), 'locked without achievements');
  await finish(t, run, 'wheel-locked');
});

test('The Wheel: watching six bots runs to the end', { timeout: 120_000 }, async (t) => {
  const run = await open('/games/wheel/?preview', PHONE);
  const { page } = run;
  await page.clock.install();
  await page.goto(page.url());
  await page.click('#watch-toggle');
  assert.equal(await page.$('#d-share'), null, 'no dials when watching');
  await page.click('#pause');
  await page.selectOption('#speed', '8');
  for (let i = 0; i < 100 && !(await page.$('#again')); i++) await page.clock.runFor(5000);
  assert.ok(await page.$('#again'), 'the watched table ends');
  await finish(t, run, 'wheel-watch');
});
