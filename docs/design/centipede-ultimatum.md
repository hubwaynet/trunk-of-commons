# Centipede & Ultimatum: design notes

Source: *Game 2 - multiplayer iterated - centipede with ultimatum (MI-CU)*, TrunK of Commons, 2018-08-07.

## Rules as implemented (engine draft 2, 2026-11-04)

- Six seats, everyone starts with 20 points. The Commons is a finite reserve of 120, as in Game 1.
- Players take turns in join order. Each turn a player **gives** the round's requirement (1 in round 1, rising by 1 each round) or **grabs** the pool.
- A player who can't pay the requirement in full **passes**: they can't give and can't grab, but they keep their seat, can receive a share and can vote (Jason, 2026-11-04).
- If nobody grabs, the Commons adds 1 for each player who gave, and the pool **carries over** to the next round. It grows until someone grabs (Jason, 2026-11-04).
- A grab starts an ultimatum. The grabber sets **each player's share separately**, in whole points, among the players still at the table, so they can reward and punish (Jason, 2026-11-04).
- Everyone votes 0, 1 or 2, and every vote counts at face value. A vote is paid from the voter's share first, then their balance, so a broke player can still vote on a split (Jason, 2026-11-04). Rejecting is free (Jason, 2026-11-04).
  - Average below 1: rejected. See "What a rejection does" below.
  - Average from 1 to 1.5 (1.5 counts as closer to 1): the split is paid. The vote pool is shared equally in whole points, with any remainder going to the Commons.
  - Average above 1.5: the split is paid. The Commons rounds the vote pool up to a whole number per player (Jason, 2026-11-04).
- After a split, each player stays or sits out. Players who sit out are excluded from the rest of the table (Jason, 2026-11-04). The pool restarts at 0, the requirement keeps rising, and the next round starts with the divider and runs in the opposite order.
- The table ends when fewer than 3 players remain, when nobody can afford to give (any pool left goes back by what each put in; see 2026-11-05), or when the Commons can't pay the round bonus.
- Game 2 stays locked until all five Game 1 achievements are earned (Jason, 2026-11-04).

## What a rejection does (decided)

Jason wants tables to run long enough for players to learn what worked, but not so long that the lesson blurs (13 rounds felt too long). He chose **grabber out, pool refunded**, with a start of 20 (2026-11-04): median 10 rounds. The other versions stay available as engine options.

| Version | Rejected pool | Grabber | Table |
|---|---|---|---|
| 2018 rule | to the Commons | stays | ends |
| Carry on | to the Commons | stays | continues |
| **Chosen: grabber out, refund (default)** | back to each player in proportion to what they put in | leaves the table | continues |

The vote tokens of a rejected split always go to the Commons.

## Findings from simulation (4,000 bot tables per row, varied roster of 6, draft 2 rules)

| Version | Median rounds | Reach round 8 | Seats finishing ahead | Best and worst strategy |
|---|---|---|---|---|
| 2018 rule | 2 | 4% | about 12% | everyone slightly behind |
| 2018 rule, no grabbing in round 1 | 2 | 4% | | same |
| Carry on | 8 | 52% | | everyone loses 9 to 13 |
| Grabber out (pool to Commons) | 7 | 46% | 12% | everyone behind |
| **Grabber out, refund** | **10** | **81%** | **66%** | Edge Watcher +8.9, Spiteful +5.5, Patient +5.3 … Greedy −1.0, Early Grabber −1.5 |
| Grabber out, refund, start 40 | 13 | 100% | 68% | same order, bigger gaps |

- **Where the points leak.** Under the 2018 rule every rejected pool goes to the Commons, so the Commons grows and the players shrink. Refunding the pool to the players who put it in stops the leak. The grabber's loss is personal (their seat) rather than shared.
- **With the refund, a lesson shows up.** Patience followed by a modest, well-timed grab with a fair split wins (Edge Watcher). Steady givers do well. Greedy and early grabbers get voted out. Free Voter still finishes ahead, so the free-riding temptation stays visible.
- **Free rejection still decides some failures.** Under the 2018 rule, 47% of rejections would have passed if every player offered a fair share had voted 1.
- **Why tables end.** At cooperative tables the end is escalation: the requirement outruns balances, everyone goes broke, and the pool is shared. With a start of 20 that happens around round 5 if nobody grabs, and around round 10 at mixed tables, where grabs recycle points.
- **Sitting out is still rare** (about 0.1 per table). The cascade Jason anticipated hasn't appeared with the current bot habits.
- Broke players passed on about 10% of turns under the recommended version.

