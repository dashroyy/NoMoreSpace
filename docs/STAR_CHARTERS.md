# Star Charters

A space tile-laying game for 2 to 5 players, played online with friends (robots fill empty seats). It is the fifth game on the arcade and lives at `/charters`.

It takes the shape of the classic tile-laying game *Carcassonne* (Klaus-Jürgen Wrede, 2000) and moves it to space: the roads become **warp lanes**, the cities become **space stations**, the monasteries become **deep space arrays**, the fields become the **void**, and the meeples become little tin **probes** (plus a **dreadnought** that counts as two). On top of that are the space twists: **wormholes**, **black holes**, **anomalies** and **thruster fuel**. The tiles, art, names and the 3D world are all original; the name *Carcassonne* is not used anywhere.

On purpose it looks like none of the other games: a **1960s space-age toy set**. Thick tiles of deep blue space are laid out on a cream star chart (whose faint grid lines up with the tiles); stations are cream enamel decks of little towers, glass domes and lit windows with a teal hull wall; warp lanes are glowing gold tubes with stripes running along them; probes are tin rockets in each captain's colour. Real soft shadows and studio light, no outlines (Star Bonanza is the cel-shaded one), a rounded retro display font (Righteous), and a swinging lounge tune with vibraphone, walking bass and a theremin for music.

## How to win

Lay tiles to build the map, claim what you build with probes, and score when it is finished. When the last tile is laid, unfinished things score a little and the void is counted. **The most points wins** (a tie goes to whoever finished more features).

## A turn

1. **Lay a tile.** You get the next tile from the bag (everyone can see it, and the two after it). Put it next to the map so **every edge matches** its neighbour: lane to lane, station to station, void to void. The glowing squares show everywhere it fits; tap one, turn the tile with ⟲ ⟳ (it only turns the ways that fit there) and press **Place**. A tile that fits nowhere goes back in the box.
2. **Send a probe (or not).** You may put **one** probe, or your dreadnought, on a piece of the tile you just laid, as long as **nobody is on that feature yet**. Markers show where you can. Or, instead, burn **thruster fuel** to call one of your probes home. Then press **End turn**. Nothing is sent to the server until then, so **Back** always works.
3. **Score.** Anything finished scores at once. Whoever has the **most strength** on it (a probe is 1, the dreadnought 2) gets the points; a tie pays everyone in it. The probes come home.

Two features each with their own probes can be **joined** by a later tile; then they are one feature and the most strength wins it. That is how you take over somebody else's station (the dreadnought helps).

## What scores what

| Feature | Finished when | Finished | Left unfinished at the end |
|---|---|---|---|
| 🛣️ **Warp Lane** | both ends stop (at a hub, a station, an array, or a wormhole whose twin is out) | 1 a tile | 1 a tile |
| 🏙️ **Station** | its hull is sealed all the way round | 2 a tile, +2 per reactor core | 1 a tile, +1 per core |
| 📡 **Deep Space Array** | all 8 tiles round it are there | 9 | 1, +1 per tile round it |
| 🕳️ **Black Hole** | all 8 tiles round it are there | 9 | 1, +1 per tile round it |
| ✨ **Void** | never: scored at the end | | 3 for each **finished** station it touches |

A probe in the void lies down (like a farmer) and stays there all game. Void trawling can be switched off in the lobby for new players.

## The space twists

- 🌀 **Wormholes.** The bag holds two **Wormhole Gates** (a lane runs into a violet portal) and two **Wormhole Stations** (a station with a cyan portal). A portal is an open end until its twin is on the map; from then on, whatever runs into one is **joined** to whatever runs into the other, however far apart (a glowing bridge arcs over the map between them). Join your lane to a rival's from across the galaxy, and the most strength takes it.
- 🕳️ **Black hole slingshot.** Lay a tile next to a black hole (or lay the black hole itself) and you may send your probe to **any unclaimed lane, station or array on the tiles round the hole**, not just the tile you laid. (Not the void.)
- 💎 **Anomalies.** Glowing gems float two squares out from the map. The first tile laid on one grabs it: ⛽ **+1 thruster fuel**, 💎 **+3 points**, or ⏩ a **warp boost** (take another turn straight away). A new one appears when one is taken.
- ⛽ **Thruster fuel.** Everyone starts with 2 (at most 4). Instead of sending a probe out, burn one to call any of your probes home (it scores nothing). Good for a probe stuck on a lane that will never finish.
- 🛸 **Your fleet**: 7 probes and the dreadnought.

## The tiles

