# Ruler of the Galaxy

A dice battle for 2 to 6 players, played online with friends (robots fill empty seats). It is the third game on the arcade and lives at `/ruler`.

Six giant contenders circle a dying star. Roll the dice, smash your rivals with lasers, and seize the **Omni-Throne** in the galactic core. The rules follow the shape of the board game *King of Tokyo* (roll six dice up to three times, one ship "inside" that everyone else shoots, yield or hold, a market of cards bought with a currency you roll); the contenders, cards, names and the whole 3D galaxy are original.

The whole game is played in a 3D galaxy: a spiral Milky Way under the table, Andromeda and nebulas in the sky, a plasma star wrapped in a Dyson lattice in the middle, an asteroid belt round the rim, and the six contenders as animated 3D models that fly into the Core, fire lasers, burst into flames and come back as ghosts.

## How to win

- reach **20 Dominion Stars** (15, 20 or 25: the host picks), or
- be **the last flagship flying**.

Everyone starts with **10 Hull** (the most you can have, unless a card says otherwise).

## A turn

1. **Start inside** the Core (or the Binary Pulsar): +2 Stars.
2. **Roll six dice up to three times.** Tap dice to keep them between rolls.
3. **Resolve** the dice:

| Face | What it does |
|---|---|
| **1, 2, 3** | Three of a kind score that many Stars; each extra die of the same number scores 1 more |
| **Nanite Repair** | +1 Hull, only on the Rim (not inside). Three of them in one roll: pick an **Evolution** |
| **Laser Strike** | 1 damage each. Inside, you hit everyone on the Rim; on the Rim, you hit whoever is inside |
| **Dark Matter Shard** | +1 Dark Matter, spent in the Bazaar |

4. **Hit the ship inside** and its owner may **yield**: they fly back to the Rim and you take their seat. Holding is brave: you score every turn inside, but you cannot repair there.
5. **Nobody inside?** You fly in and gain 1 Star.
6. **Shop** in the Bazaar: three face-up cards. **Augments** (keep) stay with you; **Directives** (now) happen at once. Flushing the Bazaar costs 2 Dark Matter.

With 5 or 6 players a second seat opens: the **Binary Pulsar**. It works like the Core and collapses once only four flagships are left.

## Extras (the host can turn each off)

- **Contenders.** Six, each with a power and three Evolutions of their own:

| Contender | Power | Evolutions |
|---|---|---|
| 🤖 Mecha-Nova Prime | 11 Hull | Thorns of the Core, Siege Mode Lock, Overcharged Capacitor |
| 🦑 The Void Kraken | Making someone yield steals 1 Dark Matter | Hyperspace Grapple, Void Spores, Bio-Leech Tendrils |
| 🐝 Cyber-Hive Xenos | Flushing costs 1 | Brood Replication, Reverse-Engineered Tech, Acidic Spore Cloud |
| ☀️ Solaris Star-Eater | Starts with 2 Dark Matter | Critical Mass, Solar Prominence, Supernova Ejection |
| ⏳ Chronos Syndicate | An extra roll on the first turn, and after entering the Core | Paradox Loop, Chrono-Stasis Shield, Time Rewind |
| 🪨 Goliath Asteroid-Walker | Can never lose Stars | Kinetic Impactors, Magma Carapace, Planetary Bombardment |

- **Evolutions.** Three Repairs in one roll: choose one of your contender's Evolutions (each once).
- **Galactic anomalies.** Every third round an anomaly lasts the whole round: Solar Flare (lasers double, entering gives 3 Stars), Dark Matter Nebula, Gravity Collapse, Trade Convoy (cards 2 cheaper), Wormhole Storm (everyone inside is flung out) and Peace Summit (no laser damage).
- **Ghost ships.** A destroyed ship keeps playing: two ghost dice a turn that **haunt** whoever holds the Core (1 damage) or **drain** 1 Dark Matter from the leader.
- **Blitz.** 8 Hull, 3 Dark Matter to start, 15 Stars to win and half the timers.
- **Speed.** Chill, normal or quick timers.

## The cards (38 in the deck)

