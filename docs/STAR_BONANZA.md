# Star Bonanza

A silly trading card game for 3 to 7 players, played online with friends (robots fill empty seats). It is the fourth game on the arcade and lives at `/bonanza`.

It is a cartoon space-farm remake of the classic planting-and-trading card game *Bohnanza* (Uwe Rosenberg, 1997). You are a space farmer on a floating island; the beans become **star buddies** (chubby little stars with faces and costume gags), the bean fields become **patches** of soil, and the coins are gold **Star Coins**. A UFO flown by Zorp the alien is the deck. The rules follow the original's shape (a hand you may never reorder, planting in order, cards turned over and traded with everybody, a coin table that rewards rare cards); the characters, jokes, art and the whole 3D farm are original.

On purpose it looks nothing like the other games on the arcade: bright candy colours, chunky stickers with thick outlines, bouncy buttons, comic-book sound words, cartoon 3D (toon shading, outlines, no glow), boings and ka-chings for sound and a marimba tune for music.

## How to win

Grow star buddies in your patches and **harvest** them for coins. When the UFO has run out of stars for the last time (the host picks 1, 2 or 3 trips), the game ends: every patch is harvested and **the most coins wins**. A tie goes to whoever holds more cards.

## A turn

1. **Plant.** You **must** plant the first card in your hand and **may** plant the next one. Hands stay in the order they were dealt: no sorting! A patch grows one kind of star at a time; planting a different kind means harvesting the patch first.
2. **Trade.** The UFO beams down two stars. You can plant them, or swap them (and any card in your hand) with the other farmers at the **Trading Post**. While it is your turn anybody can offer you a deal, and you can offer to one farmer or to everyone. Giving a star for nothing is a gift.
3. **Plant your winnings.** Every star that changed hands, and every beamed-down star you kept, must be planted straight away. Only take what fits!
4. **Draw three** cards, to the back of your hand. Next farmer.

**Harvest any time**, even on somebody else's turn: the stars you need for each coin are on every card (the "beanometer"); the rest wander off. A patch with one **lonely star** is safe while any of your other patches has more. A **third patch** costs 3 coins (with 3 farmers everybody starts with three).

## The star buddies

