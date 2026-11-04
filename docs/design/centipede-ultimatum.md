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
- The table ends when fewer than 3 players remain, when nobody can afford to give (any pool left is shared equally), or when the Commons can't pay the round bonus.
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

## Bot roster (draft 2, 10 strategies)

| Strategy | Grabs | Divides | Judges | Leaves |
|---|---|---|---|---|
| Patient | never | equal | accepts at least half a fair share | no |
| Pushover | never | equal | always 2 | no |
| Bookkeeper | never | by what each put in (passers get 0) | accepts if it gets back what it put in | after a split that lost it points |
| Early Grabber | first turn with anything in the pool | keeps 60%, rest equal | at least half a fair share | no |
| Pool Watcher | pool at 40 or more | keeps 40%, rest by what each put in | at least half a fair share | no |
| Greedy | pool at 20 or more | keeps 80%, rest equal | at least 30% of a fair share | after its split goes through |
| Edge Watcher | when giving would leave it short next round | keeps 1.25 × fair, rest by what each put in | at least 60% of a fair share | no |
| Spiteful | never | equal | 0 unless given a fair share | no |
| Free Voter | never | equal | always 0 | no |
| Mirror | after a greedy split goes through | cuts the greedy divider out | at least 70% of a fair share | no |

Every bot votes 2 on its own split. "Never" grabs still allows a bot to give until it is broke. Tables seat at least one grabber, one judge and one reciprocator.

## First playable page (2026-11-04)

- `games/centipede-ultimatum/` with `src/ui/centipede-ultimatum/`: one human seat and five bots, or six bots in watch mode. Bots move on a short timer; the page waits for you on your turn, when you divide, when you vote and when you choose to stay.
- Dividing: a share for each player with − / + steppers, plus three presets (equal, by what each put in, keep half). The offer is enabled only when every point is assigned.
- Voting shows the split as bars next to what each player put in. After the vote the outcome card shows every share and every vote.
- The round log shows each turn (G = gave, · = passed, GRAB), then each player's offered share and their vote.
- The end card reveals every bot's strategy and each player's net, and asks what the leader did differently.
- Locked until all five Rising Pool achievements are earned (same localStorage key the landing page uses). `node tools/build-preview.mjs centipede-ultimatum --unlocked` builds a preview that opens anyway, because an artifact can't see the Game 1 achievements stored on the live site.
- Not built yet: points carrying between tables, Game 2 achievements, a "Read the table" exercise, and the landing page and nav links on other pages.
