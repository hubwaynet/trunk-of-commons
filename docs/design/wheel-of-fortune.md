# Wheel of Fortune: design notes

**Working title.** "Wheel of Fortune" is also the name of a famous TV game show, so the game needs its own name before launch (Jason's call, with the legal review).

**Sources:**
- *Wheel of Fortune Sharing Game*, 2017-11-19, in the claude.ai project.
- Game 3 ("multiplayer iterated") in *TrunK of Commons*, 2018-08-07.

**Status, 2026-11-09: core rules settled and simulated; a play-test page is up** (`games/wheel/?preview`), revised after Jason's first play (decisions 14-20). The first five questions are answered (see "Decisions" below). A pure engine (`src/engine/wheel.js`), eight bots (`src/bots/wheel-bots.js`), a simulator (`tools/sim-wheel.mjs`) and tests (`tests/wheel.test.mjs`) are on main. The first findings and the proposals waiting for Jason are at the end of this file. As in the other design logs, each decision has its date and who decided.

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
9. **The self-share loophole is closed** (Jason, 2026-11-09: "close the self-share loop hole"). The slice a player shares with themselves counts as kept (`selfShare: 'kept'` is now the default), so the fee and the boost follow only what reaches other people, and sharing only with yourself is keeping. 2017 as written stays available as `selfShare: 'cascade'`.
10. **The economy: the refund, and a stake of 1,000** (Jason, 2026-11-09: "ok Refund in equal shares, with a stake of 1,000"). At full time, if the poorest player still holds at least 10% of the stake, the game's boost fund is shared equally among the players and the common fund adds the 2017 bonus (2% to 10% of each stake, by the poorest player's share). A table that busts loses its fund. `endBonus: 'refund'` and `stake: 1000` are now the defaults. The agent's note: with the refund, the fee works like a deposit returned when the table finishes; six keepers finish 40 ahead, though keeping still loses against the bots (-229). Refunding by what each shared was the alternative; Jason kept equal shares, in line with 2018's equal Universal Distribution.
11. **Momentum too strong for one player to hold back** (Jason, 2026-11-09: "Make momentum too difficult for one player to hold back"). Turning the wheel back needs a net vote of more than 9, more than any one player can cast (`reverseAbove: 9`, the default). Momentum carries the arrow round to every seat, as Jason first conceived it ("When I first conceived this I thought momentum would swing the arrow around"); only two or more players together can turn it back. 2017's threshold of 6 was below one player's strongest vote (9), so one player could always reverse it alone and hold the arrow (100% of the time in simulation). The reversal-limit experiment was removed; the delays and `blackRun` stay as options for when gangs can hold the arrow.
12. **Both dials should count, and bots show their wish** (Jason, 2026-11-09: "I was hoping both dialing direction and sharing amount to be important to achieve the maximum time. Let's make sure they both count, even with bots. So yes, Bots show their wish."). Steering bots now vote their wish at the moments that matter to them, even when they can't win alone, so the player can see it and tip the balance: the Self-Steerer hurries the white arrow when it is next and holds it back while it has it; the Patron does the same for whoever else shares most; the Lifeguard hurries the black arrow past a player below four tenths of the stake, and the white arrow to them. The goal, not yet met: tune the rules so that both the direction dial and the share dial decide whether a table reaches six minutes with the bonus.
13. **Cheaper votes, and a page to play** (Jason, 2026-11-09: "Cheaper votes but with an eye to getting feedback from me, with testing how I can play with the bots. At this stage I did not experience the game, I'm only imagining it with the rules & players. Let's get this up for play to check feedback from play."). A vote now costs a quarter of a token a second per degree (`voteCost: 0.25`, the default). A first play-test page is at `games/wheel/` (open with `?preview` until the Game 2 achievements unlock it). Agent's choices for the play-test, for Jason to judge in play: a stake picker (650, 800 or 1,000; 650 by default, where both dials matter most in simulation; the engine default stays 1,000 from decision 10); your dials start at passing on half to everyone; the clock waits for Start, then runs a second a second with Pause, Step and speeds of 1x to 8x.

## The core as built (2026-11-09)

