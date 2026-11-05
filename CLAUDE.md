# Trunk of Commons: notes for AI agents

Educational social dilemma games. Jason Lee Lasky directs the design and does not write code; agents build, Jason plays and steers. Explain changes in plain words, not code.

## Conventions

- **Licences:** code AGPL-3.0-only (SPDX line at the top of each JS file); content, rules and docs CC BY-SA 4.0.
- **Commits:** author `Jason Lee Lasky <56460062+hubwaynet@users.noreply.github.com>`, with a `Co-authored-by:` trailer naming the agent. See CONTRIBUTING.md.
- **Spelling:** Australian English in player-facing copy.
- **Design decisions** go in `docs/design/<game>.md`, with the date and who decided. Simulation findings go there too.

## Architecture

- `src/engine/` holds pure rules with no DOM and no randomness. The same code is meant to run as a server referee for multiplayer later.
- `src/bots/` holds strategy bots. Each one has `label`, `family`, `summary`, `tell` (how it looks in the round log) and `create(rng)` returning `choose(view)`, plus optional `stay(view)` and `possible(view)` for random strategies. Bots see only `botView`. Use the supplied rng, never Math.random.
- `src/bots/evidence.js` replays a finished table to find every strategy consistent with each bot's moves. "Read the table" scores guesses by evidence, not by exact match.
- `src/ui/site.css` holds the shared tokens, site bar and footer. `src/ui/games.css` and `src/ui/common.js` hold what every game page shares: the table, panel, log and debrief styles; markup helpers; seat names and colours; toasts; the achievements strip, card and store. `focus.js`, `fireworks.js` and `progress-store.js` are shared too. Each game adds its own `src/ui/<game>/style.css` and `main.js`, plus a pure `achievements.js` (no DOM) that tests and simulators can use. Build shared features once, in the shared files.
- `games/_template/` is the starting page for a new game. `games/index.html` redirects home until a games list page exists.
- There is no build step for the site: GitHub Pages serves ES modules from `main`. `npm run preview` bundles one game into `dist/<game>.html` for sharing as a claude.ai artifact (dist/ is gitignored).
- Tests: `npm test` (rules, bots, achievements) and `npm run test:ui` (plays whole tables of both games in headless Chromium at desktop/light and phone/dark; fails on page errors, sideways scroll, lost keyboard focus or new accessibility problems). Run both before pushing to `main`. The UI test needs Playwright; tables are seeded, so `UI_SEED=n npm run test:ui` replays a failure. Known accessibility issues awaiting Jason are listed at the top of the test.

## Game 1, Rising Pool (done, Nov 2026)

These are the key rules settled with Jason:

- The Commons is a finite reserve of 120. It pays top-ups and takes failed pools. When it can't cover a full top-up, the season ends.
- Players must pay in full. A player who can't afford a level drops to the highest one they can afford, marked ↓ in the round log.
- Points carry between tables (stored in the browser). Joining a table needs 20; otherwise "Start over".
- Reputation uses a fixed threshold: green if the player's average choice is at least medium. Relative reputation is reserved for a later, more complex game.
- There are five achievements, ordered easiest to hardest by simulated odds. Earning all five plays fireworks and unlocks Game 2. The check uses localStorage key `trunk.risingPool.achievements`.

## Game 2, Centipede & Ultimatum (playable, Nov 2026)

- **The current rules are summarised at the top of `docs/design/centipede-ultimatum.md`.** The rest of that file is a dated decision log.
- Engine options (`createGame`) default to Jason's decisions. Older variants are kept as options so simulations can compare them.
- Bots: 11 strategies with social voting (solidarity, turn-taking, dominance, grudges, free-rider sanctions). They read everything from `botView`, which also computes free riders.
- Simulators: `tools/sim-centipede.mjs` (bot tables) and `tools/sim-centipede-achievements.mjs` (learner styles for the human seat, including Jason's exploit patterns: coalition, dominator, skimmer).
- Locked behind the five Rising Pool achievements; `?preview` opens it (Jason is fine with this). Six achievements; all six unlock Game 3. Unlocks are permanent and stored by `src/ui/progress-store.js`; each game's Reset clears only its achievements.
- No rematch or choosing the bots, because either could be gamed (Jason, 2026-11-06).
- Changes go straight to `main` with Jason's agreement (since 2026-11-05, confirmed 2026-11-06). Run `npm test` and `npm run test:ui` first. The `game-2-centipede-sim` branch mirrors main.

## Next

First, the decisions from the 2026-11-06 review, logged in both design docs under "Review decisions". Build them in this order:

1. An automatic play-through test of both games.
2. Move the code both games share into one place.
3. The decided features, built once for both games. Jason sees announcer wording and debrief drafts before they go live.

Then Game 3, the Wheel of Fortune, which needs headless simulation first. After that comes the larger framework (token economy, governance), followed by legal review and onboarding.
