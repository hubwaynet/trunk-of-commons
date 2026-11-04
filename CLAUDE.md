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
- `src/ui/site.css` holds the shared tokens, site bar and footer. Each game adds its own `src/ui/<game>/style.css` and `main.js`.
- `games/_template/` is the starting page for a new game. `games/index.html` redirects home until a games list page exists.
- There is no build step for the site: GitHub Pages serves ES modules from `main`. `npm run preview` bundles one game into `dist/<game>.html` for sharing as a claude.ai artifact (dist/ is gitignored).
- Tests: `npm test` (node:test).

## Game 1, Rising Pool (done, Nov 2026)

These are the key rules settled with Jason:

- The Commons is a finite reserve of 120. It pays top-ups and takes failed pools. When it can't cover a full top-up, the season ends.
- Players must pay in full. A player who can't afford a level drops to the highest one they can afford, marked ↓ in the round log.
- Points carry between tables (stored in the browser). Joining a table needs 20; otherwise "Start over".
- Reputation uses a fixed threshold: green if the player's average choice is at least medium. Relative reputation is reserved for a later, more complex game.
- There are five achievements, ordered easiest to hardest by simulated odds. Earning all five plays fireworks and unlocks Game 2. The check uses localStorage key `trunk.risingPool.achievements`.

## Next

Game 2 is Centipede & Ultimatum, from the TrunK of Commons notes (2018). Game 3 is the Wheel of Fortune, which needs headless simulation first. After that comes the larger framework (token economy, governance), followed by legal review and onboarding.