## Interim defaults (agent's choice, open to change)

1. The order stays the same after a round with no grab.
2. A round cap of 60, as a safety stop for simulation.
3. `firstGrabRound` exists as a switch but changed little, so it is off.

## Bot roster (draft 3, 10 strategies, 2026-11-05)

Each bot measures an offer against its own idea of a fair share: an **equal** share of the pool, a share **in proportion** to what it put in (the pool includes the Commons bonus), or **exactly what it put in**. It votes 2 (welcome) at or above one level, 1 (accept) at or above a lower one, and 0 below. Every bot votes 2 on its own split.

| Strategy | Grabs | Divides | Welcomes (2) at | Accepts (1) at | Leaves |
|---|---|---|---|---|---|
| Patient | never | equal | equal share | half an equal share | no |
| Pushover | never | equal | anything | – | no |
| Bookkeeper | never | by what each put in | proportional share | what it put in | after a split that lost it points |
| Early Grabber | first turn with anything in the pool | keeps 60%, rest equal | equal share | half an equal share | no |
| Pool Watcher | pool at 40 or more | keeps 40%, rest by what each put in | proportional share | half an equal share | no |
| Greedy | pool at 20 or more | keeps 80%, rest equal | never | 30% of an equal share | after its split goes through |
| Edge Watcher | when giving would leave it short next round | keeps 1.25 × equal, rest by what each put in | proportional share | 60% of an equal share | no |
| Spiteful | never | equal | never | an equal share (rounded down) | no |
| Free Voter | never | equal | never | never (always 0) | no |
| Mirror | after a greedy split goes through | cuts the greedy divider out | equal share | 70% of an equal share | no |

"Never" grabs still allows a bot to give until it is broke. Tables seat at least one grabber, one judge and one reciprocator.

## First playable page (2026-11-04)

- `games/centipede-ultimatum/` with `src/ui/centipede-ultimatum/`: one human seat and five bots, or six bots in watch mode. Bots move on a short timer; the page waits for you on your turn, when you divide, when you vote and when you choose to stay.
- Dividing: a share for each player with − / + steppers, plus three presets (equal, by what each put in, keep half). The offer is enabled only when every point is assigned.
- Voting shows the split as bars next to what each player put in. After the vote the outcome card shows every share and every vote.
- The round log shows each turn (G = gave, · = passed, GRAB), then each player's offered share and their vote.
- The end card reveals every bot's strategy and each player's net, and asks what the leader did differently.
- Locked until all five Rising Pool achievements are earned (same localStorage key the landing page uses). `node tools/build-preview.mjs centipede-ultimatum --unlocked` builds a preview that opens anyway, because an artifact can't see the Game 1 achievements stored on the live site.
- Not built yet: points carrying between tables, Game 2 achievements, a "Read the table" exercise, and the landing page and nav links on other pages.

## Round 9 and the vote arithmetic (Jason, 2026-11-05)

Jason grabbed a pool of 103 at a five-player table and split it almost equally (21 each, 19 for himself). The split was rejected, with votes totalling 4 out of the 5 needed. He had voted 1 on his own split, and the Bookkeeper voted 0 because it had put in 24 and was offered 21. Two lessons were hidden there: your own vote counts, and an equal split shortchanges the heavy contributors.

Decided (Jason, 2026-11-05):

- **Make the arithmetic visible.** The divide and vote cards say how many votes are needed to pass and that each 0 needs a 2 to cover it. Split tables show each player's share beside what they put in, with a share below the stake marked red. The outcome card gives the vote total, the number needed, and who voted 0 or 2.
- **Generous judges.** Most bots now vote 2 when an offer meets their own idea of fair (see the roster). Greedy, Spiteful and Free Voter never pay for a 2.
- **Split by what each put in is the first preset and the starting split** when a player divides.

### Do bots think equal or proportional is fair?

Both, depending on the bot and on where it sits. I tested this at 11,840 real grabs where the two splits differ, asking each table how it would vote on an equal split and on a split by stake of the same pool:

- Both kinds of split pass 99% of the time with the generous judges, and they average almost the same vote (1.40 equal, 1.38 by stake).
- An equal split upsets the heavy contributors: Bookkeeper rejects it 28% of the time. A split by stake upsets players who put in less and judge by equal shares: Greedy rejects it 58% of the time, Spiteful 45% and Patient 33%. Those are mostly cases where the bot itself had passed or given less.
- Edge Watcher and Pool Watcher welcome a split by stake far more often (82% and 88%) than an equal one (37% and 39%).