- **Seats** by join order: the initiator at the white arrow, then alternating sides, the last to join at the black arrow (six players sit at seats 0, 1, 5, 2, 4, 3).
- **Each second:** votes are paid into the boost fund and their sum sets the speed (at least 6° a second) and, if it is more than 9 against the wheel, turns it round (decision 11; it was any net vote at first); the seat holding the black arrow pays 9 and its two neighbours 1 each into the reward; the wheel turns; parcels due arrive.
- **The reward** takes 2 seconds to cross and lands on whoever is at the white arrow when it arrives.
- **Receiving:** each player's arrivals for the second are added up and settled once. They pass on (share dial) tenths to the nearest people (people dial), keep the rest and pay the 2017 fee on what they keep (95% when keeping everything, otherwise 100% minus the share). The boost fund adds up to 10% to what's shared, in proportion to the people reached. Shares travel 45° a second round the rim: 2, 3 or 4 seconds at six seats.
- **Ending:** at 360 seconds, or when anyone can't pay. Rewards still crossing are forfeited to the boost fund; shares still travelling complete with settings frozen (2017).
- **Accounting** is in hundredths of a token, and every test table conserves every token exactly.
- **Options kept for comparison:** `minVote: 1` (2017's no neutral), `reverseAbove: 6` (2017 momentum), `selfShare: 'cascade' | 'kept'`, `endBonus: 'none' | '2017' | 'refund'`, and the collection amounts, speeds, stake and length.

**Bots** (the roster from question 8, as a starting point): Sharer (8/10 to everyone), Keeper (keeps all), Free Rider (shares half, but only with itself), Self-Steerer (shares half; hurries the white arrow to itself and holds it back while it has it), Patron (shares 7/10; does the same for whoever else shares most), Lifeguard (shares 7/10; hurries the black arrow past a player below 4/10 of the stake, and the white arrow to them), Reciprocator (matches the others' average sharing), Opportunist (9/10, dropping to half while it holds the white arrow). Since decision 12 the steerers vote their wish even when they can't win alone (`bring` and `rescue`). The earlier cost-aware holding (`steer`, paying only when it makes a difference) is kept for learner styles and the older rules. Learner styles also include `steward`.

**Learner styles** for the human seat (`LEARNERS` in the simulator) play fixed settings, so results compare cleanly. The `dilemma` mode plays each style alone against five random bots, and at a table of six of the same style.

## Simulation findings (2026-11-09)

Stake 600, 6 minutes, `selfShare: 'kept'` (now the default) unless marked. 1,000 tables per style unless marked. Nets are tokens at the end minus the stake. Reproduce with `node tools/sim-wheel.mjs 1000 dilemma`.

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

1. ~~Close the self-share loophole~~: done (decision 9).
2. ~~The economy~~: done (decision 10).
3. ~~Steering~~: momentum too strong for one player (decision 11). The agent had recommended `blackRun: 10`; Jason chose momentum, his original design.

## Steering experiments (2026-11-09)

Rules as decided before decision 11 (stake 1,000, refund, self-share kept, any net vote turns the wheel). Bot tables: 1,000 per row. "Alone" is the learner style against five random bots, 300 tables each. Steering styles shown are "shares half, steers to self, up to 3 a second" / "up to 9". Reproduce with `tools/sim-wheel.mjs` options `{"reverseAbove":0,"delays":true}` and `{"reverseAbove":0,"blackRun":10}` (the reversal limit was removed); the resisting bots were a scratch experiment, not kept in the roster.

| Rule or habit | Bot tables lasted | Bonus earned | Self-Steerer bot | Steer to self, alone | Share everything, alone | Six who steer to self |
|---|---|---|---|---|---|---|
| None (as decided) | 30% | 28% | +244 | +181 / +230 | -37 | -178, bust in 139 s |
| Bots push back together (3 kinds, up to 4 a second, against anyone holding 12 of the last 20 s) | 20% | 17% | +202 | +169 / +79 | -75 | (no change) |
| Five kinds push back at up to 9 | 29% | 26% | +173 | +131 / +187 | -141 | (no change) |
| 2017 position and vote delays | 13% | 11% | +187 | +294 / +293 | -39 | -224 |
| Reversal limit: 120° between reversals (option removed) | 13% | 9% | +80 | +284 | +77 | -216 |
| Reversal limit: 180° | 20% | 9% | -33 | +57 | -34 | -313 |
| **Nobody pays the black arrow's 9 for more than 10 s in a row** (`blackRun: 10`) | **83%** | **78%** | +309 | +183 / +270 | **+103** | -213 / -365 |
| `blackRun: 10` and the 180° limit | 21% | 10% | -53 | +13 | -48 | -310 |

What the experiments show:

1. **Holding is cheap and pinning is deadly.** Holding the white arrow costs the holder about a token every 10 seconds; the seat held at the black arrow pays 9 a second until it goes bust, which ends the table for everyone.
2. **Pushing back doesn't work.** Bots that steer against a holder pay more than the holder does and still lose. That's the second-order free-rider problem: sanctioning is itself a public good (Ostrom; check the source before a card names it).
3. **2017's delays help the holder,** as expected: privilege as latency means the seat at the white arrow acts first. Not kept.
4. **A reversal limit moves the damage rather than stopping it.** The holder rocks the arrow across their half of the wheel, the far half pays, and the table busts later.
5. **Protecting the pinned player works.** After one natural pass (10 seconds at the minimum speed), a player held at the black arrow pays 1 a second instead of 9. Natural play is untouched; only pinning is affected. Tables survive a holder, the poorest player ends with a median 74% of the stake (from 0%), and sharing pays against the bots (+103 sharing everything, +83 sharing 8/10). The temptation is still there: holding gains +183 to +270 alone, and a table where everyone holds still goes bust (-213 to -365).

## Does the arrow swing round? (2026-11-09)

Jason asked whether players can stop the arrow swinging round the table. Share of seconds a steerer had the white arrow in its segment, 300 tables each (a fair share is 17%):

| Rule | Self-Steerer bot (pays up to 3) | Determined player (up to 9) | Seats the arrow reached per table |
|---|---|---|---|
| Any net vote turns the wheel (the first core) | 74% | 100% | 1.6 of 6 (Self-Steerer), 1.0 (determined) |
| 2017: turning back needs more than 6 | 17% | 100% | 6 of 6 / 1 of 6 |
| Turning back needs more than 9 (decision 11) | 17% | 17% | 6 of 6, about 6 laps |

## After decisions 9-11 (2026-11-09)

The rules now: stake 1,000, six minutes, self-share kept, the refund, momentum above one player's vote. Bot tables: 1,000; learner styles: 300 tables each.

- **Every bot table lasts the six minutes and earns the bonus**, and the poorest player ends with a median 92% of the stake. Nobody goes bust, and join order makes no difference (+47 to +53 by seat).
- **Steering is idle in one-player games.** No bot can turn the wheel back alone, so bots never pay to vote (0 votes per table). The vote dial only matters when two or more players act together, and no bot does that yet.
- **The share dial is now the dilemma, but a mild one.** At a stake of 1,000: alone against the bots, sharing half pays best (+102), 8/10 +76, everything -22, keeping -72; a table of six sharing everything does best (+100 each), 8/10 +90, half +70, keeping +40. That is the prisoner's dilemma order (temptation 102 > cooperation 100 > mutual defection 70 > the lone cooperator -22), but the temptation is only 2 tokens.
- **The stake is a cliff, not a dial.** At 600, bot tables last 68% of the time but the poorest ends near 0, so the bonus is almost never earned (4%) and everyone loses heavily (keepers go bust 41% of the time). At 700 and above, every table lasts and earns the bonus. Learner nets at 700: half alone +68, everything alone -58; six sharing everything +70, six sharing half +35.

## Making steering count (2026-11-09, after decision 12)

Learner styles against five random bots, 400 tables each; bot tables 1,000. "Bonus" means the table reached six minutes with the poorest above 10% of the stake, so the fund was refunded.

1. **With momentum above one player's vote, a vote can only speed the wheel up** (or cancel others' speed-ups). Collection is always 11 a second, so steering changes who pays and who receives, never the total.
2. **Selfish wishes drain the steerer and cost everyone the bonus.** At a stake of 700, 291 of 1,000 bot tables missed the bonus; in 269 of them the poorest player was the Self-Steerer, which paid 261 tokens a table in votes. Steering counts, but against the table.
3. **Rescuing at full price backfires.** A learner who hurries the arrows for the poorest player, or tries to turn the wheel back as the black arrow nears them, lowered both lasting and the bonus at every stake tried. A vote costs a token per degree, more than the rescue saves, and turning back sends the black arrow over the player who has just paid. Hurrying the white arrow to a poor keeper mostly feeds the fee.
4. **Cheaper votes stop the bots draining themselves.** With a vote at a quarter of the 2017 price (`voteCost: 0.25`, 1 token buys 4 degrees a second), every bot table at a stake of 700 lasts and earns the bonus.
5. **Stewarding helps when votes are cheap and stakes are tight.** A steward hurries the black arrow past a player in danger and hurries the white arrow past a player who passes on little (whose fee would swallow the reward). With `voteCost: 0.25`, a learner sharing half and stewarding at strength 9 earned the bonus at 39% of tables at a stake of 600 (12% without steering) and 62% at 650 (27%), but went bust more often (lasting fell by 5 to 15 points). A gentler steward (strength 4, keeping 35% in reserve) gained less (27% to 42% at 650) and didn't help generous sharers.
6. **Sharing counts clearly.** At a stake of 650 with `voteCost: 0.25`, the bonus rate for the learner's table by sharing: keep 8%, half 27%, 8/10 67%, everything 70%.

So far, sharing decides whether a table reaches six minutes with the bonus; steering mostly decides it against the table, and helps only modestly when votes are cheap.

## The play-test page (2026-11-09)

As first built; the dials, picture, ending and end card were revised after Jason's first play (decisions 14-20 below).

- **Where:** `games/wheel/index.html`, `src/ui/wheel/main.js` and `style.css`. Linked from the home page ("Level 3 · Play-test") and the site nav. `npm run preview` with `node tools/build-preview.mjs wheel --unlocked` bundles it for a claude.ai artifact.
- **The picture:** the wheel turns smoothly between seconds. The white arrow (reward) and black arrow (pays) are on the face, which fades from white to black. Rewards cross the middle as gold dots and shares run round the rim as blue dots; each stream of four dots arrives on the second the engine settles it. Seats show name, tokens, dials ("5/10 → 5" or "keeps all"), and "pays 9", "pays 1" or "receives", with a ring whose line style matches: dashed for paying, solid for receiving, so colour is never the only cue.
- **The panel:** time left, your tokens and net, who has each arrow and how fast the wheel turns, the poorest player against the bonus line (a tenth of the stake), the boost fund, Start/Pause, Step and speed. Three range dials (Pass on, Share with, Turn the wheel) with words beside them: what you keep after the fee, and what a vote costs and does. "What's happening" lists the white arrow's visits, bots' dial changes and votes, the wheel turning round, and the bonus coming under threat.
- **The table:** a scoreboard of every seat (tokens, dials, vote, rewards in, shared out, paid in). The end card says how the table ended and what happened to the boost fund, shows your result, reveals each bot's strategy, names the richest and the biggest giver, and asks who was the hero.
- **Screen readers:** the shared announcer speaks at the start, when either arrow reaches you, each minute, when the wheel turns round, when the bonus comes under threat, and at the end. The picture is one image with a title; the panel and scoreboard carry the same facts as text.
- **Tests:** `npm run test:ui` now plays a whole Wheel table at desktop/light and phone/dark (keyboard dials, focus kept while the clock runs, Step moves one second, no sideways scroll, axe), checks the lock, and watches six bots to the end.
- **Not built yet:** achievements and what they unlock, "What this table showed", reputation discs, invitations, points between tables.

## Jason's first play (2026-11-09)

Jason's feedback from playing the play-test page, and what was built:

> "The 3 dials should be dials with strength indicators to select from. The direction dial strength should decay strength back to neutral. Place You player at bottom. Increase size of the directional vote indicators for players in order for them to cooperate or go against. Separate the player share flows so we can see where they flow, how much, how far. The end game flows shut off immediately, and bonus boost is not seen. The end point tally ignores pre-split and boost numbers."

14. **Round dials with strength bars** (Jason). Pass on, Share with and Turn the wheel are knobs (`src/ui/wheel/knob.js`): a ring of bars that grow with strength, lit bars filled and unlit bars outlined. Tap a bar or drag round; the keyboard still works (they are sliders to assistive technology); a tap on the vote dial's cap stops voting. They sit beside the wheel on a desktop and under it on a phone, with Start, Step, speed and the clock in a bar under the picture.
15. **Your vote fades back to 0** (Jason). Agent's choice of rate, for Jason to judge in play: one step a second, so a 9 fades over 9 seconds and costs 11¼ tokens in all. It is a page rule for the human seat; bots choose their vote every second anyway.
16. **You sit at the bottom** (Jason). Seat 0 (you, or the first to join when watching) is drawn at the bottom; the white arrow starts there.
17. **Big vote arrows** (Jason). Each seat's vote is a curved arrow beside it along the circle of seats, longer and thicker for a stronger vote, with the number on it; solid when it goes with the wheel's turn, dashed when against it.
18. **Separate share flows** (Jason). Each sender's shares run in their own lane (seat 0 outermost), in their colour, as a band from sender to receiver, thicker for more on the way, with an arrowhead at the receiver and the parcels moving along it. "Shares shown" (or tapping a seat) follows one player: their bands come forward, the rest fade, and the amount on its way is written on each band. Yours are followed by default.
19. **The ending plays out** (Jason). At the bell, shares still travelling finish their trips, rewards still crossing drop into the boost fund, which now sits in the hub throughout; then, if the table earned it, the fund flows out of the hub to every seat (circles) and the common fund's bonus comes in from outside (diamonds), the balances count up, and only then the end card appears. A fund that isn't earned shows as "lost". The engine records what the page needs (`s.ending`, when `record` is on); recording changes no rule.
20. **Your account in full** (Jason). The end card shows your ledger: stake, paid in, votes, received before sharing (rewards and shares in), shared out (boost included), the boost the fund added, fees, before the split, your share of the fund, the bonus, and what you end with. Each line is the change in the rounded running total, so the whole tokens shown add up exactly. The results table adds Received, Fees, Before the split and Fund + bonus for every seat. `ledger(s, id)` in the engine closes exactly for every player (tested over 48 tables, both endings).

The vote words now say what everyone's votes did last second (for example "added up to ↻4, with the wheel's turn. That's not past 6, so it still turned at its minimum 6° a second").

### Finding: votes never change the wheel (2026-11-09)

Under the current rules a vote with the wheel adds speed only once the table's votes together pass 6 (`speed = max(minSpeed, net)`), and a vote against it only cancels others' speed-ups unless the net passes 9. Over 300 bot tables at a stake of 650, bots voted in 49% of all seconds and **their votes changed the wheel's speed or direction in none of them**; they spent about 128 tokens a table on votes that did nothing (the tokens go to the boost fund, refunded when the table earns it). A lone player voting up to 6 with the wheel, or up to 9 against, changes nothing either. This is the "steering is weak" question from the first session, now measured; it goes to Jason as the next decision. Reproduce with a scratch count of seconds where any vote was cast and `speed !== minSpeed` or the direction changed.

## Open for the next session (2026-11-09)

1. **Jason's feedback from play** comes first. Questions the page is meant to answer: does steering feel worth doing; is the stake right (650, 800, 1,000); is the picture readable on a phone; does the share-dial temptation show? (First play done, decisions 14-20; the votes finding above waits for Jason.)
2. **Give steering more leverage**, if play confirms it's weak (decision 12). Options to simulate, one at a time: letting votes slow the wheel as well as speed it (a lower minimum speed), with the pinned player protected (`blackRun`) if holding returns; a tighter stake; tuning the steering bots so their wishes don't bankrupt them.
3. **Sharpening the sharing temptation**, if wanted: the fee and boost tables, or how the refund is shared.
4. **For the page:** achievements (ordered by simulated odds, as in Games 1 and 2), "What this table showed" (question 9: check each source first), reputation discs (question 6).
5. The deferred questions: invitations, points between tables (7), the name (10).
