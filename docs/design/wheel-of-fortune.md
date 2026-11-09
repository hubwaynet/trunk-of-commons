# Wheel of Fortune: design notes

**Working title.** "Wheel of Fortune" is also the name of a famous TV game show, so the game needs its own name before launch (Jason's call, with the legal review).

**Sources:**
- *Wheel of Fortune Sharing Game*, 2017-11-19, in the claude.ai project.
- Game 3 ("multiplayer iterated") in *TrunK of Commons*, 2018-08-07.

**Status, 2026-11-09: core rules settled and simulated; no page yet.** The first five questions are answered (see "Decisions" below). A pure engine (`src/engine/wheel.js`), eight bots (`src/bots/wheel-bots.js`), a simulator (`tools/sim-wheel.mjs`) and tests (`tests/wheel.test.mjs`) are on main. The first findings and the proposals waiting for Jason are at the end of this file. As in the other design logs, each decision has its date and who decided.

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

## Lessons from Game 2's ending (2026-11-08)

- **How a table ends shapes the whole game.** Game 2's fixed last round felt abrupt. Playing on to a natural end brought back long, dull tails. And the money sitting in the pool made "can players still pay?" the wrong test. Simulate the ending early.
- **A cooperative group can drain a shared reserve.** Once Game 2's tables could carry on, the Commons ran dry at about 1 fair table in 4 or 5. Measure reserve exhaustion and stuck pools in Game 3's simulations from the start.

## Later (Jason, 2026-11-08)

With many players at many tables, the commons may need connecting between tables, alongside player profiles that carry between tables. This is not for Game 3's first version, but it bears on question 6 (reputation carrying over) and question 7 (points between tables).

## Questions to settle with Jason

These were the prompts for the first session. Questions 1-5 are answered (see "Decisions"). The others wait until the simulator has something to show (Jason, 2026-11-09: "start with your suggestions and iterate as we learn").

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

## Decisions (2026-11-09)

1. **Time** (Jason). The engine works in ticks of one second for the accounting. Every token movement is a parcel with a departure and an arrival tick, so the page can draw it as a smooth stream that arrives on time. Jason: "Tick is fine for accounting but more movement than 1 per second is required for moving rewards & shared points ... a smooth animation requiring more steps to appear as a stream." Whether the page's clock runs by itself (with Pause and Step) or waits is for the page session; the agent's leaning is a running clock with Pause and Step.
2. **A small core first** (Jason), "for observation with automated settings": the wheel and seats, collection on the black side, the reward to the white arrow, the two share dials with shares passing on, the fee and the boost, rotation votes with **0 allowed**, a minimum wheel speed and transit times. The rest of 2017 is added one mechanic at a time and kept only if it changes behaviour.
3. **The stake is raised** (Jason: "why not increase minimum starting tokens/points for a longer lasting table?"), to a value the simulation sets. The 2017 stake of 100 can't last: the seat at the black arrow pays 9 a second, 90 tokens per pass.
4. **Six seats** for now, you and five bots, or six bots to watch (Jason). The engine takes any number. **The people dial counts people** (just me, me and the nearest one, ... everyone), because 10% of six is 0.6 of a person; the boost stays proportional, 10% for everyone (Jason).
5. **Length and ending** (Jason): at most 6 minutes (360 ticks), or the moment a player can't pay what the black side collects. Jason also asked for the completion bonus to be considered (see the findings: as written it does nothing).
6. **Scoring** (Jason): your own tokens at the end against your stake, with the table's results beside it (did it last, the poorest player, how much you shared). The debrief asks 2017's question: who was the hero? Jason: "make this an evolution on game 2 and focus on looking for the dilemma, to optimise the game rules to make it an educational & fun experience ... start with your suggestions and iterate as we learn."
7. **Invitations come later, after reputation** (agent's proposal, accepted in passing by Jason, who raised it: "Players gain a reputation. Sharing players would invite like minded players. So too exploiters might to gang up?"). For the first version you start the table and sit at the white arrow, and the bots join in a seeded order. Later: you invite one bot from a short line-up showing reputations, and each bot invites the next by its leanings, so sharers draw sharers and exploiters gangs. This needs a decision against the 2026-11-06 rule "no choosing the bots".
8. **Sharing rewards is Game 3's main lesson** (Jason): "Sharing rewards is an extended lesson in game 3, for the common good, compared to game 2, which had it a little to last the distance."

## The core as built (2026-11-09)

- **Seats** by join order: the initiator at the white arrow, then alternating sides, the last to join at the black arrow (six players sit at seats 0, 1, 5, 2, 4, 3).
- **Each second:** votes are paid into the boost fund and their sum sets the direction (any net vote turns the wheel round) and speed (at least 6° a second); the seat holding the black arrow pays 9 and its two neighbours 1 each into the reward; the wheel turns; parcels due arrive.
- **The reward** takes 2 seconds to cross and lands on whoever is at the white arrow when it arrives.
- **Receiving:** each player's arrivals for the second are added up and settled once. They pass on (share dial) tenths to the nearest people (people dial), keep the rest and pay the 2017 fee on what they keep (95% when keeping everything, otherwise 100% minus the share). The boost fund adds up to 10% to what's shared, in proportion to the people reached. Shares travel 45° a second round the rim: 2, 3 or 4 seconds at six seats.
- **Ending:** at 360 seconds, or when anyone can't pay. Rewards still crossing are forfeited to the boost fund; shares still travelling complete with settings frozen (2017).
- **Accounting** is in hundredths of a token, and every test table conserves every token exactly.
- **Options kept for comparison:** `minVote: 1` (2017's no neutral), `reverseAbove: 6` (2017 momentum), `selfShare: 'cascade' | 'kept'`, `endBonus: 'none' | '2017' | 'refund'`, and the collection amounts, speeds, stake and length.

**Bots** (the roster from question 8, as a starting point): Sharer (8/10 to everyone), Keeper (keeps all), Free Rider (shares half, but only with itself), Self-Steerer (pays to hold the white arrow on itself, shares half), Patron (steers towards whoever else shares most, shares 7/10), Lifeguard (steers towards the poorest, shares 7/10), Reciprocator (matches the others' average sharing), Opportunist (9/10, dropping to half while it holds the white arrow). Steerers pay only when the wheel would carry the arrow out of the target's segment, and only as much as it takes; they don't pay for a vote that can't win.

**Learner styles** for the human seat (`LEARNERS` in the simulator) play fixed settings, so results compare cleanly. The `dilemma` mode plays each style alone against five random bots, and at a table of six of the same style.

## Simulation findings (2026-11-09)

Stake 600, 6 minutes, `selfShare: 'kept'` unless marked. 1,000 tables per style unless marked. Nets are tokens at the end minus the stake. Reproduce with `node tools/sim-wheel.mjs 1000 dilemma '{"selfShare":"kept"}'`.

| Your style | You vs five random bots: your net | Table lasted | Six of this style: net each | Lasted | Mean length |
|---|---|---|---|---|---|
| Shares half, steers to self (up to 9 a second) | +139 | 0% | -224 | 0% | 101 s |
| Shares half, steers to self (up to 3) | +105 | 0% | -107 | 0% | 81 s |
| Shares everything with everyone | -141 | 13% | 0 | 100% | 360 s |
| Shares 8/10 with everyone | -151 | 16% | -108 | 100% | 360 s |
| 9/10, half while at the white arrow | -152 | 17% | -220 | 100% | 360 s |
| Shares half with everyone | -226 | 14% | -354 | 100% | 360 s |
| Shares 7/10, steers to the poorest | -359 | 20% | -213 | 100% | 360 s |
| Keeps everything | -290 | 7% | -542 | 0% | 314 s |

1. **There is a real dilemma, and it is in steering.** Steering the white arrow to yourself pays you alone (+105 to +139), while a table where everyone does it goes bust within two minutes and everyone loses (-107 to -224). Sharing everything with everyone breaks even when everyone does it (0) but loses against the bots (-141). In prisoner's dilemma terms: temptation +105, reward 0, punishment -107, sucker -141.
2. **How steering wins.** The steerer collects while the white arrow is anywhere in its segment, so holding it costs about one token per reversal, every 10 seconds or so, against a reward of 11 a second. The black arrow is held on the seat opposite, which pays 9 a second until it goes bust, about a minute at a stake of 600. Every bot table with a Self-Steerer went bust (728 of 1,000); without one, 24% lasted the six minutes.
3. **The share dials are not a dilemma.** Sharing more pays you more as well, against the bots and among equals. The 2017 fee makes keeping simply a bad move. The Opportunist's trick (generous except at the white arrow) doesn't beat plain generosity.
4. **Loophole: sharing only with yourself.** As written (`selfShare: 'cascade'`), sharing everything with only yourself was the best style of all: +622 alone (400 tables). The slice for yourself comes back as incoming, earns a boost and pays no fee. With `selfShare: 'kept'`, your own slice counts as kept, and the same style is plain keeping (-204).
5. **The fee is a sink.** Over a full table the boost fund takes a third to over half of all stakes unless everyone shares nearly everything. When everyone shares half, each player loses 354 of 600 even though the table lasts. Nobody can come out ahead together, only at someone else's expense.
6. **The 2017 end bonus as written does nothing** (nets moved by 3 tokens at most), because it only boosts the few seconds of shares still travelling at the end. **A refund version works when it triggers:** at full time, the boost fund is shared equally, and the common fund adds the bonus as a % of each stake. Then cooperative tables come out ahead (six sharing everything +60 each, 8/10 +48, half +30). In mixed tables it rarely triggers, because the poorest usually ends below 10% of the stake. At a stake of 1,000 with the refund, bot tables without a Self-Steerer lasted 87% of the time, earned the bonus 86% of the time and lost nothing on average; tables with one lasted 9%.
7. **2017's momentum rule** (`reverseAbove: 6`) stops modest steerers altogether. Bots willing to pay 2-3 a second never vote again, because a reversal needs 7. A determined steerer (up to 9) still holds the arrow: +136 alone, and every table it sits at goes bust. So it takes steering out of most of the game without taking away the temptation.
8. **The stake** changes how long tables last, not who wins. Bot tables lasted the full time 0% (300), 1% (500), 7% (600), 22% (800) and 30% (1,000) of the time. The Self-Steerer gains more with a bigger stake (+66 at 300, +213 at 1,000), because the seat opposite lasts longer.
9. **Join order matters little.** The last to join starts at the black arrow and pays first, but the wheel brings everyone round within a minute. Over 1,000 bot tables: initiator -204, last to join -222.

## Proposals waiting for Jason (2026-11-09)

1. Close the self-share loophole: make `selfShare: 'kept'` the rule.
2. The economy: the refund version of the end bonus, with a stake of about 1,000, so a cooperative table can come out ahead and keeping the poorest alive is worth something to everyone.
3. Steering: what should stop a player holding the white arrow? Options to simulate: bots that counter-steer together against a holder (a coalition), the 2017 position delays (privilege as latency, which help the holder), or a rising cost for holding. The 2017 momentum rule alone is not recommended.