Each is named after a real kind of star, and the joke is in taking the name literally. 3 to 5 players use eight kinds (104 cards); 6 or 7 players, or a host who switches on **All 11 star buddies**, use all eleven (154). Stars needed for 1, 2, 3 and 4 coins (the original game's table, so the balance has had decades of testing: the commoner the kind, the more of them each coin takes):

| Star buddy | Who they are | In the UFO | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| Red Dwarf (all 11 only) | grumpy bearded miner in a hard hat | 24 | 4 | 7 | 10 | 12 |
| Brown Dwarf (all 11 only) | sleepyhead in a nightcap | 22 | 4 | 7 | 9 | 11 |
| Orange Dwarf | garden gnome | 20 | 4 | 6 | 8 | 10 |
| Yellow Dwarf | far too sunny, in a straw hat | 18 | 3 | 6 | 8 | 9 |
| White Dwarf | retired old-timer with specs and a moustache | 16 | 3 | 5 | 7 | 8 |
| Blue Giant | gym buddy in a sweatband | 14 | 3 | 5 | 6 | 7 |
| Red Giant | puffed-up, sweating hothead | 12 | 2 | 4 | 6 | 7 |
| Neutron Star | tiny, but lifts a dumbbell | 10 | 2 | 4 | 5 | 6 |
| Pulsar | winking party DJ in headphones | 8 | 2 | 3 | 4 | 5 |
| Quasar | show-off in shades and a crown | 6 | – | 2 | 3 | – |
| Magnetar (all 11 only) | so attractive spoons stick to it | 4 | – | 2 | 3 | 4 |

The buddies are built in 3D from simple shapes (`scene/critters.js`): a puffy five-pointed star body, eyes that blink, a mouth, and a costume. The card pictures are photographs of those same models, taken once when the game loads (`art.js`), so a card always looks like the star in the patch.

## Trading

Everybody trades at once, so there are no turns inside the trade: people put **deals** on the table and the first person who can take a deal gets it.

- In **Make a deal**, tap the cards you would give (in your hand, or beamed-down ones on your turn), tap the kinds you want back (tap again for two, three...), and put it on the table.
- A deal from the farmer whose turn it is goes to everyone, or to one farmer they pick. A deal from anyone else goes to the farmer whose turn it is (you only ever trade **with the active farmer**, as in the original).
- Three deals open at once at most; take one back any time.
- **Deal!** hands over exactly what was asked for (the game picks the cards; if you have spares in your hand, it asks which).
- Robots make deals, take good ones, accept a gift when it is worth planting, and give away stars they cannot use rather than ruin a patch. The active farmer closes the Trading Post with **Done trading**, or the clock does.

## The screens

- **Start screen.** The bouncing logo and a stripy loading bar, a funny tip, then **Press any key** (also what lets the browser play sound). The camera swoops from deep space down to the farm.
- **Title screen.** The logo in the middle with star buddies peeking round it, four big chunky buttons (Play with friends, Join a farm, Practice, How to play), your farmer name (tap to change it; the dice makes up silly ones like *Captain Pickles*) and Settings. The farm plays a little demo game behind, with the camera slowly circling.
- **Lobby.** The farm code on four tilted sticker letters, an invite link and a QR code, up to seven farmers (with Add robot), the house rules (how long, speed, all 11 buddies), a chat, and a big **Let's farm!** button.
- **The game.** Along the top, a sticker for every farmer (coins, cards in hand, their patches; tap one to fly over their farm) next to the UFO's star count. At the bottom, **Zorp** says what to do right now in a speech bubble (with a different joke each turn), your **hand** of cards with their coin tables and a *Next!* sticker on the card you must plant, and your **patches** as wooden planters (*Plant here!*, *Harvest first*, *Lonely star*, what they are worth and how many more the next coin needs). Keys: 1, 2, 3 plant; D ends your trading; Esc opens the menu.
- **Trading Post.** A market stall with a striped awning: the beamed-down stars, the deals on the table and the deal-maker.
- **The end.** A podium for the top three, everyone's coins and a few silly awards (Jackpot!, Wheeler-dealer, Big softie, Rarest buddy).

## The 3D farm and the effects

Everything on screen comes from the game log (`fx.js`), so everyone sees the same thing at the same moment.

- Every farmer has a **floating island** (grass on an upside-down rock, with bushes, flowers and spotty toadstools), two or three **soil patches**, a crate for won stars, a pile of **gold coins** and a bouncing arrow when it is their turn. The **UFO** hovers in the middle with Zorp at the wheel, its lights chasing round and a tractor beam holding the beamed-down stars.
- **Planting**: the card flies from your hand into the patch with a puff of soil and a *PLOP!* or *BOING!*.
- **Harvesting**: the buddies hop off the patch, coins fly to the pile with a *KA-CHING!* (a big one gets confetti and a camera bump; harvesting for nothing gets a sad *wah-wah*).
- **Trading**: stars fly between islands with a *SWAP!* (or *AWW, A GIFT!*), and the robots shout things like *Psst! Wanna trade?*.
- **Drawing**: three card backs flip out of the UFO. **Refill**: the UFO zooms off and comes back full (slide whistle). **Last call!** when it is empty for good, and a confetti party for the winner.
- When a lot happens at once (the last harvest of the game), the effects get lighter so it never turns into a blur.

## Robots

`server/bonanza/bots.js` plays through the same `act()` door a person uses: it plants where a star fits or over the cheapest patch, harvests when a patch has peaked or its kind is running low, makes a couple of deals per turn, takes deals that help, and gives away what it cannot plant. Anyone who goes quiet is taken over by a robot for that step (a *💤* shows, and touching the screen takes back over). `test/bonanza.test.js` plays whole robot-only games with 3 to 7 farmers.

## Where things are

```
server/bonanza/
  data.js      the eleven star buddies (counts, coin tables, persona, colours), rules numbers, what the client needs
  engine.js    the rules: a state machine (plant, trade, tray, draw) driven by act(); viewFor(id) is what each person sees
  bots.js      the robots
  index.js     the "/bonanza" Socket.IO namespace: tables, seats, chat, the one "act" event
public/
  bonanza.html, css/bonanza.css (everything: this game shares no styles with the others)
  js/bonanza/
    main.js      screens, the socket, the store
    world.js     the 3D world: the farm, the camera, the attract-mode demo on the title screen
    scene/       stage.js (toon renderer and camera), sky.js (cartoon space), critters.js (the star buddies, coins, card backs),
                 farm.js (islands, patches, the UFO, flights), toonfx.js (puffs, confetti, sparkles, rings)
    art.js       the card pictures, photographed from the 3D buddies
    game.js      the game screen: Zorp's bubble, hand, patches, the Trading Post
    fx.js        reads the game log and turns each line into effects, comic words, sounds and banners
    home.js, lobby.js, end.js, codex.js (How to play), settings.js, splash.js, ui.js, chat.js, sound.js
test/bonanza.test.js   the rules, the robots, a full live game over a socket, and checks that the client's pieces fit
```

### How the engine works

Unlike Ruler of the Galaxy and Phase to Space, which are one long function that asks people questions, this game never waits for one person: anyone can harvest at any time, and people trade while it is somebody else's turn. So `engine.js` is a small **state machine** (`plant`, `trade`, `tray`, `draw`). Everything a person does is one call, `act(playerId, { type, ... })`: `plant`, `skipPlant`, `harvest`, `buyField`, `offer`, `cancelOffer`, `accept` and `doneTrading`. The server checks everything; a mistake comes back as a plain message to just that person. Robots call the same `apply()`. (Inside the code a patch is still a "field" and coins are "lumens" or the "stash"; only the words on screen changed.)

`viewFor(id)` hides everyone else's hand and tells the screen what to do (`you.todo`), which patches can be harvested for how much, and whether a third patch can be bought. Each log line has a kind (`k`: `plant`, `harvest`, `reveal`, `offer`, `trade`, `tray`, `draw`, `reshuffle`, `last`, `afk`, `win`, `emote`) and `fx.js` has a handler for each; `test/bonanza.test.js` checks that the screen only reacts to lines the engine really writes.

### Testing

`SBZ_TEST_PACE=0.15` makes the robots act (almost) at once, handy for watching a whole game. Tests set a `pace` of 0. In the browser, `window.__sbz.step(seconds)` moves the 3D scene forward by hand (a hidden tab gets no animation frames).

## Tuning

Everything that decides how the game plays is in `data.js` (the coin table, the card counts, the start hand, how many cards you draw, the price of a third patch) and the timers at the top of `engine.js`.