So there is no single fair split at the table. Equality protects players who couldn't give; proportion rewards those who did. That tension is the lesson.

### Simulation with draft 3 bots (4,000 tables)

Median 11 rounds, 82% reach round 8. 20% of splits rejected, 53% accepted, 27% welcomed. 63% of seats finish ahead. Edge Watcher is still best (+10.6 per seat), and Greedy and Early Grabber are still the only strategies behind on average.

## Achievements (2026-11-05)

Jason chose the challenges; the order (easiest first) comes from `tools/sim-centipede-achievements.mjs`, which plays the human seat with six learner styles against five bots (2,000 tables each). Odds per table are for the style that suits each one.

| # | Achievement | What it asks | Odds per table |
|---|---|---|---|
| 1 | Nobody short-changed | Your split passes and every player gets back at least what they put in | 81–89% when splitting by stake |
| 2 | Steady hand | Reach the end of a table without grabbing, still seated and ahead | 85% for a steady giver |
| 3 | One clean grab | Grab exactly once, the split passes, finish ahead | 76% if you grab once at a pool of 25–60 and split by stake |
| 4 | Welcomed | Your split's average vote is above 1.5 | 45% (63% if 1.5 counted as welcomed) |
| 5 | Your vote counted | Someone voted 0 on your split and your own 2 carried it | 10–39% (needs a 0-voter and a close count) |

- "Steady hand" includes "and ahead", because otherwise giving every turn earns it automatically.
- "Nobody short-changed" is nearly automatic when the split by stake (the starting split) passes, so it works as the first lesson about that preset.
- A welcomed split of yours plays a short fireworks burst and a toast every time; all five play the full show once (stored in `trunk.centipede.celebrated`). Achievements are stored in `trunk.centipede.achievements`.
- Fireworks moved to `src/ui/fireworks.js`, shared by both games.
- An engine switch `welcomeAt: 'atLeast'` makes 1.5 count as welcomed. It is off pending Jason's decision.

### Open questions for Jason

- **The welcome bonus is small.** When a split is welcomed, the Commons only rounds the vote pool up to a whole number per player. If the votes already divide evenly, the top-up is 0.
- **1.5 at some tables.** A table with a Free Voter (always 0) and a Spiteful (never 2) can reach at most 9 votes out of 12 at six seats, which is exactly 1.5. Under the current rule that table can never welcome a split.
- **Long tables.** Median 11 rounds, but 29% of tables pass 20 rounds and 8% pass 30, with a maximum of 59. Late rounds drag on with one or two players able to afford the rising amount while everyone else passes.

## Welcome bonus, round limit, sixth achievement (Jason, 2026-11-05)

- **An average of 1.5 or more welcomes a split** (`welcomeAt: 'atLeast'`, now the default). This replaces the 2026-11-04 rule that 1.5 counts as accepted.
- **A welcomed split pays a bonus.** The Commons rounds the vote pool up as before and then adds 1 point for every player (`welcomeBonus: 1`), as far as its reserve allows.
- **Round limit 20** (`maxRound: 20`). The table ends after round 20, and any pool goes back by what each put in.
- **New achievement, Full distance:** still at the table when round 20 ends.

New achievement order (odds per table for the style that suits each one): Nobody short-changed (about 85%), Steady hand (86%), One clean grab (74%), Welcomed (63%), Full distance (30–53%, depends on the table more than on you), Your vote counted (10–40%).

Simulation (4,000 tables, 6 seats): median 11 rounds; 34% reach round 20; 26% of splits rejected, 50% accepted, 24% welcomed. The welcome bonus helps free riders: Free Voter rose to second best (+8.0 per seat), behind Edge Watcher (+9.8).

### Table size (simulation, 2,000 tables each, for Jason's question)

| Seats | Median rounds | Reach round 20 | Splits per table | First grab | Rejected | Welcomed | Seats ahead |
|---|---|---|---|---|---|---|---|
| 4 | 8 | 19% | 4.5 | round 3 | 24% | 15% | 72% |
| 6 (current) | 11 | 33% | 6.8 | round 2 | 27% | 25% | 67% |
| 8 | 20 | 57% | 10.0 | round 1 | 24% | 28% | 60% |
| 10 | 20 | 90% | 14.7 | round 1 | 20% | 38% | 57% |

