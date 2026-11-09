# Wheel of Fortune: design notes

**Working title.** "Wheel of Fortune" is also the name of a famous TV game show, so the game needs its own name before launch (Jason's call, with the legal review).

**Sources:**
- *Wheel of Fortune Sharing Game*, 2017-11-19, in the claude.ai project.
- Game 3 ("multiplayer iterated") in *TrunK of Commons*, 2018-08-07.

**Status, 2026-11-09: core rules settled and simulated; a play-test page is up** (`games/wheel/?preview`), revised after Jason's first play (decisions 14-26) and his second (27-28). The first five questions are answered (see "Decisions" below). A pure engine (`src/engine/wheel.js`), eight bots (`src/bots/wheel-bots.js`), a simulator (`tools/sim-wheel.mjs`) and tests (`tests/wheel.test.mjs`) are on main. The first findings and the proposals waiting for Jason are at the end of this file. As in the other design logs, each decision has its date and who decided.

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
10. **The economy: the refund, and a stake of 1,000** (Jason, 2026-11-09: "ok Refund in equal shares, with a stake of 1,000"; the equal shares were replaced by shares by sharing in decision 27). At full time, if the poorest player still holds at least 10% of the stake, the game's boost fund is shared equally among the players and the common fund adds the 2017 bonus (2% to 10% of each stake, by the poorest player's share). A table that busts loses its fund. `endBonus: 'refund'` and `stake: 1000` are now the defaults. The agent's note: with the refund, the fee works like a deposit returned when the table finishes; six keepers finish 40 ahead, though keeping still loses against the bots (-229). Refunding by what each shared was the alternative; Jason kept equal shares, in line with 2018's equal Universal Distribution.
11. **Momentum too strong for one player to hold back** (Jason, 2026-11-09: "Make momentum too difficult for one player to hold back"). Turning the wheel back needs a net vote of more than 9, more than any one player can cast (`reverseAbove: 9`, the default). Momentum carries the arrow round to every seat, as Jason first conceived it ("When I first conceived this I thought momentum would swing the arrow around"); only two or more players together can turn it back. 2017's threshold of 6 was below one player's strongest vote (9), so one player could always reverse it alone and hold the arrow (100% of the time in simulation). The reversal-limit experiment was removed; the delays and `blackRun` stay as options for when gangs can hold the arrow.
12. **Both dials should count, and bots show their wish** (Jason, 2026-11-09: "I was hoping both dialing direction and sharing amount to be important to achieve the maximum time. Let's make sure they both count, even with bots. So yes, Bots show their wish."). Steering bots now vote their wish at the moments that matter to them, even when they can't win alone, so the player can see it and tip the balance: the Self-Steerer hurries the white arrow when it is next and holds it back while it has it; the Patron does the same for whoever else shares most; the Lifeguard hurries the black arrow past a player below four tenths of the stake, and the white arrow to them. The goal, not yet met: tune the rules so that both the direction dial and the share dial decide whether a table reaches six minutes with the bonus.
13. **Cheaper votes, and a page to play** (Jason, 2026-11-09: "Cheaper votes but with an eye to getting feedback from me, with testing how I can play with the bots. At this stage I did not experience the game, I'm only imagining it with the rules & players. Let's get this up for play to check feedback from play."). A vote now costs a quarter of a token a second per degree (`voteCost: 0.25`, the default). A first play-test page is at `games/wheel/` (open with `?preview` until the Game 2 achievements unlock it). Agent's choices for the play-test, for Jason to judge in play: a stake picker (650, 800 or 1,000; 650 by default, where both dials matter most in simulation; the engine default stays 1,000 from decision 10); your dials start at passing on half to everyone; the clock waits for Start, then runs a second a second with Pause, Step and speeds of 1x to 8x.

## The core as built (2026-11-09)

