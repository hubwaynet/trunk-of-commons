# Wheel of Fortune: design notes

**Working title.** "Wheel of Fortune" is also the name of a famous TV game show, so the game needs its own name before launch (Jason's call, with the legal review).

**Sources:**
- *Wheel of Fortune Sharing Game*, 2017-11-19, in the claude.ai project.
- Game 3 ("multiplayer iterated") in *TrunK of Commons*, 2018-08-07.

**Status, 2026-11-08: nothing is decided.** This file holds the 2017 rules in brief and the questions to settle with Jason. As CLAUDE.md says, the rules are tested in headless simulation before any page is built. Record each decision below with its date and who decided, as in the other design logs.

## The idea (2017)

"Turn a trickle into a cascade." The game plays out the dynamics of pyramid and Ponzi schemes, high-yield reinvestment programmes and trickle-down economics, which funnel benefits to a few. Players can turn those dynamics towards cooperative, more equitable, bottom-up outcomes, "allowing all players to survive and thrive."

The game also asks who the hero is: the player who shared the most and showed others the benefits, or the one who collected the most despite strong incentives to share?

## The 2017 rules in brief

**The wheel and the seats**
- The wheel has a white reward arrow, a black collection arrow opposite it, and grey arrows at 90° between them. Its face fades from white through grey to black.
- Players sit evenly around the wheel. Join order sets each seat: the initiator starts at the white arrow and the last to join at the black.

**Collection and reward**
- Players within 90° of the black arrow pay into the reward fund automatically: 9 tokens a second for the player at the black arrow, and 1 a second for those near the grey arrows on the black side. Part of a segment pays part of the amount.
- Everything in the reward fund goes to the player at the white arrow.

**Rotation votes**
- Every player votes a direction and a speed: 1 to 9 tokens a second, which turns the wheel 1° to 9° a second. There is no neutral, and the sum of the votes decides.
- Vote tokens go to the share boost fund.
- The wheel keeps a minimum momentum of 6° a second. Reversing it takes more than 6° a second of net votes the other way. The default direction is clockwise.

**Delays: privilege as latency**
- A vote takes effect after a delay: up to 1.5 seconds by position (darker seats wait longer), plus up to 1.5 seconds for an extreme vote.
- Dial moves are also speed-limited, and the dials have some momentum.

**Sharing**
- Each player has two dials: what share of the nearest players to share with (including themselves), and what share of their incoming rewards to share.
- Shares keep passing on until the fraction falls below 0.1 of a token.

**The share boost fund**
- It takes a fee on tokens a player keeps, and the fee falls as sharing rises:

| Sharing | Fee on kept tokens | The sharer keeps |
|---|---|---|
| 0% | 95% | 5% |
| 50% | 50% | 25% |
| 100% | none | — |

- It boosts sharing by 1% for each 10% of players shared with.

**Transit times**
- Rewards take 2 seconds to arrive, so they may land on a different player if the wheel moves meanwhile.
- Shares travel 45° a second round the rim.
- Boost-fund tokens take half a second to travel to or from a player.

**Ending and the end bonus**
- The game ends at its maximum time (6 minutes for 6 players) or when any player falls below 1 token.
- If it reaches the maximum time and the poorest player still holds at least 10% of the starting stake, the share boost distribution gets a bonus. The bonus runs from 2% (poorest holds 10–20%) to 10% (poorest holds 90% or more). Bigger tables add 1% for every 4 extra players.

**Levels**
- Tables of 6, 10, 14, 18, 22 and 26 players.
- A player moves up a level only after finishing a table at the maximum time.

**Stakes and the common fund**
- Each player stakes 100 tokens at a 6-player table, and more at bigger ones.
- What's left in the game's boost fund goes to a common fund that helps start and finish future games.

**Reputation and indicators**
- Each player's reputation disc is green if they share more than the table average, and magenta if less. This is relative reputation.
- The disc's final colour carries into the player's next game.
- Two bars show each player's share settings: yellow to red for the share of players, and cyan to blue for the share of tokens.
- The disc also shows the direction of the player's rotation vote.

## What's ready in the code (2026-11-08)

- **The unlock.** `isUnlocked('wheel')` is set when a player earns all six Game 2 achievements. The home page's Level 3 card says "In design".
- **Shared page parts:**
  - `src/ui/common.js` and `src/ui/games.css`
  - the screen-reader announcer, `announce.js`
  - `focus.js`, `fireworks.js` and `progress-store.js`
  - `ideas.js`, plus each game's `moments.js`, for the "What this table showed" card
  - the achievements store
  - the play-through test, `tests/ui.smoke.mjs`
  - the starting page, `games/_template/`
- **Patterns to copy:**
  - a pure engine whose `createGame` options keep older variants for simulations to compare
  - bots with `create(rng)`, reading only `botView`, with `assess()` returning a vote and its reasons
  - simulators with learner styles for the human seat (see `tools/`)
- **The seat palette.** The six seat colours come from the 2017 RGB colour wheel, one per seat at a six-player table. Review item M6 still applies: white numbers on chartreuse, orange and spring green fall below 4.5:1.
- **Accessibility rule.** Colour must never be the only cue (Jason, 2026-11-06). Use shape or line style, plus a word.

## Questions to settle with Jason

These are prompts for the first session, not decisions. Put them one at a time, each with a recommendation and the reason for it.

1. **Time.** Continuous seconds, as in 2017, or discrete ticks the engine steps through while the page animates them? The engine must stay pure and deterministic, so ticks fit naturally. One tick could stand for one 2017 second.
2. **How much of 2017 to keep at first.** The core is collection, reward, rotation votes, the two share dials, and the fee and boost. The extras are the position and vote delays, dial speed limits, momentum, transit times and the end bonus. Jason suspects the 2018 framework went too far with gamification. Simulate the core first, then add one mechanic at a time and keep only those that change how players behave.
3. **The table.** Six seats: you and five bots, or six bots to watch. That's the 2017 first level. Bigger tables later, or never?
4. **Stakes and length.** 2017 had 100 tokens and 6 minutes. What are they in ticks?
5. **Is there a real dilemma?** As written, a player who keeps everything gets only 5%, so not sharing may simply be a bad move rather than a temptation. The simulator should find whether hoarding, steering the wheel to yourself, or sharing wins, and at what settings the tension is real.
6. **Reputation.** Relative (above or below the table's average sharing), as in 2017. CLAUDE.md reserves relative reputation for a later game, and this is it. Does it carry to the next table? How does it sit alongside Game 2's four-state ring?
7. **Points between tables.** Game 1 carries them over; Game 2 doesn't.
8. **Bots.** A starting roster:
   - the sharer
   - the hoarder
   - the self-steerer, who turns the white arrow towards itself
   - the steerer towards the biggest sharer
   - the steerer towards the poorest player
   - the reciprocal sharer, who shares with those who share
   - the free rider
   - the opportunist, who shares until it holds the white arrow
9. **Lessons to name later,** on the "What this table showed" card. Candidates are the Matthew effect, trickle-down economics, Ponzi and pyramid dynamics, Rawls's difference principle (the end bonus follows the poorest player), and privilege as latency. Check each source before using it.
10. **The name,** before launch.
