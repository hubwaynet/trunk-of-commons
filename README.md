# Trunk of Commons

Educational, entertaining, iterated social dilemma games about trust, cooperation, reputation and the commons.

**Play it:** [hubwaynet.github.io/trunk-of-commons](https://hubwaynet.github.io/trunk-of-commons/) · Game 1: [Rising Pool](https://hubwaynet.github.io/trunk-of-commons/games/rising-pool/) · Game 2: [Centipede & Ultimatum](https://hubwaynet.github.io/trunk-of-commons/games/centipede-ultimatum/)

Visitors learn by playing against strategy bots in the browser, then progress to harder games. Multiplayer comes later as a progressive web app. The games began as design notes by Jason Lee Lasky in 2017–18 (*TrunK of Commons* and the *Wheel of Fortune Sharing Game*) and are being rebuilt from 2026.

## Games

| # | Game | Dilemma | Status |
|---|------|---------|--------|
| 1 | **Rising Pool** (working title) | Threshold public good with rising stakes | Playable |
| 2 | **Centipede & Ultimatum** | Take the pool or keep building; divide it and face judgement | Playable (unlocked by Game 1) |
| 3 | Wheel of Fortune (placeholder name) | Real-time redistribution, sharing incentives, privilege as latency | Design & simulation |

Games 1 and 2 are the learning levels. Game 3 is unlocked by achievements and is designed with bot simulation first.

## Run it

No build step. Serve the folder and open the game:

```sh
python3 -m http.server 8000
# then http://localhost:8000/games/rising-pool/
```

Tests (Node 20+): `npm test`. Play-through of both games in a headless browser: `npm run test:ui` (needs Playwright with Chromium).

Single-file preview for sharing: `npm install && npm run preview` writes `dist/rising-pool.html`.

## Structure

```
src/engine/   Pure game rules and seeded randomness. No DOM. Will also run server-side as the multiplayer referee.
src/bots/     Strategy bots, readable and forkable. Bots are named at random per table.
src/ui/       Browser interface for each game.
games/        One page per game (served directly by GitHub Pages). games/_template/ is the starting point for a new game;
              games/index.html redirects to the home page until a games list exists.
src/ui/site.css  Shared tokens, type, site bar and attribution footer used by every page.
docs/design/  Rule decisions, open questions and simulation findings.
tests/        Engine tests.
```

## Licensing

- **Code** (everything under `src/`, `tools/`, `tests/`, and the scripts in `games/`): [GNU AGPL-3.0](LICENSE). If you run a modified version as an online service, you share your changes.
- **Content** (game rules, narratives, educational copy, artwork, `docs/`): [CC BY-SA 4.0](LICENSE-CONTENT.md).

## How this is made

Jason Lee Lasky directs the design. Code is written with AI agents, and every commit says so: Jason is the author of record, and the agent that wrote the change is credited with a `Co-authored-by` line. With Jason's agreement, changes go straight to `main`, which is the live site, once the tests pass (2026-11-06). See [CONTRIBUTING.md](CONTRIBUTING.md).

Made in the Northern Rivers, NSW. [hubway.net](https://hubway.net)
