# Centipede & Ultimatum: design notes

Source: *Game 2 - multiplayer iterated - centipede with ultimatum (MI-CU)*, TrunK of Commons, 2018-08-07.

## Rules as implemented (engine draft, 2026-11-04)

- Six seats, everyone starts with 20 points. The Commons is a finite reserve of 120, as in Game 1.
- Players take turns in join order. Each turn a player **gives** the round's requirement (1 in round 1, rising by 1 each round) or **grabs** the pool.
- If everyone gives, the Commons adds 1 per player and the pool **carries over** to the next round. It grows until someone grabs (Jason, 2026-11-04).
- A grab starts an ultimatum. The grabber divides the pool, in whole points, among the players still in play (Jason, 2026-11-04).
- Everyone, the grabber included, votes 0, 1 or 2, paying what they vote. Rejecting (voting 0) is free (Jason, 2026-11-04).
  - Average below 1: the pool and the votes are forfeit to the Commons and the table ends.
  - Average from 1 to 1.5 (1.5 counts as closer to 1; Jason, 2026-11-04): the split is paid. The vote pool is shared equally in whole points, with any remainder going to the Commons.
  - Average above 1.5: the split is paid. The Commons rounds the vote pool up to a whole number per player, and it is shared equally (Jason, 2026-11-04).
- After an accepted split, each player stays or sits out. Players who sit out are excluded from the rest of the table (Jason, 2026-11-04). Fewer than 3 players ends the table. The pool restarts at 0, the requirement keeps rising, and the next round starts with the divider and runs in the opposite order.
- Game 2 stays locked until all five Game 1 achievements are earned (Jason, 2026-11-04).

## Interim defaults (agent's choice, open to change)

1. **Pay in full.** A player who can't afford the requirement is made to grab. Being broke hands you the knife.
2. **Order after a completed round.** It stays the same. The 2018 text only covers the order after an ultimatum.
3. **Commons runs dry.** If it can't pay the round bonus, the season ends and the pool is shared equally.
4. **Votes are paid before the split pays out.** A broke player casts the most they can afford.
5. **Round cap of 60.** This is a safety stop for simulation only.
6. Two switches exist for testing, both off by default: `rejectEndsGame` and `firstGrabRound`.

## Bot roster (draft, 9 strategies)

| Strategy | Grabs | Keeps | Judges |
|---|---|---|---|
| Patient | only when forced | equal | accepts at least half a fair share |
| Pushover | only when forced | equal | always 2 |
| Early Grabber | first turn with anything in the pool | 60% | accepts at least half a fair share |
| Pool Watcher | pool at 40 or more | 40% | accepts at least half a fair share |
| Greedy | pool at 20 or more, then leaves | 80% | accepts at least 30% of a fair share |
| Edge Watcher | when giving would leave it short next round | 1.25 × fair | accepts at least 60% of a fair share |
| Spiteful | only when forced | equal | 0 unless given a fair share |
| Free Voter | only when forced | equal | always 0 (lets others pay) |
| Mirror | after a greedy split goes through | what the greedy divider kept | accepts at least 70% of a fair share |

Every bot votes 2 on its own split.

## Findings from simulation (4,000 bot-only tables, 6 random strategies each)

- **Tables are short.** 99% end in a rejected split. The median table is over in round 1, and 55% end there. Early Grabber takes a pool of about 4 in round 1, keeps 60%, the others get nothing, and the split is voted down.
- **Locking grabs in round 1** (`firstGrabRound: 2`) only moves the same ending to round 2.
- **Free rejection decides most failures.** 58% of rejections would have passed if the zero-voters who had been offered a fair share had voted 1. The grabber's own 2 covers one zero at a six-seat table, but two zeros sink the split. Being too broke to vote decided only 3% of rejections at mixed tables. At an all-Patient table, though, it is the whole story: a forced grab around round 10, nobody can pay to vote, and the split fails even though it is perfectly fair.
- **Everyone loses on average.** Every table ends with a forfeited pool, so the Commons grows (median 129 at the end) and every strategy finishes slightly behind. Pool Watcher comes closest to even, and Pushover loses most.
- **Carrying on after a rejection is worse** (`rejectEndsGame: false`). Tables bleed out to the round cap, most splits are forced grabs by broke players, and every strategy loses 10 to 20 points. The 2018 rule that a rejection ends the game is protective.
- Even without Early Grabber and Free Voter, 95% of tables end in rejection, with a median of 3 rounds. Forced grabs made up about half of all ultimatums.
- No bot sat out under the default rules: the bots' stay habits almost never trigger. The sit-out cascade Jason anticipated is untested until bots get richer stay rules.
