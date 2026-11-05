# Contributing

## Attribution convention

This project is written with AI agents under human direction, and the history says so.

- **Author of record:** Jason Lee Lasky (`56460062+hubwaynet@users.noreply.github.com`).
- **AI co-authors:** each commit an agent writes ends with a `Co-authored-by:` line naming that agent, for example `Co-authored-by: Claude <noreply@anthropic.com>`.
- **Review:** Jason directs every change and plays it on the live site. Since 2026-11-05, with his agreement (confirmed 2026-11-06), agents push straight to `main` once `npm test` passes. Other contributors open pull requests.

## Bots

New strategies are welcome. A strategy is a small object in `src/bots/` with a `label`, a one-sentence `summary` a learner can understand, and a `create(rng)` function returning `choose(view)` and optionally `stay(view)`. Bots see only public information from finished rounds (`botView`). Use the supplied `rng`, never `Math.random`, so games replay exactly from their seed.

## Rules changes

Rules live in `src/engine/` and are tested in `tests/`. If you change a rule, record the reason in `docs/design/`.
