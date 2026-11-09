# Trunk of Commons: notes for AI agents

Educational social dilemma games. Jason Lee Lasky directs the design and does not write code; agents build, Jason plays and steers. Explain changes in plain words, not code.

## Conventions

- **Licences:** code AGPL-3.0-only (SPDX line at the top of each JS file); content, rules and docs CC BY-SA 4.0.
- **Commits:** author `Jason Lee Lasky <56460062+hubwaynet@users.noreply.github.com>`, with a `Co-authored-by:` trailer naming the agent. See CONTRIBUTING.md.
- **Spelling:** Australian English in player-facing copy.
- **Design decisions** go in `docs/design/<game>.md`, with the date and who decided. Simulation findings go there too.

## Architecture

- `src/engine/` holds pure rules with no DOM and no randomness. The same code is meant to run as a server referee for multiplayer later.
- `src/bots/` holds strategy bots. Each one has `label`, `family`, `summary`, `tell` (how it looks in the round log) and `create(rng)`. Bots see only `botView`. Use the supplied rng, never Math.random.
  - In Rising Pool, `create` returns `choose(view)`, plus optional `stay(view)`, and `possible(view)` for random strategies.
  - In Centipede & Ultimatum, it returns `turn`, `divide`, `assess` and `vote`, plus optional `stay`. `assess(view)` returns the vote and, for a 0, the reasons (shown to the player); `vote` is `assess(view).vote`, so build new judging habits inside `assess`.
  - In the Wheel of Fortune (Game 3, working title), it returns `decide(view)`, called every second, giving `{ vote, share, people }`. Bots vote their wish even when they can't win alone (Jason, 2026-11-09), through `bring()`, `rescue()` and `steward()` in `src/bots/wheel-bots.js`; `steer()` is the older cost-aware holding. Bots stand in for human players: every bot learns and shows what it learned (Jason, 2026-11-09, decisions 24 and 26). Each keeps its character as its opening habit and learns, with its own temperament, from its own results lap by lap (`experience()`, where the fees show up) and from other players' reactions (being hurried past, what comes back). `decide` may return `note`, a sentence saying what it learned ("@[id]" stands for a player's name); the page shows it in What's happening and in "What the bots learned" on the end card. Keep a note on every learned change; each bot speaks at most once a lap (Jason, 2026-11-10, decision 33: `teach()` drops a second note in the same lap).
- `src/bots/evidence.js` replays a finished table to find every strategy consistent with each bot's moves. "Read the table" scores guesses by evidence, not by exact match.
- `src/ui/site.css` holds the shared tokens, site bar and footer. `src/ui/games.css` and `src/ui/common.js` hold what every game page shares: the table, panel, log and debrief styles; markup helpers; seat names and colours; toasts; the achievements strip, card and store. `focus.js`, `fireworks.js` and `progress-store.js` are shared too. Each game adds its own `src/ui/<game>/style.css` and `main.js`, plus a pure `achievements.js` (no DOM) that tests and simulators can use. Build shared features once, in the shared files.
- `games/_template/` is the starting page for a new game. `games/index.html` redirects home until a games list page exists.
- There is no build step for the site: GitHub Pages serves ES modules from `main`. `npm run preview` bundles one game into `dist/<game>.html` for sharing as a claude.ai artifact (dist/ is gitignored).
- Tests: `npm test` (rules, bots, achievements) and `npm run test:ui` (plays whole tables of all three games in headless Chromium at desktop/light and phone/dark; fails on page errors, sideways scroll, lost keyboard focus or new accessibility problems). Run both before pushing to `main`. The UI test needs Playwright; tables are seeded, so `UI_SEED=n npm run test:ui` replays a failure. Known accessibility issues awaiting Jason are listed at the top of the test.

## Game 1, Rising Pool (done, Nov 2026)

These are the key rules settled with Jason:

- The Commons is a finite reserve of 120. It pays top-ups and takes failed pools. When it can't cover a full top-up, the season ends.
- Players must pay in full. A player who can't afford a level drops to the highest one they can afford, marked ↓ in the round log.
- Points carry between tables (stored in the browser). Joining a table needs 20; otherwise "Start over".
- Reputation uses a fixed threshold: green if the player's average choice is at least medium. Relative reputation is reserved for a later, more complex game.
- There are five achievements, ordered easiest to hardest by simulated odds. Earning all five plays fireworks and unlocks Game 2. The check uses localStorage key `trunk.risingPool.achievements`.

## Game 2, Centipede & Ultimatum (done, Nov 2026)

- **The current rules are summarised at the top of `docs/design/centipede-ultimatum.md`.** The rest of that file is a dated decision log.
- Engine options (`createGame`) default to Jason's decisions. Older variants are kept as options so simulations can compare them.
- No last round (Jason, 2026-11-08). When fewer than three players can afford the amount, the pool goes to a **closing split**, divided by the next player in turn. If it's welcomed and three or more can then afford the next round, play carries on; otherwise the table is over. A cooperative table can now run the Commons dry, at about 1 fair table in 4 or 5. When it does, the debrief says so ("Rules for what may be taken", Ostrom).
- Simulators also include `tools/sim-centipede-ending.mjs`, which compares the ways a table can end.
- Bots: 11 strategies with social voting (solidarity, turn-taking, dominance, grudges, free-rider sanctions). They read everything from `botView`, which also computes free riders.
- Simulators: `tools/sim-centipede.mjs` (bot tables) and `tools/sim-centipede-achievements.mjs` (learner styles for the human seat, including Jason's exploit patterns: coalition, dominator, skimmer).
- Locked behind the five Rising Pool achievements; `?preview` opens it (Jason is fine with this). Six achievements; all six unlock Game 3. Unlocks are permanent and stored by `src/ui/progress-store.js`; each game's Reset clears only its achievements.
- No rematch or choosing the bots, because either could be gamed (Jason, 2026-11-06).
- Changes go straight to `main` with Jason's agreement (since 2026-11-05, confirmed 2026-11-06). Run `npm test` and `npm run test:ui` first. The `game-2-centipede-sim` branch mirrors main.

## Next

Games 1 and 2 are done for now: bots with strategies and the educational debrief are enough (Jason, 2026-11-08). The decisions from the 2026-11-06 review are logged in both design docs under "Review decisions", and all are built. Colour must never be the only cue on any table (Jason, 2026-11-06): use shape or line style and a word as well (rings, chips, tags), and check new visuals in greyscale.

Later, with many players at many tables, the commons may need connecting between tables, alongside player profiles that carry between tables (Jason, 2026-11-08). Ostrom's eighth design principle, nested layers of organisation, may be a guide (agent's note, not decided).

Then Game 3, the Wheel of Fortune (working title). Its core rules are settled and simulated, and a first play-test page is up at `games/wheel/?preview` for Jason's feedback from play (2026-11-09): `src/engine/wheel.js` (ticks of one second, parcels with travel times, amounts in hundredths), `src/bots/wheel-bots.js`, `tools/sim-wheel.mjs` (modes `bots`, `dilemma`, `stakes`, `split`, `stake`, and `votes`, `floors`, `smart`, `learning`, which re-run the design doc's tables with the bots of their time from `tools/wheel-bots-then.mjs`) and `tests/wheel.test.mjs`. Read `docs/design/wheel-of-fortune.md` first: decisions, the core as built, findings and what's open. Settled with Jason: stake 1,000 (the play-test page offers 500, 550, 650, 800 or 1,000, with 500 by default: Jason, 2026-11-10, decision 29), six minutes or until someone can't pay, sharing with yourself counts as keeping, the boost fund is shared out at full time by sharing, in proportion to the part of what reached each player that they passed on (Jason, 2026-11-09, decision 27; equal shares before), momentum is too strong for one player to turn the wheel back (more than 9), votes add to the speed with the wheel's turn and slow it against (never below 2° a second; Jason kept it, 2026-11-10), and a vote costs a quarter token per degree a second with the wheel and a token against it, so pinning an arrow costs more than it gains. Steering bots hold an arrow back only when that pays (`holdPays`); there is no pinned-player protection (Jason, 2026-11-09, decisions 21-23). The page is `src/ui/wheel/main.js` with round dials in `src/ui/wheel/knob.js`; `npm run test:ui` plays it too. After Jason's first play (decisions 14-20): You sit at the bottom, your vote fades back to 0 one step a second, votes are big curved arrows, each sender's shares run in their own lane, the boost fund sits in the hub, the ending plays out from `s.ending` (recorded by the engine, no rule change), and the end card shows each account from `ledger(s, id)`. After his second play (decision 28), the picture follows the white arrow by default (Follow: the white arrow, the black arrow, everyone alike, or one player). Receipts make no comparisons; the end card has a what-if that replays your table with one other Pass on setting (decision 32). Six achievements (`src/ui/wheel/achievements.js`, odds from `tools/sim-wheel-achievements.mjs`) count at the 500 stake; all six show "The Wheel mastered" and unlock nothing yet. "What this table showed" (`src/ui/wheel/moments.js`) names up to three moments with checked sources; the design doc lists the candidates not used and why. The first rule's finding (votes never changed the wheel) led to decisions 21-23. After that comes the larger framework (token economy, governance), followed by legal review and onboarding.
