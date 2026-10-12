# Phase to Space

A space card battler for 2 to 6 players, played online with friends (robots fill empty seats). It is the second game on the arcade, next to No More Space, and lives at `/phase`.

You command a starship. Recruit a wacky crew, hunt Void Beasts, and try to stop your friends doing the same. The rules follow the shape of the card game *Here to Slay* (action points, hero abilities that need a dice roll, challenges, modifier cards, monsters), and everything else (the cards, names, art, wording) is original and space themed.

## How to win

Be the first to have either:

- **a crew with all six disciplines** (Marine, Warden, Scout, Smuggler, Psion, Broadcaster) when your turn ends. Your Captain counts as one, or
- **three slain Void Beasts**.

## A turn: 3 Energy

Spend them in any order, on any mix of these:

| Action | Energy |
|---|---|
| **Draw** a card | 1 |
| **Play** a Crew, Gear or Protocol card from your hand | 1 |
| **Use** a Crew member already in your party (once per turn each) | 1 |
| **Attack** a Void Beast | 2 |
| **Flush**: discard your whole hand and draw five new cards | 3 |
| **Free powers**: some Captains and slain Beasts have a once-per-turn power | free |

Unused Energy is lost. Some Beasts give you a 4th Energy each turn.

## Rolling

Everything uses **two dice**. A Crew card says "9+": roll 9 or more to use it. Playing a Crew card from your hand lets you roll for it straight away. A Void Beast has a **slay** number (roll it or more and it joins your party) and a **fight-back** number (roll it or less and you pay the price, usually by sacrificing a Crew card). In between, nothing happens.

**Boosts** (free) can be played on *any* roll the moment it lands, by anyone: pick the plus number to help a roll or the minus number to hurt it. They stack. A window opens after every roll; players who hold no Boosts are not asked.

**Signal Jam** (free) answers a Crew, Gear or Protocol card as it is played. You and the player both roll (and Boosts can be played on that too); if the Jammer rolls the **same or higher**, the card is discarded and the Energy is wasted. A player can only be Signal Jammed **once per turn**, and Crew effects, Boosts and attacks cannot be Jammed.

## The cards (93 in the deck)

| Kind | Cards | What it is |
|---|---|---|
| **Crew** | 36 (6 per discipline) | Join your party. Each has a roll number and an effect. |
| **Gear** | 13 | Slid under a Crew card. Cursed Gear goes on a rival's Crew card. |
| **Protocols** | 16 | One-shot tricks. |
| **Boosts** | 20 | Plus-or-minus numbers for any roll. |
| **Signal Jam** | 8 | Cancel a card someone plays. |

Not in the deck: **12 Captains** (you pick one of 3 dealt to you, or 2 at a big table; it can never be destroyed or stolen) and **15 Void Beasts** (three face up at all times; slaying one gives its power for the rest of the game and draws you 2 cards).

The effects are plain words (DESTROY, DISCARD, DRAW, STEAL, SACRIFICE, SHIELD, SEARCH, LOOK, PULL, SWAP). The card text is also what the engine runs: see `server/phase/cards.js`.

## Where things are

```
server/phase/
  cards.js     every card, as plain data (an effect is a list of steps, e.g. [['discard', 2], ['destroy']])
  engine.js    the rules: one long async function that asks people questions (ask / respond)
  bots.js      the robots: they answer the very same questions a person does
  index.js     the "/phase" Socket.IO namespace: tables, seats, answers, chat
public/
  phase.html, css/phase.css, css/phase-cards.css, css/phase-help.css (odds, tips, pop-ups, flying cards)
  js/phase/    main (screens), table (the board), prompts (questions), dice, fx, cards, glyphs (card pictures), tips,
               lobby, home, codex, chat, sound
  assets/phase/art/   a portrait for every card (made by tools/art, see ASSETS.md)
  assets/phase/fx/    Kenney explosion and particle sprites
test/phase.test.js    cards, rules, robot-only games, a full live game, hub routes, the icon atlas, odds, hints, card pictures
```

### How the engine works

A game is one async function (`run()` in `engine.js`). Whenever it needs a decision (what to do with your Energy, which Crew card to destroy, whether to Signal Jam, whether to play a Boost) it calls `ask()` and waits. People answer with the `respond` event; robots, and people who are away or have gone quiet, are answered by `bots.js`. A person who does not answer an action question in time is "AFK": a robot steers for them until they press Take control. Unanswered Signal Jams and Boosts are simply passed.

Each question is one of: `captain`, `action`, `pick` (choose from a list: Crew cards on the board, players, cards), `react` (a Signal Jam?) or `boost`. The server checks every answer, so a client can never do anything the rules do not allow. Players only receive `viewFor(id)`, which has their own hand and only a count for everyone else's.

### Tuning

`node` can play thousands of robot-only games in seconds (see the scripts in `test/phase.test.js`). With the current numbers robots win about 70% by six disciplines and 30% by Beasts, in around 8 turns each. If you change a card or a rule, run the tests: they check that every game ends, no card is ever lost, and the engine never crashes.

## Reading the table without reading the log

The game tries hard to show, not tell:

- **Card pictures.** Under each card's name is a row of icons for what it does (`🃏+2 › 💥👤` is "draw 2, then destroy a Crew card"). `public/js/phase/glyphs.js` works them out from the card's own step list (and from Captain, Beast and Gear powers), so they can never disagree with the rules. How to play has a legend.
- **Big text.** Cards in your hand are sized to the window (`--w-hand` in `phase.css`) and keep their words; tap any card and a description in large type appears right above it (with your odds), and hovering shows the card big. Table places set their own card size; the size classes in `phase-cards.css` are weightless (`:where`) so those always win.
- **Odds.** The server sends each player `you.odds` (`oddsFor()` in `engine.js`): for every Void Beast, which of its needs your crew meets (`reqStatus()`), your chance to slay it and the chance it bites back; for your Crew, the chance each effect roll works. The table shows them as a bar and a padlock on the Beasts and a coloured ring round each Crew card's roll number.
- **A suggested move.** `hints.suggest` is what a robot would do in your seat (`suggest()` in `bots.js`: the robots' own scoring without their random wobble, so it never touches the game's dice). It glows on the table and as a bulb line by the buttons; tapping it picks the card. The bulb button in the header turns the tips off (remembered per browser).
- **Rolls on a number line.** Under the dice, 2 to 12, green where it works, red where it fails or a Beast bites, with a marker that slides as Boosts land.
- **Things happen where they happen.** `fx.js` reads the ship log: drawn cards fly from the deck to the player, played cards fly to the middle, a slain Beast flies into its slayer's party, and little pop-ups (`+2 🃏`, `💥`, `✓ it works`) rise over whoever was affected. Energy orbs pop when spent, a new discipline badge flashes, and a light runs round the box of whoever's turn it is. When it is not your turn, the bar at the bottom shows who is playing and how many Signal Jams and Boosts you are holding.

## Adding a card

1. Add it to `server/phase/cards.js` (a Crew card is `crew(id, class, name, art, roll, text, steps)`).
2. If it needs a new effect, add a step to the `STEPS` table in `engine.js` and (so robots understand it) a value in `bots.js`.
3. Give it a portrait: add it to `tools/art/portrait-table.mjs` and run the portrait tool (see ASSETS.md).
4. A new step also needs its pictures: add it to `STEP` in `public/js/phase/glyphs.js` (a new power goes in `PASSIVE`).
5. `npm test`. The tests refuse a card without a portrait or pictures, an unknown step, an icon that does not exist, or a duplicate id.