27 kinds, **75 tiles in a Classic game** (about 30 minutes) and **38 in a Sprint** (about 10). The starting tile is a Docking Ring (a station on one side, a lane across). The mix follows the original game's (lots of lane bends and straight lanes, station caps, wedges and rings, a few arrays, one crossroads and one megastation), plus the wormhole twins and the black holes; wormholes always come in pairs, in both lengths.

Each tile is drawn as a 7 x 7 map of letters in `server/charters/tiles.js` (`.` void, `S` station, `C` reactor core, `Q` station wormhole, `L` lane, `O` lane wormhole, `X` lane hub, `A` array, `H` black hole). Everything else is worked out from the drawing: what each edge is, the separate pieces on the tile (flood fill), and which piece is on each of the twelve "ports" (three per side: left, middle, right) where pieces join the tile next door. The same drawing goes to the browser, which builds the 3D tile from it, so the rules and the picture cannot disagree. A test checks every tile is drawn properly (each edge all station, all void, or void-lane-void, and no pocket of void with no way out).

## The board and scoring (server/charters/board.js)

Features are worked out afresh whenever needed: a union-find over every piece of every tile, joining pieces across matching ports, and the two pieces with portals once both twins are out. A feature knows its tiles, cores, open ends (sides with no neighbour, plus a portal with no twin), the probes on it, and (for the void) which stations it touches. With 75 tiles that is a few hundred pieces, so it is cheap to redo for every spot a tile could go: the server works out, at the start of each turn, every place the tile fits, where a probe could go on each, and what each would finish, and sends that list to the captain whose turn it is. The client never has to know the rules.

## The robots (server/charters/bots.js)

A robot tries every place the tile fits and every place it could send a probe (or the dreadnought, or calling one home), guesses what each is worth (points it finishes now, how likely what it joins is to finish, an anomaly's prize, keeping probes in reserve, rivals' gains counted against it), and picks the best with a pinch of luck. Each leans a little one way (builder, trawler, racer or steady), worked out from its name. Somebody who goes quiet for a whole turn (60 seconds at Normal speed, 108 at Chill, 33 at Quick) has a robot play for them until they are back.

## The screen

- **The map** fills the screen: drag to look around, wheel or pinch to zoom, ⌖ to see it all. **Point at anything** (or tap it on a phone) to light up the whole feature and see its size, open ends, what it is worth finished and unfinished, and who is winning it. Small tags over the probes show what their features are worth (Settings can hide them).
- **Captains** down the left (along the top on a phone): colour, score, probes and dreadnought at home, fuel, and a timer bar on whoever's turn it is.
- **Next up** (top right): the next two tiles, for everyone.
- **The dock** (bottom): your tile (turned the way it will go), what to do next in big words, and the buttons. Keys: Q / R turn, Enter places and ends the turn, Backspace goes back, arrows or WASD pan, + / - zoom, F fits the map.
- **Effects** come from the game log: tiles land with a clack and a ring of dust, probes come down on a flame and blast off home when they score, a sealed station gets confetti and a beam of light, a little ship races down a finished lane, an array fires a beam, the wormholes open with a banner and a theremin, and at the end every unfinished feature is counted up one after another before the podium.

## Code

```
server/charters/
  tiles.js    the tiles as 7 x 7 drawings, and everything worked out from them
  board.js    the map: placing, features (union-find), scores, winners
  data.js     colours, lengths, anomalies, and the data the browser gets (/charters-data.json)
  engine.js   the game: lobby, turns, options, scoring, anomalies, the end, viewFor
  bots.js     the robot captains
  index.js    the Socket.IO namespace /charters
public/charters.html, public/css/charters.css
public/js/charters/
  main.js, net.js, ui.js, sound.js, settings.js, splash.js, chat.js
  home.js, lobby.js, game.js (the turn and the read-outs), fx.js (effects from the log), end.js, codex.js (How to play)
  art.js      photographs every tile from above at load, for the dock and How to play
  world.js    the 3D world: the chart table, the map, the camera, the demo map on the title screen
  scene/      look.js (materials, textures), stage.js (renderer, camera, controls), tiles3d.js (a tile from its drawing),
              pieces.js (rockets, anomalies), board3d.js (the map in step with the game), effects.js
test/charters.test.js   tiles, every rule, robot games, a live socket game, and the client's pieces
```

To try it locally: `npm run dev` and open `http://localhost:3000/charters`. `SCH_TEST_PACE=0.25` makes robots quicker.

## Ideas for later

Lobby switches for **Unstable Cores** (big points if the station is sealed, minus points if it is left open), **Trade Routes** (a finished lane joining two sealed stations scores double), a hand of two tiles, light **factions**, an **Engineer drone** (extend its feature for a second tile), and a **Daily Sector** solo puzzle with the same tiles for everyone and a leaderboard.
