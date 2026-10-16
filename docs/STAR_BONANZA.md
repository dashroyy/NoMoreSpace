# Star Bonanza

A star-trading card game for 3 to 7 players, played online with friends (robots fill empty seats). It is the fourth game on the arcade and lives at `/bonanza`.

It is a space remake of the classic planting-and-trading card game *Bohnanza* (Uwe Rosenberg, 1997): the beans become **stars**, the fields become **nurseries**, the coins become **lumens**. The rules follow that game's shape (a hand you may never reorder, planting in order, turning cards over and trading them with everybody, a payout table that rewards rare cards); the names, the story, the art and the whole 3D table are original.

## How to win

Grow stars in your nurseries and **harvest** them into lumens. When the deck has run out for the last time (the host picks 1, 2 or 3 times through it), the game ends: everything still growing is harvested and **the most lumens wins**. A tie goes to whoever holds more cards.

## A turn

1. **Plant.** You **must** plant the first star in your hand and **may** plant the next one too. Hands stay in the order they were dealt: you can never sort them. A nursery grows one kind of star at a time; planting a different kind means harvesting the nursery first.
2. **Turn over and trade.** Two stars are turned over from the deck. You can plant them (they go to your tray), or trade them and any star in your hand with the other players. While it is your turn, anybody can make you an offer, and you can offer to one person or to everybody. Stars you give away for nothing are a gift.
3. **Plant what you won.** Every star that changed hands in a trade, and every turned-over star you kept, must be planted straight away. Take only what fits.
4. **Draw three** stars, to the back of your hand. The next player goes.

**Harvesting happens any time**, even on somebody else's turn: tap a nursery and the stars you need for each lumen turn gold, and the rest burn out. A nursery with a **single star** is safe while any of your other nurseries has more than one. A **third nursery** costs 3 lumens (with 3 players everybody starts with three).

When the deck runs out it is shuffled again from the burnt-out stars (that is the first, or second, "time through"). The last time it runs out, the turn in progress is the last.

## Every star

