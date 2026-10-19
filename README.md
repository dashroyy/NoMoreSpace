# Starcade

Five free multiplayer games that run in the browser, on one site and one server. The front page is a game picker.

- **[No More Space](#no-more-space)** (`/nms`): a spooky social-deduction game on a 3D spaceship, 3 to 15 players.
- **[Phase to Space](docs/PHASE_TO_SPACE.md)** (`/phase`): a space card battler for 2 to 6 players with robots to fill empty seats: recruit a crew, slay Void Beasts and Signal Jam your friends.
- **[Ruler of the Galaxy](docs/RULER.md)** (`/ruler`): a 3D dice battle for 2 to 6 players (robots fill empty seats), in the spirit of *King of Tokyo*: roll, blast your rivals with lasers and hold the Omni-Throne at the heart of a 3D galaxy.
- **[Star Bonanza](docs/STAR_BONANZA.md)** (`/bonanza`): a silly trading card game for 3 to 7 players (robots fill empty seats), a cartoon space-farm remake of *Bohnanza*: grow star buddies (one of them farts) on a floating island in a cel-shaded cartoon world, swap them with everyone at once and cash them in for coins.
- **[Star Charters](docs/STAR_CHARTERS.md)** (`/charters`): a space tile-laying game for 2 to 5 players (robots fill empty seats), in the spirit of *Carcassonne*: lay tiles to build warp lanes and space stations, claim them with tin-rocket probes, open wormholes, slingshot round black holes and grab anomalies, on a 1960s space-age chart table.

The first three share the same fonts and look (Star Bonanza and Star Charters each have a look of their own), and there is an optional custom icon set to replace emoji (`?icons=on`; see [docs/ASSETS.md](docs/ASSETS.md)); older invite and replay links (`/?join=CODE`) still go to No More Space.

# No More Space

A spooky, slightly silly space spin-off of **Blood on the Clocktower**, played on a 3D ship you walk around like **Among Us**, with the paranoia of **The Traitors**.

*The ship is falling into a black hole. Something aboard is not human. Find it before there is no more space.*

- 🎭 **72 hidden roles in four scripts** (17 of them new: a Pathfinder who follows footprints through the 3D ship, a Mime who really cannot speak, a Signal Jammer whose static hides a player's words, a Mastermind who keeps the game going after the Parasite is airlocked, a Cuckoo that lays its egg in a Drifter, and more; see [docs/SCRIPTS.md](docs/SCRIPTS.md)) (🗡️ **Citadel of Traitors** is the fourth: a castle under a Blood Moon, based on the TV show *The Traitors*, with a Prize Pot, daily Shields, recruiting, unmasked banishments and 9 more roles; 🦠 **Outbreak** is the third: the Demon infects instead of killing, in a lab station adrift in a spore cloud, with 11 more roles. Details in [docs/SCRIPTS.md](docs/SCRIPTS.md)): 🕳️ *Black Hole Blues* has 23 (22 matching Blood on the Clocktower's *Trouble Brewing*, plus the 🤡 Holo-Jester), and 🎪 **Cosmic Carnival** is a second script with 12 new roles: a Lion Tamer who guesses the Parasite, a Method Actor who thinks it is the Parasite, a Clown whose last pie can lose the game, a Stage Double whose twin the crew cannot afford to lose, and a mirror Demon that makes every clue lie (see [docs/SCRIPTS.md](docs/SCRIPTS.md))
- 👥 **3–15 players**, using BotC's own setup table (plus a quick 3–4 player "Short Haul" mode)
- 👨‍✈️ Play with a human **Captain** (Storyteller) running a full **Command Station**, or let **ARIA the autopilot** run the game
- 🚀 **3D ship** with 12 rooms that each have their own moving details and sounds, proximity text & voice chat, 11 task minigames, window clues, night drawings on the walls
- 🕐 BotC-style days: private chats → emergency meeting → nominations where **everyone votes YES/NO at once** and a clockwise **vote clock** reveals the hands → airlock, with a **Ready** button to skip ahead when everyone's done talking
- ⚡ **Ship systems**: once-per-game online abilities for 8 roles: intercept a room's chat, door logs, lockdowns, sensor sweeps, med-scans, spoofed messages, disguises and blackouts
- 🤖 Robot crewmates who do tasks, use ship systems and haunt when dead, a 🎓 practice mode, 🌐 public ships for finding a game, 🔮 "who dies tonight?" guesses, replay links, and games that survive server restarts
- ⚙️ Comfort settings: text size, separate music / effects / voice volume, 💬 sound captions, camera distance and shake; a 🗺️ full map on Tab; a 👤 profile with unlockable cosmetics
- 📊 An owner dashboard at `/dashboard` with live players, win rates, roles and bug reports
- 👻 Ghosts stay in the game (bets on the Parasite, haunting, a ghost channel), emoji reactions, speaking rings, lobby bios, ship names, rematches with a season scoreboard, and a shareable result card
- 🔒 Lock the room you are in for a private chat, and knock on locked doors: nobody barges in or listens at the door
- 🗒️ A private **notebook** for tracking claims and suspicions, shown as badges around the bridge table
- 🎬 An **epic end-game reveal** that unmasks every character model and replays each night

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000 (the game picker; No More Space is at /nms, Phase to Space at /phase, Ruler of the Galaxy at /ruler, Star Bonanza at /bonanza, Star Charters at /charters)
npm test        # rules tests, including robot playtests at every player count
```

Open several **private/incognito windows** to play against yourself (3 minimum, 5+ for the full experience).

## What's where

```
server/
  phase/          Phase to Space: cards.js, engine.js (the rules), bots.js, index.js (its own Socket.IO namespace)
  ruler/          Ruler of the Galaxy: data.js, engine.js, bots.js, index.js (the same pattern, namespace /ruler)
  bonanza/        Star Bonanza: data.js, engine.js (a state machine: everyone trades at once), bots.js, index.js (namespace /bonanza)
  charters/       Star Charters: tiles.js (tiles drawn as 7 x 7 letter maps), board.js (features by union-find), data.js, engine.js, bots.js, index.js (namespace /charters)
  roles.js        the Black Hole Blues roles and the setup table; roles-carnival / -outbreak / -traitors / -extra.js hold the rest (72 in all)
  engine.js       the rules: nights, days, nominations, voting, winning
  storyteller.js  ARIA: balanced role picks, false info, stories, window clues
  tasks.js        the 11 room tasks
  cosmetics.js    suit colours, hats, visors, pets
  index.js        web server + live connections (Socket.IO)
  bots.js         robot crewmates' brains
  persist.js      saves running games across restarts
  records.js      play stats, bug reports and replays (in data/)
public/
  index.html            the game picker; nms.html (No More Space), phase.html (Phase to Space), ruler.html (Ruler of the Galaxy), bonanza.html (Star Bonanza) and charters.html (Star Charters)
  css/                  style.css... for No More Space, phase.css and phase-cards.css, plus the shared icons, fonts and typography
  js/main.js            wires No More Space together
  js/phase/             the Phase to Space client (board, prompts, dice, effects)
  js/ruler/             the Ruler of the Galaxy client: scene/ (the 3D galaxy, arena, ships and effects), dice tray, table, prompts
  js/bonanza/           the Star Bonanza client: scene/ (cartoon 3D: the star buddies, the floating farm, the UFO), cards, the Trading Post
  js/charters/          the Star Charters client: scene/ (the 3D tiles built from their drawings, rockets, the chart table), the dock, the read-outs
  js/icons.js           swaps emoji for the arcade's own icons, in the page and in canvas text
  js/world/             the 3D ship (Three.js): layout, ship, avatars (the astronaut), role models (KayKit characters with a cartoon outline, the procedural Parasite), sky
  js/ui/                HUD, chat, role card, night & drawing, tasks, lobby,
                        Captain's Command Station, end-game reveal
  js/audio.js           generative music & synthesised sound effects (no audio files)
  js/voice.js           proximity voice chat (WebRTC)
test/                   engine tests (npm test)
deploy/                 one-time server setup script + config
.github/workflows/      ci.yml tests every push; deploy.yml publishes main
docs/                   GAME_DESIGN.md (rules & balance), SCRIPTS.md, PHASE_TO_SPACE.md, RULER.md, STAR_BONANZA.md, ASSETS.md and HOSTING_GUIDE.md
tools/                  pack-models.mjs and pack-animations.mjs (KayKit packs into .glb files); art/ draws the icon atlas and card portraits
```

## Guides

- 🎲 **[Game design](docs/GAME_DESIGN.md)**: every role, balance tables, phases, the Command Station, clues and the reveal
- 📖 **[Hosting guide](docs/HOSTING_GUIDE.md)**: GitHub → Namecheap → droplet → Cloudflare, step by step
- 🧱 **[3D models, icons, fonts and credits](docs/ASSETS.md)**: the real 3D models, the icon atlas, card portraits and fonts (KayKit and Kenney, CC0), how they are made and loaded
- 🃏 **[Phase to Space](docs/PHASE_TO_SPACE.md)**: the rules, every card, how the engine and the robots work
- 👑 **[Ruler of the Galaxy](docs/RULER.md)**: the rules, the contenders, the 3D scene, how to add a card
- 🌟 **[Star Bonanza](docs/STAR_BONANZA.md)**: the rules, every star buddy and what it pays, trading, the robots, the cartoon farm
- 🧩 **[Star Charters](docs/STAR_CHARTERS.md)**: the rules, what scores what, wormholes, black holes and anomalies, how tiles are drawn, the robots, the screen

## Voice chat behind strict networks (optional)

Voice chat connects players' browsers directly to each other. That works on most home networks, but some school or office networks block it. For those, run a TURN relay (for example `coturn`) and set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` in the server's environment.