| Kind | Cards | What it is |
|---|---|---|
| **Augments** (keep) | 20 | Stay with you: a 7th die, an extra roll, armour, cheaper cards, Stars for holding the Core... |
| **Directives** (now) | 18 | Happen once: Stars, Dark Matter, repairs, damage to rivals, an extra turn... |

The card text is what the engine runs: an Augment names a `hook` the engine checks at the right moment, and a Directive is a list of steps, e.g. `[['stars', 2], ['hurtOthers', 1]]`. See `server/ruler/data.js`.

## Where things are

```
server/ruler/
  data.js      dice faces, contenders, evolutions, cards and anomalies as plain data
  engine.js    the rules: one long async function that asks people questions (ask / respond)
  bots.js      the robots: they answer the very same questions a person does
  index.js     the "/ruler" Socket.IO namespace: tables, seats, answers, chat
public/
  ruler.html, css/ruler.css
  js/ruler/
    main.js      screens, the socket, the store
    world.js     the 3D world: places every flagship at its seat, flies them in and out, moves the camera
    scene/       stage.js (renderer, bloom, the camera rig), galaxy.js (the sky, the spiral galaxies, nebulas, planets),
                 arena.js (the star, Dyson lattice, Omni-Throne, Pulsar, asteroid belt), ships.js (the six contenders),
                 effects.js (lasers, explosions, shockwaves, floating Stars and shards, fireworks)
    fx.js        reads the game log and turns each line into 3D effects, sounds, pop-ups and banners
    dice.js      the 3D dice tray (its own small renderer); faces.js draws the faces
    game.js      the table: player plates, the dice console with a preview of what you will get, the Bazaar
    home.js, lobby.js, prompts.js (yield / evolve / grapple), codex.js (How to play), chat.js, end.js, sound.js
  assets/models/ruler/   the 3D models (see ASSETS.md)
test/ruler.test.js    data, every rule, 70 robot-only games, a full live game over sockets and the routes
```

### How the engine works

Exactly like Phase to Space: a game is one async function (`run()` in `engine.js`). Whenever it needs a decision it calls `ask()` and waits; people answer with the `respond` event, and robots (or people who have gone quiet) are answered by `bots.js`. The questions are `dice` (roll with these dice kept, or resolve), `buy` (a card, flush, heal or done), `yield`, `evolve` and `grapple`. The server checks every answer, and the client only ever sees `viewFor(id)`.

Each log line has a kind (`k`: `roll`, `laser`, `damage`, `enter`, `yield`, `destroy`, `buy`...) and the client's `fx.js` has a handler for each, so the 3D scene, the sounds and the pop-ups always follow what really happened. `you.preview` tells the dice console what the current dice would give if you resolved now (Stars, repairs, damage, who gets hit, whether you would enter).

### The 3D scene

- three.js with an `EffectComposer` (bloom and ACES tone mapping). The camera rides a sphere around the star and flies to wherever the action is (`fly()` and `look()`), then drifts back to an overview.
- The galaxies are particle clouds drawn by a small shader; the star is a plasma shader; the asteroid belt is one instanced mesh.
- Mecha-Nova is the KayKit Combat Mech (animated), Chronos is built round a Kenney racing craft and Goliath carries a Kenney turret; the Kraken reuses No More Space's Parasite, and the Hive and the Star-Eater are built from code. Every one has the arcade's dark cartoon outline.
- A ghost ship is the same model in see-through wireframe.
- The browser pane used for testing pauses animation when it is hidden: `window.__rotg.step(seconds)` moves the scene and the dice by hand.

### Tuning

With the current numbers robots win about 70% of games on Stars and the rest by being the last ship flying, in about 8 rounds, and every contender wins between 20% and 28% of the time.

## Adding a card

1. Add it to `CARDS` in `server/ruler/data.js`: `card(id, 'keep' | 'now', cost, name, emoji, text, { hook })` for an Augment, or `{ fx: [[step, n], ...] }` for a Directive.
2. A new hook is checked in `engine.js` wherever it matters (`this.has(p, 'hook')`); a new step goes in `runEffect()`.
3. Tell the robots what it is worth in `cardValue()` in `bots.js`.
4. `npm test`. The tests refuse unknown hooks or steps and duplicate ids, and play 70 games to check nothing ever crashes or stalls.