3 to 5 players use the eight base kinds (104 cards); 6 or 7 players, or a host who switches on **Full galaxy**, use all eleven (154). Stars needed for 1, 2, 3 and 4 lumens (the real game's table, so the balance has had twenty-five years of testing: the more of a kind in the deck, the more of them you need):

| Star | In the deck | 1 ✦ | 2 ✦ | 3 ✦ | 4 ✦ |
|---|---|---|---|---|---|
| Red Dwarf (full galaxy only) | 24 | 4 | 7 | 10 | 12 |
| Brown Dwarf (full galaxy only) | 22 | 4 | 7 | 9 | 11 |
| Orange Dwarf | 20 | 4 | 6 | 8 | 10 |
| Yellow Dwarf | 18 | 3 | 6 | 8 | 9 |
| White Dwarf | 16 | 3 | 5 | 7 | 8 |
| Blue Giant | 14 | 3 | 5 | 6 | 7 |
| Red Giant | 12 | 2 | 4 | 6 | 7 |
| Neutron Star | 10 | 2 | 4 | 5 | 6 |
| Pulsar | 8 | 2 | 3 | 4 | 5 |
| Quasar | 6 | – | 2 | 3 | – |
| Magnetar (full galaxy only) | 4 | – | 2 | 3 | 4 |

Every kind has its own 3D look: a boiling plasma ball with a glow of its own, and extras. A pulsar sweeps two beams round like a lighthouse, a neutron star shoots a thin jet each way, a quasar fires jets from a tilted disc of gas, a magnetar spins loops of magnetic field, a red giant swells and a white dwarf glints. Each one is also drawn as a card picture (`public/js/bonanza/art.js`).

## Trading

Everybody trades at once, so there are no turns inside the trade: people post **offers** and the first person who can accept an offer takes it.

- Open the offer builder and tap the stars you want to give (in your hand, or turned over if it is your turn), tap the kinds you want back (tap again for two, three...), and post it.
- An offer from the active player goes to everyone, or to one person they choose. An offer from anyone else goes to the active player (you only ever trade **with the active player**, the way the real game does).
- You can have three offers open; take one back any time.
- Accepting hands over exactly the stars the offer asked for (the screen picks them for you; if you have spares in your hand it asks which).
- Robots make offers, take good ones, and accept a gift when the star is worth planting (and give away a star they cannot use rather than burn out a nursery). The active player ends the trading with **Done trading**, or the clock does.

## The menus

Built like the other games on the arcade: the title screen over the 3D table (which plays a little demo game by itself), Play online, Join a table (four letter boxes, or an invite link `/bonanza?join=ABCD`), Practice (two to six robots and a game length), How to play (a picture of every star with what it pays), Settings. The lobby has seven seats, a code with a copy-link button and a QR code, the match rules (game length, speed, full galaxy; the host edits them, everybody else sees them locked) and a Launch button.

In the game:

- **Along the top**, a chip for every player: lumens, cards in hand, and a swatch for each of their nurseries. Tap one to fly the camera to their table.
- **At the bottom**, a big prompt that says what to do right now (*Plant your Red Giant*, *Trade!*, *Plant what you won*), with the clock. Under it, **your hand** in order (the next star to plant is marked) and **your nurseries**. Plantable nurseries glow and say *plant here*; tap one (or press 1, 2, 3). Planting over a different kind asks whether to harvest first. Each nursery shows what it pays now and how many more stars the next lumen needs, and has a **Harvest** button.
- **On the right**, while stars are turned over, the trading panel: the turned-over stars, every offer (with a gold Accept when you can take it) and the offer builder.
- **In the 3D table**, each player has glowing nursery pads (the more of a kind, the brighter), a tray where the stars they have just won wait to be planted, and a stack of gold lumens. The deck is a violet orb in the middle with the stars left and which time through you are on.

Everything is readable with pictures first: the star pictures carry the meaning, and the words are big.

## The animations

Everything on screen comes from the game log, so everyone sees the same thing at the same moment (`fx.js`). Planting flies the star from your hand card into the nursery in a flash; a harvest pulls the stars together, bursts, and the lumens fly to the owner's stack (a big one makes the camera lean in); turned-over stars fly from the deck; a trade swaps stars across the table; the shuffle and the *Last turn!* warning shake the deck; the winner gets fireworks and the camera circles them.

## Robots

`server/bonanza/bots.js` plays the same actions a person can, through the same door: it plants where a star fits or the cheapest nursery to harvest, harvests when a nursery has peaked or its kind is running low, posts a couple of offers per turn (spare stars for stars that fit), accepts offers that help, and gives away stars it cannot plant. Anyone who goes quiet is taken over by a robot for that step (and flagged, with a sleepy marker). In an all-robot game nothing is ever lost or stuck: `test/bonanza.test.js` plays whole games with 3 to 7 robots.

## Where things are

```
server/bonanza/
  data.js      the eleven stars, counts and payout table, rules numbers and what the client needs
  engine.js    the rules: a state machine (plant, trade, tray, draw) driven by act(); viewFor(id) is what each person sees
  bots.js      the robots
  index.js     the "/bonanza" Socket.IO namespace: tables, seats, chat, the one "act" event
public/
  bonanza.html, css/bonanza.css (the game; the shared glass panels, buttons and menus come from ruler.css and ruler-menus.css)
  js/bonanza/
    main.js      screens, the socket, the store
    world.js     the 3D world: the table, the camera, and the attract-mode demo on the title screen
    scene/       table.js (the glass table, nursery pads, trays, lumen stacks, flights), starmesh.js (every kind of 3D star)
                 (the sky, plasma and effects are Ruler of the Galaxy's: public/js/ruler/scene/)
    art.js       the card pictures, drawn on a canvas
    game.js      the game screen: prompt, hand, nurseries, trading panel
    fx.js        reads the game log and turns each line into 3D effects, sounds, pop-ups and banners
    home.js, lobby.js, end.js, codex.js (How to play), settings.js, splash.js, ui.js, chat.js, sound.js
test/bonanza.test.js   the rules, the robots, a full live game over a socket, and checks that the client's pieces fit
```

### How the engine works

Unlike Ruler of the Galaxy and Phase to Space, which are one long function that asks people questions, this game never waits for one person: anyone can harvest at any time, and people trade while it is somebody else's turn. So `engine.js` is a small **state machine** (`plant`, `trade`, `tray`, `draw`). Everything a person does is one call, `act(playerId, { type, ... })`: `plant`, `skipPlant`, `harvest`, `buyField`, `offer`, `cancelOffer`, `accept` and `doneTrading`. The server checks everything; a mistake comes back as a plain message to just that person. Robots call the same `apply()`.

`viewFor(id)` hides everyone else's hand and tells the screen what to do (`you.todo`), which nurseries can be harvested for how much, and whether a third nursery can be bought. Each log line has a kind (`k`: `plant`, `harvest`, `reveal`, `offer`, `trade`, `tray`, `draw`, `reshuffle`, `last`, `afk`, `win`, `emote`) and `fx.js` has a handler for each; `test/bonanza.test.js` checks that the screen only reacts to lines the engine really writes.

### Testing

`SBZ_TEST_PACE=0.15` makes the robots act (almost) at once, handy for watching a whole game. Tests set a `pace` of 0.

## Tuning

Everything that decides how the game plays is in `data.js` (the payout table, the card counts, the start hand, how many stars you draw, the price of a third nursery) and the timers at the top of `engine.js`.
