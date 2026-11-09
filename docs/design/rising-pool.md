# Rising Pool: design notes

Source: *Game 1 - multiplayer iterated - dilemma (MI-D)*, TrunK of Commons, 2018-08-07.

## Rules as implemented (prototype 0.1)

- Six seats: one human and five strategy bots (or six bots in watch mode).
- Each round r, players secretly choose **nothing** (0), **medium** (r) or **high** (2r). Nobody can give more than they hold.
- Average below r: the pool is forfeit to the Commons and the game ends for everyone.
- Average at or nearer medium (up to and including the halfway point 1.5r): the Commons tops the pool up to the next multiple of the player count; everyone gets an equal share.
- Average nearer high: the Commons tops up so everyone receives 2r.
- Between rounds each player chooses to stay or leave. Fewer than 3 players ends the table.
- The Commons is a finite reserve of 120 points (decided by Jason, 2026-11-03). It funds top-ups and receives forfeited pools. When it can't cover a full top-up it pays what it has (in whole points, any odd remainder staying in the Commons) and the season ends.
- Everyone starts with 20 points. Your points carry from table to table (stored in your browser); a table needs 20 to join, and below that you can start over with 20 or watch the bots (Jason, 2026-11-04). Bots start each table with 20. There are no tokens or money.
- You can only choose a level you can pay in full. Bots that ask for more than they hold drop to the highest level they can afford, marked ↓ in the round log. (Prototype 0.2 let a short player give "all they had" at the high level, which made the log misleading.)

## Decisions made while building (open to change)

1. **Season end.** The 2018 notes have no end other than failure or players leaving. Prototype 0.1 used a hidden end round (7–12). Prototype 0.2 replaces it with the finite Commons: the season ends when the reserve runs out.
2. **Ties go to medium.** An average exactly halfway between medium and high counts as medium.
3. **Top-up rounds up.** "Closest integer divisible by the number of players" is read as the next multiple at or above the pool.
4. **Starting balance 20.** See the finding below.

## Finding from simulation (2,000 bot-only tables)

With the rules as written, almost every table ends in failure, typically by round 4–7.

Two causes:

- **Behavioural:** about a third of failures happen in rounds 2–3, when an exploiter's zero gift tips reciprocating bots (Grudger especially) into withdrawal.
- **Structural:** rising stakes outrun balances. A medium giver only breaks even in a shared round, so balances barely grow while the medium amount climbs by 1 each round. Over half of failures involve someone who could not afford the amount they chose. Raising the starting balance from 10 to 40 delays the collapse by a few rounds but doesn't remove it.

Open question for design: is "escalation exhausts the commons" the lesson Game 1 should teach, or should bonus rounds (or the Commons) grow balances enough for a well-cooperating table to sustain itself? Options include a larger bonus, slower escalation, or stakes as a share of the average balance rather than a fixed step.

**Settled (Jason, 2026-11-06):** escalation is part of the lesson. No rule change; the debrief says so. See "Review decisions" below.

## Educational layer

- Reputation ring around each seat: green if a player's average choice meets the medium threshold, magenta if below (colours from the 2017 Wheel of Fortune indicator scheme). Prototype 0.2 compared players to the table average; Jason chose the fixed threshold for Game 1 (2026-11-04) and kept relative reputation as a possible dynamic for a later, more complex game.
- After each table: debrief, a "read the table" exercise (match each bot to its strategy), and achievements stored in the browser.

## Read the table: scoring by evidence (2026-11-04)

Simulation with a perfect reader showed exact-match scoring was unfair: after two rounds each bot still fits about 3 strategies, and even at 8+ rounds fewer than half are uniquely identifiable. Lookalikes (Steady, Mirror, Keeper, Generous Mirror at a calm table) only separate when something goes wrong.

Jason chose evidence scoring: a guess is right if that strategy would have made exactly the same moves (and stay/leave decisions) as the bot did. `src/bots/evidence.js` replays the table to check. Random strategies declare every move they could make. Jittery Mirror can explain anything, so it only counts as a fit when it is the true strategy or nothing else fits.

The verdict for each bot says Right, Fits the evidence (naming the true strategy), or Doesn't fit (naming the first round where the guess would have acted differently), and lists the other strategies that also fit. The achievement needs every guess to fit at a table of four rounds or more.

Possible next steps (not built): live narrowing in the log ("3 fit") as a hint; a probing achievement for testing bots by giving nothing once.

## Finding: finite Commons (prototype 0.2, 3,000 bot-only tables)

- 98% of tables still end with the pool failing (median round 6). Under 2% last long enough to drain the Commons (median round 14).
- The Commons drains slowly at a well-run table. When everyone gives the same level there is no top-up at all: all-high pays everyone exactly what they gave. Top-ups come from mixed tables and from players who can no longer afford the high amount.
- A table where everyone always gives high lasts 20 rounds, then the Commons runs dry. A table where everyone gives medium never draws on the Commons and fails at round 21, when the medium amount passes everyone's balance.
- Because the reserve is visible, players can see the end coming. That invites end-game defection (give nothing in the last round or two). This may be a good lesson or a problem to design around.

