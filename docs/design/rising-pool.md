# Rising Pool: design notes

Source: *Game 1 - multiplayer iterated - dilemma (MI-D)*, TrunK of Commons, 2018-08-07.

## Rules as implemented (prototype 0.1)

- Six seats: one human and five strategy bots (or six bots in watch mode).
- Each round r, players secretly choose **nothing** (0), **medium** (r) or **high** (2r). Nobody can give more than they hold.
- Average below r: the pool is forfeit to the Commons and the game ends for everyone.
- Average at or nearer medium (up to and including the halfway point 1.5r): the Commons tops the pool up to the next multiple of the player count; everyone gets an equal share.
- Average nearer high: the Commons tops up so everyone receives 2r.
- Between rounds each player chooses to stay or leave. Fewer than 3 players ends the table.
- The season ends at a hidden round between 7 and 12, so the last round can't be predicted (this avoids backward induction unravelling the game).
- Everyone starts with 20 points. There are no tokens or money: points exist only within a table.

## Decisions made while building (open to change)

1. **Hidden season end.** The 2018 notes have no end other than failure or players leaving. With rising stakes that would always end in failure, so a hidden end was added.
2. **Ties go to medium.** An average exactly halfway between medium and high counts as medium.
3. **Top-up rounds up.** "Closest integer divisible by the number of players" is read as the next multiple at or above the pool.
4. **Starting balance 20.** See the finding below.

## Finding from simulation (2,000 bot-only tables)

With the rules as written, almost every table ends in failure, typically by round 4–7.

Two causes:

- **Behavioural:** about a third of failures happen in rounds 2–3, when an exploiter's zero gift tips reciprocating bots (Grudger especially) into withdrawal.
- **Structural:** rising stakes outrun balances. A medium giver only breaks even in a shared round, so balances barely grow while the medium amount climbs by 1 each round. Over half of failures involve someone who could not afford the amount they chose. Raising the starting balance from 10 to 40 delays the collapse by a few rounds but doesn't remove it.

Open question for design: is "escalation exhausts the commons" the lesson Game 1 should teach, or should bonus rounds (or the Commons) grow balances enough for a well-cooperating table to sustain itself? Options include a larger bonus, slower escalation, or stakes as a share of the average balance rather than a fixed step.

## Educational layer

- Reputation ring around each seat: green if a player's average gift is at or above the table's, magenta if below (colours from the 2017 Wheel of Fortune indicator scheme).
- After each table: debrief, a "read the table" exercise (match each bot to its strategy), and achievements stored in the browser.