The Commons never ran out at any size, so scaling its reserve made no difference.

## End-of-table pool goes back by stake (Jason, 2026-11-05)

When a table ends with a pool still on it (round 20, nobody can afford the amount, or the Commons runs dry), the pool now goes back to each player in proportion to what they put in, the same way a rejected pool is refunded. Before this it was shared equally. That was an agent's interim default from draft 1, never Jason's decision.

Rounding: when a pool is split in proportion (the "by what each put in" preset, refunds, and the end-of-table return), leftover points from rounding down now go one each to the players with the largest fractions. Before, they went to the biggest contributors. For example, a pool of 12 with stakes 1, 3 and 3 now returns 2, 5 and 5 (it was 1, 6 and 5).

Simulation after both changes (4,000 tables): median 11 rounds, 34% reach round 20. Free Voter is close behind Edge Watcher as the best strategy (+9.6 and +9.9 per seat), and Pushover now finishes slightly behind (−1.1).

## Empty-pool exploit closed (Jason found it, 2026-11-05)

Jason found that a divider who survives a split starts the next round with an empty pool, so they could grab 0, "split" 0, vote 2, and collect the welcome bonus every round. The bots welcomed it because a share of 0 equals an equal share of 0. Bots exploited it too: Edge Watcher's grab trigger ignores the pool size. Once empty pools were blocked, welcomed splits fell from 24% to 9%, so the earlier welcome figures and achievement odds were inflated.

Decided: **grabbing opens only after the pool has gone round the table once since the last split (and at the start)** (`grabOpens: 'afterLap'`). Until then the Grab button is greyed out and says how many turns are left. This was Jason's second suggestion. It blocks token pools as well as empty ones, which "can't grab an empty pool" (`grabOpens: 'nonEmpty'`, also available) would not.

Simulation with the fix (4,000 tables): median 10 rounds, 21% reach round 20. 44% of splits are rejected, 50% accepted and 6% welcomed. Bot grabs now come later and are bigger (median pool 51), so greedy keeps are punished more often. Best strategies: Pool Watcher +10.2, Free Voter +8.1, Edge Watcher +7.6. Early Grabber, Greedy and Pushover finish level or behind.

Achievement odds (per table, for the style that suits each one) barely move: Nobody short-changed about 88%, Steady hand 85%, One clean grab 76%, Welcomed about 65% for a fair splitter who votes 2, Full distance 20–39%, Your vote counted 9–41%. The order stays the same.

## Reset achievements, permanent unlocks, Game 3 unlock (Jason, 2026-11-05)