## Strategy key

The page shows all ten strategies grouped by family, each with a one-line summary and a "tell": how it looks in the round log. Each table seats five of them under random names. Players can mark a guess for each bot in the round log during play; the guesses carry into the debrief, where all ten strategies are options.

## Achievements (2026-11-04)

Season survivor (stay until the Commons runs dry) proved effectively impossible: about 0.1% of tables even with the best simple strategy (always high), 1.6% when starting with 40 points. Jason replaced it with **Long haul**: keep the pool alive through round 8 while you stay.

Ordered easiest to hardest, with estimated per-table odds from 4,000 simulated tables under a play style suited to each:

| Achievement | Condition | Odds per table |
|---|---|---|
| Held the line | Give high in a round the pool would have failed without you | ~80% (always high) |
| Timed the exit | Leave ahead, then the pool fails after you go | ~55% (medium, leave once ahead from round 3) |
| Long haul | Pool alive through round 8 while you stay | ~21% (always high) |
| Rising tide | Three bonus rounds in a row while at the table | ~19% (always high) |
| Read the table | Every guess fits the evidence, table of 4+ rounds | skill, not luck |

A progress strip in the page header shows how many are earned. Earning all five plays a fireworks show (skipped for reduced motion), and shows a "Game 2 unlocked" box saying the player has demonstrated skill and understanding in social dilemma strategies. The landing page marks Level 2 as unlocked in the same browser.

## Reset achievements (Jason, 2026-11-05)

A Reset link under the achievements strip clears the five achievements and the one-time celebration. The Game 2 unlock is stored separately (`trunk.unlocked.centipede`) and survives a reset. See `docs/design/centipede-ultimatum.md`.

## Review decisions (Jason, 2026-11-06)

From the whole-system review (`claude/review-2026-11-06.md` in the claude.ai project). Decided, not yet built.

- **The escalation lesson (settles the open question above).** *Built 2026-11-06*: the debrief says, for example, "The pool fell short in round 6. Curlew chose to give nothing, and Ember couldn't afford what they chose (↓)." Its closing paragraph adds "They also outrun what players hold: even a table that trusts completely runs out of points to give." The debrief says what failed this table ("Reed chose 0", or "Quoll couldn't afford medium ↓"). It also says that rising stakes outrun balances, so even a trusting table has limits. No rule change. In simulation, 84% of failing rounds include a ↓, and 12% fail on affordability alone.
- **"What this table showed" card.** One or two things that happened at this table, each with one sentence naming the idea and its source, with a link (for example Axelrod's nice, retaliatory, forgiving and clear; noise; public goods). Jason picks from drafts. Same card as Game 2.
  - *Built; Jason kept all seven Game 1 ideas as drafted (2026-11-06).*
  - A failed round gives one card, named by its cause. If anyone couldn't afford their gift (↓), it shows "rules people can keep" (Ostrom's congruence, which carries the escalation lesson). If players only chose nothing, it shows "a threshold public good".
  - Share of 1,500 simulated tables showing each idea: rules people can keep 60%, nice/retaliatory/forgiving/clear 44%, threshold public good 40%, end-game problem 26%, free rider 15%, mistakes and forgiveness 2%. The shadow of the future is found at 10% of tables but is always outranked.
- **Screen readers.** One quiet announcer per page gives each round's result. Jason sees the exact sentences before they go live.
  - *Built, and the wording approved as drafted (Jason, 2026-11-06).*
    - It reads the round prompt ("Round 2: give nothing, medium 2 or high 4. You have 21 points."), the result with your gain or loss and the stay question, the table's end, Read the table's verdict, and the "not enough points" screen.
    - When you're watching, it says nothing until the table closes, because rounds come every 1.4 seconds.
    - The table picture's spoken label describes each ring as "gives medium or more on average" or "gives less than medium on average".
- **Reputation rings.** Explained on the page, with a legend and a text alternative. The threshold is unchanged. *Built 2026-11-06:* the rings are thicker, and "gives less than medium" is dashed as well as magenta, so colour is never the only cue (Jason). The legend says "solid" and "dashed", and the spoken label gives each player's ring in words. *Moved 2026-11-08 (Jason):* the legend now sits at the end of How it works, followed by a **Collapse and play** button, as in Game 2 (see `centipede-ultimatum.md`).
- **Order of work, and review flow.** See the same section in `centipede-ultimatum.md`.

## Achievements section (Jason, 2026-11-09)

A collapsible **Achievements** section sits below How it works, listing every achievement with what it asks and whether it is done (DONE, NEW or TO DO), plus the progress bar. It starts closed and remembers being opened. The header strip has a **Show ▾** button that opens the section and scrolls to it. It is built once in `src/ui/common.js` (`achievementsListHtml`, `showAchievementsButton`) and shared by both games. The end-of-table card is unchanged.

The header strip has only **Show ▾**. **Reset** sits inside the Achievements section, at the end of the progress line (after "Game 2/3 unlocked"), so it can't be tapped by accident from the strip (Jason, 2026-11-09). Reset still asks for confirmation.