- **Seats** by join order: the initiator at the white arrow, then alternating sides, the last to join at the black arrow (six players sit at seats 0, 1, 5, 2, 4, 3).
- **Each second:** votes are paid into the boost fund (a quarter token a degree with the wheel's turn, a token a degree against it, decision 22) and their sum sets the speed: 6° a second plus the net vote, never below 2 (decision 21); more than 9 against turns it round (decision 11; it was any net vote at first), starting at 6 the other way; the seat holding the black arrow pays 9 and its two neighbours 1 each into the reward; the wheel turns; parcels due arrive.
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

Under the current rules a vote with the wheel adds speed only once the table's votes together pass 6 (`speed = max(minSpeed, net)`), and a vote against it only cancels others' speed-ups unless the net passes 9. Over 300 bot tables at a stake of 650, bots voted in 49% of all seconds and **their votes changed the wheel's speed or direction in none of them**; they spent about 128 tokens a table on votes that did nothing (the tokens go to the boost fund, refunded when the table earns it). A lone player voting up to 6 with the wheel, or up to 9 against, changes nothing either. This is the "steering is weak" question from the first session, now measured; it goes to Jason as the next decision. Reproduce with `node tools/sim-wheel.mjs 300 votes` (seconds where any vote was cast and the speed was not the minimum or the direction changed).

### Votes that add and slow (Jason, 2026-11-09)

Decision 21 (Jason, 2026-11-09): votes should "add speed, and slow it". Built as the engine option `voteSpeed: 'addsSlows'` (speed = 6 + the net vote, never below `slowest`; turning round still needs more than 9 together, and then starts at 6 the other way). `'adds'` (no slowing) and `'pastMin'` (the first rule) are kept for comparison. Since decisions 22-23, `'addsSlows'` is the default.

Simulated: 300 tables per row. Bot tables are six random bots. "Alone" means the style in your seat against five random bots. The hard holder is `bringSelf`: it shares half, hurries the white arrow to itself at 9 and holds it back at 9. Nets are in tokens. Reproduce with `node tools/sim-wheel.mjs 300 floors`.

| Stake 650 (the page's default) | Votes that changed the wheel | Bot tables lasted | Bonus | Self-Steerer: white arrow, net | Hard holder alone: white arrow, net, lasted |
|---|---|---|---|---|---|
| First rule (`pastMin`) | 0% | 100% | 39% | 17%, -263 | 18%, -449, 59% |
| Adds, no slowing | 55% | 80% | 36% | 18%, -289 | 19%, -460, 46% |
| Adds and slows, floor 4 | 95% | 62% | 30% | 22%, -252 | 25%, -432, 27% |
| Floor 3 | 94% | 50% | 23% | 24%, -247 | 29%, -376, 1% |
| Floor 2 | 94% | 50% | 23% | 24%, -247 | 38%, -243, 0% |
| Floor 0 | 94% | 50% | 23% | 24%, -246 | 93%, +29, 0% |
| Floor 2 + pinned-player protection (`blackRun: 10`) | 98% | 96% | 55% | 26%, -120 | 37%, -215, 95% |
| Floor 0 + protection | 98% | 96% | 55% | 26%, -120 | 99%, -224, 100% |

| Stake 1,000 | Votes that changed the wheel | Bot tables lasted | Bonus | Self-Steerer: white arrow, net | Hard holder alone: white arrow, net, lasted |
|---|---|---|---|---|---|
| First rule | 0% | 100% | 100% | 17%, +50 | 18%, -87, 99% |
| Adds, no slowing | 48% | 100% | 100% | 18%, +31 | 19%, -101, 99% |
| Floor 2 | 97% | 97% | 95% | 25%, +91 | 37%, -309, 29% |
| Floor 2 + protection | 100% | 100% | 100% | 26%, +83 | 37%, -75, 100% |
| Floor 0 + protection | 100% | 100% | 100% | 26%, +83 | 100%, -189, 100% |

What it shows:

1. **Votes count.** Votes change the wheel in 94-100% of the seconds they're cast, up from 0%.
2. **Gentle holding pays; hard holding doesn't.**
   - The Self-Steerer (votes of 3) holds the white arrow a quarter of the time and becomes the best-off bot at a stake of 1,000 (+91, against +50 under the first rule).
   - A hard holder gains the arrow (37% to 93% of the time) but mostly loses, because the seat it pins at the black arrow goes bust and the table loses the refund.
   - The cost of hard pinning falls on everyone, while the pinner pays about 1 a second against the pinned player's 9.
3. **The floor matters only for strong votes.** Bots vote 2 or 3, so floors 0 to 3 give the same bot tables.
4. **The pinned-player protection keeps tables alive.** After 10 seconds in a row at the black arrow, a seat pays 1 instead of 9. With it, 96% of tables last at a stake of 650, against 50% without. A hard holder loses even while holding the arrow all the time, since the pinned seat pays so little.

Jason's response (2026-11-09): "Shouldn't the cost of pinning the wheel outweigh the benefits?" The agent's options:

- **(A)** Votes against the wheel cost more.
- **(B)** The reward stops after a long hold.
- **(C)** Collection follows how far the wheel turns. The agent advised against it, because it would make most steering pointless.

22. **Pricier votes against the wheel** (Jason, 2026-11-09: "(A) Pricier votes against the wheel"). A vote against the wheel's turn costs 1 token a degree, 2017's price (`voteCostAgainst: 1`, the default). A vote with it stays at a quarter. Fighting momentum now costs four times as much as hurrying it.
23. **Smarter bots, not protection** (Jason, 2026-11-09: "Smarter bots, not protection"). The steering bots hold the white arrow back only when holding pays them more than it costs (`holdPays` and `arrowWorth` in `src/bots/wheel-bots.js`):
    - **What a second of the arrow is worth:** to the Self-Steerer, the reward stream times what it keeps after sharing and the fee; to the Patron, the slice of the favoured player's shares that comes back to it.
    - **What holding buys:** slowing by k degrees a second keeps the arrow there about k/6 of a second longer each second, at k times the price of a vote against.
    - **The result:** at a token a degree, neither bot ever finds holding worth it; at a quarter, the Self-Steerer would.
    - **What's kept:** hurrying stays (it shows the wish, at a quarter token a degree). The stubborn holder survives as `bring(..., always = true)`, for learner styles.
    - **No protection:** the pinned-player protection stays off (`blackRun: Infinity`).
    - **The floor** is 2° a second (`slowest: 2`), the agent's choice, open to Jason. At 0 one player could stop the wheel dead.

### After decisions 21-23 (2026-11-09)

300 tables per row, smart bots. "Holds when it costs" is the stubborn gentle holder (shares half, hurries and holds at 3 whatever it costs); "holds if it pays" is the same with the smart rule. Reproduce with `node tools/sim-wheel.mjs 300 smart`.

| | First rule, stake 650 | Now, stake 650 | First rule, stake 1,000 | Now, stake 1,000 |
|---|---|---|---|---|
| Votes that changed the wheel | 0% | 100% | 0% | 100% |
| Bot tables lasted | 100% | 83% | 100% | 100% |
| Bonus earned | 39% | 40% | 100% | 100% |
| Self-Steerer: white arrow, net | 17%, -263 | 17%, -246 | 17%, +49 | 17%, +51 |
| Alone: shares half, no steering | -249 | -142 | +115 | +119 |
| Alone: holds if it pays | -327 | -221 | +44 | +35 |
| Alone: holds when it costs | -328 | -420 | +44 | -106 |
| Alone: hard holder (9, stubborn) | -440 | -644 | -88 | -982 |
| Alone: shares half and stewards | -228 | -137 | +87 | +95 |

1. **Pinning now costs the pinner more than it gains.** Every holding style ends below the same player not steering. A hard holder spends most of its stake.
2. **Votes always count, and the bots' votes are now hurrying.** The Self-Steerer and Patron hurry the arrow towards themselves or their favourite, and the Lifeguard hurries arrows past the poorest player.
3. **Stewarding pays its way at a tight stake.** At 650 the steward ends a little better off than the plain sharer (-137 against -142) and helps the table: its tables last 94% of the time, against 88%, and earn the bonus 59%, against 53%. At 1,000 it's a small gift to the table (+95 against +119).
4. **Who still goes bust at 650.** Of 300 bot tables, 50 ended early, every one because a Keeper or Free Rider couldn't pay. None ended because a seat was pinned: the longest run at the black arrow is back to 10 seconds, one natural pass. With stubborn holding bots it had been 18 seconds, and 148 tables ended early.
5. **Selfish steering no longer tempts.** The dilemma left in steering is cooperative: steering for the table helps, and at a tight stake it pays for itself.

### Bots that learn (Jason, 2026-11-09)

Jason asked why the Keeper never changes, given the fees. The agent's answer: every bot is a fixed strategy with a readable tell, like the entries in Axelrod's tournaments, and none learns from its own results.

24. **Two learning bots** (Jason: "Both. Bots are standing in for human players. As long as there is feedback, and time to learn, a player should eventually adjust from experience. While the rules and fees are one feedback, player reactions are another."). A new family, Learners, puts at least one at every table.
    - **The Learner** learns from its own results, which is where the rules and fees show up. It plays Win-Stay, Lose-Shift and starts at a random share dial. After each lap (each time the white arrow leaves it, so every lap holds one visit of each arrow) it compares what it kept per token of reward with the lap before. If it did at least as well, it moves its dial 2 tenths further the same way; if worse, it turns back.
    - **The Reformed Keeper** keeps everything until either kind of feedback reaches it: the fees (its tokens fall below 7/10 of the stake), or other players' reactions (3 seconds in which the others' votes hurried the white arrow on while it had it). Then it shares with everyone, 2 tenths more every 10 seconds, up to the others' average (at least half, at most 8 tenths). You can reform it by hurrying the arrow past it.
    - **Their reasons show** in "What's happening": "the fees have cost it three tenths of its stake", "others hurried the white arrow past it", "it kept more per token of reward last lap than the lap before, so it tries further the same way".

Simulated: 400 bot tables per stake, with the new roster of at least one bot from each of the four families. Reproduce with `node tools/sim-wheel.mjs 300 learning` (it plays 400 tables for this table and 300 for decision 26's).

| | Stake 650 | Stake 1,000 |
|---|---|---|
| Bot tables lasted | 87% (83% before the Learners) | 100% |
| Bonus earned | 53% (40%) | 100% |
| Went bust | Keeper 29, Free Rider 24 | none |
| Learner: share dial at the start, at the end (mean) | 5.1, 6.1 | 5.1, 6.2 |
| Learner: dial moves per table | 6 | 6 |
| Learner: end dial, 0 to 10 tenths (tables) | 0 0 0 12 40 34 78 45 41 8 9 | 0 0 0 9 49 33 68 49 36 8 15 |
| Reformed Keeper reformed | every table: 74% by the fees, 26% by reactions, after 94 s on average | every table, after 146 s |
| Net: Reformed Keeper against Keeper | -190 against -404 | +41 against -89 |
| Net: Learner | -162 (the Sharer: -162) | +67 (the Sharer: +83) |

1. **The Learner finds the selfish optimum, not the cooperative one.** No Learner ends keeping (0 to 2 tenths), and the most common end is 6 tenths to everyone: passing on half of what it receives, which keeps the most per token of reward (a quarter, after the fee). It rarely learns to share everything, because the payoff for that is spread across the table rather than coming back to it. That is the share dial's temptation, made visible.
2. **Reforming roughly halves the Keeper's loss** at 650 and turns it into a gain at 1,000. At the bigger stake the fees take longer to bite, so it reforms later.
3. **Learning helps the table:** with a Learner or a Reformed Keeper at every table, more tables last and earn the bonus at the tight stake.

### Seeing the fee and the boost (2026-11-09)

Jason asked: "How could players learn about the fees & boosts that occur according to their choices while playing? Is there a way to show those fee & boost changes more clearly?" Before this, fees and boosts were all but invisible in play. The fee went into the hub without any visible flow, and the boost was folded into the shares. Players saw only a sentence of percentages, the hub's number and, at the end, the account.

25. **Three ways to see them** (Jason: "I like all three"):
    - **Where every 100 tokens go.** A bar under your dials splits 100 received tokens into to others (with the boost the fund adds), the fee, and what you keep, and changes as you turn the dials. The sentence beside it gives the same numbers.
    - **A receipt after each white-arrow visit,** in What's happening, for the player you follow (you by default): "Your 10 s at the white arrow: 98 reached you. You passed on 41, and the fund added 4 to it; the fee took 33; you kept 24." The whole tokens add up.
    - **Fee and boost flows in the picture,** for the player you follow. Squares carry the fee from their seat into the hub, and diamonds carry the fund's boost out to their lane, each labelled with this second's amount. The shapes and labels carry it in greyscale.
    - **Agent's choice, open to Jason:** no comparisons ("at 6/10 you'd have kept 25"). Players discover the better settings by trying, in line with decision 24's principle of learning from experience. A comparison line is easy to add.

Jason's observation (2026-11-09): "the fee collection amass because players don't learn the fee rules are to encourage sharing, punish selfishness. Free Rider did not learn to change, even though it had feedback & time ... a longer game would suggest adjustments if representing a human player."

### Every bot learns (Jason, 2026-11-09)

26. **Every bot learns and shows what it learned** (Jason: "Every bot should learn and demonstrate what they learn. The game play and appropriate explainations assist human players to understand what there is to learn."). Each bot keeps its character as its opening habit, so its tell shows early, and learns from both kinds of feedback with its own temperament. Its own results, lap by lap, are where the fees show up. Other players' reactions are seconds in which their votes hurried the white arrow on while it had it, and what came back to it. When a bot learns something, it says so in What's happening, and the end card adds "What the bots learned": each bot's opening habit, its lessons with the time and reason, and where it ended. The Reformed Keeper is folded into the Keeper.

| Bot | Opening habit | What it learns from | What it does |
|---|---|---|---|
| Sharer | 8/10 to everyone | what comes back | eases a tenth at a time (never below half) when less than half of what it passes on comes back; shares more again when 8 in 10 come back |
| Keeper | keeps everything | the fees; reactions | stubborn: starts sharing once the fees have cost it 4/10 of its stake, or after 5 seconds of being hurried past; then 2 tenths more every 10 s, up to the others' average |
| Free Rider | half, to itself only | the fee; reactions | after two laps keeping under a tenth of its reward, or 3 seconds hurried past, widens to the 2 nearest, then to everyone |
| Opportunist | 9/10, half at the white arrow | reactions | drops the trick if hurried past while cutting; says so if three laps pass and nobody reacts |
| Reciprocator | the others' average | the others' sharing | follows them up or down, and says so |
| Self-Steerer | hurries the arrow to itself | its results | steers less after each lap its votes cost more than its reward rose, then stops: hurrying brings the arrow sooner, not for longer |
| Patron | hurries the arrow to the most generous | what comes back while each player holds the arrow | after two laps, hurries the arrow past a player who sends it almost nothing back |
| Lifeguard | rescues the poorest | whether its help is swallowed | stops hurrying the white arrow to a poor player who keeps under a tenth of what reaches them; still hurries the black arrow past them |
| Learner | a random share | its results | Win-Stay, Lose-Shift, 2 tenths a lap |

Simulated: 300 bot tables per row, with the same seeds for the bots as they were (fixed, plus the two Learners) and for every bot learning. Reproduce with `node tools/sim-wheel.mjs 300 learning`.

| | Stake 650, as they were | Stake 650, every bot learns | Stake 1,000, as they were | Stake 1,000, every bot learns |
|---|---|---|---|---|
| Bot tables lasted | 86% | 99% | 100% | 100% |
| Bonus earned | 55% | 98% | 100% | 100% |
| Boost fund at the end (median) | 2,568 | 2,058 | 2,635 | 2,160 |
| Table's mean share dial at 30 s, 2 min, 4 min, the end (a keeper counts 0) | 4.5, 4.8, 5.4, 5.5 | 5.2, 5.7, 6.5, 6.7 | 4.5, 4.6, 5.4, 5.5 | 5.2, 5.7, 6.2, 6.7 |
| Keeper net | -389 | -19 | -80 | -16 |
| Free Rider net | -383 | -25 | -87 | +19 |
| Self-Steerer net | -210 | +31 | +52 | +72 |

How often each lesson comes (share of tables where the bot sits, stake 650):

- **Keeper:** starts sharing at every table, after a median of 2:18 at stake 650 and 3:49 at 1,000.
- **Free Rider:** widens its sharing at 83% of tables.
- **Opportunist:** drops its trick at 58% and says nobody reacted at 37%.
- **Self-Steerer:** steers less, then stops steering for itself, at every table, starting after about 1:38.
- **Patron:** hurries the arrow past a keeper at 26%.
- **Lifeguard:** stops sending the white arrow to a swallowing keeper at 15%.
- **Sharer:** eases at 29%.
- **Learner:** moves its dial about six times a table.

1. **Learning keeps the table alive.** At the tight stake, tables earn the bonus almost every time, and every bot ends better off. The fund piles up less because the bots feeding it with fees learn not to.
2. **The table's sharing climbs over the six minutes,** from about 5 tenths to nearly 7. It settles above the Learner's selfish 6/10 because the Sharers and the Reciprocators' following hold it up.
3. **Reactions are partly accidental.** A bot hurrying the arrow towards itself also hurries it past its neighbour, and that counts as "others hurried the arrow past it". The Patron's hurrying past keepers is the deliberate kind. A person playing can do it on purpose.

## Jason's second play (2026-11-09)

Jason played the build with every bot learning: "I did play a game 3. I'd like the end-game fund split to be according to sharing behaviour instead of equal. I'd like the player focus showing fees & boosts to follow the white arrow by default, with an option to switch to black arrow or select any bot to view."

27. **The boost fund is shared out by sharing** (Jason, 2026-11-09; replaces the equal shares of decision 10). At full time, if the poorest still holds a tenth of the stake, each player's part of the fund is in proportion to the part of what reached them (rewards and shares in) that they passed on to others, the boost not counted (`refundBy: 'rate'`, the new default). A keeper gets none of it. If nobody passed anything on, the shares are equal. The common fund's bonus stays a % of each stake, the same for everyone. Equal shares stay as `refundBy: 'equal'`, and shares by tokens passed on as `'tokens'`.
    - **Agent's choice, open to Jason: the measure.** The part passed on measures behaviour rather than luck (how much happened to reach you), and it is the number the split bar and the receipts already show. Shares by tokens passed on gave nearly the same nets (within about 20 tokens).
    - **On the page:** How it works says so; the panel's fund line says what part of what reached you you've passed on so far, and what your part of the fund would be if the table ended now; at the end each seat's circles from the hub are sized by its part (none for a keeper); the end card names who passed on the most, the account notes your part, and the results table adds a Passed on column.
28. **The picture follows the white arrow by default** (Jason, 2026-11-09). "Follow" (it was "Shares shown") offers the white arrow, the black arrow, everyone alike, you, or any bot; tapping a seat follows it and tapping it again goes back to the white arrow. The fee squares, boost diamonds, amounts on the bands and the receipts follow whoever has the chosen arrow, so by default every white-arrow visit gets a receipt. Following the black arrow adds a receipt for each turn there: what they paid in, and what reached them in shares meanwhile.

### Sharing out the fund by sharing (2026-11-09)

Every bot learning. Each style alone against five random bots ("alone"), and six of one style ("six"), 300 tables each. Nets in tokens. Reproduce with `node tools/sim-wheel.mjs 300 split`.

| Your style | 650, equal | 650, by sharing | 800, equal | 800, by sharing | 1,000, equal | 1,000, by sharing |
|---|---|---|---|---|---|---|
| Keeps everything, alone | -291 | -558 | -110 | -552 | -96 | -539 |
| Shares half, alone | +85 | +41 | +100 | +61 | +119 | +83 |
| Shares 8/10, alone | +39 | **+120** | +63 | **+157** | +83 | **+184** |
| Shares everything, alone | -96 | +51 | -61 | +108 | -39 | +143 |
| Shares half and stewards, alone | +58 | +10 | +85 | +38 | +106 | +60 |
| Shares everything and stewards, alone | -120 | +21 | -89 | +59 | -66 | +82 |
| Six of one style: keep, half, 8/10, everything (any split) | -621, +32, +58, +65 | | +24, +48, +72, +80 | | +40, +70, +90, +100 | |

1. **The best lone style moves from half to 8/10,** and sharing everything alone turns from a loss into a gain. Keeping loses about twice as much, because its fees now go to the sharers rather than back to everyone.
2. **The dilemma narrows to the top of the dial.** Alone, 8/10 still beats everything (+120 against +51 at 650), while six sharing everything do best together (+65 each). That is still the prisoner's dilemma order (120 > 65 > 58 > 51), but the lone cooperator no longer loses.
3. **The bots don't see it.** They learn lap by lap, and the share-out comes only at the end, so their play, how long tables last and the bonus rate are unchanged; the Learner still settles near 6/10. A person who knows the rule can do better than the bots.
4. **Stewarding costs more than it did** (+10 against +58 alone at 650 for a half-sharer), because a steward's votes feed the fund that sharers take more of. Stewarding while sharing everything still pays (+21).

## Reproducing the tables (2026-11-09)

The simulations behind decisions 21-26 ran as scratch scripts. They are now modes of `tools/sim-wheel.mjs`, each playing the bots of its time from `tools/wheel-bots-then.mjs` (`first`: decisions 12-20, fixed bots that hold whatever it costs; `smart`: decisions 21-23; `twoLearners`: decision 24; `now`: every bot learns):

| Mode | Rebuilds | Command |
|---|---|---|
| `votes` | votes never changed the wheel under the first rule | `node tools/sim-wheel.mjs 300 votes` |
| `floors` | votes that add and slow: floors and the pinned-player protection, stakes 650 and 1,000 | `node tools/sim-wheel.mjs 300 floors` |
| `smart` | after decisions 21-23: first rule against now, with the alone styles | `node tools/sim-wheel.mjs 300 smart` |
| `learning` | decision 24's table (400 tables) and decision 26's, with how often each lesson comes | `node tools/sim-wheel.mjs 300 learning` |
| `split` | decision 27: equal shares against shares by sharing | `node tools/sim-wheel.mjs 300 split` |
| `stake` | the stake with every bot learning (below) | `node tools/sim-wheel.mjs 300 stake` |

The modes use `simulate()`'s seeds (table t: 5000 + t). The scratch scripts' seeds were lost with that session, so the re-runs match the logged figures within sampling noise rather than exactly (agent's check, 2026-11-09):

- **votes:** bots voted in 50% of seconds (logged 49%), their votes changed the wheel in none (none), costing 129 tokens a table (128).
- **floors:** every logged pattern holds; shares of seconds at the white arrow within 1 point (4 points for the hard holder at floor 0: 89% against 93%), lasting and bonus within 7 points, nets within 30 tokens (the Self-Steerer at 1,000 with floor 2: +108 against +91).
- **smart:** within 4 points and 26 tokens. One small finding doesn't hold: at stake 650 the steward and the plain sharer end level (-155 against -153), not "a little better off" (-137 against -142); the steward's tables still last longer (93% against 85%) and earn the bonus more (58% against 52%).
- **learning:** within 2 points for lasting and bonus, 0.1 for the dials, 41 tokens for nets (the Self-Steerer as it was at 650: -170 against -210), and 7 points for how the Reformed Keeper reformed (81% by the fees against 74%).

Tables logged before decision 21 that name a `tools/sim-wheel.mjs` command reproduce exactly when it is run at the commit that logged them, with its own bots: the first findings table, re-run at 0dee34d, matches every figure.

## The stake with every bot learning (2026-11-09)

Every bot learning, the fund shared out by sharing (decision 27). Bot tables, and each style alone against five random bots, 300 tables each. "Lowest point": the poorest player's lowest balance during the table, as a share of the stake (median, and the worst tenth of tables). Reproduce with `node tools/sim-wheel.mjs 300 stake`.

| Stake | Bot tables: lasted, bonus | Lowest point (worst tenth) | Keeps: net, bonus | Half: net, bonus | 8/10: net, bonus | Everything: net, bonus | Half + steward: net, bonus | Everything + steward: net, bonus |
|---|---|---|---|---|---|---|---|---|
| 450 | 75%, 46% | 7% (0%) | -445, 0% | -179, 36% | -84, 59% | -237, 43% | -179, 53% | -282, 35% |
| 500 | 89%, 73% | 16% (1%) | -497, 0% | -98, 65% | -22, 74% | -160, 62% | -106, 76% | -232, 51% |
| 550 | 96%, 88% | 22% (8%) | -535, 5% | -31, 84% | +43, 85% | -74, 77% | -51, 89% | -141, 70% |
| 600 | 100%, 95% | 29% (15%) | -553, 32% | +22, 96% | +100, 94% | +3, 89% | -4, 99% | -45, 86% |
| 650 | 100%, 99% | 34% (21%) | -558, 61% | +41, 99% | +120, 97% | +51, 95% | +10, 100% | +21, 96% |
| 800 | 100%, 100% | 43% (33%) | -552, 100% | +61, 100% | +157, 100% | +108, 100% | +38, 100% | +59, 100% |
| 1,000 | 100%, 100% | 52% (44%) | -539, 100% | +83, 100% | +184, 100% | +143, 100% | +60, 100% | +82, 100% |

1. **650 is no longer a tight stake.** With every bot learning, bot tables last and earn the bonus at 650 almost every time (99%), and the poorest never comes near the line (lowest point 34% of the stake, 21% in the worst tenth). Only a keeper in your seat puts it at risk (bonus 61%). Learning moved the tight band down to about **500-550**.
2. **At 500-550 both dials count, as decision 12 hoped.** The bonus rate for your table runs from 0-5% if you keep, through 65-84% sharing half, to 76-89% sharing half and stewarding: stewarding adds 5 to 11 points over the same sharing without it. Sharing 8/10 still pays you best (+43 at 550), and a steward pays a little for the table's sake (-51 against -31).
3. **Lone styles at 650-1,000:** keeping always loses heavily (-540 to -560) now that its fees go to the sharers; 8/10 is the best lone style at every stake; sharing everything and stewarding while sharing everything both come out ahead from 650 up.
4. **Below 500 the table is mostly luck:** at 450 a quarter of bot tables go bust, and even the best lone style earns the bonus only 59% of the time.

## Open for the next session (2026-11-09)

1. **Jason's feedback from play** comes first. Questions the page is meant to answer: does steering feel worth doing; is the stake right (650, 800, 1,000); is the picture readable on a phone; does the share-dial temptation show? (First play done, decisions 14-20; the votes finding above waits for Jason.)
2. **Give steering more leverage**, if play confirms it's weak (decision 12). Options to simulate, one at a time: letting votes slow the wheel as well as speed it (a lower minimum speed), with the pinned player protected (`blackRun`) if holding returns; a tighter stake; tuning the steering bots so their wishes don't bankrupt them.
3. **Sharpening the sharing temptation**, if wanted: the fee and boost tables, or how the refund is shared.
4. **For the page:** achievements (ordered by simulated odds, as in Games 1 and 2), "What this table showed" (question 9: check each source first), reputation discs (question 6).
5. The deferred questions: invitations, points between tables (7), the name (10).