- Both games have a **Reset** link under the achievements strip in the header, with an in-page "are you sure?" step (artifacts can't show browser dialogs). It clears that game's achievements and its one-time celebration, so the full fireworks play again.
- **Unlocks are permanent once earned** (`src/ui/progress-store.js`: `trunk.unlocked.centipede`, `trunk.unlocked.wheel`), so resetting Rising Pool never locks Game 2 again. Players who completed a game before this existed get the unlock recorded the next time they open that game.
- **All six Game 2 achievements unlock Game 3.** The full fireworks play once, the "mastered" card says the Wheel is unlocked for when it's ready, the header strip says "Game 3 unlocked", and the home page shows "Level 3 · Unlocked · In design". When Game 3 is built, its lock should check `isUnlocked('wheel')`.

## Coalition strategy and social voters (Jason, 2026-11-05)

Jason found a winning pattern. Give one round, grab the next (as often as the lap rule allows), pay everyone at least what they put in, find the player who votes 0, give them nothing, and keep their share. His table went from 20 to 81 points, and the Commons running dry at round 19 was the only brake. It worked because every bot judged only its own share. A copy of the strategy (`coalition` in `tools/sim-centipede-achievements.mjs`) averaged +40 a table against draft 3 bots, four times any other style, and was never rejected.

Jason preferred making bots more like human social voters over a "no grabbing twice running" rule. Decided (Jason, 2026-11-05), now in the bots:

- **Solidarity** (looking past their own share): Bookkeeper and Spiteful vote 0 if anyone who put something in is offered less than they put in. Patient and Mirror won't welcome such a split (they vote at most 1).
- **Taking turns:** Spiteful and Mirror vote 0 when the same player divides twice running and keeps more than 1.25 equal shares. Patient, Pool Watcher and Edge Watcher won't welcome any repeat divider.
- Pushover, Greedy, Early Grabber and Free Voter are unchanged: they still judge only their own share.

Results:

| Learner style (3,000 tables) | Mean net before | Mean net after | Median after | Sent out after |
|---|---|---|---|---|
| Coalition | +39.5 | +14.6 | +5 | 45% |
| Fair grabber (by stake, votes 2) | +10.1 | +6.3 | +5 | 2% |
| Grabs once | +4.6 | +4.4 | +5 | 2% |
| Steady giver | +4.9 | +4.5 | +5 | 0% |

The coalition now pays only at tables without social voters (20% of tables still give +30 or more). So it rewards reading the table rather than being a free win.

Bot tables (4,000): median 10 rounds, 21% reach round 20. 50% of bot splits are rejected and only 1% welcomed, because bot grabbers often short-change players who passed. Best strategies: Edge Watcher +11.5, Pool Watcher +9.7, Free Voter +7.5. Pushover is worst at −4.1.

Achievement odds for a fair player: Nobody short-changed about 90%, Steady hand 90%, One clean grab 78%, Welcomed about 50% (was 64%), Full distance 12–19% (was 20–39%), Your vote counted 9–44%. The order is unchanged.

## Dominance and grudges (Jason, 2026-11-05)

Jason still reached Full distance and dominated a table by keeping control of the grab, alternating a split that punished the last 0-voter with a fair split to appease the table. His table had none of the turn-taking bots (Pushover, Bookkeeper, Free Voter, Greedy, Early Grabber). He asked for more punishment for a repetitive grabber. Added:

- **Dominance:** a divider who also divided at least 2 of the last 3 splits. Spiteful, Mirror, Greedy, Early Grabber, Pool Watcher and Edge Watcher vote 0; the grabbers resent losing the grab. Patient won't welcome it.
- **Grudges:** a divider who short-changed this bot in an earlier split at the table. Spiteful, Mirror, Bookkeeper and Edge Watcher vote 0; Patient won't welcome it.

| Learner style (3,000 tables) | Mean net before | Mean net after | Sent out after |
|---|---|---|---|
| Dominator (Jason's alternating pattern) | +12.6 | +1.7 | 100% |
| Coalition | +14.6 | +2.2 | 100% |
| Grabs whenever the pool reaches a threshold, fair split, votes 2 | +6.3 | +3.5 | 48% |
| Grabs once, fair split | +4.4 | +4.6 | 2% |
| Steady giver | +4.5 | +4.5 | 0% |

Even a fair player who grabs often is now sent out at about half of tables. Repeatedly holding the pool is resented whatever the split. If that feels too harsh, dominance could need 3 of the last 4 splits.

Full distance became the hardest achievement (about 10–11% per table for a fair player), so it moved to last, after Your vote counted (about 22%).

## Divider goes last; punish greed, not frequency (Jason, 2026-11-05)

Jason was rejected and sent out after three fair grabs, while a greedy bot kept extra twice before being rejected on its third try. Decided:

- **Turn order after a split:** the next round runs in the opposite order, **starting with the player after the divider**, so the divider has the last turn. The lap then finishes on the divider's turn, and the first chance to grab goes to someone else. (The 2018 notes started the next round with the divider, before the lap rule existed.)
- **A fair divider** keeps no more than the larger of an equal share and their share by stake, rounded up. Bots now veto only greedy dividers who repeat (twice running) or dominate (2 of the last 3 splits). A fair divider who dominates loses at most a welcome, from Early Grabber, Pool Watcher and Edge Watcher (who want their own turn) and Patient. Solidarity and grudges are unchanged.

| Learner style (3,000 tables) | Mean net | Median | Sent out |
|---|---|---|---|
| Grabs often, fair split, votes 2 | +6.2 | +5 | 6% (was 48%) |
| Grabs once, fair split | +5.2 | +6 | 1% |
| Steady giver | +4.3 | +5 | 0% |
| Dominator (alternating punish/appease) | +7.1 | +3 | 59% |
| Coalition (exclude the 0-voter every time) | +11.0 | +4 | 53% |

The greedy patterns are now gambles: their median is below fair play, and they are sent out at more than half of tables. The coalition still averages slightly more than fair play, from the roughly 13% of tables without enough social voters, where it wins big.

Achievement odds for the style that suits each one: Nobody short-changed 91%, Steady hand 90%, One clean grab 84%, Welcomed 54%, Your vote counted 20–40%, Full distance 10–19%. The order is unchanged.

## The skim and the Skimmer bot (Jason, 2026-11-05)

Jason's third method: when the grab comes to him, pay everyone back exactly what they put in, keep the whole Commons bonus, and vote 2. Nobody is short-changed, so the solidarity voters stay quiet. He also saw a selection effect: the greedy grabber bots get voted out early, and the bots left behind are the passive ones. He reached round 20 easily and asked for a bot that competes with his method.

- Learner `patient skimmer` (skims when the pool reaches 25–40): +14.8 mean, +13 median. That is about three times fair play. It is sent out at 57% of tables but has usually banked its gains by then, and it reaches round 20 at 31% of tables. Grabbing at every chance (`skimmer`) does badly: sent out at 77% of tables, median −1.
- **New bot, Skimmer** (grabber family): gives until the pool reaches its mark (20–40, random per table), then grabs and skims. It competes for the grab by vetoing greedy repeat or dominant dividers and withholding its welcome from fair ones. It accepts a split that returns its stake and welcomes a proportional one.
- With the Skimmer in the roster, the patient skimmer learner drops to +12.4 mean, +11 median. The Skimmer is the best bot (+16.4 per seat). Tables run longer (median 14 rounds, 29% reach round 20), so Full distance is easier for fair players (about 23% per table, was 10–19%).
- The skim is still the strongest known style. One reason: a rejected grabber gets its own stake back and loses only its seat, so greedy grabs are cheap gambles.

## Free riders can be punished; rejected grabbers leave their points (Jason, 2026-11-05)

Jason found Free Voter coming out on top even when he tried to keep the cooperative players going. He couldn't punish it, because the solidarity voters defended anyone short-changed, free riders included. He also noted that a rejected divider walked away with their points. Decided:

- **Free riders:** a player who voted 0 at least twice on a split that passed and treated them fairly (at least what they put in, at least 80% of an equal share, nobody else short-changed). A protest 0 doesn't count. Bots see this publicly, and so does the player: the divide card marks them **free rider**.
- **Solidarity no longer defends free riders**, so a divider can cut them without being vetoed for it.
- **Bots that sanction:** Pool Watcher and Edge Watcher give free riders half of what they put in and share the difference with the rest. Skimmer does the same but keeps the difference. Mirror grabs to sanction free riders (once the pool reaches 20) and gives them nothing.
- **A grabber sent out by a rejection leaves all their points, refund included, in the pool** for the players who remain (`rejectedGrabberPoints: 'pool'`). The log's "pool after" shows what stayed behind.

Results (3,000 tables per learner style):

| Learner style | Mean net (median) | Sent out | Full distance | Free Voter at that table: mean, top of table |
|---|---|---|---|---|
| Fair + sanctions free riders | +16.3 (+19) | 12% | 72% | −3.3, 6% |
| Fair grabber, votes 2 | +18.0 (+19) | 3% | 71% | +5.1, 24% |
| Grabs once, fair | +13.9 (+14) | 2% | 34% | +11.7, 46% |
| Steady giver | +14.4 (+15) | 0% | 32% | +12.5, 42% |
| Patient skimmer | +0.5 (−20) | 67% | 31% | +16.0, 37% |
| Coalition | +5.3 (−20) | 50% | 41% | +11.1, 31% |
| Dominator | +12.0 (+18) | 34% | 56% | +1.5, 10% |

- Free riding now pays only when nobody punishes it, which is the lesson.
- Being sent out costs everything, so greedy styles typically end around −20. The points they leave behind lift everyone who stays, so tables run longer: median 15 rounds, 43% reach round 20.
- Bot tables: Bookkeeper +17.7, Patient +15.9, Spiteful +15.8, Edge Watcher +14.9, Free Voter +13.5, Skimmer +8.6, Pushover +5.3, Mirror −0.2, Pool Watcher −10.8, Early Grabber −19.4, Greedy −19.8.
- Achievement order by odds for the style that suits each one: Nobody short-changed 96%, Steady hand 93%, One clean grab 77%, **Full distance about 72%** (moved up from last), Welcomed 65–69%, Your vote counted 25–55%.

## Generous dividers aren't short-changed (Jason, 2026-11-05)

In round 20 Jason gave himself less than he had put in, to keep another player alive, and paid everyone else exactly their stake. The Bookkeeper vetoed it, because the solidarity check counted the divider among the short-changed. Fixed: the divider's own share no longer counts as short-changing, for solidarity, for free-rider detection, or for the "Nobody short-changed" achievement, which now reads "every other player".
