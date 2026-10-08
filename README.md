# No More Space

A spooky, slightly silly space spin-off of **Blood on the Clocktower**, played on a 3D ship you walk around like **Among Us**, with the paranoia of **The Traitors**.

*The ship is falling into a black hole. Something aboard is not human. Find it before there is no more space.*

- 🎭 **22 hidden roles**, each matching one in Blood on the Clocktower's *Trouble Brewing* (Crew, Drifters, Saboteurs, The Parasite), unlocked by player count
- 👥 **3–15 players**, using BotC's own setup table (plus a quick 3–4 player "Short Haul" mode)
- 👨‍✈️ Play with a human **Captain** (Storyteller) running a full **Command Station**, or let **ARIA the autopilot** run the game
- 🚀 **3D ship** with 12 rooms, proximity text & voice chat, 11 task minigames, window clues, night drawings on the walls
- 🕐 BotC-style days: private chats → emergency meeting → nominations with a clockwise **vote clock** → airlock, with a **Ready** button to skip ahead when everyone's done talking
- 🗒️ A private **notebook** for tracking claims and suspicions, shown as badges around the bridge table
- 🎬 An **epic end-game reveal** that unmasks every character model and replays each night

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # rules tests, including robot playtests at every player count
```

Open several **private/incognito windows** to play against yourself (3 minimum, 5+ for the full experience).

## What's where

```
server/
  roles.js        all 22 roles, the setup table, role tips
  engine.js       the rules: nights, days, nominations, voting, winning
  storyteller.js  ARIA: balanced role picks, false info, stories, window clues
  tasks.js        the 11 room tasks
  cosmetics.js    suit colours, hats, visors, pets
  index.js        web server + live connections (Socket.IO)
public/
  index.html, css/style.css
  js/main.js            wires everything together
  js/world/             the 3D ship (Three.js): layout, ship, avatars, role models, sky
  js/ui/                HUD, chat, role card, night & drawing, tasks, lobby,
                        Captain's Command Station, end-game reveal
  js/audio.js           generative music & synthesised sound effects (no audio files)
  js/voice.js           proximity voice chat (WebRTC)
test/                   engine tests (npm test)
deploy/                 one-time server setup script + config
.github/workflows/      ci.yml tests every push; deploy.yml publishes main
docs/                   GAME_DESIGN.md (rules & balance) and HOSTING_GUIDE.md
```

## Guides

- 🎲 **[Game design](docs/GAME_DESIGN.md)**: every role, balance tables, phases, the Command Station, clues and the reveal
- 📖 **[Hosting guide](docs/HOSTING_GUIDE.md)**: GitHub → Namecheap → droplet → Cloudflare, step by step

## Voice chat behind strict networks (optional)

Voice chat connects players' browsers directly to each other. That works on most home networks, but some school or office networks block it. For those, run a TURN relay (for example `coturn`) and set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` in the server's environment.
